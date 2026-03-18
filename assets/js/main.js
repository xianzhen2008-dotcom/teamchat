/**
 * Main Entry - 应用入口
 */

import { stateManager } from './core/state.js';
import { eventBus } from './core/events.js';
import { App } from './core/app.js';

import { websocketService } from './services/websocket.js';
import { avatarService } from './services/avatar.js';
import { apiService } from './services/api.js';

import { sidebarModule } from './modules/sidebar/index.js';
import { messagesModule } from './modules/messages/index.js';
import { inputModule } from './modules/input/index.js';
import { filterModule } from './modules/filter/index.js';
import { searchModule } from './modules/search/index.js';
import { statusDashboard } from './modules/dashboard/status.js';
import { metricsDashboard } from './modules/dashboard/metrics.js';
import { emailMonitorDashboard } from './modules/dashboard/email-monitor.js';
import { themeModule } from './modules/theme/index.js';

// 根据 Agent ID 或名称获取对应的头像文件
function getAgentAvatar(agentId, agentName) {
    const avatarMap = {
        // 按 ID 映射
        'main': 'compressed/小龙虾_compressed.jpg',
        'lobster': 'compressed/小龙虾_compressed.jpg',
        'writer': 'compressed/小文 2_compressed.jpg',
        'mail': 'compressed/小邮_compressed.jpg',
        'data': 'compressed/小数_compressed.jpg',
        'qa': 'compressed/小测_compressed.jpg',
        'pm': 'compressed/小产_compressed.jpg',
        'dev': 'compressed/小码_compressed.jpg',
        'backend': 'compressed/小后_compressed.jpg',
        'frontend': 'compressed/小前_compressed.jpg',
        'mobile': 'compressed/小移_compressed.jpg',
        'devops': 'compressed/小运_compressed.jpg',
        'finance': 'compressed/小财_compressed.jpg',
        // 按名称映射
        '小龙虾': 'compressed/小龙虾_compressed.jpg',
        '小文': 'compressed/小文 2_compressed.jpg',
        '小写': 'compressed/小文 2_compressed.jpg',
        '小邮': 'compressed/小邮_compressed.jpg',
        '小数': 'compressed/小数_compressed.jpg',
        '小测': 'compressed/小测_compressed.jpg',
        '小产': 'compressed/小产_compressed.jpg',
        '小码': 'compressed/小码_compressed.jpg',
        '小后': 'compressed/小后_compressed.jpg',
        '小前': 'compressed/小前_compressed.jpg',
        '小移': 'compressed/小移_compressed.jpg',
        '小运': 'compressed/小运_compressed.jpg',
        '小财': 'compressed/小财_compressed.jpg'
    };
    
    // 优先使用 ID 映射，其次使用名称映射
    return avatarMap[agentId] || avatarMap[agentName] || 'compressed/小龙虾_compressed.jpg';
}

// 远程访问检测
const IS_REMOTE = !['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const SESSION_KEY = 'team_chat_session';

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
    const password = prompt('请输入访问口令：');
    if (password) {
        login(password).then(success => {
            if (success) {
                initApp();
            } else {
                alert('口令错误，请重试');
                showLoginDialog();
            }
        });
    }
}

