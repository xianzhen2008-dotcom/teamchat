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

const STORAGE_KEY_HISTORY = 'team_chat_history';
const STORAGE_KEY_GREETED = 'team_chat_greeted';
const MAX_HISTORY_SIZE = 1000;

const initialAgents = [
    { id: 'lobster', agentId: 'main', name: '小龙虾', role: '总助 / COO', color: 'var(--cyber-red)', img: '小龙虾.png' },
    { id: 'dev', agentId: 'dev', name: '小码', role: '开发主管', color: 'var(--cyber-purple)', img: '小码.png' },
    { id: 'pm', agentId: 'pm', name: '小产', role: '产品经理', color: '#ff6b6b', img: '小产.png' },
    { id: 'frontend', agentId: 'frontend', name: '小前', role: '前端开发', color: '#61affe', img: '小前.png' },
    { id: 'backend', agentId: 'backend', name: '小后', role: '后端开发', color: '#49cc90', img: '小后.png' },
    { id: 'devops', agentId: 'devops', name: '小运', role: '运维部署', color: '#fca130', img: '小运.png' },
    { id: 'qa', agentId: 'qa', name: '小测', role: '测试验证', color: '#9012fe', img: '小测.png' },
    { id: 'mobile', agentId: 'mobile', name: '小移', role: '移动端', color: '#0db7ed', img: '小移.png' },
    { id: 'mail', agentId: 'mail', name: '小邮', role: '商务专家', color: '#e3b341', img: '小邮.png' },
    { id: 'writer', agentId: 'writer', name: '小文', role: '创意策划', color: '#f778ba', img: '小文2.png' },
    { id: 'data', agentId: 'data', name: '小数', role: '数据分析', color: '#388bfd', img: '小数.png' },
    { id: 'finance', agentId: 'finance', name: '小财', role: '财经投资', color: '#3fb950', img: '小财.png' }
];

const initialState = {
    messages: [],
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
    lastSpeaker: null,
    greeted: false,
    theme: 'dark',
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
                this._state.messages = JSON.parse(historyRaw);
            }
            
            const greetedRaw = localStorage.getItem(STORAGE_KEY_GREETED);
            this._state.greeted = greetedRaw === 'true';

            const theme = localStorage.getItem('team_chat_theme');
            if (theme) {
                this._state.theme = theme;
            }
        } catch (e) {
            console.warn('[StateManager] Failed to load from storage:', e);
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

    setState(updates, silent = false) {
        const prevState = { ...this._state };
        this._state = { ...this._state, ...updates };
        
        if (!silent) {
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
        this._subscribers.forEach((callbacks, key) => {
            if (key === '*' || prevState[key] !== newState[key]) {
                callbacks.forEach(cb => {
                    try {
                        cb(newState[key], prevState[key], newState);
                    } catch (e) {
                        console.error('[StateManager] Subscriber error:', e);
                    }
                });
                // 同时触发 eventBus 事件
                if (key !== '*') {
                    eventBus.emit(`state:changed:${key}`, newState[key]);
                }
            }
        });
    }

    addMessage(message) {
        const messages = [...this._state.messages, message];
        if (messages.length > MAX_HISTORY_SIZE) {
            messages.splice(0, messages.length - MAX_HISTORY_SIZE);
        }
        this.setState({ messages });
        this._saveHistory(message);
        return messages;
    }

    updateMessage(timestamp, updates) {
        const messages = this._state.messages.map(msg => {
            if (msg.timestamp === timestamp) {
                return { ...msg, ...updates };
            }
            return msg;
        });
        this.setState({ messages });
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

    loadHistory(serverHistory) {
        const msgMap = new Map();
        
        serverHistory.forEach(m => {
            const key = m.runId ? `runId:${m.runId}` : `${m.timestamp}-${m.sender}-${m.text?.slice(0,100)}`;
            msgMap.set(key, m);
        });
        
        this._state.messages.forEach(m => {
            const key = m.runId ? `runId:${m.runId}` : `${m.timestamp}-${m.sender}-${m.text?.slice(0,100)}`;
            msgMap.set(key, m);
        });
        
        const mergedHistory = Array.from(msgMap.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-MAX_HISTORY_SIZE);
        
        this.setState({ messages: mergedHistory });
        this._saveHistory();
    }

    clearHistory() {
        this.setState({ messages: [] });
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

    setTheme(theme) {
        this.setState({ theme });
        localStorage.setItem('team_chat_theme', theme);
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
        this.setState({ lastSpeaker: name });
    }

    setSearch(query, matches = [], index = -1) {
        this.setState({
            searchQuery: query,
            searchMatches: matches,
            currentMatchIndex: index
        });
    }

    getAgentById(agentId) {
        return this._state.agents.find(a => a.agentId === agentId);
    }

    getAgentByName(name) {
        return this._state.agents.find(a => a.name === name);
    }

    addOrUpdateSession(sessionId, agentId, agentName) {
        const sessions = this._state.sessions instanceof Map 
            ? new Map(this._state.sessions) 
            : new Map(Object.entries(this._state.sessions || {}));
        const existing = sessions.get(sessionId);
        sessions.set(sessionId, {
            id: sessionId,
            shortId: sessionId.slice(0, 8),
            agentId,
            agentName,
            lastMessageTime: Date.now(),
            messageCount: (existing?.messageCount || 0) + 1
        });
        this._state.sessions = sessions;
        this._notifySubscribers({ sessions: this._state.sessions }, { sessions });
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
