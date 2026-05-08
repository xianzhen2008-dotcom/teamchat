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
// 优先走 TeamChat 同源代理，避免前端直接暴露给 Gateway 的瞬时抖动
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const WS_HOST = window.location.port === '5173'
    ? `${window.location.hostname}:18788`
    : window.location.host;
const GATEWAY_URL = `${WS_PROTOCOL}//${WS_HOST}/v1/gateway`;
const CLIENT_ID = 'cli';
// Token 将通过 /api/gateway-token 动态获取

const HEARTBEAT_INTERVAL = 5000;
const HEARTBEAT_TIMEOUT = 15000;
const MAX_MISSED_HEARTBEATS = 2;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 15000;
const MAX_RECONNECT_ATTEMPTS = 10;
const AUTH_RATE_LIMIT_DELAY = 30000;
const STREAM_FLUSH_INTERVAL = 80;
const MOBILE_RENDER_RECOVERY_ATTEMPTS = 8;

class App {
    constructor(options = {}) {
        this.ws = null;
        this.connectReqId = null;
        this.syncTimer = null;
        this.pingTimer = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.connectFallbackTimer = null;
        this.isManualClose = false;
        this.wasOffline = false;
        this.missedHeartbeats = 0;
        this.lastPongTime = Date.now();
        this.runMessageEls = new Map();
        this.processedMessageIds = new Set();
        this.initialized = false;
        this.lastMessageTimestamp = parseInt(localStorage.getItem('lastMessageTimestamp')) || 0;
        this.initialAuthToken = options.authToken || null;
        this.initialAuthTokenSource = options.authTokenSource || (options.authToken ? 'bootstrap' : null);
        this.authToken = this.initialAuthToken;
        this.lastHttpFallbackToastAt = 0;
        this.lastAuthToastAt = 0;
        this.authRetryBlockedUntil = 0;
        this.syncInterval = 30000;
        this.agentTraceBuffer = new Map();
        this.connectBlockedReason = null;
        this.mobileRenderRecoveryTimer = null;
        this.mobileRenderRecoveryWatchdog = null;
        this.backgroundHistoryHydrated = false;
    }

