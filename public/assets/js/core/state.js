/**
 * StateManager - 集中式状态管理模块
 * 
 * 管理应用的全局状态，包括：
 * - messages: 消息历史记录
 * - agents: Agent 列表配置
 * - currentAgent: 当前选中的 Agent
 * - isConnected: WebSocket 连接状态
 * - agentBusyMap: Agent 忙碌状态映射
 * - agentQueues: Agent 消息队列
 */

import { eventBus } from './events.js';
import { findAgentByName, getAgentDisplayName, normalizeAgentId, normalizeMessageAgentFields } from '../utils/agent-meta.js';
import { getCompactSessionId, getMessageDisplayText, getPrimarySessionId, isMessageHidden } from '../utils/message-meta.js';

const STORAGE_KEY_HISTORY = 'team_chat_history';
const STORAGE_KEY_GREETED = 'team_chat_greeted';
const STORAGE_KEY_FILTER_PREFS = 'team_chat_filter_prefs';
const MAX_HISTORY_SIZE = 1000;

const getHistoryMessageSignature = (message) => {
    if (!message) return '';
    const clientMessageId = message.metadata?.clientMessageId || message.clientMessageId || message.id || '';
    const modelId = message.modelInfo?.modelId || message.metadata?.modelInfo?.modelId || message.metadata?.model || message.model || '';
    const routeSessionKey = message.metadata?.routeSessionKey || message.metadata?.sourceSessionKey || '';
    return [
        clientMessageId,
        message.runId || '',
        message.timestamp || 0,
        message.sender || '',
        message.sessionId || '',
        routeSessionKey,
        message.channel || '',
        message.source || '',
        modelId,
        message.isUser ? 'u' : 'a',
        message.status || '',
        message.deleted ? 'd' : '',
        message.recalled ? 'r' : '',
        message.type || '',
        message.text || '',
        message.thinking || '',
        Array.isArray(message.tools) ? message.tools.length : 0,
        Array.isArray(message.actionLogs) ? message.actionLogs.length : 0
    ].join('|');
};

const isHistorySame = (prevMessages = [], nextMessages = []) => {
    if (prevMessages === nextMessages) return true;
    if (prevMessages.length !== nextMessages.length) return false;

    for (let i = 0; i < prevMessages.length; i += 1) {
        if (getHistoryMessageSignature(prevMessages[i]) !== getHistoryMessageSignature(nextMessages[i])) {
            return false;
        }
    }

    return true;
};

const getSessionRouteKey = (message = {}, sessionId = '') => {
    const candidates = [
        message.metadata?.routeSessionKey,
        message.metadata?.sourceSessionKey,
        message.deliveryContext?.sessionKey,
        typeof sessionId === 'string' && sessionId.startsWith('agent:') ? sessionId : ''
    ];

    return candidates
        .map((value) => String(value || '').trim())
        .find(Boolean) || null;
};

const getRouteAgentIdFromSessionKey = (sessionKey = '') => {
    const raw = String(sessionKey || '').trim();
    if (!raw.startsWith('agent:')) return null;
    const parts = raw.split(':').filter(Boolean);
    if (parts.length < 2) return null;
    return normalizeAgentId(parts[1]) || parts[1] || null;
};

const getSessionChannel = (message = {}) => {
    return String(
        message.channel
        || message.source
        || message.metadata?.channel
        || message.metadata?.source
        || message.deliveryContext?.channel
        || ''
    ).trim().toLowerCase() || null;
};

