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

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// 开发环境下使用代理，生产环境使用当前 host
const GATEWAY_HOST = window.location.port === '5173' ? 'localhost:18789' : window.location.host;
const GATEWAY_URL = `${WS_PROTOCOL}//${GATEWAY_HOST}/v1/gateway`;
const CLIENT_ID = 'cli';
const AUTH_TOKEN = '6ed82a04d1ee1f774459f0a64d19a79afda1dc10d8d1c49a';

const HEARTBEAT_INTERVAL = 5000;
const HEARTBEAT_TIMEOUT = 15000;
const MAX_MISSED_HEARTBEATS = 2;
const RECONNECT_BASE_DELAY = 500;
const RECONNECT_MAX_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

class App {
    constructor(options = {}) {
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
        this.lastMessageTimestamp = parseInt(localStorage.getItem('lastMessageTimestamp')) || 0;
        this.authToken = options.authToken || AUTH_TOKEN;
        this.syncInterval = 30000; // 每 30 秒同步一次
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
        
        // 启动定期同步
        this._startPeriodicSync();
        
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
            this._pauseHeartbeat();
        } else {
            console.log('[App] App came to foreground');
            this._resumeHeartbeat();
            if (!state.getStateValue('isConnected')) {
                this._cancelReconnect();
                this.reconnectAttempts = 0;
                this._connect();
            } else {
                this._verifyConnection();
            }
        }
    }

    _pauseHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    _resumeHeartbeat() {
        if (!this.pingTimer) {
            this.pingTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL);
        }
    }

    _verifyConnection() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[App] Connection verify failed, reconnecting...');
            state.setConnected(false);
            this._cancelReconnect();
            this.reconnectAttempts = 0;
            this._connect();
            return;
        }
        this.missedHeartbeats = 0;
        this.ws.send(JSON.stringify({ type: 'ping' }));
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
            let historyUrl = `${apiHost}/history?token=${this.authToken}`;
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
        let wsUrl = `${GATEWAY_URL}?token=${this.authToken}`;
        if (sessionToken) {
            wsUrl += `&session=${sessionToken}`;
        }
        
        // 移动端调试信息
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log(`[App] Connecting to WS (${isMobile ? 'Mobile' : 'Desktop'}):`, wsUrl.replace(/token=[^&]+/, 'token=***'));
        console.log('[App] Browser info:', navigator.userAgent.substring(0, 100));

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
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            console.error(`[App] WS Error (${isMobile ? 'Mobile' : 'Desktop'}):`, e);
            console.error('[App] WS Error details:', {
                type: e.type,
                target: e.target?.url?.replace(/token=[^&]+/, 'token=***'),
                readyState: e.target?.readyState
            });
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
        
        // 不要立即发送 connect 请求，等待 Gateway 发送 connect.challenge 事件
        // this._sendConnectRequest();

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL);

        if (this.wasOffline) {
            this.wasOffline = false;
            this._syncMissedMessages();
        } else {
            this._loadHistory();
        }
        this.processedMessageIds.clear();
    }

    async _syncMissedMessages() {
        console.log('[App] Syncing missed messages since', this.lastMessageTimestamp);
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const res = await fetch(`${apiHost}/api/messages/since?timestamp=${this.lastMessageTimestamp}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`[App] Synced ${data.count} missed messages`);
                
                if (data.messages && data.messages.length > 0) {
                    for (const msg of data.messages) {
                        if (!this.processedMessageIds.has(msg.timestamp)) {
                            this.processedMessageIds.add(msg.timestamp);
                            emit(EventTypes.MESSAGE_RECEIVED, {
                                sender: msg.sender,
                                text: msg.text,
                                isUser: msg.sender === '我',
                                timestamp: msg.timestamp,
                                modelInfo: msg.modelInfo || null
                            });
                        }
                    }
                }
                
                if (data.latestTimestamp > this.lastMessageTimestamp) {
                    this.lastMessageTimestamp = data.latestTimestamp;
                    localStorage.setItem('lastMessageTimestamp', data.latestTimestamp.toString());
                }
                
                emit(EventTypes.UI_TOAST, { message: `已同步 ${data.count} 条消息`, type: 'success' });
            }
        } catch (e) {
            console.error('[App] Sync missed messages failed:', e);
            this._loadHistory();
        }
    }

    _startPeriodicSync() {
        // 清除之前的定时器
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        
        // 每 30 秒同步一次
        this.syncTimer = setInterval(() => {
            this._syncMissedMessages();
        }, this.syncInterval);
        
        console.log('[App] Started periodic sync every', this.syncInterval / 1000, 'seconds');
    }

    _stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    // 手动同步
    async manualSync() {
        console.log('[App] Manual sync triggered');
        await this._syncMissedMessages();
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
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log(`[App] WS Closed (${isMobile ? 'Mobile' : 'Desktop'}):`, e.code, e.reason);
        console.log('[App] WS Close details:', {
            code: e.code,
            reason: e.reason,
            wasClean: e.wasClean
        });
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
                auth: { token: this.authToken },
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
        this.connectReqId = id;

        // 收到 challenge 后发送 connect 请求
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
                auth: { token: this.authToken },
                role: 'operator',
                scopes: ['operator.admin', 'operator.write', 'operator.read']
            }
        };

        console.log('[App] Received challenge, sending connect request');
        this.ws.send(JSON.stringify(connectReq));
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
        
        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log('[App] Max reconnect attempts reached, waiting for user action');
            emit(EventTypes.UI_TOAST, { 
                message: '连接失败，请检查网络后刷新页面', 
                type: 'error' 
            });
            return;
        }

        const delay = RECONNECT_BASE_DELAY;
        this.reconnectAttempts++;

        console.log(`[App] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        emit(EventTypes.UI_TOAST, { 
            message: `正在重连... (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 
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
        
        const model = payload?.message?.model || null;

        // 调试日志
        console.log('[App] Chat message payload:', {
            runId,
            state: msgState,
            sessionId: payload.sessionId,
            contentTypes: Array.isArray(content) ? content.map(c => c?.type) : typeof content
        });

        if (!runId) return;

        // 使用正确的 sessionId
        const currentSessionId = state.getStateValue('currentSessionId');
        const effectiveSessionId = payload.sessionId || currentSessionId || runId;

        let thinking = null;
        const tools = [];
        
        if (Array.isArray(content)) {
            for (const block of content) {
                if (!block || typeof block !== 'object') continue;
                
                // 兼容多种 thinking 格式
                if (block.type === 'thinking' || block.type === 'thought') {
                    thinking = block.thinking || block.thought || block.content || '';
                    console.log('[App] Found thinking block:', thinking.substring(0, 100));
                    emit('agent:thinking', { agentId: senderAgentId, content: thinking });
                }
                
                // 兼容多种 tool_use 格式
                if (block.type === 'tool_use' || block.type === 'toolCall' || block.type === 'tool_call') {
                    const toolName = block.name || block.toolName || 'unknown';
                    const toolParams = block.input || block.params || block.arguments || {};
                    tools.push({
                        type: 'tool_use',
                        name: toolName,
                        params: toolParams,
                        status: 'running'
                    });
                    console.log('[App] Found tool_use block:', toolName);
                    emit('agent:tool_call', { 
                        agentId: senderAgentId, 
                        tool: toolName, 
                        params: toolParams 
                    });
                }
                
                // 兼容多种 tool_result 格式
                if (block.type === 'tool_result' || block.type === 'toolResult') {
                    const resultContent = block.content || block.result || '';
                    tools.push({
                        type: 'tool_result',
                        result: resultContent,
                        status: block.is_error ? 'error' : 'success'
                    });
                    emit('agent:tool_result', { 
                        agentId: senderAgentId, 
                        tool: block.tool_use_id || 'unknown', 
                        result: resultContent 
                    });
                }
            }
        }

        if (msgState === 'delta' && typeof text === 'string') {
            this._handleDeltaMessage(runId, sender, senderAgentId, text, model, thinking, tools, effectiveSessionId);
            return;
        }

        if (msgState === 'final') {
            this._handleFinalMessage(runId, sender, senderAgentId, text, model, thinking, tools, effectiveSessionId);
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
                model: null,
                sessionId: effectiveSessionId
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

    _handleDeltaMessage(runId, sender, senderAgentId, text, model, thinking = null, tools = [], sessionId = null) {
        let entry = this.runMessageEls.get(runId);

        if (!entry) {
            if (this.processedMessageIds.has(runId)) {
                console.log(`[App] Skipping duplicate runId: ${runId}`);
                return;
            }

            entry = { sender, text: '', lastRenderTime: 0, sessionId: sessionId || runId, thinking, tools };
            this.runMessageEls.set(runId, entry);

            if (senderAgentId) {
                state.clearPendingTimer(senderAgentId);
                state.addAgentRun(senderAgentId, runId);
                state.setAgentBusy(senderAgentId);
                state.addOrUpdateSession(sessionId || runId, senderAgentId, sender);
                emit(EventTypes.AGENT_BUSY, { agentId: senderAgentId });
            }
        }
        
        if (thinking) entry.thinking = thinking;
        if (tools.length > 0) entry.tools = tools;
        entry.text = text;

        const now = Date.now();
        if (now - entry.lastRenderTime > 50) {
            messagesModule.updateStreamingMessage(runId, text, sender, senderAgentId, model, thinking, tools);
            entry.lastRenderTime = now;
        }
    }

    _handleFinalMessage(runId, sender, senderAgentId, text, model, thinking = null, tools = [], sessionId = null) {
        const finalText = typeof text === 'string' ? text.trim() : '';
        const entry = this.runMessageEls.get(runId);
        const effectiveSessionId = sessionId || (entry?.sessionId) || runId;

        if (senderAgentId) {
            state.clearPendingTimer(senderAgentId);
            state.removeAgentRun(senderAgentId, runId);

            if (!state.hasAgentRuns(senderAgentId)) {
                state.setAgentIdle(senderAgentId);
                emit(EventTypes.AGENT_IDLE, { agentId: senderAgentId });
                this._flushAgentQueue(senderAgentId);
            }

            state.setLastSpeaker(sender);
            state.addOrUpdateSession(effectiveSessionId, senderAgentId, sender);

            if (finalText) {
                state.addAgentLog(senderAgentId, {
                    text: '✅ 完成: ' + finalText.substring(0, 80),
                    type: 'success'
                });
            }
        }

        if (entry) {
            if (finalText) {
                messagesModule.finalizeStreamingMessage(runId, finalText, model, entry.thinking || thinking, entry.tools || tools);
            }
            this.runMessageEls.delete(runId);
            this.processedMessageIds.add(runId);
        } else if (finalText) {
            const timestamp = Date.now();
            emit(EventTypes.MESSAGE_RECEIVED, {
                sender,
                text: finalText,
                isUser: false,
                type: 'final',
                model: model || null,
                sessionId: effectiveSessionId,
                thinking: thinking,
                tools: tools,
                timestamp
            });
            this._updateLastMessageTimestamp(timestamp);
        }

        // 保存 Agent 消息到服务器历史记录
        if (finalText && senderAgentId) {
            const agentMessage = {
                sender,
                text: finalText,
                isUser: false,
                timestamp: Date.now(),
                model: model || null,
                sessionId: effectiveSessionId,
                agentId: senderAgentId,
                runId
            };
            apiService.saveMessage(agentMessage).catch(e => {
                console.error('[App] Failed to save agent message to server:', e);
            });
        }
    }

    _updateLastMessageTimestamp(timestamp) {
        if (timestamp > this.lastMessageTimestamp) {
            this.lastMessageTimestamp = timestamp;
            localStorage.setItem('lastMessageTimestamp', timestamp.toString());
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

        const sessionId = `session-${agentId}`;

        const sessionKey = `agent:${agentId}:${agentId}`;
        const contextMessage = `【本地群聊 Team Chat】老板：\n${message.replace(/@[^\s]+\s*/g, '').trim()}`;

        const req = {
            type: 'req',
            id: this._generateId(),
            method: 'agent',
            params: {
                agentId: agentId,
                sessionKey: sessionKey,
                message: contextMessage,
                sessionId: sessionId
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
