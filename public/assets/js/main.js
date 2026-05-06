/**
 * Main Entry - 应用入口
 * Version: 255 - Mobile browser compatibility mode
 */

console.log('%c[Main] Loading TeamChat OSS build', 'background: #00d4ff; color: black; font-size: 14px; padding: 4px 8px; border-radius: 4px;');

import { stateManager } from './core/state.js';
import { eventBus } from './core/events.js';
import { App, EventTypes } from './core/app.js';
import { avatarService } from './services/avatar.js';
import { apiService } from './services/api.js';
import { AGENT_ORDER, compareAgentsByOrder, dedupeAgents, getAgentDisplayName, getAgentRole, normalizeAgentId, normalizeAgentRecord } from './utils/agent-meta.js';
import { isMessageHidden } from './utils/message-meta.js';

import { sidebarModule } from './modules/sidebar/index.js';
import { messagesModule } from './modules/messages/index.js';
import { inputModule } from './modules/input/index.js';
import { filterModule } from './modules/filter/index.js';
import { searchModule } from './modules/search/index.js';
import { teamchatNotificationsModule } from './modules/notifications/index.js';
import { statusDashboard } from './modules/dashboard/status.js';
import { metricsDashboard } from './modules/dashboard/metrics.js';
import { emailMonitorDashboard } from './modules/dashboard/email-monitor.js';
import { themeModule } from './modules/theme/index.js';
import { initPwaSupport } from './services/pwa.js';

// 根据 Agent ID 或名称获取对应的头像文件
function getAgentAvatar(agentId, agentName) {
    const normalizedId = normalizeAgentId(agentId) || normalizeAgentId(agentName) || agentId;
    const avatarMap = {
        main: 'agent-main.svg',
        writer: 'agent-writer.svg',
        mail: 'agent-mail.svg',
        data: 'agent-data.svg',
        qa: 'agent-qa.svg',
        pm: 'agent-pm.svg',
        dev: 'agent-dev.svg',
        backend: 'agent-be.svg',
        frontend: 'agent-fe.svg',
        mobile: 'agent-mobile.svg',
        devops: 'agent-ops.svg',
        finance: 'agent-finance.svg'
    };

    return avatarMap[normalizedId] || 'agent-main.svg';
}

// 远程访问检测
const IS_REMOTE = !['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const SESSION_KEY = 'team_chat_session';
const GATEWAY_TOKEN_KEY = 'team_chat_token';
const HOME_DIR = '';
const OPENCLAW_HOME = '';
const WORKSPACE_ROOT = '';
const TEAMCHAT_ROOT = '';

window.stateManager = stateManager;
window.__TEAMCHAT_IS_MESSAGE_HIDDEN__ = isMessageHidden;

function isAppWebView() {
    return Boolean(window.Capacitor)
        || /; wv\)|TeamChat/i.test(navigator.userAgent || '')
        || document.body?.dataset.mobileRecovery === 'true';
}

function resolveAppUrl(url) {
    try {
        return new URL(url, window.location.origin);
    } catch {
        return null;
    }
}

function navigateInApp(url, { desktopNewTab = true } = {}) {
    const nextUrl = resolveAppUrl(url);
    if (!nextUrl) return false;

    const sameOrigin = nextUrl.origin === window.location.origin;
    if (isAppWebView() || !desktopNewTab || sameOrigin) {
        window.location.assign(nextUrl.href);
    } else {
        window.open(nextUrl.href, '_blank', 'noopener');
    }
    return true;
}

function initMobileViewportRecovery() {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;

    const detectMobileCompatMode = () => {
        const ua = String(navigator.userAgent || '').toLowerCase();
        const isAndroid = /android/.test(ua);
        const problematicBrowser = /(quark|huawei|honor|heytapbrowser|miuibrowser|ucbrowser|mqqbrowser|qqbrowser|baiduboxapp|sogoumobilebrowser|vivo(?:browser)?|oppo(?:browser)?)/i.test(ua);
        const modernChromeFamily = /(chrome|crios|edga|edgios|samsungbrowser)/i.test(ua);

        if (problematicBrowser) return 'legacy-android';
        if (isAndroid && !modernChromeFamily) return 'legacy-android';
        return 'standard';
    };

    const isTouchDevice = () => Boolean(
        'ontouchstart' in window
        || navigator.maxTouchPoints > 0
        || navigator.msMaxTouchPoints > 0
    );

    const updateViewportState = () => {
        const viewportHeight = Math.max(
            Math.round(window.visualViewport?.height || 0),
            Math.round(window.innerHeight || 0),
            Math.round(document.documentElement?.clientHeight || 0)
        );
        if (viewportHeight > 0) {
            root.style.setProperty('--app-height', `${viewportHeight}px`);
        }

        const isNarrow = window.matchMedia?.('(max-width: 768px)')?.matches || false;
        const mobileRecovery = isNarrow;
        body.dataset.mobileRecovery = mobileRecovery ? 'true' : 'false';
        body.dataset.mobileViewport = isNarrow ? 'narrow' : 'wide';
        body.dataset.mobileTouch = isTouchDevice() ? 'true' : 'false';
        body.dataset.mobileCompat = detectMobileCompatMode();
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState, { passive: true });
    window.addEventListener('orientationchange', updateViewportState, { passive: true });
    window.visualViewport?.addEventListener('resize', updateViewportState, { passive: true });
    window.visualViewport?.addEventListener('scroll', updateViewportState, { passive: true });
}

