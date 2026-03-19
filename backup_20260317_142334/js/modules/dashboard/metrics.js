export class MetricsDashboard {
    constructor() {
        this.container = null;
        this.metrics = {
            messagesPerSecond: 0,
            totalMessages: 0,
            activeAgents: 0,
            onlineUsers: 1,
            cpuUsage: 0,
            memoryUsage: 0,
            uptime: 0
        };
        this.syncStatus = {
            serverCount: 0,
            localCount: 0,
            diff: 0,
            lastSyncTime: null,
            syncInProgress: false,
            latency: 0,
            error: null
        };
        this.history = [];
        this.autoRefreshInterval = null;
        this.startTime = Date.now();
        this.isVisible = false;
    }

    init() {
        this.createContainer();
        this.bindEvents();
        console.log('[Metrics] Dashboard initialized');
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'metrics-dashboard';
        this.container.id = 'metrics-dashboard';
        this.container.innerHTML = `
            <div class="metrics-header">
                <h2>📈 性能监控</h2>
                <button class="metrics-close" id="metrics-close">✕</button>
            </div>
            <div class="metrics-content">
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-icon">📊</div>
                        <div class="metric-label">消息速率</div>
                        <div class="metric-value" id="metric-mps">0 条/秒</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">💬</div>
                        <div class="metric-label">总消息数</div>
                        <div class="metric-value" id="metric-total">0</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">🤖</div>
                        <div class="metric-label">活跃 Agent</div>
                        <div class="metric-value" id="metric-agents">0</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">👥</div>
                        <div class="metric-label">在线用户</div>
                        <div class="metric-value" id="metric-users">1</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">💻</div>
                        <div class="metric-label">CPU 使用率</div>
                        <div class="metric-value" id="metric-cpu">0%</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">🧠</div>
                        <div class="metric-label">内存使用</div>
                        <div class="metric-value" id="metric-memory">0 MB</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">⏱️</div>
                        <div class="metric-label">运行时间</div>
                        <div class="metric-value" id="metric-uptime">00:00:00</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-icon">🎯</div>
                        <div class="metric-label">消息成功率</div>
                        <div class="metric-value" id="metric-success">100%</div>
                    </div>
                </div>
                <div class="sync-status-section">
                    <div class="sync-status-header">
                        <h3>🔄 消息同步状态</h3>
                        <button class="sync-btn" id="manual-sync-btn">
                            🔄 手动同步
                        </button>
                    </div>
                    <div class="sync-status-grid">
                        <div class="sync-status-item">
                            <span class="sync-status-label">服务器消息</span>
                            <span class="sync-status-value" id="sync-server-count">0</span>
                        </div>
                        <div class="sync-status-item">
                            <span class="sync-status-label">本地消息</span>
                            <span class="sync-status-value" id="sync-local-count">0</span>
                        </div>
                        <div class="sync-status-item">
                            <span class="sync-status-label">差异消息</span>
                            <span class="sync-status-value" id="sync-diff">0</span>
                        </div>
                        <div class="sync-status-item">
                            <span class="sync-status-label">同步延迟</span>
                            <span class="sync-status-value" id="sync-latency">0ms</span>
                        </div>
                        <div class="sync-status-item">
                            <span class="sync-status-label">最后同步</span>
                            <span class="sync-status-value" id="sync-last-time">--</span>
                        </div>
                        <div class="sync-status-item">
                            <span class="sync-status-label">连接状态</span>
                            <span class="sync-status-value" id="sync-connection">
                                <span class="status-dot status-disconnected"></span> 未连接
                            </span>
                        </div>
                    </div>
                    <div class="sync-status-message" id="sync-status-message"></div>
                </div>
                <div class="tunnel-links-section">
                    <div class="tunnel-links-header">
                        <h3>🔗 远程连接</h3>
                    </div>
                    <div class="tunnel-links-grid">
                        <div class="tunnel-link-item">
                            <span class="tunnel-link-label">TeamChat</span>
                            <div class="tunnel-link-actions">
                                <input type="text" id="teamchat-tunnel-url" readonly placeholder="点击按钮获取最新链接">
                                <button class="copy-btn" id="copy-teamchat-btn" title="复制链接">📋</button>
                                <button class="refresh-btn" id="refresh-teamchat-btn" title="刷新链接">🔄</button>
                                <button class="open-btn" id="open-teamchat-btn" title="打开登录页">↗️</button>
                            </div>
                        </div>
                        <div class="tunnel-link-item">
                            <span class="tunnel-link-label">邮件系统</span>
                            <div class="tunnel-link-actions">
                                <input type="text" id="mail-tunnel-url" readonly placeholder="点击按钮获取最新链接">
                                <button class="copy-btn" id="copy-mail-btn" title="复制链接">📋</button>
                                <button class="refresh-btn" id="refresh-mail-btn" title="刷新链接">🔄</button>
                                <button class="open-btn" id="open-mail-btn" title="打开登录页">↗️</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="admin-controls-section">
                    <div class="admin-controls-header">
                        <h3>⚙️ 系统管理</h3>
                    </div>
                    <div class="admin-controls-grid">
                        <button class="admin-control-btn" id="restart-gateway-btn">
                            <span class="btn-icon">🔄</span>
                            <span class="btn-label">重启网关</span>
                        </button>
                        <button class="admin-control-btn" id="restart-teamchat-btn">
                            <span class="btn-icon">🔁</span>
                            <span class="btn-label">重启 TeamChat</span>
                        </button>
                        <button class="admin-control-btn" id="restart-tunnel-btn">
                            <span class="btn-icon">🌐</span>
                            <span class="btn-label">重启 Tunnel</span>
                        </button>
                        <button class="admin-control-btn" id="clear-cache-btn">
                            <span class="btn-icon">🗑️</span>
                            <span class="btn-label">清空缓存</span>
                        </button>
                    </div>
                </div>
                <div class="metrics-chart">
                    <canvas id="metrics-chart"></canvas>
                </div>
            </div>
        `;
        document.body.appendChild(this.container);
    }

    bindEvents() {
        const closeBtn = this.container.querySelector('#metrics-close');
        closeBtn.addEventListener('click', () => this.hide());
        
        const manualSyncBtn = this.container.querySelector('#manual-sync-btn');
        manualSyncBtn.addEventListener('click', () => this.manualSync());
        
        // 复制按钮事件
        const copyTeamChatBtn = this.container.querySelector('#copy-teamchat-btn');
        copyTeamChatBtn.addEventListener('click', () => this.copyToClipboard('teamchat-tunnel-url', copyTeamChatBtn));
        
        const copyMailBtn = this.container.querySelector('#copy-mail-btn');
        copyMailBtn.addEventListener('click', () => this.copyToClipboard('mail-tunnel-url', copyMailBtn));
        
        // 刷新按钮事件
        const refreshTeamChatBtn = this.container.querySelector('#refresh-teamchat-btn');
        refreshTeamChatBtn.addEventListener('click', () => this.refreshTunnelUrl('teamchat'));
        
        const refreshMailBtn = this.container.querySelector('#refresh-mail-btn');
        refreshMailBtn.addEventListener('click', () => this.refreshTunnelUrl('mail'));
        
        // 打开按钮事件
        const openTeamChatBtn = this.container.querySelector('#open-teamchat-btn');
        openTeamChatBtn.addEventListener('click', () => this.openTunnelUrl('teamchat'));
        
        const openMailBtn = this.container.querySelector('#open-mail-btn');
        openMailBtn.addEventListener('click', () => this.openTunnelUrl('mail'));
        
        // 管理按钮事件
        const restartGatewayBtn = this.container.querySelector('#restart-gateway-btn');
        restartGatewayBtn.addEventListener('click', () => this.adminAction('restart-gateway', '重启网关'));
        
        const restartTeamChatBtn = this.container.querySelector('#restart-teamchat-btn');
        restartTeamChatBtn.addEventListener('click', () => this.adminAction('restart-teamchat', '重启 TeamChat'));
        
        const restartTunnelBtn = this.container.querySelector('#restart-tunnel-btn');
        restartTunnelBtn.addEventListener('click', () => this.adminAction('restart-tunnel', '重启 Tunnel'));
        
        const clearCacheBtn = this.container.querySelector('#clear-cache-btn');
        clearCacheBtn.addEventListener('click', () => this.adminAction('clear-cache', '清空缓存'));
    }
    
    async adminAction(action, label) {
        if (!confirm(`确定要${label}吗？`)) return;
        
        try {
            const response = await fetch(`/api/admin/${action}`, { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                alert(`${label}成功！`);
                if (action === 'restart-teamchat') {
                    setTimeout(() => location.reload(), 3000);
                }
            } else {
                alert(`${label}失败：${data.error || '未知错误'}`);
            }
        } catch (e) {
            console.error('[Metrics] Admin action failed:', e);
            alert(`${label}失败：${e.message}`);
        }
    }
    
    async copyToClipboard(inputId, btn) {
        const input = document.getElementById(inputId);
        if (input && input.value) {
            try {
                await navigator.clipboard.writeText(input.value);
                const originalText = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => btn.textContent = originalText, 1500);
            } catch (e) {
                console.error('[Metrics] Copy failed:', e);
            }
        }
    }
    
    async fetchTunnelUrls() {
        // 不再自动获取，改为点击刷新按钮时获取
        console.log('[Metrics] Tunnel URLs will be fetched on demand');
    }
    
    async refreshTunnelUrl(type) {
        const url = type === 'teamchat' ? '/api/tunnel' : '/api/mail-tunnel';
        const inputId = type === 'teamchat' ? 'teamchat-tunnel-url' : 'mail-tunnel-url';
        const refreshBtn = this.container.querySelector(`#refresh-${type}-btn`);
        
        try {
            refreshBtn.textContent = '⏳';
            const response = await fetch(url);
            const data = await response.json();
            let tunnelUrl = data.url || '';
            
            // 添加状态提示
            if (data.isLocal) {
                tunnelUrl = `${tunnelUrl} (本地)`;
            }
            
            const input = this.container.querySelector(`#${inputId}`);
            if (input) {
                input.value = tunnelUrl || '未配置';
                input.title = data.note || '';
            }
            
            // 存储完整 URL 用于打开
            this[`${type}TunnelUrl`] = data.url || '';
            
            setTimeout(() => refreshBtn.textContent = '🔄', 1000);
        } catch (e) {
            console.error('[Metrics] Failed to refresh tunnel URL:', e);
            const input = this.container.querySelector(`#${inputId}`);
            if (input) {
                input.value = '获取失败';
            }
            refreshBtn.textContent = '❌';
            setTimeout(() => refreshBtn.textContent = '🔄', 2000);
        }
    }
    
    openTunnelUrl(type) {
        const tunnelUrl = this[`${type}TunnelUrl`];
        if (!tunnelUrl) {
            alert('请先点击 🔄 刷新按钮获取最新链接');
            return;
        }
        
        // 自动跳转到登录页
        const loginUrl = type === 'teamchat' ? `${tunnelUrl}/team_chat_login.html` : tunnelUrl;
        window.open(loginUrl, '_blank');
    }

    show() {
        this.container.classList.add('visible');
        this.isVisible = true;
        this.startAutoRefresh();
        this.updateSyncStatus();
        this.fetchTunnelUrls();
    }

    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
        this.stopAutoRefresh();
    }

    startAutoRefresh() {
        this.fetchMetrics();
        this.autoRefreshInterval = setInterval(() => {
            this.fetchMetrics();
        }, 2000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    async fetchMetrics() {
        try {
            const response = await fetch('/api/system-metrics');
            const data = await response.json();
            
            // 转换服务器数据格式
            if (data) {
                // 从 data 中提取指标
                this.metrics.cpuUsage = data.memory?.percent || 0;
                this.metrics.memoryUsage = (data.memory?.used || 0) / (1024 * 1024); // 转换为 MB
                this.metrics.onlineUsers = data.teamchat?.users || 1;
                this.metrics.uptime = data.teamchat?.uptime || 0;
                this.metrics.activeAgents = data.agents?.active || 0;
                
                // 从 history 获取消息数
                const historyRes = await fetch('/history');
                const history = await historyRes.json();
                this.metrics.totalMessages = history.length || 0;
                
                // 计算消息速率（简单估算）
                this.metrics.messagesPerSecond = this.metrics.totalMessages > 0 ? 
                    (this.metrics.totalMessages / (this.metrics.uptime || 1)).toFixed(2) : 0;
                
                this.updateDisplay();
                this.addToHistory(this.metrics);
            }
        } catch (e) {
            console.error('[Metrics] Failed to fetch:', e);
        }
    }

    updateDisplay() {
        document.getElementById('metric-mps').textContent = `${this.metrics.messagesPerSecond} 条/秒`;
        document.getElementById('metric-total').textContent = this.metrics.totalMessages.toLocaleString();
        document.getElementById('metric-agents').textContent = this.metrics.activeAgents;
        document.getElementById('metric-users').textContent = this.metrics.onlineUsers;
        document.getElementById('metric-cpu').textContent = `${(this.metrics.cpuUsage || 0).toFixed(1)}%`;
        document.getElementById('metric-memory').textContent = `${Math.round(this.metrics.memoryUsage || 0)} MB`;
        document.getElementById('metric-uptime').textContent = this.formatUptime(this.metrics.uptime || 0);
    }

    updateSyncStatus() {
        document.getElementById('sync-server-count').textContent = this.syncStatus.serverCount;
        document.getElementById('sync-local-count').textContent = this.syncStatus.localCount;
        document.getElementById('sync-diff').textContent = this.syncStatus.diff;
        document.getElementById('sync-latency').textContent = `${this.syncStatus.latency}ms`;
        
        if (this.syncStatus.lastSyncTime) {
            document.getElementById('sync-last-time').textContent = 
                new Date(this.syncStatus.lastSyncTime).toLocaleTimeString();
        }
        
        const connectionEl = document.getElementById('sync-connection');
        if (navigator.onLine) {
            connectionEl.innerHTML = '<span class="status-dot status-connected"></span> 已连接';
        } else {
            connectionEl.innerHTML = '<span class="status-dot status-disconnected"></span> 未连接';
        }
        
        const messageEl = document.getElementById('sync-status-message');
        if (this.syncStatus.syncInProgress) {
            messageEl.textContent = '🔄 同步中...';
            messageEl.className = 'sync-status-message syncing';
        } else if (this.syncStatus.error) {
            messageEl.textContent = `❌ 错误: ${this.syncStatus.error}`;
            messageEl.className = 'sync-status-message error';
        } else if (this.syncStatus.diff > 0) {
            messageEl.textContent = '⚠️ 发现差异消息，正在同步...';
            messageEl.className = 'sync-status-message warning';
        } else {
            messageEl.textContent = '✓ 同步完成';
            messageEl.className = 'sync-status-message success';
        }
    }

    async manualSync() {
        if (this.syncStatus.syncInProgress) return;
        
        this.syncStatus.syncInProgress = true;
        this.syncStatus.error = null;
        this.updateSyncStatus();
        
        try {
            if (window.syncMessagesWithServer) {
                await window.syncMessagesWithServer(true);
            }
        } catch (e) {
            this.syncStatus.error = e.message;
            console.error('[Sync] Manual sync failed:', e);
        } finally {
            this.syncStatus.syncInProgress = false;
            this.updateSyncStatus();
        }
    }

    addToHistory(metrics) {
        this.history.push({
            time: Date.now(),
            ...metrics
        });
        
        if (this.history.length > 60) {
            this.history.shift();
        }
    }

    formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
}

// 导出实例供 main.js 使用
export const metricsDashboard = new MetricsDashboard();
export default metricsDashboard;
