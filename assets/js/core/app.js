/**
 * App - 主应用入口模块
 * 
 * 负责：
 * - 初始化所有模块
 * - 协调模块间的交互
 * - 管理应用生命周期
 * - 提供全局工具函数
 */

import { state } from './state.js';
import { eventBus, EventTypes, emit, on, once } from './events.js';
import { apiService } from '../services/api.js';
import { messagesModule } from '../modules/messages/index.js';
import { renderToolCard } from '../modules/messages/markdown.js';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// 开发环境下使用代理，生产环境使用当前 host
const GATEWAY_HOST = window.location.port === '5173' ? 'localhost:18789' : window.location.host;
const GATEWAY_URL = `${WS_PROTOCOL}//${GATEWAY_HOST}/v1/gateway`;
const CLIENT_ID = 'cli';
const AUTH_TOKEN = '6ed82a04d1ee1f774459f0a64d19a79afda1dc10d8d1c49a';

const HEARTBEAT_INTERVAL = 10000;
const HEARTBEAT_TIMEOUT = 30000;
const MAX_MISSED_HEARTBEATS = 3;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

class App {
    constructor() {
        this.ws = null;
        this.connectReqId = null;
        this.syncTimer = null;
        this.pingTimer = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.isManualClose = false;
        this.wasOffline = false;
        this.missedHeartbeats = 0;
        this.lastPongTime = Date.now();
        this.runMessageEls = new Map();
        this.processedMessageIds = new Set();
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            console.warn('[App] Already initialized');
            return;
        }

        console.log('[App] Initializing...');
        
        emit(EventTypes.APP_INIT);
        
        this._setupEventListeners();
        this._setupNetworkMonitor();
        this._loadTheme();
        
        await this._loadHistory();
        
        this._connect();
        
        this.initialized = true;
        
        setTimeout(() => {
            emit(EventTypes.APP_READY);
        }, 100);
        