const initialAgents = [
    { id: 'main', agentId: 'main', name: getAgentDisplayName('main'), role: 'Team lead', color: 'var(--cyber-red)', img: 'agent-main.svg' },
    { id: 'dev', agentId: 'dev', name: getAgentDisplayName('dev'), role: 'Implementation', color: 'var(--cyber-purple)', img: 'agent-dev.svg' },
    { id: 'pm', agentId: 'pm', name: getAgentDisplayName('pm'), role: 'Product planning', color: '#ff6b6b', img: 'agent-pm.svg' },
    { id: 'frontend', agentId: 'frontend', name: getAgentDisplayName('frontend'), role: 'UI engineering', color: '#61affe', img: 'agent-fe.svg' },
    { id: 'backend', agentId: 'backend', name: getAgentDisplayName('backend'), role: 'Server engineering', color: '#49cc90', img: 'agent-be.svg' },
    { id: 'devops', agentId: 'devops', name: getAgentDisplayName('devops'), role: 'Operations', color: '#fca130', img: 'agent-ops.svg' },
    { id: 'qa', agentId: 'qa', name: getAgentDisplayName('qa'), role: 'Quality assurance', color: '#9012fe', img: 'agent-qa.svg' },
    { id: 'mobile', agentId: 'mobile', name: getAgentDisplayName('mobile'), role: 'Mobile app', color: '#0db7ed', img: 'agent-mobile.svg' },
    { id: 'mail', agentId: 'mail', name: getAgentDisplayName('mail'), role: 'Inbox adapter', color: '#e3b341', img: 'agent-mail.svg' },
    { id: 'writer', agentId: 'writer', name: getAgentDisplayName('writer'), role: 'Content and documentation', color: '#f778ba', img: 'agent-writer.svg' },
    { id: 'data', agentId: 'data', name: getAgentDisplayName('data'), role: 'Analytics', color: '#388bfd', img: 'agent-data.svg' },
    { id: 'finance', agentId: 'finance', name: getAgentDisplayName('finance'), role: 'Finance assistant', color: '#3fb950', img: 'agent-finance.svg' }
];

const initialState = {
    messages: [],
    historyLoading: true,
    historyLoaded: false,
    historyError: '',
    agents: initialAgents,
    currentAgent: null,
    currentSessionId: null,
    isConnected: false,
    connectionQuality: 'good',
    agentBusyMap: new Map(),
    agentQueues: new Map(),
    agentActiveRuns: new Map(),
    agentPendingTimers: new Map(),
    agentLogs: new Map(),
    agentActivity: new Map(),
    expandedAgents: new Set(),
    filterAgents: new Set(),
    showSystemMessages: false,
    hideHeartbeatPrompts: true,
    lastSpeaker: null,
    greeted: false,
    theme: 'fresh',
    searchQuery: '',
    searchMatches: [],
    currentMatchIndex: -1,
    sessions: new Map(),
    replyTo: null
};

class StateManager {
    constructor() {
        this._state = { ...initialState };
        this._subscribers = new Map();
        this._initFromStorage();
    }

    _initFromStorage() {
        try {
            const historyRaw = localStorage.getItem(STORAGE_KEY_HISTORY);
            if (historyRaw) {
                this._state.messages = JSON.parse(historyRaw).map((message) => normalizeMessageAgentFields(message));
                this.rebuildSessionsFromMessages(this._state.messages, true);
            }
            
            const greetedRaw = localStorage.getItem(STORAGE_KEY_GREETED);
            this._state.greeted = greetedRaw === 'true';

            const theme = localStorage.getItem('team_chat_skin') || localStorage.getItem('team_chat_theme');
            if (theme) {
                this._state.theme = theme;
            }

            const filterPrefsRaw = localStorage.getItem(STORAGE_KEY_FILTER_PREFS);
            if (filterPrefsRaw) {
                const filterPrefs = JSON.parse(filterPrefsRaw);
                this._state.showSystemMessages = Boolean(filterPrefs?.showSystemMessages);
                this._state.hideHeartbeatPrompts = filterPrefs?.hideHeartbeatPrompts !== false;
            }
        } catch (e) {
            console.warn('[StateManager] Failed to load from storage:', e);
        }
    }

    _saveFilterPrefs() {
        try {
            localStorage.setItem(STORAGE_KEY_FILTER_PREFS, JSON.stringify({
                showSystemMessages: Boolean(this._state.showSystemMessages),
                hideHeartbeatPrompts: this._state.hideHeartbeatPrompts !== false
            }));
        } catch (e) {
            console.warn('[StateManager] Failed to save filter prefs:', e);
        }
    }

    getState(key) {
        if (key) {
            return this._state[key];
        }
        return { ...this._state };
    }

    getStateValue(key) {
        return this._state[key];
    }

    setState(updates, silent = false, maybeSilent = false) {
        let nextState;
        let isSilent = silent;

        // Backward compatibility: allow setState('key', value, silent)
        if (typeof updates === 'string') {
            nextState = { [updates]: silent };
            isSilent = Boolean(maybeSilent);
        } else if (updates && typeof updates === 'object') {
            nextState = updates;
        } else {
            console.warn('[StateManager] Ignored invalid setState payload:', updates);
            return;
        }

        const prevState = { ...this._state };
        this._state = { ...this._state, ...nextState };
        
        if (!isSilent) {
            this._notifySubscribers(prevState, this._state);
        }
    }