async function initApp() {
    // 动态从服务器获取 Gateway Token
    let AUTH_TOKEN = new URLSearchParams(location.search).get('token') || localStorage.getItem('team_chat_token');
    if (!AUTH_TOKEN) {
        try {
            const tokenResp = await fetch('/api/gateway-token');
            if (tokenResp.ok) {
                const tokenData = await tokenResp.json();
                AUTH_TOKEN = tokenData.token;
            }
        } catch (e) {
            console.error('Failed to fetch gateway token:', e);
        }
    }
    const MAIN_KEY = 'main-key';

    // 从 Gateway 获取真实的 agents 列表
    let agents = [];
    try {
        const resp = await fetch('/api/agents');
        if (resp.ok) {
            const data = await resp.json();
            // API 可能返回数组或对象
            const agentList = Array.isArray(data) ? data : (data.agents || data.list || []);
            agents = agentList.map(a => ({
                agentId: a.id,
                name: a.name || a.id,
                img: getAgentAvatar(a.id, a.name),
                role: a.role || a.name || a.id
            }));
        }
    } catch (e) {
        console.warn('Failed to fetch agents, using default list:', e);
    }

    // Agent 排序配置：常用优先，开发组（除小码外）排到最后
    const AGENT_ORDER = [
        'main',    // 小龙虾 - 团队主管（最常用）
        'writer',  // 小文 - 写作助手
        'mail',    // 小邮 - 邮件助手
        'data',    // 小数 - 数据分析师
        'qa',      // 小测 - 测试专家
        'pm',      // 小产 - 产品经理
        'dev',     // 小码 - 开发专家（开发组唯一靠前的）
        // 开发组其他成员排到最后
        'frontend', // 小前 - 前端专家
        'backend',  // 小后 - 后端专家
        'mobile',   // 小移 - 移动开发
        'devops',   // 小运 - 运维专家
        'finance'   // 小财 - 财务助手
    ];

    // 对 agents 进行排序
    agents.sort((a, b) => {
        const aIndex = AGENT_ORDER.indexOf(a.agentId);
        const bIndex = AGENT_ORDER.indexOf(b.agentId);
        
        // 如果在排序列表中，按列表顺序
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        
        // 如果只有 a 在列表中，a 排前面
        if (aIndex !== -1) return -1;
        
        // 如果只有 b 在列表中，b 排前面
        if (bIndex !== -1) return 1;
        
        // 都不在列表中，按名称排序
        return a.name.localeCompare(b.name);
    });

    // 如果获取失败，使用默认列表
    if (agents.length === 0) {
        agents = [
            { agentId: 'main', name: '小龙虾', img: 'compressed/小龙虾_compressed.jpg', role: '团队主管' },
            { agentId: 'writer', name: '小文', img: 'compressed/小文 2_compressed.jpg', role: '写作助手' },
            { agentId: 'mail', name: '小邮', img: 'compressed/小邮_compressed.jpg', role: '邮件助手' },
            { agentId: 'data', name: '小数', img: 'compressed/小数_compressed.jpg', role: '数据分析师' },
            { agentId: 'qa', name: '小测', img: 'compressed/小测_compressed.jpg', role: '测试专家' },
            { agentId: 'pm', name: '小产', img: 'compressed/小产_compressed.jpg', role: '产品经理' },
            { agentId: 'dev', name: '小码', img: 'compressed/小码_compressed.jpg', role: '开发专家' },
        ];
    }

    stateManager.setState('agents', agents);
    stateManager.setState('currentAgent', agents[0]);

    // 预加载所有 Agent 的头像（传入文件名数组）
    avatarService.preloadAll(agents.map(a => a.img));

    const app = new App({ authToken: AUTH_TOKEN });

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
        grid: document.getElementById('filter-agent-grid')
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

    // 从服务器加载历史消息
    async function loadHistoryFromServer() {
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const res = await fetch(`${apiHost}/history?token=${AUTH_TOKEN}`);
            if (res.ok) {
                const serverHistory = await res.json();
                console.log(`[History] 从服务器加载 ${serverHistory.length} 条历史消息`);
                stateManager.loadHistory(serverHistory);
                console.log("HISTORY_RE_RENDERED_20260317", { count: serverHistory.length });
            } else {
                console.error('[History] 加载失败:', res.status);
            }
        } catch (e) {
            console.error('[History] 加载错误:', e);
        }
    }

    loadHistoryFromServer();

    // 初始化主题
    themeModule.init();
    
    // 初始化工作日志按钮（桌面端和移动端）
    const statusToggle = document.getElementById('status-toggle');
    const statusToggle2 = document.getElementById('status-toggle-2');
    const handleStatusToggle = () => {
        statusDashboard.show();
        // 关闭下拉菜单
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (statusToggle) {
        statusToggle.addEventListener('click', handleStatusToggle);
    }
    if (statusToggle2) {
        statusToggle2.addEventListener('click', handleStatusToggle);
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
    const handleEmailMonitorToggle = () => {
        emailMonitorDashboard.toggle();
        const dropdown = document.getElementById('header-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    };
    if (emailMonitorToggle) {
        emailMonitorToggle.addEventListener('click', handleEmailMonitorToggle);
    }
    if (emailMonitorToggle2) {
        emailMonitorToggle2.addEventListener('click', handleEmailMonitorToggle);
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
    
    // 初始化锁屏按钮
    const scrollLockBtn = document.getElementById('scroll-lock-toggle');
    if (scrollLockBtn) {
        scrollLockBtn.addEventListener('click', () => {
            messagesModule.toggleScrollLock();
        });
    }

    // 初始化邮件链接
    const mailLink = document.getElementById('mail-link') || document.getElementById('mail-link-2');
    if (mailLink) {
        fetch('/api/mail-tunnel')
            .then(res => res.json())
            .then(data => {
                const mailUrl = data.url;
                if (mailUrl) {
                    mailLink.href = mailUrl;
                } else {
                    mailLink.href = 'http://localhost:3456';
                }
            })
            .catch(err => {
                console.warn('[Mail] Failed to fetch mail tunnel URL:', err);
                mailLink.href = 'http://localhost:3456';
            });
    }

    // 初始化移动端下拉菜单
    const moreToggle = document.getElementById('more-toggle');
    const headerDropdown = document.getElementById('header-dropdown');
    if (moreToggle && headerDropdown) {
        moreToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            headerDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!headerDropdown.contains(e.target) && e.target !== moreToggle) {
                headerDropdown.classList.remove('show');
            }
        });
        
        headerDropdown.addEventListener('click', () => {
            headerDropdown.classList.remove('show');
        });
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
            const mentionName = mentionMatch[1];
            targetAgent = agents.find(a => 
                a.name.toLowerCase() === mentionName.toLowerCase() ||
                a.agentId.toLowerCase() === mentionName.toLowerCase()
            );
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
            targetAgent = agents.find(a => a.agentId === 'lobster') || agents[0];
        }
        
        if (!targetAgent) {
            eventBus.emit('toast:show', { message: '没有可用的Agent', type: 'error' });
            return;
        }

        const msgId = Date.now();
        messagesModule.addMessage({
            id: msgId,
            sender: 'user',
            text,
            timestamp: msgId,
            isUser: true,
            status: 'sending'
        });

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        
        const sent = app.send({
            type: 'req',
            id,
            method: 'agent',
            params: {
                agentId: targetAgent.agentId,
                sessionKey: `agent:${targetAgent.agentId}:${MAIN_KEY}`,
                message: text,
                idempotencyKey: id
            }
        });

        if (sent) {
            const messages = stateManager.getState('messages') || [];
            const msgIndex = messages.findIndex(m => m.id === msgId);
            if (msgIndex >= 0) {
                messages[msgIndex].status = 'sent';
                stateManager.setState('messages', [...messages]);
            }
            stateManager.setAgentBusy(targetAgent.agentId, true);
            sidebarModule.render();
        } else {
            const messages = stateManager.getState('messages') || [];
            const msgIndex = messages.findIndex(m => m.id === msgId);
            if (msgIndex >= 0) {
                messages[msgIndex].status = 'failed';
                stateManager.setState('messages', [...messages]);
            }
        }
    });

    eventBus.on('toast:show', ({ message, type = 'info' }) => {
        showToast(message, type);
    });

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    app.init();

    // 全局点击空白关闭弹窗（只有点击面板外部才关闭）
    document.addEventListener('click', (e) => {
        // 关闭筛选面板
        const filterPanel = document.getElementById('filter-panel');
        const filterToggle = document.getElementById('filter-toggle');
        if (filterPanel && filterPanel.classList.contains('active')) {
            // 只有点击面板外部且不是切换按钮时才关闭
            if (!filterPanel.contains(e.target) && e.target !== filterToggle && !filterToggle?.contains(e.target)) {
                filterPanel.classList.remove('active');
            }
        }

        // 关闭搜索面板
        const searchPanel = document.getElementById('search-panel');
        const searchToggle = document.getElementById('search-toggle');
        if (searchPanel && searchPanel.classList.contains('active')) {
            if (!searchPanel.contains(e.target) && e.target !== searchToggle && !searchToggle?.contains(e.target)) {
                searchPanel.classList.remove('active');
            }
        }

        // 关闭工作日志面板
        const statusDashboard = document.getElementById('status-dashboard');
        const statusToggle = document.getElementById('status-toggle');
        if (statusDashboard && statusDashboard.classList.contains('active')) {
            if (!statusDashboard.contains(e.target) && e.target !== statusToggle && !statusToggle?.contains(e.target)) {
                statusDashboard.classList.remove('active');
            }
        }

        // 关闭性能监控面板
        const metricsDashboard = document.getElementById('metrics-dashboard');
        const metricsToggle = document.getElementById('metrics-toggle');
        if (metricsDashboard && metricsDashboard.classList.contains('active')) {
            if (!metricsDashboard.contains(e.target) && e.target !== metricsToggle && !metricsToggle?.contains(e.target)) {
                metricsDashboard.classList.remove('active');
            }
        }

        // 关闭邮件监控面板
        const emailMonitorDashboard = document.getElementById('email-monitor-dashboard');
        const emailMonitorToggle = document.getElementById('email-monitor-toggle');
        if (emailMonitorDashboard && emailMonitorDashboard.classList.contains('active')) {
            if (!emailMonitorDashboard.contains(e.target) && e.target !== emailMonitorToggle && !emailMonitorToggle?.contains(e.target)) {
                emailMonitorDashboard.classList.remove('active');
            }
        }

        // 关闭 @提及菜单
        const mentionMenu = document.getElementById('mention-menu');
        const chatInput = document.getElementById('chat-input');
        if (mentionMenu && mentionMenu.style.display !== 'none') {
            if (!mentionMenu.contains(e.target) && e.target !== chatInput) {
                mentionMenu.style.display = 'none';
            }
        }
    });

    window.teamChat = {
        app,
        stateManager,
        eventBus,
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

    console.log('🚀 TeamChat initialized');
    
    // 添加全局同步函数供 metrics dashboard 使用
    window.syncMessagesWithServer = async function(forceFullSync = false) {
        const startTime = Date.now();
        try {
            // 获取本地消息
            const localMessages = stateManager.getState('messages') || [];
            const localCount = localMessages.length;
            
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const sessionToken = localStorage.getItem('team_chat_session') || '';
            
            let serverHistory;
            let serverCount;
            
            if (forceFullSync) {
                // 完整同步：获取最近 30 天的消息
                let url = `${apiHost}/history?days=30`;
                if (sessionToken) url += `&session=${sessionToken}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
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
                    headers: { 'Content-Type': 'application/json' }
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
                stateManager.setState('messages', serverHistory);
                if (window.messagesModule && window.messagesModule.render) {
                    window.messagesModule.render();
                }
                
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