    async init() {
        if (this.initialized) {
            console.warn('[App] Already initialized');
            return;
        }

        console.log('[App] Initializing...');
        
        emit(EventTypes.APP_INIT);
        
        // 首先获取 Gateway Token
        await this._fetchGatewayToken();
        
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

    async _fetchGatewayToken() {
        const fallbackToken = this.initialAuthTokenSource === 'cache' ? this.initialAuthToken : null;

        if (this.initialAuthToken && this.initialAuthTokenSource !== 'cache') {
            this.authToken = this.initialAuthToken;
            this.connectBlockedReason = null;
            console.log('[App] Using gateway token from bootstrap data');
            return;
        }

        if (fallbackToken) {
            console.log('[App] Cached gateway token detected, attempting server refresh');
        }

        try {
            const sessionToken = localStorage.getItem('team_chat_session') || '';
            const headers = sessionToken ? { 'X-Session-Token': sessionToken } : {};
            const resp = await fetch('/api/gateway-token', { headers });
            if (resp.ok) {
                const data = await resp.json();
                if (data?.token) {
                    this.authToken = data.token;
                    this.connectBlockedReason = null;
                    localStorage.setItem('team_chat_token', data.token);
                    console.log('[App] Loaded gateway token from server');
                    return;
                }
            }
        } catch (e) {
            console.warn('[App] Failed to fetch gateway token:', e?.message || e);
        }

        if (fallbackToken) {
            this.authToken = fallbackToken;
            this.connectBlockedReason = null;
            console.warn('[App] Falling back to cached gateway token');
            return;
        }

        this.authToken = null;
        console.log('[App] No gateway token available, continue with session auth only');
    }

    _setupEventListeners() {
        on(EventTypes.MESSAGE_SENT, ({ text, agentId }) => {
            this._handleMessageSend(text, agentId);
        });

        on(EventTypes.THEME_CHANGED, ({ skin, theme }) => {
            const nextSkin = skin || theme || 'fresh';
            state.setTheme(nextSkin);
            document.body.setAttribute('data-skin', nextSkin);
            document.body.removeAttribute('data-theme');
        });

        on(EventTypes.UI_SIDEBAR_TOGGLE, () => {
            this._toggleSidebar();
        });

        on(EventTypes.FILTER_CHANGED, (payload) => {
            const agentNames = Array.isArray(payload) ? payload : payload?.agentNames;
            if (agentNames && agentNames.length > 0) {
                state.setFilterAgents(agentNames);
            } else {
                state.clearFilter();
            }
            if (payload && Object.prototype.hasOwnProperty.call(payload, 'showSystemMessages')) {
                state.setShowSystemMessages(Boolean(payload.showSystemMessages));
            }
            if (payload && Object.prototype.hasOwnProperty.call(payload, 'hideHeartbeatPrompts')) {
                state.setHideHeartbeatPrompts(payload.hideHeartbeatPrompts !== false);
            }
        });

        on('agent:trace', ({ agentId, trace }) => {
            this._recordAgentTrace(agentId, trace);
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
        // 服务端不支持客户端主动发送心跳
        // 通过服务端发送的 event health / event presence 来检测连接状态
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
        const skin = state.getStateValue('theme') || localStorage.getItem('team_chat_skin') || 'fresh';
        document.body.setAttribute('data-skin', skin);
        document.body.removeAttribute('data-theme');
    }

    async _loadHistory(options = {}) {
        const background = Boolean(options.background);
        const hasRenderedHistory = state.getStateValue('historyLoaded');
        const existingMessages = state.getState('messages') || [];
        const shouldShowLoading = !background && !hasRenderedHistory && existingMessages.length === 0;
        const isRemote = !IS_LOCAL;
        const isNarrowViewport = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        const historyPlans = background
            ? [{ limit: 600, timeoutMs: isRemote ? 15000 : 12000 }]
            : (isRemote || isNarrowViewport
                ? [
                    { limit: 60, timeoutMs: 6000 },
                    { limit: 120, timeoutMs: 9000 },
                    { limit: 240, timeoutMs: 12000 }
                ]
                : [{ limit: 600, timeoutMs: 12000 }]);

        if (shouldShowLoading) {
            state.setState({ historyLoading: true, historyLoaded: false });
            messagesModule.render();
        }
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const sessionToken = localStorage.getItem('team_chat_session') || '';
            let res = null;
            let lastError = null;
            let resolvedPlan = historyPlans[historyPlans.length - 1];

            for (const plan of historyPlans) {
                let historyUrl = `${apiHost}/history?limit=${plan.limit}`;
                const params = new URLSearchParams();
                if (this.authToken) {
                    params.set('token', this.authToken);
                }
                if (sessionToken) {
                    params.set('session', sessionToken);
                }
                const extraQuery = params.toString();
                if (extraQuery) {
                    historyUrl += `&${extraQuery}`;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), plan.timeoutMs);
                try {
                    res = await fetch(historyUrl, {
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                    clearTimeout(timeoutId);
                    if (res.ok || res.status === 401) {
                        resolvedPlan = plan;
                        break;
                    }
                    lastError = new Error(`history_http_${res.status}`);
                } catch (error) {
                    lastError = error;
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            if (!res) {
                throw lastError || new Error('history_unavailable');
            }
            if (res.status === 401) {
                console.warn('[App] History request unauthorized, redirecting to login');
                const currentUrl = new URL(window.location.href);
                window.location.replace(`/team_chat_login.html?returnTo=${encodeURIComponent(currentUrl.pathname + currentUrl.search)}`);
                return;
            }
            if (res.ok) {
                const serverHistory = await res.json();
                const shouldTreatAsSnapshot = background ? false : resolvedPlan.limit < 600;
                state.loadHistory(serverHistory, {
                    partial: shouldTreatAsSnapshot,
                    snapshotLimit: resolvedPlan.limit
                });
                state.setState({ historyError: '' });
                this._scheduleMobileRenderRecovery('history-loaded');
                const latestTimestamp = serverHistory.reduce(
                    (max, message) => Math.max(max, Number(message?.timestamp) || 0),
                    0
                );
                if (latestTimestamp > 0) {
                    this._updateLastMessageTimestamp(latestTimestamp);
                }

                if (!background && (isRemote || isNarrowViewport) && !this.backgroundHistoryHydrated) {
                    this.backgroundHistoryHydrated = true;
                    setTimeout(() => {
                        Promise.resolve(this._loadHistory({ background: true })).catch(() => {});
                    }, 1200);
                }
            }
        } catch (e) {
            console.error('[App] Failed to load history:', e);
            const isAbort = e?.name === 'AbortError';
            if (shouldShowLoading) {
                state.setState({
                    historyError: isAbort ? '历史消息加载超时，正在尝试重新连接…' : '历史消息加载失败，请检查网络后重试。'
                });
            }
            const retryCount = Number(options.retryCount || 0);
            if (!background && retryCount < 1) {
                setTimeout(() => {
                    this._loadHistory({ ...options, retryCount: retryCount + 1 });
                }, 2000);
            }
        } finally {
            state.setState({ historyLoading: false, historyLoaded: true });
            if (shouldShowLoading) {
                messagesModule.render();
            }
            this._scheduleMobileRenderRecovery('history-finally');
        }
    }

    _connect() {
        if (this.connectBlockedReason) {
            console.log('[App] Connect suppressed:', this.connectBlockedReason);
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('[App] Already connecting, skip');
            return;
        }

        // 获取session token用于远程访问验证
        const sessionToken = localStorage.getItem('team_chat_session') || '';
        // auth.mode: "none" 时不发送 token
        let wsUrl = GATEWAY_URL;
        if (this.authToken) {
            wsUrl += `?token=${this.authToken}`;
            if (sessionToken) {
                wsUrl += `&session=${sessionToken}`;
            }
        } else if (sessionToken) {
            wsUrl += `?session=${sessionToken}`;
        }
        
        // 移动端调试信息
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log(`[App] Connecting to WS (${isMobile ? 'Mobile' : 'Desktop'}):`, wsUrl.replace(/token=[^&]+/, 'token=***'));
        console.log('[App] Browser info:', navigator.userAgent.substring(0, 100));
        console.log('[App] Auth token present:', !!this.authToken, 'Token length:', this.authToken?.length || 0);

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

        this._scheduleInitialConnectRequest();

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL);

        if (this.wasOffline) {
            this.wasOffline = false;
            this._syncMissedMessages();
        } else {
            this._loadHistory({ background: true });
        }
        this.processedMessageIds.clear();
    }

    async _syncMissedMessages() {
        console.log('[App] Syncing missed messages since', this.lastMessageTimestamp);
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const sessionToken = localStorage.getItem('team_chat_session') || '';
            const params = new URLSearchParams({
                timestamp: String(this.lastMessageTimestamp)
            });
            if (this.authToken) {
                params.set('token', this.authToken);
            }
            if (sessionToken) {
                params.set('session', sessionToken);
            }
            const res = await fetch(`${apiHost}/api/messages/since?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`[App] Synced ${data.count} missed messages`);
                
                let visibleSyncedCount = 0;

                if (data.messages && data.messages.length > 0) {
                    const normalizedMessages = data.messages.map((msg) => ({
                        ...msg,
                        _synced: true
                    }));
                    visibleSyncedCount = normalizedMessages.filter((msg) => !window.__TEAMCHAT_IS_MESSAGE_HIDDEN__?.(msg)).length;
                    state.loadHistory(normalizedMessages, { partial: true });
                    this._scheduleMobileRenderRecovery('sync-missed');
                }
                
                if (data.latestTimestamp > this.lastMessageTimestamp) {
                    this.lastMessageTimestamp = data.latestTimestamp;
                    localStorage.setItem('lastMessageTimestamp', data.latestTimestamp.toString());
                }
                
                const syncedToast = visibleSyncedCount > 0
                    ? `已同步 ${visibleSyncedCount} 条可见消息`
                    : data.count > 0
                        ? `已同步 ${data.count} 条更新，其中暂无新的可见消息`
                        : '没有新的消息更新';
                emit(EventTypes.UI_TOAST, { message: syncedToast, type: visibleSyncedCount > 0 ? 'success' : 'info' });
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

    _isMobileRecoveryViewport() {
        return Boolean(
            window.matchMedia?.('(max-width: 768px)')?.matches
            && (
                'ontouchstart' in window
                || navigator.maxTouchPoints > 0
                || navigator.msMaxTouchPoints > 0
            )
        );
    }

    _scheduleMobileRenderRecovery(reason = 'unknown') {
        if (!this._isMobileRecoveryViewport()) return;

        if (this.mobileRenderRecoveryTimer) {
            clearTimeout(this.mobileRenderRecoveryTimer);
        }

        this.mobileRenderRecoveryTimer = setTimeout(() => {
            const messages = state.getState('messages') || [];
            const visibleMessages = Array.isArray(messages)
                ? messages.filter((message) => !window.__TEAMCHAT_IS_MESSAGE_HIDDEN__?.(message))
                : [];
            const container = document.querySelector('.messages-view');
            if (!container) return;

            const renderedCount = container.querySelectorAll('.msg').length;
            const loadingState = container.querySelector('.messages-loading-state');

            if (visibleMessages.length > 0 && renderedCount === 0) {
                console.warn(`[App] Mobile render recovery triggered (${reason})`, {
                    visibleMessages: visibleMessages.length,
                    renderedCount
                });
                loadingState?.remove();
                container.classList.remove('history-refreshing');
                if (typeof messagesModule._doRender === 'function') {
                    messagesModule._doRender();
                } else {
                    messagesModule.render();
                }
            }
        }, 140);

        if (!this.mobileRenderRecoveryWatchdog) {
            let attemptsLeft = MOBILE_RENDER_RECOVERY_ATTEMPTS;
            this.mobileRenderRecoveryWatchdog = setInterval(() => {
                const container = document.querySelector('.messages-view');
                const visibleMessages = (state.getState('messages') || []).filter((message) => !window.__TEAMCHAT_IS_MESSAGE_HIDDEN__?.(message));
                const renderedCount = container?.querySelectorAll('.msg').length || 0;
                const historyLoaded = Boolean(state.getStateValue('historyLoaded'));

                if (!container || renderedCount > 0 || visibleMessages.length === 0 || !historyLoaded || attemptsLeft <= 0) {
                    if (renderedCount > 0 || attemptsLeft <= 0) {
                        clearInterval(this.mobileRenderRecoveryWatchdog);
                        this.mobileRenderRecoveryWatchdog = null;
                    }
                    attemptsLeft -= 1;
                    return;
                }

                console.warn('[App] Mobile render watchdog forcing render', {
                    visibleMessages: visibleMessages.length,
                    attemptsLeft
                });
                container.querySelector('.messages-loading-state')?.remove();
                container.classList.remove('history-refreshing');
                if (typeof messagesModule._doRender === 'function') {
                    messagesModule._doRender();
                } else {
                    messagesModule.render();
                }
                attemptsLeft -= 1;
            }, 900);
        }
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
            console.log('[App] WS Received:', msg.type, msg.event || '', msg.id?.substring(0, 8) || '');

            // 服务端不会发送 ping，只通过 event health / event presence 检测连接
            // 如果收到 ping/pong，直接忽略
            if (msg.type === 'ping' || msg.type === 'pong' || 
                msg.event === 'ping' || msg.event === 'pong' ||
                msg.method === 'ping' || msg.method === 'pong') {
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

        // 注意：不要在关闭时重置 connectReqId
        // 因为可能在收到连接响应之前连接断开，导致响应无法匹配
        // this.connectReqId = null;
        this._clearPendingConnectFallback();
        if (this.pingTimer) clearInterval(this.pingTimer);
    }

    _scheduleInitialConnectRequest() {
        this._clearPendingConnectFallback();
        this.connectFallbackTimer = setTimeout(() => {
            this.connectFallbackTimer = null;
            this._sendConnectRequest();
        }, 150);
    }

    _clearPendingConnectFallback() {
        if (this.connectFallbackTimer) {
            clearTimeout(this.connectFallbackTimer);
            this.connectFallbackTimer = null;
        }
    }

    _buildConnectParams() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const client = {
            id: CLIENT_ID,
            displayName: 'Team Chat Web',
            version: '1.0.0',
            platform: 'web',
            mode: 'webchat'
        };

        const connectParams = {
            minProtocol: 3,
            maxProtocol: 3,
            client: client,
            role: 'operator',
            scopes: ['operator.admin', 'operator.write', 'operator.read']
        };

        if (this.authToken) {
            connectParams.auth = {
                token: this.authToken
            };
        }

        return connectParams;
    }

    _sendConnectRequest(requestId = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const id = requestId || this.connectReqId || this._generateId();
        this.connectReqId = id;

        const connectReq = {
            type: 'req',
            id,
            method: 'connect',
            params: this._buildConnectParams()
        };

        console.log('[App] CONNECT_SENT', JSON.stringify(connectReq));
        this.ws.send(JSON.stringify(connectReq));
    }

    _respondToChallenge() {
        this._clearPendingConnectFallback();
        console.log('[App] Received connect challenge, resending connect request');
        this._sendConnectRequest(this.connectReqId || this._generateId());
    }

    _sendHeartbeat() {
        // 服务端不支持客户端主动发送心跳，只更新最后活动时间
        // 通过服务端发送的 event health / event presence 来检测连接状态
        this.lastPongTime = Date.now();
        this.missedHeartbeats = 0;
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

        const now = Date.now();
        const blockedDelay = this.authRetryBlockedUntil > now
            ? this.authRetryBlockedUntil - now
            : 0;
        this.reconnectAttempts++;
        const backoffDelay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, Math.max(this.reconnectAttempts - 1, 0)),
            RECONNECT_MAX_DELAY
        );
        const delay = Math.max(backoffDelay, blockedDelay);

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
        this._clearPendingConnectFallback();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
    }

    _handleConnectFailure(error) {
        const detailCode = error?.details?.code || '';
        const errorMessage = String(error?.message || '');
        const now = Date.now();

        if (detailCode === 'AUTH_RATE_LIMITED' || errorMessage.includes('too many failed authentication attempts')) {
            this.authRetryBlockedUntil = now + AUTH_RATE_LIMIT_DELAY;
            if (now - this.lastAuthToastAt > 5000) {
                this.lastAuthToastAt = now;
                emit(EventTypes.UI_TOAST, {
                    message: '认证尝试过于频繁，30 秒后自动重试',
                    type: 'warning'
                });
            }
            return;
        }

        if (detailCode === 'CONTROL_UI_DEVICE_IDENTITY_REQUIRED') {
            this.isManualClose = true;
            this.connectBlockedReason = 'device_identity';
            this._cancelReconnect();
            state.setConnected(false);
            if (now - this.lastAuthToastAt > 5000) {
                this.lastAuthToastAt = now;
                emit(EventTypes.UI_TOAST, {
                    message: '当前访问环境不支持该握手方式，请改用 HTTPS 或 localhost',
                    type: 'error'
                });
            }
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(4001, 'Unsupported device identity context');
            }
            return;
        }
    }

    _handleWsMessage(msg) {
        if (msg?.type === 'event' && msg?.event === 'connect.challenge') {
            this._respondToChallenge();
            return;
        }

        // 处理连接响应 - 支持两种方式：匹配 connectReqId 或检测 connect 方法的成功响应
        const isConnectResponse = msg?.type === 'res' && 
            (msg?.id === this.connectReqId || 
             (msg?.ok === true && !state.getStateValue('isConnected')));
        
        if (isConnectResponse) {
            console.log('[App] WS Received: res id:', msg.id, 'ok:', msg.ok, 'expected:', this.connectReqId, 'isConnected:', state.getStateValue('isConnected'));
            if (msg.ok) {
                this.connectBlockedReason = null;
                state.setConnected(true);
                const statusEl = document.getElementById('connection-status');
                if (statusEl) {
                    statusEl.style.backgroundColor = 'var(--cyber-green)';
                }
                const banner = document.getElementById('connection-banner');
                if (banner) {
                    banner.style.display = 'none';
                }
                this.authRetryBlockedUntil = 0;
                emit(EventTypes.UI_TOAST, { message: '连接成功', type: 'success' });
                emit(EventTypes.CONNECTION_CHANGED, { connected: true });
                emit('ws:open');
                console.log('[App] CONNECT_SUCCESS');
            } else {
                console.error('[App] CONNECT_FAILED:', msg.error || 'unknown error');
                const statusEl = document.getElementById('connection-status');
                if (statusEl) {
                    statusEl.style.backgroundColor = 'red';
                }
                this._handleConnectFailure(msg.error);
            }
            return;
        }

        if (msg?.type === 'res' && msg?.ok === false) {
            console.log('[App] SEND_FAILED_RAW:', JSON.stringify(msg));
            console.log('[App] SERVER_RESPONSE:', msg);
            console.log('[App] SEND_FAILED_ERROR:', msg.error || 'unknown error');
        }

        if (msg?.type === 'event' && msg?.event === 'chat' && msg?.payload) {
            console.log('[App] WS Received: event chat', JSON.stringify(msg.payload).substring(0, 200));
            this._handleChatMessage(msg.payload);
        }
    }

    _handleChatMessage(payload) {
        const { runId, state: msgState, sessionKey } = payload;
        const sender = this._resolveAgentName(sessionKey);
        const senderAgentId = this._resolveAgentId(sessionKey);
        const content = payload?.message?.content;
        const textBlocks = Array.isArray(content)
            ? content
                .filter(block => block?.type === 'text' && typeof block.text === 'string')
                .map(block => block.text)
                .filter(Boolean)
            : [];
        // Realtime payloads may prepend action-log text blocks before the final assistant reply.
        const text = Array.isArray(content)
            ? (textBlocks[textBlocks.length - 1] || textBlocks[0] || null)
            : (typeof content === 'string' ? content : null);

        const realtimeModel = this._resolveRealtimeModel(payload);
        const model = realtimeModel.modelId;
        const role = payload?.message?.role || null;

        // 跳过用户消息，避免重复显示
        if (role === 'user') {
            console.log('[App] Skipping user message echo from gateway');
            return;
        }

        if (!runId) return;

        const sessionKeyPart = this._resolveSessionKey(sessionKey);
        const sessionId = payload?.message?.sessionId || payload?.sessionId || sessionKeyPart || runId;

        let thinking = null;
        const tools = [];
        const actionLogs = [];
        
        if (Array.isArray(content)) {
            for (const block of content) {
                if (!block || typeof block !== 'object') continue;
                
                // 兼容多种 thinking 格式
                if (block.type === 'thinking' || block.type === 'thought') {
                    thinking = block.thinking || block.thought || block.content || '';
                    console.log('[App] Found thinking block:', thinking.substring(0, 100));
                    emit('agent:thinking', { agentId: senderAgentId, content: thinking });
                    actionLogs.push({
                        type: 'thinking',
                        title: '思考过程',
                        content: thinking,
                        status: 'info'
                    });
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
                    actionLogs.push({
                        type: 'tool_use',
                        title: `调用工具 ${toolName}`,
                        content: typeof toolParams === 'string' ? toolParams : JSON.stringify(toolParams, null, 2),
                        status: 'running'
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
                    actionLogs.push({
                        type: 'tool_result',
                        title: `${block.tool_use_id || '工具'} 返回`,
                        content: typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2),
                        status: block.is_error ? 'error' : 'success'
                    });
                }
            }
        }

        actionLogs.forEach((trace) => this._recordAgentTrace(senderAgentId, trace));
        const bufferedActionLogs = this._getAgentTrace(senderAgentId);

        if (msgState === 'delta' && typeof text === 'string') {
            this._handleDeltaMessage(runId, sender, senderAgentId, text, model, thinking, tools, sessionId, bufferedActionLogs);
            return;
        }

        if (msgState === 'final') {
            this._handleFinalMessage(runId, sender, senderAgentId, text, model, thinking, tools, sessionId, bufferedActionLogs, realtimeModel.modelInfo);
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
                sessionId: sessionId
            });
            this.runMessageEls.delete(runId);

            if (senderAgentId) {
                state.clearPendingTimer(senderAgentId);
                if (!state.hasAgentRuns(senderAgentId)) {
                    state.setAgentIdle(senderAgentId);
                    emit(EventTypes.AGENT_IDLE, { agentId: senderAgentId });
                }
                this._clearAgentTrace(senderAgentId);
            }
        }
    }

    _handleDeltaMessage(runId, sender, senderAgentId, text, model, thinking = null, tools = [], sessionId = null, actionLogs = []) {
        let entry = this.runMessageEls.get(runId);
        const isNewEntry = !entry;

        if (!entry) {
            if (this.processedMessageIds.has(runId)) {
                console.log(`[App] Skipping duplicate runId: ${runId}`);
                return;
            }

            entry = {
                sender,
                agentId: senderAgentId,
                text: '',
                renderedText: '',
                sessionId: sessionId || runId,
                thinking,
                tools,
                actionLogs,
                flushTimer: null
            };
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
        if (actionLogs.length > 0) entry.actionLogs = actionLogs;
        entry.text = text;
        if (model) entry.model = model;
        if (sessionId) entry.sessionId = sessionId;

        if (isNewEntry) {
            this._flushStreamingEntry(runId);
            return;
        }

        if (!entry.flushTimer) {
            entry.flushTimer = window.setTimeout(() => {
                this._flushStreamingEntry(runId);
            }, STREAM_FLUSH_INTERVAL);
        }
    }

    _handleFinalMessage(runId, sender, senderAgentId, text, model, thinking = null, tools = [], sessionId = null, actionLogs = [], realtimeModelInfo = null) {
        // 🛡️ 防止重复处理同一个 runId
        if (this.processedMessageIds.has(runId)) {
            console.log(`[App] Skipping duplicate final message for runId: ${runId}`);
            return;
        }

        const finalText = typeof text === 'string' ? text.trim() : '';
        const entry = this.runMessageEls.get(runId);
        if (entry?.flushTimer) {
            clearTimeout(entry.flushTimer);
            entry.flushTimer = null;
        }
        const effectiveSessionId = sessionId || (entry?.sessionId) || runId;
        const effectiveActionLogs = (entry?.actionLogs && entry.actionLogs.length > 0)
            ? entry.actionLogs
            : actionLogs;

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
                messagesModule.finalizeStreamingMessage(runId, finalText, model, entry.thinking || thinking, entry.tools || tools, effectiveSessionId, effectiveActionLogs);
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
                modelInfo: realtimeModelInfo || undefined,
                sessionId: effectiveSessionId,
                thinking: thinking,
                tools: tools,
                actionLogs: effectiveActionLogs,
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
                modelInfo: realtimeModelInfo || undefined,
                sessionId: effectiveSessionId,
                agentId: senderAgentId,
                runId,
                thinking: thinking,
                tools: tools,
                actionLogs: effectiveActionLogs
            };
            apiService.saveMessage(agentMessage).catch(e => {
                console.error('[App] Failed to save agent message to server:', e);
            });
        }

        if (senderAgentId) {
            this._clearAgentTrace(senderAgentId);
        }
    }

    _flushStreamingEntry(runId) {
        const entry = this.runMessageEls.get(runId);
        if (!entry) return;

        if (entry.flushTimer) {
            clearTimeout(entry.flushTimer);
            entry.flushTimer = null;
        }

        if (entry.renderedText === entry.text) {
            return;
        }

        messagesModule.updateStreamingMessage(
            runId,
            entry.text,
            entry.sender,
            entry.agentId,
            entry.model || null,
            entry.thinking || null,
            entry.tools || [],
            entry.sessionId || runId,
            entry.actionLogs || []
        );
        entry.renderedText = entry.text;
    }

    _resolveRealtimeModel(payload = {}) {
        const message = payload?.message || {};
        const meta = payload?.meta || message?.meta || {};
        const agentMeta = meta?.agentMeta || message?.agentMeta || {};
        const promptReport = meta?.systemPromptReport || message?.systemPromptReport || {};
        const usage = message?.usage || payload?.usage || agentMeta?.lastCallUsage || agentMeta?.usage || {};

        const modelId = message?.model
            || message?.modelId
            || message?.metadata?.model
            || message?.metadata?.modelId
            || message?.metadata?.modelInfo?.modelId
            || payload?.model
            || payload?.modelId
            || agentMeta?.model
            || promptReport?.model
            || null;

        if (!modelId) {
            return { modelId: null, modelInfo: null };
        }

        return {
            modelId,
            modelInfo: {
                modelId,
                inputTokens: usage?.inputTokens || usage?.input || usage?.promptTokens || 0,
                outputTokens: usage?.outputTokens || usage?.output || usage?.completionTokens || 0
            }
        };
    }

    _updateLastMessageTimestamp(timestamp) {
        if (timestamp > this.lastMessageTimestamp) {
            this.lastMessageTimestamp = timestamp;
            localStorage.setItem('lastMessageTimestamp', timestamp.toString());
        }
    }

    _handleMessageSend(text, targetAgentId) {
        const replySessionId = messagesModule.getReplySessionId ? messagesModule.getReplySessionId() : null;
        const replySession = replySessionId ? state.getSession(replySessionId) : null;
        const replyRouteSessionKey = replySession?.routeSessionKey
            || (replySessionId && String(replySessionId).startsWith('agent:') ? replySessionId : null);
        const replyRouteChannel = replySession?.channel || replySession?.source || 'teamchat';
        const replyRouteAgentId = replySession?.routeAgentId || null;
        const mentionMatch = text.match(/@([^\s]+)/);
        const mentionValue = mentionMatch?.[1]?.replace(/[,:;：；，。!?！？]+$/u, '') || '';
        const explicitlyMentionedAgent = mentionValue && !['所有人', '全体', 'all'].includes(mentionValue)
            ? state.getAgentByName(mentionValue)
            : null;
        let resolvedTargetAgentId = targetAgentId || null;
        let broadcastToAll = false;
        const clientMessageId = this._generateId();

        if (!resolvedTargetAgentId) {
            if (mentionValue && ['所有人', '全体', 'all'].includes(mentionValue)) {
                broadcastToAll = true;
            } else if (explicitlyMentionedAgent) {
                resolvedTargetAgentId = explicitlyMentionedAgent.agentId;
            }

            if (!resolvedTargetAgentId && !broadcastToAll) {
                if (replyRouteAgentId) {
                    resolvedTargetAgentId = replyRouteAgentId;
                } else {
                    const lastSpeaker = state.getStateValue('lastSpeaker');
                    const fallbackAgent = lastSpeaker
                        ? state.getAgentByName(lastSpeaker)
                        : state.getAgentById('main');
                    resolvedTargetAgentId = fallbackAgent?.agentId || null;
                }
            }
        }

        const shouldBreakReplyRoute = Boolean(
            resolvedTargetAgentId
            && replyRouteAgentId
            && resolvedTargetAgentId !== replyRouteAgentId
        );
        const effectiveReplySessionId = shouldBreakReplyRoute
            ? null
            : (replyRouteSessionKey || replySessionId || null);
        const effectiveRouteChannel = shouldBreakReplyRoute ? 'teamchat' : replyRouteChannel;
        const effectiveRouteAgentId = shouldBreakReplyRoute ? resolvedTargetAgentId : replyRouteAgentId;

        const message = {
            id: clientMessageId,
            sender: '我',
            text,
            isUser: true,
            timestamp: Date.now(),
            status: 'sent',
            sessionId: effectiveReplySessionId,
            agentId: resolvedTargetAgentId || null,
            metadata: {
                clientMessageId,
                channel: 'teamchat',
                source: 'teamchat',
                originChannel: 'teamchat',
                routeChannel: effectiveRouteChannel,
                ...(effectiveReplySessionId ? {
                    routeSessionKey: effectiveReplySessionId,
                    sourceSessionKey: effectiveReplySessionId
                } : {}),
                ...(effectiveRouteAgentId ? { routeAgentId: effectiveRouteAgentId } : {})
            }
        };

        emit(EventTypes.MESSAGE_RECEIVED, message);
        const willUseHttpFallback = !broadcastToAll
            && Boolean(resolvedTargetAgentId);

        if (!willUseHttpFallback) {
            const persistedMessage = {
                ...message,
                metadata: {
                    ...(message.metadata || {}),
                    skipGatewayForward: true
                }
            };
            apiService.saveMessage(persistedMessage).catch(e => {
                console.error('[App] Failed to save message to server:', e);
                if (!state.getStateValue('isConnected')) {
                    this._notifyHttpFallback();
                }
            });
        }

        if (broadcastToAll) {
            this._sendToAll(text);
        } else if (resolvedTargetAgentId) {
            this._sendToAgentViaHttp(resolvedTargetAgentId, text, effectiveReplySessionId, {
                channel: 'teamchat',
                source: 'teamchat',
                routeAgentId: effectiveRouteAgentId,
                metadata: {
                    ...(message.metadata || {}),
                    routeChannel: effectiveRouteChannel,
                    sourceChannel: effectiveRouteChannel
                }
            });
        }
    }

    _sendOrQueue(agentId, message, targetSessionId = null, routing = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !state.getStateValue('isConnected')) {
            this._sendToAgentNow(agentId, message, targetSessionId, routing);
            return false;
        }

        if (state.isAgentBusy(agentId)) {
            state.enqueueForAgent(agentId, { message, targetSessionId, routing });
            const agent = state.getAgentById(agentId);
            emit(EventTypes.MESSAGE_QUEUED, { agentId, agentName: agent?.name });
            return true;
        }

        this._sendToAgentNow(agentId, message, targetSessionId, routing);
        return false;
    }

    _sendToAgentNow(agentId, message, targetSessionId = null, routing = null) {
        const normalizedTargetSessionId = String(targetSessionId || '').trim();
        const explicitSessionKey = normalizedTargetSessionId.startsWith('agent:') ? normalizedTargetSessionId : null;
        const conversationId = explicitSessionKey ? null : (normalizedTargetSessionId || agentId);
        const sessionKey = explicitSessionKey || `agent:${agentId}:${conversationId}`;
        const contextMessage = message.replace(/@[^\s]+\s*/g, '').trim();

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !state.getStateValue('isConnected')) {
            this._sendToAgentViaHttp(agentId, contextMessage, normalizedTargetSessionId || null, routing);
            return;
        }

        // 添加隐藏的 TeamChat 接口能力提示（使用特殊分隔符，Agent可识别但不会显示）
        const capabilitiesHint = `
[SYSTEM]
📋 TeamChat 使用指南：
1️⃣ 发文件：先 share-file 获取链接，再 send 发送（格式：[显示名](URL)）
2️⃣ @协作：回复中 @dev/@qa 等可触发其他 Agent（限3层递归）
3️⃣ 可用 Agent：main dev qa data writer pm finance devops mobile frontend backend
4️⃣ 支持 Markdown、文件路径自动识别
[/SYSTEM]`;
        const messageWithHint = contextMessage + '\n\n' + capabilitiesHint;

        // 更新会话活动
        state.updateSessionActivity(sessionKey);

        // 构建请求对象，必须包含 idempotencyKey
        const req = {
            type: 'req',
            id: this._generateId(),
            method: 'agent',
            params: {
                agentId: agentId,
                sessionKey: sessionKey,
                message: messageWithHint,
                idempotencyKey: this._generateId()
            }
        };

        const raw = JSON.stringify(req);
        this.ws.send(raw);
        console.log('[App] WS Sent:', req.type, req.method, 'id:', req.id.substring(0, 8), 'agentId:', req.params?.agentId, 'session:', sessionKey);

        state.addAgentLog(agentId, {
            text: `📤 发送消息: ${message.substring(0, 50)}...`,
            type: 'message'
        });
    }

    _notifyHttpFallback() {
        const now = Date.now();
        if (now - this.lastHttpFallbackToastAt < 5000) return;
        this.lastHttpFallbackToastAt = now;
        emit(EventTypes.UI_TOAST, {
            message: '实时连接不可用，已切换为兼容发送模式',
            type: 'info'
        });
    }

    _sendToAgentViaHttp(agentId, message, targetSessionId = null, routing = null) {
        if (!message || !message.trim()) return;

        this._notifyHttpFallback();
        apiService.sendToAgent(agentId, message, '我', targetSessionId, routing || {}).then(() => {
            state.addAgentLog(agentId, {
                text: `📮 兼容模式发送: ${message.substring(0, 50)}...`,
                type: 'message'
            });
        }).catch(e => {
            console.error('[App] HTTP fallback send failed:', e);
            emit(EventTypes.UI_TOAST, {
                message: `发送失败：${e?.message || '网络异常'}`,
                type: 'error'
            });
        });
    }

    _recordAgentTrace(agentId, trace) {
        if (!agentId || !trace) return;
        const traceTime = trace.time || Date.now();
        if ((Date.now() - traceTime) > 5 * 60 * 1000) {
            return;
        }

        const traces = this.agentTraceBuffer.get(agentId) || [];
        const normalizedTrace = {
            type: trace.type || 'info',
            title: trace.title || '行动记录',
            content: trace.content || '',
            status: trace.status || 'info',
            time: traceTime
        };
        const signature = `${normalizedTrace.type}|${normalizedTrace.title}|${normalizedTrace.content}|${normalizedTrace.status}`;
        const exists = traces.some((item) => `${item.type}|${item.title}|${item.content}|${item.status}` === signature);
        if (!exists) {
            traces.push(normalizedTrace);
            this.agentTraceBuffer.set(agentId, traces.slice(-20));
        }
    }

    _getAgentTrace(agentId) {
        if (!agentId) return [];
        return [...(this.agentTraceBuffer.get(agentId) || [])];
    }

    _clearAgentTrace(agentId) {
        if (!agentId) return;
        this.agentTraceBuffer.delete(agentId);
    }

    _sendToAll(text) {
        const agents = state.getStateValue('agents');
        const busyQueued = [];

        for (const agent of agents) {
            const msg = text.replace(/@所有人|@全体|@all/g, '').trim();
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

        // 支持从队列中获取 targetSessionId
        const targetSessionId = next.targetSessionId || null;
        this._sendToAgentNow(agentId, next.message, targetSessionId, next.routing || null);
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

    _resolveSessionKey(sessionKey) {
        const raw = String(sessionKey || '').trim();
        const parts = raw.split(':').filter(Boolean);
        if (parts.length >= 3 && parts[0] === 'agent') {
            return parts[2];
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

export { state, eventBus, EventTypes, emit, on, once, App };
export default App;