    subscribe(key, callback) {
        if (!this._subscribers.has(key)) {
            this._subscribers.set(key, new Set());
        }
        this._subscribers.get(key).add(callback);
        
        return () => {
            const subs = this._subscribers.get(key);
            if (subs) {
                subs.delete(callback);
            }
        };
    }

    subscribeAll(callback) {
        return this.subscribe('*', callback);
    }

    _notifySubscribers(prevState, newState) {
        const changedKeys = Object.keys(newState).filter((key) => prevState[key] !== newState[key]);

        this._subscribers.forEach((callbacks, key) => {
            if (key === '*' || prevState[key] !== newState[key]) {
                callbacks.forEach(cb => {
                    try {
                        cb(newState[key], prevState[key], newState);
                    } catch (e) {
                        console.error('[StateManager] Subscriber error:', e);
                    }
                });
            }
        });

        changedKeys.forEach((key) => {
            eventBus.emit(`state:changed:${key}`, newState[key]);
        });
    }

    addMessage(message) {
        const normalizedMessage = normalizeMessageAgentFields(message);
        const messages = [...this._state.messages, normalizedMessage];
        if (messages.length > MAX_HISTORY_SIZE) {
            messages.splice(0, messages.length - MAX_HISTORY_SIZE);
        }
        this.setState({ messages });
        this.rebuildSessionsFromMessages(messages);
        this._saveHistory(message);
        return messages;
    }

    updateMessage(timestamp, updates) {
        const messages = this._state.messages.map(msg => {
            if (msg.timestamp === timestamp) {
                return normalizeMessageAgentFields({ ...msg, ...updates });
            }
            return msg;
        });
        this.setState({ messages });
        this.rebuildSessionsFromMessages(messages);
        this._saveHistory();
    }

    deleteMessage(timestamp) {
        const messages = this._state.messages.map(msg => {
            if (msg.timestamp === timestamp) {
                return { ...msg, deleted: true };
            }
            return msg;
        });
        this.setState({ messages });
        this.rebuildSessionsFromMessages(messages);
        this._saveHistory();
    }

    _saveHistory(newMessage = null) {
        try {
            const toSave = this._state.messages.slice(-MAX_HISTORY_SIZE);
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('[StateManager] Failed to save history:', e);
        }
    }