        console.log('[App] Initialized successfully');
    }

    _setupEventListeners() {
        on(EventTypes.MESSAGE_SENT, ({ text, agentId }) => {
            this._handleMessageSend(text, agentId);
        });

        on(EventTypes.THEME_CHANGED, ({ theme }) => {
            state.setTheme(theme);
            document.body.setAttribute('data-theme', theme);
            const icon = document.getElementById('theme-icon');
            if (icon) {
                icon.textContent = theme === 'light' ? '☀️' : '🌙';
            }
        });

        on(EventTypes.UI_SIDEBAR_TOGGLE, () => {
            this._toggleSidebar();
        });

        on(EventTypes.FILTER_CHANGED, ({ agentNames }) => {
            if (agentNames && agentNames.length > 0) {
                state.setFilterAgents(agentNames);
            } else {
                state.clearFilter();
            }
        });
    }

    _setupNetworkMonitor() {
        if (navigator.connection) {
            navigator.connection.addEventListener('change', () => {
                this._handleNetworkChange();
            });
        }

        document.addEventListener('visibilitychange', () => {
            this._handleVisibilityChange();
        });

        window.addEventListener('online', () => {
            this._handleNetworkOnline();
        });

        window.addEventListener('offline', () => {
            this._handleNetworkOffline();
        });
    }

    _handleNetworkChange() {
        const isOnline = navigator.onLine;
        this._updateConnectionStatus(isOnline);
    }

    _handleVisibilityChange() {
        if (document.hidden) {
            console.log('[App] App went to background');
        } else {
            console.log('[App] App came to foreground');
            if (!state.getStateValue('isConnected') && !this.reconnectTimer) {
                this.reconnectAttempts = 0;
                this._connect();
            }
        }
    }

    _handleNetworkOnline() {
        console.log('[App] Network online');
        this.wasOffline = true;
        this._updateConnectionStatus(true);
        if (!state.getStateValue('isConnected')) {
            this.reconnectAttempts = 0;
            this._connect();
        }
    }

    _handleNetworkOffline() {
        console.log('[App] Network offline');
        this.wasOffline = true;
        this._updateConnectionStatus(false);
    }

    _updateConnectionStatus(isOnline) {
        const statusEl = document.getElementById('connection-status');
        const banner = document.getElementById('connection-banner');
        const isConnected = state.getStateValue('isConnected');

        if (!isOnline) {
            if (statusEl) {
                statusEl.style.backgroundColor = 'red';
                statusEl.title = '网络已断开';
            }
            if (banner) {
                banner.style.display = 'block';
                banner.textContent = '⚠️ 网络已断开，请检查网络设置';
            }
        } else {
            if (statusEl) {
                statusEl.style.backgroundColor = isConnected ? 'var(--cyber-green)' : 'yellow';
                statusEl.title = isConnected ? '已连接' : '连接中...';
            }
            if (banner) {
                if (isConnected) {
                    banner.style.display = 'none';
                } else {
                    banner.style.display = 'block';
                    banner.textContent = '⚠️ 连接不稳定，正在尝试重连...';
                }
            }
        }
    }

    _updateConnectionQuality(quality) {
        state.setConnectionQuality(quality);
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        switch (quality) {
            case 'good':
                statusEl.style.backgroundColor = 'var(--cyber-green)';
                statusEl.style.boxShadow = '0 0 8px var(--cyber-green)';
                statusEl.title = '连接良好';
                break;
            case 'poor':
                statusEl.style.backgroundColor = 'orange';
                statusEl.style.boxShadow = '0 0 8px orange';
                statusEl.title = '连接不稳定';
                break;
            case 'disconnected':
                statusEl.style.backgroundColor = 'red';
                statusEl.style.boxShadow = '0 0 8px red';
                statusEl.title = '已断开';
                break;
        }

        emit(EventTypes.CONNECTION_QUALITY, { quality });
    }

    _loadTheme() {
        const theme = state.getStateValue('theme') || 'dark';
        document.body.setAttribute('data-theme', theme);
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.textContent = theme === 'light' ? '☀️' : '🌙';
        }
    }

    async _loadHistory() {
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const sessionToken = localStorage.getItem('team_chat_session') || '';
            let historyUrl = `${apiHost}/history?token=${AUTH_TOKEN}`;
            if (sessionToken) {
                historyUrl += `&session=${sessionToken}`;
            }
            const res = await fetch(historyUrl);
            if (res.ok) {
                const serverHistory = await res.json();
                state.loadHistory(serverHistory);
            }
        } catch (e) {
            console.error('[App] Failed to load history:', e);
        }
    }

    _connect() {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('[App] Already connecting, skip');
            return;
        }

        // 获取session token用于远程访问验证
        const sessionToken = localStorage.getItem('team_chat_session') || '';
        let wsUrl = `${GATEWAY_URL}?token=${AUTH_TOKEN}`;
        if (sessionToken) {
            wsUrl += `&session=${sessionToken}`;
        }
        console.log('[App] Connecting to WS:', wsUrl.replace(/token=[^&]+/, 'token=***'));

        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
        }

        this._cancelReconnect();

        try {
            this.ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[App] WS Creation Failed:', e);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => this._onWsOpen();
        this.ws.onmessage = (event) => this._onWsMessage(event);
        this.ws.onclose = (e) => this._onWsClose(e);
        this.ws.onerror = (e) => {
            console.error('[App] WS Error:', e);
            emit('ws:error', e);
        };
        
        emit('ws:connecting');
    }

    _onWsOpen() {
        console.log('[App] WS Connected');
        this.isManualClose = false;
        this.reconnectAttempts = 0;
        this.missedHeartbeats = 0;
        this.lastPongTime = Date.now();
        this._updateConnectionQuality('good');

        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.style.backgroundColor = 'yellow';
        }

        const banner = document.getElementById('connection-banner');
        if (banner) {
            banner.style.display = 'block';
            banner.textContent = '正在握手...';
        }

        emit(EventTypes.UI_TOAST, { message: '正在握手...', type: 'info' });
        
        // 直接发送 connect 请求（不带 nonce）
        // 如果 Gateway 需要 challenge，会返回 connect.challenge 事件
        this._sendConnectRequest();

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL);

        if (this.wasOffline) {
            this.wasOffline = false;
        }

        this._loadHistory();
        this.processedMessageIds.clear();
    }

    _onWsMessage(event) {
        this.lastPongTime = Date.now();
        this.missedHeartbeats = 0;

        if (state.getStateValue('connectionQuality') !== 'good') {
            this._updateConnectionQuality('good');
        }

        try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'ping' || msg.event === 'ping') {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'pong' }));
                }
                return;
            }

            if (msg.type === 'pong') {
                return;
            }

            this._handleWsMessage(msg);
        } catch (e) {
            console.error('[App] WS Parse Error:', e);
        }
    }

    _onWsClose(e) {
        console.log('[App] WS Closed:', e.code);
        state.setConnected(false);

        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.style.backgroundColor = 'red';
        }

        const banner = document.getElementById('connection-banner');
        if (banner) {
            banner.style.display = 'block';
            banner.textContent = '⚠️ 连接已断开，正在尝试重连...';
        }

        emit(EventTypes.CONNECTION_CHANGED, { connected: false });
        emit('ws:close', e);

        if (!this.isManualClose) {
            emit(EventTypes.UI_TOAST, { message: '连接已断开，正在重连...', type: 'error' });
            this._scheduleReconnect();
        }

        this.connectReqId = null;
        if (this.pingTimer) clearInterval(this.pingTimer);
    }

    _sendConnectRequest() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const id = this._generateId();
        this.connectReqId = id;

        const client = {
            id: CLIENT_ID,
            displayName: 'Team Chat Web',
            version: '1.0.0',
            platform: 'web',
            mode: 'webchat'
        };

        const connectReq = {
            type: 'req',
            id,
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: client,
                auth: { token: AUTH_TOKEN },
                role: 'operator',
                scopes: ['operator.admin', 'operator.write', 'operator.read']
            }
        };

        console.log('[App] Sending connect request');
        this.ws.send(JSON.stringify(connectReq));
    }
    
    _respondToChallenge(nonce) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const id = this._generateId();

        // 响应 challenge 使用 connect.challenge 方法，而不是 connect
        const challengeResponse = {
            type: 'req',
            id,
            method: 'connect.challenge',
            params: {
                nonce: nonce
            }
        };

        console.log('[App] Responding to challenge with connect.challenge');
        this.ws.send(JSON.stringify(challengeResponse));
    }

    _sendHeartbeat() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        try {
            this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
            console.error('[App] Ping failed:', e);
        }

        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > HEARTBEAT_TIMEOUT) {
            this.missedHeartbeats++;
            console.warn(`[App] Heartbeat timeout (${this.missedHeartbeats}/${MAX_MISSED_HEARTBEATS})`);
            this._updateConnectionQuality('poor');

            if (this.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
                console.error('[App] Too many missed heartbeats, reconnecting...');
                emit(EventTypes.UI_TOAST, { message: '连接不稳定，正在重连...', type: 'error' });
                this.ws.close(4000, 'Heartbeat timeout');
            }
        }
    }

    _scheduleReconnect() {
        if (this.isManualClose) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_DELAY
        );
        this.reconnectAttempts++;

        console.log(`[App] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        emit(EventTypes.UI_TOAST, { 
            message: `网络不稳定，${Math.ceil(delay / 1000)}秒后重连...`, 
            type: 'info' 
        });

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this._connect();
        }, delay);
    }

    _cancelReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
    }

    _handleWsMessage(msg) {
        // 处理 connect.challenge 事件
        if (msg?.type === 'event' && msg?.event === 'connect.challenge' && msg?.payload?.nonce) {
            console.log('[App] Received connect challenge, responding with nonce');
            this._respondToChallenge(msg.payload.nonce);
            return;
        }
        
        // 处理 connect 响应
        if (msg?.type === 'res' && msg?.id === this.connectReqId) {
            if (msg.ok) {
                state.setConnected(true);

                const statusEl = document.getElementById('connection-status');
                if (statusEl) {
                    statusEl.style.backgroundColor = 'var(--cyber-green)';
                }

                const banner = document.getElementById('connection-banner');
                if (banner) {
                    banner.style.display = 'none';
                }

                emit(EventTypes.UI_TOAST, { message: '连接成功', type: 'success' });
                emit(EventTypes.CONNECTION_CHANGED, { connected: true });
                emit('ws:open');  // 触发 ws:open 事件供 index.html 监听

                // 检查是否需要发送状态汇报（至少间隔2小时）
                this._sendStatusReportIfNeeded();
            } else {
                console.error('[App] WS Handshake Failed:', msg.error);
                const statusEl = document.getElementById('connection-status');
                if (statusEl) {
                    statusEl.style.backgroundColor = 'red';
                }
            }
            return;
        }

        if (msg?.type === 'event' && msg?.event === 'chat' && msg?.payload) {
            this._handleChatMessage(msg.payload);
        }
    }

    _handleChatMessage(payload) {
        const { runId, state: msgState, sessionKey } = payload;
        const sender = this._resolveAgentName(sessionKey);
        const senderAgentId = this._resolveAgentId(sessionKey);
        const content = payload?.message?.content;
        const text = Array.isArray(content) ? content.find(c => c?.type === 'text')?.text : (typeof content === 'string' ? content : null);
        
        // 从 message 对象中提取 model 字段
        const model = payload?.message?.model || null;

        if (!runId) return;

        // 解析并触发日志事件，同时构建工具卡片 HTML
        let toolCardsHtml = '';
        if (Array.isArray(content)) {
            for (const block of content) {
                if (!block || typeof block !== 'object') continue;
                
                if (block.type === 'thinking' && typeof block.thinking === 'string') {
                    emit('agent:thinking', { agentId: senderAgentId, content: block.thinking });
                }
                
                if (block.type === 'tool_use') {
                    emit('agent:tool_call', { 
                        agentId: senderAgentId, 
                        tool: block.name || 'unknown', 
                        params: block.input || {} 
                    });
                    // 添加工具调用卡片
                    toolCardsHtml += renderToolCard(block.name || 'unknown', block.input || {}, 'running', null);
                }
                
                if (block.type === 'tool_result') {
                    emit('agent:tool_result', { 
                        agentId: senderAgentId, 
                        tool: block.tool_use_id || 'unknown', 
                        result: block.content || '' 
                    });
                    // 添加工具结果卡片
                    toolCardsHtml += renderToolCard('工具结果', null, block.is_error ? 'error' : 'success', block.content || '');
                }
            }
        }

        // 如果有工具卡片，附加到消息文本后面
        const fullText = text ? (toolCardsHtml ? text + '\n' + toolCardsHtml : text) : toolCardsHtml;

        if (msgState === 'delta' && typeof text === 'string') {
            this._handleDeltaMessage(runId, sender, senderAgentId, fullText || text, model);
            return;
        }

        if (msgState === 'final') {
            this._handleFinalMessage(runId, sender, senderAgentId, fullText || text, model);
            return;
        }

        if (msgState === 'error') {
            const errMsg = payload.errorMessage || '执行失败';
            emit('agent:error', { agentId: senderAgentId, error: errMsg });
            emit(EventTypes.MESSAGE_RECEIVED, {
                sender,
                text: errMsg,
                isUser: false,
                type: 'error',
                model: null
            });
            this.runMessageEls.delete(runId);

            if (senderAgentId) {
                state.clearPendingTimer(senderAgentId);
                if (!state.hasAgentRuns(senderAgentId)) {
                    state.setAgentIdle(senderAgentId);
                    emit(EventTypes.AGENT_IDLE, { agentId: senderAgentId });
                }
            }
        }
    }

    _handleDeltaMessage(runId, sender, senderAgentId, text, model) {
        let entry = this.runMessageEls.get(runId);

        if (!entry) {
            if (this.processedMessageIds.has(runId)) {
                console.log(`[App] Skipping duplicate runId: ${runId}`);
                return;
            }

            entry = { sender, text: '', lastRenderTime: 0 };
            this.runMessageEls.set(runId, entry);

            if (senderAgentId) {
                state.clearPendingTimer(senderAgentId);
                state.addAgentRun(senderAgentId, runId);
                state.setAgentBusy(senderAgentId);
                emit(EventTypes.AGENT_BUSY, { agentId: senderAgentId });
            }
        }

        entry.text = text;

        const now = Date.now();
        if (now - entry.lastRenderTime > 50) {
            messagesModule.updateStreamingMessage(runId, text, sender, senderAgentId, model);
            entry.lastRenderTime = now;
        }
    }

    _handleFinalMessage(runId, sender, senderAgentId, text, model) {
        const finalText = typeof text === 'string' ? text.trim() : '';
        const entry = this.runMessageEls.get(runId);

        if (senderAgentId) {
            state.clearPendingTimer(senderAgentId);
            state.removeAgentRun(senderAgentId, runId);

            if (!state.hasAgentRuns(senderAgentId)) {
                state.setAgentIdle(senderAgentId);
                emit(EventTypes.AGENT_IDLE, { agentId: senderAgentId });
                this._flushAgentQueue(senderAgentId);
            }

            state.setLastSpeaker(sender);

            if (finalText) {
                state.addAgentLog(senderAgentId, {
                    text: '✅ 完成: ' + finalText.substring(0, 80),
                    type: 'success'
                });
            }
        }

        if (entry) {
            if (finalText) {
                messagesModule.finalizeStreamingMessage(runId, finalText, model);
            }
            this.runMessageEls.delete(runId);
            this.processedMessageIds.add(runId);
        } else if (finalText) {
            emit(EventTypes.MESSAGE_RECEIVED, {
                sender,
                text: finalText,
                isUser: false,
                type: 'final',
                model: model || null
            });
        }
    }

    _handleMessageSend(text, targetAgentId) {
        if (!state.getStateValue('isConnected')) {
            emit(EventTypes.UI_TOAST, { message: '未连接到服务器', type: 'error' });
            return;
        }

        const message = {
            sender: '我',
            text,
            isUser: true,
            timestamp: Date.now(),
            status: 'sent'
        };

        state.addMessage(message);
        emit(EventTypes.MESSAGE_RECEIVED, message);

        apiService.saveMessage(message).catch(e => {
            console.error('[App] Failed to save message to server:', e);
        });

        if (targetAgentId) {
            this._sendOrQueue(targetAgentId, text);
        } else {
            const mentionMatch = text.match(/@([^\s]+)/);
            
            if (mentionMatch && ['所有人', '全体', 'all'].includes(mentionMatch[1])) {
                this._sendToAll(text);
            } else if (mentionMatch) {
                const name = mentionMatch[1];
                const agent = state.getAgentByName(name);
                if (agent) {
                    this._sendOrQueue(agent.agentId, text);
                }
            } else {
                const lastSpeaker = state.getStateValue('lastSpeaker');
                const targetAgent = lastSpeaker
                    ? state.getAgentByName(lastSpeaker)
                    : state.getAgentById('main');
                
                if (targetAgent) {
                    this._sendOrQueue(targetAgent.agentId, text);
                }
            }
        }
    }

    _sendOrQueue(agentId, message) {
        if (state.isAgentBusy(agentId)) {
            state.enqueueForAgent(agentId, message);
            const agent = state.getAgentById(agentId);
            emit(EventTypes.MESSAGE_QUEUED, { agentId, agentName: agent?.name });
            return true;
        }

        this._sendToAgentNow(agentId, message);
        return false;
    }

    _sendToAgentNow(agentId, message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const agent = state.getAgentById(agentId);
        const agentName = agent?.name || agentId;

        const sessionKey = `agent:${agentId}:${agentId}`;
        const contextMessage = `【本地群聊 Team Chat】老板：\n${message.replace(/@[^\s]+\s*/g, '').trim()}`;

        const req = {
            type: 'req',
            id: this._generateId(),
            method: 'agent',
            params: {
                agentId: agentId,
                sessionKey: sessionKey,
                message: contextMessage
            }
        };

        this.ws.send(JSON.stringify(req));

        state.addAgentLog(agentId, {
            text: `📤 发送消息: ${message.substring(0, 50)}...`,
            type: 'message'
        });
    }

    _sendToAll(text) {
        const agents = state.getStateValue('agents');
        const busyQueued = [];

        for (const agent of agents) {
            const msg = `【本地群聊 Team Chat】这是一个本地多 Agent 群聊环境。老板 @ 全体成员，请每个人都在自己的会话里回复。\n\n老板：\n${text.replace(/@所有人|@全体|@all/g, '').trim()}`;
            const queued = this._sendOrQueue(agent.agentId, msg);
            if (queued) busyQueued.push(agent.name);
        }

        if (busyQueued.length) {
            emit(EventTypes.UI_TOAST, {
                message: `⏳ ${busyQueued.join('、')} 忙碌中，已排队等待`,
                type: 'info'
            });
        } else {
            emit(EventTypes.UI_TOAST, {
                message: `已向全部 ${agents.length} 位Agent发送消息`,
                type: 'success'
            });
        }
    }

    _flushAgentQueue(agentId) {
        if (!state.getStateValue('isConnected')) return;
        if (state.isAgentBusy(agentId)) return;

        const queue = state.getAgentQueue(agentId);
        if (!queue.length) return;

        const next = state.dequeueForAgent(agentId);
        if (!next?.message) return;

        this._sendToAgentNow(agentId, next.message);
    }

    _resolveAgentName(sessionKey) {
        const raw = String(sessionKey || '').trim();
        const parts = raw.split(':').filter(Boolean);
        if (parts.length >= 3 && parts[0] === 'agent') {
            const agentId = parts[1];
            const agent = state.getAgentById(agentId);
            return agent ? agent.name : agentId;
        }
        return '系统';
    }

    _resolveAgentId(sessionKey) {
        const raw = String(sessionKey || '').trim();
        const parts = raw.split(':').filter(Boolean);
        if (parts.length >= 3 && parts[0] === 'agent') {
            return parts[1];
        }
        return null;
    }

    _toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
        if (overlay) {
            overlay.classList.toggle('active');
        }
        document.body.style.overflow = sidebar?.classList.contains('active') ? 'hidden' : '';
    }

    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[App] WebSocket not connected');
            emit(EventTypes.UI_TOAST, { message: '未连接到服务器', type: 'error' });
            return false;
        }

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (e) {
            console.error('[App] Send failed:', e);
            emit(EventTypes.UI_TOAST, { message: '发送失败', type: 'error' });
            return false;
        }
    }

    _generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    /**
     * 检查是否需要提醒小龙虾汇报进度
     * 限制：至少间隔2小时，避免刷新页面重复触发
     */
    _sendStatusReportIfNeeded() {
        const STORAGE_KEY = 'lastStatusReportTime';
        const SESSION_KEY = 'statusReportSession';
        const MIN_INTERVAL = 2 * 60 * 60 * 1000; // 2小时

        const lastReportTime = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
        const lastSession = localStorage.getItem(SESSION_KEY);
        const currentSession = this.sessionId || 'unknown';
        const now = Date.now();

        // 检查是否在当前会话中已经发送过
        if (lastSession === currentSession) {
            console.log('[App] Status report already sent in this session');
            return;
        }

        // 检查时间间隔
        if (now - lastReportTime < MIN_INTERVAL) {
            console.log('[App] Status report reminder skipped, last reminder was', new Date(lastReportTime).toLocaleString());
            return;
        }

        // 更新最后提醒时间和会话
        localStorage.setItem(STORAGE_KEY, now.toString());
        localStorage.setItem(SESSION_KEY, currentSession);

        // 只提醒小龙虾汇报进度，具体内容由她自己决定
        const reminder = `@小龙虾 请汇报当前各Agent的任务进度和状态。`;

        setTimeout(() => {
            emit(EventTypes.MESSAGE_SENT, {
                text: reminder,
                agentId: 'main'
            });
            console.log('[App] Status report reminder sent at', new Date().toLocaleString());
        }, 1000);
    }

    destroy() {
        emit(EventTypes.APP_DESTROY);

        if (this.ws) {
            this.isManualClose = true;
            this.ws.close();
            this.ws = null;
        }

        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }

        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        eventBus.removeAllListeners();
        this.initialized = false;

        console.log('[App] Destroyed');
    }
}

const app = new App();

export { app, state, eventBus, EventTypes, emit, on, once, App };
export default app;