// Session管理
function getSessionToken() {
    // 优先使用服务器注入的 session（从 URL 参数传递）
    if (window.__INITIAL_SESSION__) {
        // 保存到 localStorage 以便后续使用
        localStorage.setItem(SESSION_KEY, window.__INITIAL_SESSION__);
        return window.__INITIAL_SESSION__;
    }
    return localStorage.getItem(SESSION_KEY) || '';
}

function setSessionToken(token) {
    if (token) {
        localStorage.setItem(SESSION_KEY, token);
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
}

function getAuthHeaders(extraHeaders = {}) {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
        return extraHeaders;
    }
    return {
        ...extraHeaders,
        'X-Session-Token': sessionToken
    };
}

function normalizeLocalPath(rawPath) {
    const value = String(rawPath || '').trim();
    if (!value) return '';

    let decoded = value;
    try {
        decoded = decodeURIComponent(value);
    } catch {}

    if (/^https?:\/\//i.test(decoded)) {
        try {
            const url = new URL(decoded, window.location.origin);
            if (url.pathname.startsWith('/uploads/')) {
                decoded = `${TEAMCHAT_ROOT}${url.pathname}`;
            } else {
                return decoded;
            }
        } catch {
            return decoded;
        }
    }

    if (decoded.startsWith('file://')) {
        decoded = decoded.replace(/^file:\/\//, '');
    }

    if (decoded.startsWith('/uploads/')) {
        decoded = `${TEAMCHAT_ROOT}${decoded}`;
    } else if (decoded.startsWith('~/')) {
        decoded = `${HOME_DIR}${decoded.slice(1)}`;
    } else if (decoded.startsWith('./') || decoded.startsWith('../')) {
        decoded = `${TEAMCHAT_ROOT}/${decoded}`;
    } else if (!decoded.startsWith('/')) {
        decoded = `${TEAMCHAT_ROOT}/${decoded}`;
    }

    const normalized = [];
    for (const part of decoded.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            normalized.pop();
            continue;
        }
        normalized.push(part);
    }
    return `/${normalized.join('/')}`;
}

async function copyLocalPath(filePath, appName, shortcut, customMessage = '') {
    const resolvedPath = normalizeLocalPath(filePath);
    await navigator.clipboard.writeText(resolvedPath);
    eventBus.emit('toast:show', {
        message: customMessage || `路径已复制，在${appName}中按 ${shortcut} 粘贴打开`,
        type: 'success',
        duration: 4000
    });
    return resolvedPath;
}

function getQueryGatewayToken() {
    return new URLSearchParams(location.search).get('token') || '';
}

function getCachedGatewayToken() {
    return localStorage.getItem(GATEWAY_TOKEN_KEY) || '';
}

function persistGatewayToken(token) {
    if (token) {
        localStorage.setItem(GATEWAY_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(GATEWAY_TOKEN_KEY);
    }
}

async function resolveGatewayToken() {
    const urlToken = getQueryGatewayToken();
    if (urlToken) {
        persistGatewayToken(urlToken);
        return { token: urlToken, source: 'url' };
    }

    try {
        const tokenResp = await fetch('/api/gateway-token', {
            headers: getAuthHeaders()
        });
        if (tokenResp.ok) {
            const tokenData = await tokenResp.json();
            if (tokenData?.token) {
                persistGatewayToken(tokenData.token);
                return { token: tokenData.token, source: 'server' };
            }
        }
    } catch (e) {
        console.error('Failed to fetch gateway token:', e);
    }

    const cachedToken = getCachedGatewayToken();
    if (cachedToken) {
        console.warn('[Main] Falling back to cached gateway token');
        return { token: cachedToken, source: 'cache' };
    }

    persistGatewayToken('');
    return { token: '', source: 'none' };
}

async function checkAuthStatus() {
    try {
        const res = await fetch('/api/check-auth', {
            headers: { 'X-Session-Token': getSessionToken() }
        });
        const data = await res.json();
        return data.authenticated;
    } catch (e) {
        console.error('[Auth] Check failed:', e);
        return false;
    }
}

async function login(password) {
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.ok && data.session) {
            setSessionToken(data.session);
            return true;
        }
        return false;
    } catch (e) {
        console.error('[Auth] Login failed:', e);
        return false;
    }
}