    loadHistory(serverHistory = [], options = {}) {
        let partial = Boolean(options.partial);
        const snapshotLimit = Number(options.snapshotLimit || 0);
        console.log(
            '%c[StateManager] loadHistory called with ' + serverHistory.length + ' server messages' + (partial ? ' (partial)' : ''),
            'background: #ff6b6b; color: white; font-size: 12px; padding: 2px 6px;'
        );

        const buildMessageKey = (message) => {
            if (!message) return '';
            const clientMessageId = message.metadata?.clientMessageId || message.clientMessageId || message.id;
            if (clientMessageId) return `client:${clientMessageId}`;
            if (message.runId) return `runId:${message.runId}`;
            return `${message.timestamp}-${message.sender}-${(message.text || '').slice(0, 100)}`;
        };

        const normalizedServer = (Array.isArray(serverHistory) ? serverHistory : [])
            .map((message) => normalizeMessageAgentFields(message))
            .filter(Boolean);
        const normalizedLocal = (this._state.messages || [])
            .map((message) => normalizeMessageAgentFields(message))
            .filter(Boolean);

        const countAgentMessages = (messages = []) => messages.filter((message) => message && !message.isUser && !(message.isSystem || message.type === 'system')).length;
        const countDistinctSessions = (messages = []) => {
            const sessions = new Set();
            for (const message of messages) {
                const sessionId = getPrimarySessionId(message);
                if (sessionId) sessions.add(sessionId);
            }
            return sessions.size;
        };

        if (!partial && normalizedServer.length > 0 && normalizedLocal.length > normalizedServer.length) {
            const localAgentCount = countAgentMessages(normalizedLocal);
            const serverAgentCount = countAgentMessages(normalizedServer);
            const localSessionCount = countDistinctSessions(normalizedLocal);
            const serverSessionCount = countDistinctSessions(normalizedServer);
            const isLikelyLimitedSnapshot = snapshotLimit > 0 && normalizedServer.length <= snapshotLimit;
            const suspiciousShrink = (
                normalizedLocal.length >= normalizedServer.length * 2
                && localAgentCount >= Math.max(serverAgentCount + 3, Math.ceil(normalizedServer.length * 0.25))
                && serverSessionCount <= Math.max(2, Math.floor(localSessionCount / 2))
            );

            if (isLikelyLimitedSnapshot || suspiciousShrink) {
                partial = true;
                console.warn('[StateManager] Treating incoming history as limited snapshot to avoid collapsing into a narrow local slice', {
                    snapshotLimit,
                    localCount: normalizedLocal.length,
                    serverCount: normalizedServer.length,
                    localAgentCount,
                    serverAgentCount,
                    localSessionCount,
                    serverSessionCount
                });
            }
        }

        const msgMap = new Map();

        if (partial) {
            normalizedLocal.forEach((message) => {
                msgMap.set(buildMessageKey(message), message);
            });

            normalizedServer.forEach((message) => {
                const key = buildMessageKey(message);
                const existing = msgMap.get(key);
                msgMap.set(key, existing ? {
                    ...existing,
                    ...message,
                    metadata: {
                        ...(existing.metadata || {}),
                        ...(message.metadata || {})
                    }
                } : message);
            });
        } else {
            const latestServerTimestamp = normalizedServer.reduce(
                (max, message) => Math.max(max, Number(message.timestamp) || 0),
                0
            );

            normalizedServer.forEach((message) => {
                msgMap.set(buildMessageKey(message), message);
            });

            normalizedLocal.forEach((message) => {
                const key = buildMessageKey(message);
                const existing = msgMap.get(key);

                if (existing) {
                    msgMap.set(key, {
                        ...existing,
                        ...message,
                        status: message.status || existing.status,
                        pending: Boolean(message.pending || existing.pending),
                        _localOnly: Boolean(message._localOnly && existing._localOnly),
                        _optimistic: Boolean(message._optimistic && existing._optimistic),
                        metadata: {
                            ...(existing.metadata || {}),
                            ...(message.metadata || {})
                        }
                    });
                    return;
                }

                const messageTimestamp = Number(message.timestamp) || 0;
                const isNewerThanServer = latestServerTimestamp === 0 || messageTimestamp > latestServerTimestamp;
                const looksLocalOnly = Boolean(
                    message.pending
                    || message._localOnly
                    || message._optimistic
                    || message.isUser
                );

                if (isNewerThanServer && looksLocalOnly) {
                    msgMap.set(key, message);
                }
            });
        }

        const mergedHistory = Array.from(msgMap.values())
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .slice(-MAX_HISTORY_SIZE);

        if (isHistorySame(this._state.messages || [], mergedHistory)) {
            console.log('%c[StateManager] loadHistory skipped (no meaningful changes)', 'background: #607d8b; color: white; font-size: 12px; padding: 2px 6px;');
            return;
        }

        console.log('%c[StateManager] Merged ' + mergedHistory.length + ' messages', 'background: #4caf50; color: white; font-size: 12px; padding: 2px 6px;');

        this.setState({ messages: mergedHistory });
        this.rebuildSessionsFromMessages(mergedHistory);
        this._saveHistory();
    }

    clearHistory() {
        this.setState({ messages: [] });
        this.setState({ sessions: new Map() });
        localStorage.removeItem(STORAGE_KEY_HISTORY);
        localStorage.removeItem(STORAGE_KEY_GREETED);
    }

    setAgentBusy(agentId) {
        const agentBusyMap = new Map(this._state.agentBusyMap);
        agentBusyMap.set(agentId, true);
        this.setState({ agentBusyMap });
    }

    setAgentIdle(agentId) {
        const agentBusyMap = new Map(this._state.agentBusyMap);
        agentBusyMap.set(agentId, false);
        this.setState({ agentBusyMap });
    }

    isAgentBusy(agentId) {
        const runs = this._state.agentActiveRuns.get(agentId);
        if (runs && runs.size > 0) return true;
        const timer = this._state.agentPendingTimers.get(agentId);
        return !!timer;
    }

    enqueueForAgent(agentId, message) {
        const agentQueues = new Map(this._state.agentQueues);
        const q = agentQueues.get(agentId) || [];
        q.push({ message, at: Date.now() });
        agentQueues.set(agentId, q);
        this.setState({ agentQueues });
    }

    dequeueForAgent(agentId) {
        const agentQueues = new Map(this._state.agentQueues);
        const q = agentQueues.get(agentId) || [];
        const next = q.shift();
        agentQueues.set(agentId, q);
        this.setState({ agentQueues });
        return next;
    }

    getAgentQueue(agentId) {
        return this._state.agentQueues.get(agentId) || [];
    }

    addAgentRun(agentId, runId) {
        const agentActiveRuns = new Map(this._state.agentActiveRuns);
        let runs = agentActiveRuns.get(agentId);
        if (!runs) {
            runs = new Set();
        } else {
            runs = new Set(runs);
        }
        runs.add(runId);
        agentActiveRuns.set(agentId, runs);
        this.setState({ agentActiveRuns });
    }

    removeAgentRun(agentId, runId) {
        const agentActiveRuns = new Map(this._state.agentActiveRuns);
        const runs = agentActiveRuns.get(agentId);
        if (runs) {
            const newRuns = new Set(runs);
            newRuns.delete(runId);
            agentActiveRuns.set(agentId, newRuns);
            this.setState({ agentActiveRuns });
        }
    }

    hasAgentRuns(agentId) {
        const runs = this._state.agentActiveRuns.get(agentId);
        return runs && runs.size > 0;
    }

    setPendingTimer(agentId, timerId) {
        const agentPendingTimers = new Map(this._state.agentPendingTimers);
        agentPendingTimers.set(agentId, timerId);
        this.setState({ agentPendingTimers });
    }

    clearPendingTimer(agentId) {
        const agentPendingTimers = new Map(this._state.agentPendingTimers);
        agentPendingTimers.delete(agentId);
        this.setState({ agentPendingTimers });
    }

    getPendingTimer(agentId) {
        return this._state.agentPendingTimers.get(agentId);
    }

    addAgentLog(agentId, log) {
        const agentLogs = new Map(this._state.agentLogs);
        let logs = agentLogs.get(agentId) || [];
        logs = [...logs, { ...log, timestamp: Date.now() }];
        if (logs.length > 50) {
            logs = logs.slice(-50);
        }
        agentLogs.set(agentId, logs);
        this.setState({ agentLogs });
    }

    getAgentLogs(agentId) {
        return this._state.agentLogs.get(agentId) || [];
    }

    toggleAgentExpand(agentId) {
        const expandedAgents = new Set(this._state.expandedAgents);
        if (expandedAgents.has(agentId)) {
            expandedAgents.delete(agentId);
        } else {
            expandedAgents.add(agentId);
        }
        this.setState({ expandedAgents });
    }

    isAgentExpanded(agentId) {
        return this._state.expandedAgents.has(agentId);
    }

    toggleFilterAgent(agentName) {
        const filterAgents = new Set(this._state.filterAgents);
        if (filterAgents.has(agentName)) {
            filterAgents.delete(agentName);
        } else {
            filterAgents.add(agentName);
        }
        this.setState({ filterAgents });
    }

    setFilterAgents(agentNames) {
        this.setState({ filterAgents: new Set(agentNames) });
    }

    clearFilter() {
        this.setState({ filterAgents: new Set() });
    }

    setShowSystemMessages(showSystemMessages) {
        this.setState({ showSystemMessages: Boolean(showSystemMessages) });
        this._saveFilterPrefs();
    }

    setHideHeartbeatPrompts(hideHeartbeatPrompts) {
        this.setState({ hideHeartbeatPrompts: hideHeartbeatPrompts !== false });
        this._saveFilterPrefs();
    }

    setTheme(theme) {
        this.setState({ theme });
        localStorage.setItem('team_chat_skin', theme);
        localStorage.removeItem('team_chat_theme');
    }

    setConnected(isConnected) {
        this.setState({ isConnected });
    }

    setConnectionQuality(quality) {
        this.setState({ connectionQuality: quality });
    }

    setGreeted(greeted) {
        this.setState({ greeted });
        localStorage.setItem(STORAGE_KEY_GREETED, String(greeted));
    }

    setLastSpeaker(name) {
        this.setState({ lastSpeaker: getAgentDisplayName(name, name) });
    }