function showLoginDialog() {
    const currentUrl = new URL(window.location.href);
    const session = getSessionToken();
    const redirectUrl = session
        ? `/team_chat_login.html?session=${encodeURIComponent(session)}&returnTo=${encodeURIComponent(currentUrl.pathname + currentUrl.search)}`
        : `/team_chat_login.html?returnTo=${encodeURIComponent(currentUrl.pathname + currentUrl.search)}`;

    window.location.replace(redirectUrl);
}

let appInitialized = false;

initPwaSupport();
initMobileViewportRecovery();

async function initApp() {
    if (appInitialized) {
        console.log('[Main] App already initialized, skipping');
        return;
    }
    appInitialized = true;
    
    const { token: AUTH_TOKEN, source: authTokenSource } = await resolveGatewayToken();
    apiService.setAuthToken(AUTH_TOKEN);

    // 从 Gateway 获取真实的 agents 列表
    let agents = [];
    try {
        const resp = await fetch('/api/agents', {
            headers: getAuthHeaders()
        });
        if (resp.ok) {
            const data = await resp.json();
            // API 可能返回数组或对象
            const agentList = Array.isArray(data) ? data : (data.agents || data.list || []);
            agents = dedupeAgents(agentList.map((agent) => {
                const normalized = normalizeAgentRecord({
                    id: agent.id,
                    agentId: agent.id,
                    name: agent.name || agent.id,
                    role: agent.role || ''
                });
                return {
                    ...normalized,
                    img: getAgentAvatar(normalized.agentId, normalized.name),
                    role: normalized.role || getAgentRole(normalized.agentId, normalized.name)
                };
            }));
        }
    } catch (e) {
        console.warn('Failed to fetch agents, using default list:', e);
    }

    agents = dedupeAgents(agents).sort(compareAgentsByOrder);

    // 如果获取失败，使用默认列表
    if (agents.length === 0) {
        agents = dedupeAgents(AGENT_ORDER.map((agentId) => ({
            agentId,
            name: getAgentDisplayName(agentId),
            img: getAgentAvatar(agentId, agentId),
            role: getAgentRole(agentId)
        })));
    }

    stateManager.setState({ agents });
    stateManager.setState({ currentAgent: agents[0] });

    // 预加载所有 Agent 的头像（传入文件名数组）
    avatarService.preloadAll(agents.map(a => a.img));

    const app = new App({
        authToken: AUTH_TOKEN || null,
        authTokenSource
    });

    // 设置 apiService 的 token
    apiService.setAuthToken(AUTH_TOKEN);

    sidebarModule.init({
        container: document.getElementById('sidebar'),
        overlay: document.getElementById('sidebar-overlay'),
        agentListEl: document.getElementById('agent-list')
    });

    messagesModule.init({
        container: document.getElementById('messages-view')
    });

    teamchatNotificationsModule.init({
        container: document.getElementById('teamchat-notice-strip')
    });

    inputModule.init({
        container: document.getElementById('input-area'),
        input: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn'),
        uploadBtn: document.getElementById('upload-btn'),
        fileInput: document.getElementById('file-input'),
        previewContainer: document.getElementById('file-preview')
    });

    filterModule.init({
        panel: document.getElementById('filter-panel'),
        overlay: document.getElementById('filter-panel-overlay'),
        grid: document.getElementById('filter-agent-grid'),
        optionsContainer: document.getElementById('filter-options')
    });
    console.log("EVENT_BOUND_FILTER_INIT", { panel: !!document.getElementById('filter-panel') });

    searchModule.init({
        container: document.getElementById('search-container'),
        input: document.getElementById('search-input')
    });
    console.log("EVENT_BOUND_SEARCH_INIT", { container: !!document.getElementById('search-container') });

    statusDashboard.init();
    metricsDashboard.init();
    emailMonitorDashboard.init();

    // 初始化主题
    themeModule.init();
    
    // 初始化工作日志按钮（桌面端和移动端）
    const statusToggle = document.getElementById('status-toggle');
    const statusToggle2 = document.getElementById('status-toggle-2');
    console.log('[Main] Status toggle buttons:', { statusToggle: !!statusToggle, statusToggle2: !!statusToggle2 });
    const handleStatusToggle = (e) => {
        console.log('[Main] Status toggle clicked', e.target.id);
        e.stopPropagation();
        e.preventDefault();
        statusDashboard.show();
        // 关闭下拉菜单
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (statusToggle) {
        statusToggle.addEventListener('click', handleStatusToggle);
        console.log('[Main] Bound status-toggle click event');
    }
    if (statusToggle2) {
        statusToggle2.addEventListener('click', handleStatusToggle);
        console.log('[Main] Bound status-toggle-2 click event');
    }

    // 初始化性能监控按钮（桌面端和移动端）
    const metricsToggle = document.getElementById('metrics-toggle');
    const metricsToggle2 = document.getElementById('metrics-toggle-2');
    const handleMetricsToggle = () => {
        metricsDashboard.show();
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (metricsToggle) {
        metricsToggle.addEventListener('click', handleMetricsToggle);
    }
    if (metricsToggle2) {
        metricsToggle2.addEventListener('click', handleMetricsToggle);
    }

    // 初始化邮件监控按钮（桌面端和移动端）
    const emailMonitorToggle = document.getElementById('email-monitor-toggle');
    const emailMonitorToggle2 = document.getElementById('email-monitor-toggle-2');
    console.log('[Main] Email monitor toggle buttons:', { emailMonitorToggle: !!emailMonitorToggle, emailMonitorToggle2: !!emailMonitorToggle2 });
    const handleEmailMonitorToggle = (e) => {
        console.log('[Main] Email monitor toggle clicked', e?.target?.id);
        e?.stopPropagation?.();
        e?.preventDefault?.();
        emailMonitorDashboard.toggle();
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (emailMonitorToggle) {
        emailMonitorToggle.addEventListener('click', handleEmailMonitorToggle);
        console.log('[Main] Bound email-monitor-toggle click event');
    }
    if (emailMonitorToggle2) {
        emailMonitorToggle2.addEventListener('click', handleEmailMonitorToggle);
        console.log('[Main] Bound email-monitor-toggle-2 click event');
    }

    // 初始化智库日报按钮（桌面端和移动端）- 跳转到远程链接
    const brainDailyToggle = document.getElementById('brain-daily-toggle');
    const brainDailyToggle2 = document.getElementById('brain-daily-toggle-2');
    console.log('[Main] Brain daily toggle buttons:', { brainDailyToggle: !!brainDailyToggle, brainDailyToggle2: !!brainDailyToggle2 });
    const handleBrainDailyToggle = (e) => {
        console.log('[Main] Brain daily toggle clicked');
        e?.stopPropagation?.();
        e?.preventDefault?.();
        // APK/WebView 和移动浏览器常拦截新窗口，智库入口优先使用同页跳转。
        navigateInApp('/brain/');
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (brainDailyToggle) {
        brainDailyToggle.addEventListener('click', handleBrainDailyToggle);
        console.log('[Main] Bound brain-daily-toggle click event');
    }
    if (brainDailyToggle2) {
        brainDailyToggle2.addEventListener('click', handleBrainDailyToggle);
        console.log('[Main] Bound brain-daily-toggle-2 click event');
    }

    // 初始化 OpenClaw WebUI 按钮（桌面端和移动端）- 跳转到网关后台
    const openclawWebuiToggle = document.getElementById('openclaw-webui-toggle');
    const openclawWebuiToggle2 = document.getElementById('openclaw-webui-toggle-2');
    console.log('[Main] OpenClaw WebUI toggle buttons:', { openclawWebuiToggle: !!openclawWebuiToggle, openclawWebuiToggle2: !!openclawWebuiToggle2 });
    const handleOpenclawWebuiToggle = (e) => {
        console.log('[Main] OpenClaw WebUI toggle clicked');
        e?.stopPropagation?.();
        e?.preventDefault?.();
        // APK 内用同 WebView 跳转，保留系统返回键历史栈。
        navigateInApp('/v1/gateway');
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (openclawWebuiToggle) {
        openclawWebuiToggle.addEventListener('click', handleOpenclawWebuiToggle);
        console.log('[Main] Bound openclaw-webui-toggle click event');
    }
    if (openclawWebuiToggle2) {
        openclawWebuiToggle2.addEventListener('click', handleOpenclawWebuiToggle);
        console.log('[Main] Bound openclaw-webui-toggle-2 click event');
    }

    // 初始化搜索按钮（桌面端和移动端）
    const searchToggle = document.getElementById('search-toggle');
    const searchToggle2 = document.getElementById('search-toggle-2');
    console.log("EVENT_BOUND_SEARCH_BUTTONS", { searchToggle: !!searchToggle, searchToggle2: !!searchToggle2 });
    const handleSearchToggle = () => {
        console.log("SEARCH_TOGGLE_CLICKED_20260317");
        searchModule.toggle();
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (searchToggle) {
        searchToggle.addEventListener('click', handleSearchToggle);
    }
    if (searchToggle2) {
        searchToggle2.addEventListener('click', handleSearchToggle);
    }

    // 初始化筛选按钮（桌面端和移动端）
    const filterToggle = document.getElementById('filter-toggle');
    const filterToggle2 = document.getElementById('filter-toggle-2');
    console.log("EVENT_BOUND_FILTER_BUTTONS", { filterToggle: !!filterToggle, filterToggle2: !!filterToggle2 });
    const handleFilterToggle = () => {
        console.log("FILTER_TOGGLE_CLICKED_20260317");
        filterModule.toggle();
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (filterToggle) {
        filterToggle.addEventListener('click', handleFilterToggle);
    }
    if (filterToggle2) {
        filterToggle2.addEventListener('click', handleFilterToggle);
    }
    
    // 初始化锁屏按钮（桌面端和移动端）
    const scrollLockBtn = document.getElementById('scroll-lock-toggle');
    const scrollLockBtn2 = document.getElementById('scroll-lock-toggle-2');
    const handleScrollLock = () => {
        messagesModule.toggleScrollLock();
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (scrollLockBtn) {
        scrollLockBtn.addEventListener('click', handleScrollLock);
    }
    if (scrollLockBtn2) {
        scrollLockBtn2.addEventListener('click', handleScrollLock);
    }

    // 初始化邮件链接
    const mailLink = document.getElementById('mail-link') || document.getElementById('mail-link-2');
    if (mailLink) {
        fetch('/api/mail-tunnel', {
            headers: getAuthHeaders()
        })
            .then(res => res.json())
            .then(data => {
                const mailUrl = data.url;
                if (mailUrl) {
                    mailLink.href = mailUrl;
                } else {
                    mailLink.href = 'http://localhost:3001';
                }
            })
            .catch(err => {
                console.warn('[Mail] Failed to fetch mail tunnel URL:', err);
                mailLink.href = 'http://localhost:3001';
            });
    }

    // 初始化移动端下拉菜单
    const moreToggle = document.getElementById('more-toggle');
    const headerDropdown = document.getElementById('header-dropdown');
    if (moreToggle && headerDropdown) {
        const closeHeaderDropdown = () => {
            headerDropdown.classList.remove('show');
        };

        moreToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            headerDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            const target = e.target instanceof Node ? e.target : null;
            if (!target) return;
            if (!headerDropdown.contains(target) && !moreToggle.contains(target)) {
                closeHeaderDropdown();
            }
        });
        
        headerDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target.closest('a, .dropdown-item');
            const link = e.target.closest('a[href]');
            if (link && isAppWebView()) {
                const nextUrl = resolveAppUrl(link.getAttribute('href'));
                if (nextUrl && nextUrl.origin === window.location.origin) {
                    e.preventDefault();
                    closeHeaderDropdown();
                    navigateInApp(nextUrl.href, { desktopNewTab: false });
                    return;
                }
            }
            // 如果点击的是按钮（有ID），不在这里关闭dropdown，让按钮自己的处理程序来关闭
            if (target && target.id) {
                // 有ID的按钮，不在这里处理，让按钮自己的事件处理程序处理
                return;
            }
            // 只有没有ID的链接项才在这里关闭
            if (target) {
                closeHeaderDropdown();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                closeHeaderDropdown();
            }
        });

        const wptDashboardLink = document.getElementById('wpt-dashboard-link');
        if (wptDashboardLink) {
            wptDashboardLink.addEventListener('click', (e) => {
                e.preventDefault();
                const session = getSessionToken();
                const nextUrl = session
                    ? `/wpt-dashboard/?session=${encodeURIComponent(session)}`
                    : '/wpt-dashboard/';
                navigateInApp(nextUrl);
                closeHeaderDropdown();
            });
        }
    }

    // 连接状态监听
    const connectionStatusEl = document.getElementById('connection-status');
    let wsConnectionState = 'disconnected';
    
    function updateConnectionStatus() {
        if (!connectionStatusEl) return;
        connectionStatusEl.className = 'connection-status';
        switch(wsConnectionState) {
            case 'connected':
                connectionStatusEl.classList.add('connected');
                connectionStatusEl.title = '已连接';
                break;
            case 'connecting':
                connectionStatusEl.classList.add('connecting');
                connectionStatusEl.title = '连接中...';
                break;
            case 'error':
                connectionStatusEl.classList.add('error');
                connectionStatusEl.title = '连接错误';
                break;
            default:
                connectionStatusEl.title = '未连接';
        }
    }
    
    eventBus.on('ws:open', () => { wsConnectionState = 'connected'; updateConnectionStatus(); });
    eventBus.on('ws:close', () => { wsConnectionState = 'disconnected'; updateConnectionStatus(); });
    eventBus.on('ws:error', () => { wsConnectionState = 'error'; updateConnectionStatus(); });
    eventBus.on('ws:connecting', () => { wsConnectionState = 'connecting'; updateConnectionStatus(); });
    updateConnectionStatus();

    eventBus.on('message:send', async ({ text }) => {
        const agents = stateManager.getState('agents') || [];
        let targetAgent = null;
        
        const mentionMatch = text.match(/@(\S+)/);
        if (mentionMatch) {
            const mentionName = mentionMatch[1].replace(/[,:;：；，。!?！？]+$/u, '');
            targetAgent = stateManager.getAgentByName?.(mentionName) || null;
            if (!targetAgent) {
                const normalizedMentionId = normalizeAgentId(mentionName);
                if (normalizedMentionId) {
                    targetAgent = agents.find(a => normalizeAgentId(a.agentId || a.id || a.name) === normalizedMentionId) || null;
                }
            }
        }
        
        if (!targetAgent) {
            const messages = stateManager.getState('messages') || [];
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (!msg.isUser && msg.sender) {
                    targetAgent = agents.find(a => a.name === msg.sender);
                    if (targetAgent) break;
                }
            }
        }
        
        if (!targetAgent) {
            targetAgent = agents.find(a => a.agentId === 'main') || agents[0];
        }
        
        if (!targetAgent) {
            eventBus.emit('toast:show', { message: '没有可用的Agent', type: 'error' });
            return;
        }

        eventBus.emit(EventTypes.MESSAGE_SENT, { text, agentId: targetAgent.agentId });
    });

    eventBus.on('toast:show', ({ message, type = 'info', duration = 2000 }) => {
        showToast(message, type, duration);
    });
    eventBus.on(EventTypes.UI_TOAST, ({ message, type = 'info', duration = 2000 }) => {
        showToast(message, type, duration);
    });

    function showToast(message, type = 'info', duration = 2000) {
        const container = document.getElementById('toast-container');
        if (!container || !message) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    app.init().then(() => {
        const activeAuthToken = app.authToken || AUTH_TOKEN || '';
        persistGatewayToken(activeAuthToken);
        apiService.setAuthToken(activeAuthToken);
    }).catch((e) => {
        console.error('[Main] App init failed:', e);
    });

    const clickHitsAny = (target, elements = []) => elements.some((el) => el && (el === target || el.contains(target)));
    const syncTransientBodyState = () => {
        const searchVisible = Boolean(searchModule?.visible || document.getElementById('search-container')?.classList.contains('active'));
        document.body.classList.toggle('search-active', searchVisible);
    };

    const closeFloatingPanelsFromOutside = (target) => {
        const filterPanel = document.getElementById('filter-panel');
        const filterToggles = [document.getElementById('filter-toggle'), document.getElementById('filter-toggle-2')];
        if ((filterModule.visible || filterPanel?.classList.contains('show') || filterPanel?.classList.contains('active'))
            && !clickHitsAny(target, [filterPanel, ...filterToggles])) {
            filterModule.hide();
        }

        const searchContainer = document.getElementById('search-container');
        const searchToggles = [document.getElementById('search-toggle'), document.getElementById('search-toggle-2')];
        if ((searchModule.visible || searchContainer?.classList.contains('active'))
            && !clickHitsAny(target, [searchContainer, ...searchToggles])) {
            searchModule.close();
        }

        const statusContainer = document.getElementById('status-dashboard');
        const statusToggles = [document.getElementById('status-toggle'), document.getElementById('status-toggle-2')];
        if ((statusDashboard.visible || statusContainer?.classList.contains('active') || statusContainer?.classList.contains('visible'))
            && !clickHitsAny(target, [statusContainer, ...statusToggles])) {
            statusDashboard.hide();
        }

        const metricsContainer = document.getElementById('metrics-dashboard');
        const metricsToggles = [document.getElementById('metrics-toggle'), document.getElementById('metrics-toggle-2')];
        if ((metricsDashboard.isVisible || metricsContainer?.classList.contains('active') || metricsContainer?.classList.contains('visible'))
            && !clickHitsAny(target, [metricsContainer, ...metricsToggles])) {
            metricsDashboard.hide();
        }

        const emailContainer = document.getElementById('email-monitor-dashboard');
        const emailToggles = [document.getElementById('email-monitor-toggle'), document.getElementById('email-monitor-toggle-2')];
        if ((emailMonitorDashboard.visible || emailContainer?.classList.contains('active') || emailContainer?.classList.contains('visible'))
            && !clickHitsAny(target, [emailContainer, ...emailToggles])) {
            emailMonitorDashboard.hide();
        }

        const mentionMenu = document.getElementById('mention-menu');
        const chatInput = document.getElementById('chat-input');
        if (mentionMenu && mentionMenu.style.display !== 'none' && !clickHitsAny(target, [mentionMenu, chatInput])) {
            mentionMenu.style.display = 'none';
        }

        syncTransientBodyState();
    };

    const closeTopmostTransientUi = () => {
        const headerDropdown = document.getElementById('header-dropdown');
        if (headerDropdown?.classList.contains('show')) {
            headerDropdown.classList.remove('show');
            return true;
        }

        const noticeHistoryPanel = document.querySelector('.teamchat-notice-history-panel.active');
        if (noticeHistoryPanel) {
            if (typeof teamchatNotificationsModule.closeHistory === 'function') {
                teamchatNotificationsModule.closeHistory();
            } else {
                noticeHistoryPanel.classList.remove('active');
            }
            return true;
        }

        const mentionMenu = document.getElementById('mention-menu');
        if (mentionMenu && mentionMenu.style.display !== 'none') {
            mentionMenu.style.display = 'none';
            return true;
        }

        const searchContainer = document.getElementById('search-container');
        if (searchModule.visible || searchContainer?.classList.contains('active')) {
            searchModule.close();
            syncTransientBodyState();
            return true;
        }

        const filterPanel = document.getElementById('filter-panel');
        if (filterModule.visible || filterPanel?.classList.contains('show') || filterPanel?.classList.contains('active')) {
            filterModule.hide();
            return true;
        }

        const emailContainer = document.getElementById('email-monitor-dashboard');
        if (emailMonitorDashboard.visible || emailContainer?.classList.contains('active') || emailContainer?.classList.contains('visible')) {
            emailMonitorDashboard.hide();
            return true;
        }

        const metricsContainer = document.getElementById('metrics-dashboard');
        if (metricsDashboard.isVisible || metricsContainer?.classList.contains('active') || metricsContainer?.classList.contains('visible')) {
            metricsDashboard.hide();
            return true;
        }

        const statusContainer = document.getElementById('status-dashboard');
        if (statusDashboard.visible || statusContainer?.classList.contains('active') || statusContainer?.classList.contains('visible')) {
            statusDashboard.hide();
            return true;
        }

        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebar?.classList.contains('active')) {
            sidebar.classList.remove('active');
            sidebarOverlay?.classList.remove('active');
            document.body.style.overflow = '';
            return true;
        }

        return false;
    };

    window.TeamChatHandleNativeBack = () => {
        const handled = closeTopmostTransientUi();
        if (handled) {
            syncTransientBodyState();
        }
        return handled;
    };

    // 全局点击空白关闭浮层，必须走模块自己的 hide/close 逻辑，避免 visible 状态与 DOM 类名脱节
    document.addEventListener('click', (e) => {
        const target = e.target instanceof Node ? e.target : null;
        if (!target) return;
        closeFloatingPanelsFromOutside(target);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeTopmostTransientUi();
        syncTransientBodyState();
    });

    window.addEventListener('focus', syncTransientBodyState);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncTransientBodyState();
        }
    });
    syncTransientBodyState();

    // 全局文件链接点击处理函数
    window.handleFileLinkClick = async function(filePath, appName = 'Finder', shortcut = 'Cmd+Shift+G') {
        const resolvedPath = normalizeLocalPath(filePath);
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

        if (!resolvedPath) {
            eventBus.emit('toast:show', {
                message: '无法解析文件路径',
                type: 'error'
            });
            return;
        }

        if (!isLocal) {
            try {
                await copyLocalPath(resolvedPath, appName, shortcut);
            } catch (err) {
                console.error('[FileLink] Remote copy failed:', err);
                eventBus.emit('toast:show', {
                    message: '复制失败，请稍后重试',
                    type: 'error'
                });
            }
            return;
        }

        try {
            const response = await fetch('/api/open-local-file', {
                method: 'POST',
                headers: getAuthHeaders({
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify({
                    path: resolvedPath,
                    reveal: true
                })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'open_failed');
            }

            eventBus.emit('toast:show', {
                message: `已在${appName}中定位文件`,
                type: 'success',
                duration: 2500
            });
        } catch (err) {
            console.warn('[FileLink] Open local file failed, fallback to copy:', err);
            try {
                await copyLocalPath(resolvedPath, appName, shortcut, `无法直接打开，已复制路径到剪贴板`);
            } catch (copyError) {
                console.error('[FileLink] Copy failed:', copyError);
                eventBus.emit('toast:show', {
                    message: '复制失败，请手动复制路径',
                    type: 'error'
                });
            }
        }
    };

    window.teamChat = {
        app,
        stateManager,
        eventBus,
        resolveLocalFilePath: normalizeLocalPath,
        setActionLogExpandedDefault(expanded) {
            localStorage.setItem('team_chat_action_log_expanded_default', expanded ? 'true' : 'false');
        },
        modules: {
            sidebar: sidebarModule,
            messages: messagesModule,
            input: inputModule,
            filter: filterModule,
            search: searchModule,
            status: statusDashboard,
            metrics: metricsDashboard,
            theme: themeModule
        }
    };
    window.eventBus = eventBus;
    window.messagesModule = messagesModule;
    window.sidebarModule = sidebarModule;
    window.inputModule = inputModule;

    console.log('🚀 TeamChat initialized');
    
    // 获取并显示版本号
    fetch('/api/version')
        .then(r => r.json())
        .then(data => {
            const versionEl = document.getElementById('version-info');
            if (versionEl && data.version) {
                versionEl.textContent = data.version;
                window.__TEAMCHAT_BOOT_VERSION__ = data.version;
            }
        })
        .catch(() => {});

    const clearShellCaches = async () => {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
            await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
        }
        if ('caches' in window) {
            const keys = await caches.keys().catch(() => []);
            await Promise.all(keys
                .filter((key) => key.startsWith('teamchat-shell-'))
                .map((key) => caches.delete(key).catch(() => false)));
        }
    };

    const startRemoteVersionWatcher = () => {
        const check = async () => {
            if (document.visibilityState === 'hidden') return;
            const response = await fetch(`/api/version?ts=${Date.now()}`, {
                cache: 'no-store',
                headers: getAuthHeaders()
            });
            if (!response.ok) return;
            const data = await response.json();
            const latest = data?.version;
            const bootVersion = window.__TEAMCHAT_BOOT_VERSION__;
            if (!latest || !bootVersion || latest === bootVersion) return;
            const input = document.getElementById('message-input');
            if (input?.value?.trim()) {
                eventBus.emit('toast:show', {
                    message: `TeamChat ${latest} 已可用，发送完当前输入后刷新即可更新`,
                    type: 'info',
                    duration: 8000
                });
                return;
            }
            eventBus.emit('toast:show', {
                message: `TeamChat ${latest} 已发布，正在自动刷新`,
                type: 'info',
                duration: 2500
            });
            await clearShellCaches();
            window.location.reload();
        };
        window.setInterval(() => check().catch(() => {}), 5 * 60 * 1000);
        window.addEventListener('focus', () => check().catch(() => {}));
    };
    startRemoteVersionWatcher();
    
    // 添加全局同步函数供 metrics dashboard 使用
    window.syncMessagesWithServer = async function(forceFullSync = false) {
        const startTime = Date.now();
        try {
            // 获取本地消息
            const localMessages = stateManager.getState('messages') || [];
            const localCount = localMessages.length;
            
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const sessionToken = getSessionToken();
            
            let serverHistory;
            let serverCount;
            
            if (forceFullSync) {
                // 完整同步：获取最近 30 天的消息
                let url = `${apiHost}/history?days=30&limit=2000`;
                if (sessionToken) url += `&session=${sessionToken}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
                });
                
                if (!response.ok) throw new Error('Failed to fetch history');
                
                serverHistory = await response.json();
                serverCount = serverHistory.length;
            } else {
                // 增量同步：只获取新消息
                const lastTimestamp = parseInt(localStorage.getItem('lastMessageTimestamp')) || 0;
                let url = `${apiHost}/api/messages/since?timestamp=${lastTimestamp}`;
                if (sessionToken) url += `&session=${sessionToken}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
                });
                
                if (!response.ok) throw new Error('Failed to fetch new messages');
                
                const data = await response.json();
                serverHistory = [...localMessages, ...(data.messages || [])];
                serverCount = serverHistory.length;
            }
            
            // 计算差异
            const diff = Math.abs(serverCount - localCount);
            const latency = Date.now() - startTime;
            
            // 更新 metrics dashboard 的 syncStatus
            if (window.metricsDashboard) {
                window.metricsDashboard.syncStatus.serverCount = serverCount;
                window.metricsDashboard.syncStatus.localCount = localCount;
                window.metricsDashboard.syncStatus.diff = diff;
                window.metricsDashboard.syncStatus.latency = latency;
                window.metricsDashboard.syncStatus.lastSyncTime = Date.now();
                window.metricsDashboard.syncStatus.syncInProgress = false;
                window.metricsDashboard.syncStatus.error = null;
                window.metricsDashboard.updateSyncStatus();
            }
            
            // 更新本地消息
            if (serverCount > 0) {
                stateManager.loadHistory(serverHistory);
                
                // 更新最后消息时间戳
                const latestTimestamp = Math.max(...serverHistory.map(m => m.timestamp || 0));
                localStorage.setItem('lastMessageTimestamp', latestTimestamp.toString());
            }
            
            console.log(`[Sync] Sync completed: server=${serverCount}, local=${localCount}, diff=${diff}`);
            eventBus.emit('toast:show', { 
                message: `已同步 ${serverCount} 条消息`, 
                type: 'success' 
            });
        } catch (e) {
            console.error('[Sync] Sync failed:', e);
            if (window.metricsDashboard) {
                window.metricsDashboard.syncStatus.error = e.message;
                window.metricsDashboard.syncStatus.syncInProgress = false;
                window.metricsDashboard.updateSyncStatus();
            }
            eventBus.emit('toast:show', { 
                message: '同步失败：' + e.message, 
                type: 'error' 
            });
        }
    };
    
    // 暴露 metricsDashboard 给全局
    window.metricsDashboard = metricsDashboard;
}

// 入口点
if (IS_REMOTE) {
    console.log('[Auth] Remote access detected, checking authentication...');
    checkAuthStatus().then(isAuthenticated => {
        if (isAuthenticated) {
            console.log('[Auth] Session valid, initializing app...');
            initApp();
        } else {
            console.log('[Auth] Session invalid, showing login dialog...');
            showLoginDialog();
        }
    });
} else {
    initApp();
}