    setSearch(query, matches = [], index = -1) {
        this.setState({
            searchQuery: query,
            searchMatches: matches,
            currentMatchIndex: index
        });
    }

    getAgentById(agentId) {
        const normalizedId = normalizeAgentId(agentId) || agentId;
        return this._state.agents.find(a => a.agentId === normalizedId);
    }

    getAgentByName(name) {
        return findAgentByName(this._state.agents, name);
    }

    // ========== 会话管理增强 ==========
    
    addOrUpdateSession(sessionId, agentId, agentName) {
        if (!sessionId) return;
        const prevSessions = this._state.sessions;
        const normalizedAgentId = normalizeAgentId(agentId) || agentId;
        const normalizedName = getAgentDisplayName(agentName || normalizedAgentId, agentName || normalizedAgentId);
        const routeSessionKey = String(sessionId || '').startsWith('agent:') ? sessionId : null;
        const routeAgentId = getRouteAgentIdFromSessionKey(routeSessionKey) || normalizedAgentId;
        const sessions = this._state.sessions instanceof Map 
            ? new Map(this._state.sessions) 
            : new Map(Object.entries(this._state.sessions || {}));
        const existing = sessions.get(sessionId);
        sessions.set(sessionId, {
            id: sessionId,
            shortId: getCompactSessionId(sessionId),
            agentId: normalizedAgentId,
            agentName: normalizedName,
            routeAgentId,
            routeSessionKey: routeSessionKey || existing?.routeSessionKey || null,
            channel: existing?.channel || '',
            source: existing?.source || '',
            lastMessageTime: Date.now(),
            messageCount: (existing?.messageCount || 0) + 1
        });
        this._state.sessions = sessions;
        this._notifySubscribers({ sessions: prevSessions }, { sessions });
    }

    rebuildSessionsFromMessages(messages = [], silent = false) {
        const nextSessions = new Map();

        for (const rawMessage of messages || []) {
            if (!rawMessage) continue;
            const sessionId = getPrimarySessionId(rawMessage);
            if (!sessionId) continue;

            const normalizedMessage = normalizeMessageAgentFields(rawMessage);
            if (isMessageHidden(normalizedMessage)) continue;
            if (normalizedMessage.isSystem || normalizedMessage.type === 'system') continue;
            const existing = nextSessions.get(sessionId);
            const agentId = normalizedMessage.agentId
                || existing?.agentId
                || normalizeAgentId(normalizedMessage.sender)
                || normalizedMessage.sender
                || 'main';
            const agentName = existing?.agentName
                || getAgentDisplayName(normalizedMessage.sender || agentId, normalizedMessage.sender || agentId);
            const timestamp = normalizedMessage.timestamp || Date.now();
            const lastMessage = getMessageDisplayText(normalizedMessage).slice(0, 100);
            const routeSessionKey = getSessionRouteKey(normalizedMessage, sessionId) || existing?.routeSessionKey || null;
            const routeAgentId = normalizeAgentId(
                normalizedMessage.metadata?.routeAgentId
                || normalizedMessage.deliveryContext?.routeAgentId
                || getRouteAgentIdFromSessionKey(routeSessionKey)
                || existing?.routeAgentId
                || agentId
            ) || agentId;
            const sessionChannel = getSessionChannel(normalizedMessage) || existing?.channel || '';
            const sessionSource = String(
                normalizedMessage.source
                || normalizedMessage.metadata?.source
                || existing?.source
                || sessionChannel
                || ''
            ).trim().toLowerCase();

            if (existing) {
                const shouldReplaceLastMessage = timestamp >= (existing.lastMessageTime || 0);
                existing.lastMessageTime = Math.max(existing.lastMessageTime || 0, timestamp);
                existing.messageCount = (existing.messageCount || 0) + 1;
                existing.routeAgentId = routeAgentId || existing.routeAgentId || agentId;
                if (routeSessionKey) existing.routeSessionKey = routeSessionKey;
                if (sessionChannel) existing.channel = sessionChannel;
                if (sessionSource) existing.source = sessionSource;
                if (!existing.lastMessage || shouldReplaceLastMessage) {
                    existing.lastMessage = lastMessage;
                }
            } else {
                nextSessions.set(sessionId, {
                    id: sessionId,
                    shortId: getCompactSessionId(sessionId),
                    agentId,
                    agentName,
                    routeAgentId,
                    routeSessionKey,
                    channel: sessionChannel,
                    source: sessionSource,
                    lastMessage,
                    lastMessageTime: timestamp,
                    messageCount: 1,
                    createdAt: timestamp
                });
            }
        }

        const prevSessions = this._state.sessions;
        this._state.sessions = nextSessions;
        if (!silent) {
            this._notifySubscribers({ sessions: prevSessions }, { sessions: nextSessions });
        }
        return nextSessions;
    }

    getSessions() {
        const sessions = this._state.sessions instanceof Map 
            ? this._state.sessions 
            : new Map(Object.entries(this._state.sessions || {}));
        return Array.from(sessions.values())
            .sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    }

    getSession(sessionId) {
        const sessions = this._state.sessions instanceof Map 
            ? this._state.sessions 
            : new Map(Object.entries(this._state.sessions || {}));
        return sessions.get(sessionId);
    }

    // 获取或创建会话（新增强化方法）
    getOrCreateSession(agentId, conversationId = null) {
        const normalizedAgentId = normalizeAgentId(agentId) || agentId;
        const convId = conversationId || normalizedAgentId;
        const sessionKey = `agent:${normalizedAgentId}:${convId}`;
        const prevSessions = this._state.sessions;
        
        const sessions = this._state.sessions instanceof Map 
            ? new Map(this._state.sessions) 
            : new Map(Object.entries(this._state.sessions || {}));
        
        if (!sessions.has(sessionKey)) {
            const agent = this.getAgentById(normalizedAgentId);
            sessions.set(sessionKey, {
                id: convId,
                shortId: getCompactSessionId(convId),
                sessionKey: sessionKey,
                agentId: normalizedAgentId,
                agentName: agent?.name || getAgentDisplayName(normalizedAgentId, normalizedAgentId),
                createdAt: Date.now(),
                lastMessageTime: Date.now(),
                messageCount: 0
            });
            this._state.sessions = sessions;
            this._notifySubscribers({ sessions: prevSessions }, { sessions });
        }
        
        return sessions.get(sessionKey);
    }

    // 获取Agent的所有会话
    getAgentSessions(agentId) {
        const sessions = this._state.sessions instanceof Map 
            ? this._state.sessions 
            : new Map(Object.entries(this._state.sessions || {}));
        
        const result = [];
        for (const [key, session] of sessions) {
            if (session.agentId === agentId) {
                result.push(session);
            }
        }
        return result.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    }

    // 设置当前会话
    setCurrentSession(sessionKey) {
        this.setState({ currentSessionId: sessionKey });
    }

    // 获取当前会话
    getCurrentSession() {
        const sessions = this._state.sessions instanceof Map 
            ? this._state.sessions 
            : new Map(Object.entries(this._state.sessions || {}));
        return this._state.currentSessionId ? sessions.get(this._state.currentSessionId) : null;
    }

    // 更新会话消息计数和时间
    updateSessionActivity(sessionKey) {
        const prevSessions = this._state.sessions;
        const sessions = this._state.sessions instanceof Map 
            ? new Map(this._state.sessions) 
            : new Map(Object.entries(this._state.sessions || {}));

        const normalizedSessionId = String(sessionKey || '').trim();
        const compactSessionId = normalizedSessionId.includes(':')
            ? normalizedSessionId.split(':').pop()
            : normalizedSessionId;

        let targetKey = sessions.has(normalizedSessionId) ? normalizedSessionId : null;
        if (!targetKey) {
            for (const [key, session] of sessions.entries()) {
                if (!session) continue;
                if (session.sessionKey === normalizedSessionId || session.id === normalizedSessionId || session.id === compactSessionId) {
                    targetKey = key;
                    break;
                }
            }
        }

        const session = targetKey ? sessions.get(targetKey) : null;
        if (session) {
            session.lastMessageTime = Date.now();
            session.messageCount = (session.messageCount || 0) + 1;
            sessions.set(targetKey, session);
            this._state.sessions = sessions;
            this._notifySubscribers({ sessions: prevSessions }, { sessions });
        }
    }

    setReplyTo(message) {
        this.setState({ replyTo: message });
    }

    clearReplyTo() {
        this.setState({ replyTo: null });
    }

    reset() {
        this._state = { ...initialState };
        this._notifySubscribers({}, this._state);
    }
}

export const state = new StateManager();
export const stateManager = state;
export default state;
