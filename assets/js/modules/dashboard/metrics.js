function getAuthHeaders() {
    const sessionToken = localStorage.getItem('team_chat_session') || '';
    return sessionToken ? { 'X-Session-Token': sessionToken } : {};
}

function getVisibleMessageCount() {
    try {
        const renderedMessages = document.querySelectorAll('.messages-view .msg');
        if (renderedMessages.length > 0) {
            return renderedMessages.length;
        }
        const messages = window.stateManager?.getState?.('messages') || [];
        return Array.isArray(messages)
            ? messages.filter((message) => !window.__TEAMCHAT_IS_MESSAGE_HIDDEN__?.(message)).length
            : 0;
    } catch {
        return 0;
    }
}

function isHistoryLoaded() {
    try {
        return Boolean(window.stateManager?.getStateValue?.('historyLoaded'));
    } catch {
        return false;
    }
}

function getHistoryError() {
    try {
        return window.stateManager?.getStateValue?.('historyError') || '';
    } catch {
        return '';
    }
}

function isRealtimeConnected() {
    try {
        return Boolean(window.stateManager?.getStateValue?.('isConnected'));
    } catch {
        return false;
    }
}

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
        this.cleanup = {
            reclaimableBytes: 0,
            fileCount: 0,
            targets: []
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
        const existing = document.getElementById('metrics-dashboard');
        if (existing) {
            existing.remove();
        }

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
                <div class="cleanup-section">
                    <div class="cleanup-section-header">
                        <h3>🧹 安全清理</h3>
                        <div class="cleanup-summary" id="cleanup-summary">可释放 0 B</div>
                    </div>
                    <div class="cleanup-list" id="cleanup-list"></div>
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
        
        // 刷新按钮事件
        const refreshTeamChatBtn = this.container.querySelector('#refresh-teamchat-btn');
        refreshTeamChatBtn.addEventListener('click', () => this.refreshTunnelUrl('teamchat'));
        
        // 打开按钮事件
        const openTeamChatBtn = this.container.querySelector('#open-teamchat-btn');
        openTeamChatBtn.addEventListener('click', () => this.openTunnelUrl('teamchat'));
        
        // 管理按钮事件
        const restartGatewayBtn = this.container.querySelector('#restart-gateway-btn');
        restartGatewayBtn.addEventListener('click', () => this.adminAction('restart-gateway', '重启网关'));
        
        const restartTeamChatBtn = this.container.querySelector('#restart-teamchat-btn');
        restartTeamChatBtn.addEventListener('click', () => this.adminAction('restart-teamchat', '重启 TeamChat'));
        
        const restartTunnelBtn = this.container.querySelector('#restart-tunnel-btn');
        restartTunnelBtn.addEventListener('click', () => this.adminAction('restart-tunnel', '重启 Tunnel'));
        
        const clearCacheBtn = this.container.querySelector('#clear-cache-btn');
        clearCacheBtn.addEventListener('click', () => this.confirmSafeCleanup());
    }
    
    async adminAction(action, label) {
        if (!confirm(`确定要${label}吗？`)) return;

        const actionBtn = this.container.querySelector(`#${action}-btn`) || this.container.querySelector(`#${action.replace('restart-', 'restart-')}-btn`);
        
        try {
            if (actionBtn) {
                actionBtn.disabled = true;
                actionBtn.dataset.originalLabel = actionBtn.querySelector('.btn-label')?.textContent || '';
                const labelEl = actionBtn.querySelector('.btn-label');
                if (labelEl) labelEl.textContent = '执行中...';
            }
            let response = await fetch(`/api/ops/${action}`, {
                method: 'POST',
                headers: {
                    'X-TeamChat-Action-Origin': 'metrics-dashboard',
                    ...getAuthHeaders()
                }
            });
            if (!response.ok) {
                response = await fetch(`/api/admin/${action}`, {
                    method: 'POST',
                    headers: {
                        'X-TeamChat-Action-Origin': 'metrics-dashboard',
                        ...getAuthHeaders()
                    }
                });
            }
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
        } finally {
            if (actionBtn) {
                actionBtn.disabled = false;
                const labelEl = actionBtn.querySelector('.btn-label');
                if (labelEl && actionBtn.dataset.originalLabel) {
                    labelEl.textContent = actionBtn.dataset.originalLabel;
                }
            }
        }
    }

    async confirmSafeCleanup(targetIds = null) {
        const targets = Array.isArray(targetIds) && targetIds.length > 0
            ? this.cleanup.targets.filter((target) => targetIds.includes(target.id))
            : this.cleanup.targets.filter((target) => target.fileCount > 0);

        if (!targets.length) {
            alert('当前没有可安全清理的日志或缓存文件。');
            return;
        }

        const targetNames = targets.map((target) => `${target.title}（${this.formatBytes(target.bytes)} / ${target.fileCount} 个文件）`).join('\n');
        const impactLines = targets.map((target) => `- ${target.title}：${target.impact}`).join('\n');
        const confirmed = confirm(
            `将安全清理以下内容：\n${targetNames}\n\n清理影响：\n${impactLines}\n\n不会删除数据库和当前聊天记录。是否继续？`
        );
        if (!confirmed) return;

        try {
            const response = await fetch('/api/ops/cleanup-safe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ targets: targets.map((target) => target.id) })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '清理失败');
            }
            alert(`已安全清理 ${data.cleanedFiles || 0} 个文件，释放 ${this.formatBytes(data.cleanedBytes || 0)}`);
            await this.fetchMetrics();
        } catch (e) {
            console.error('[Metrics] Safe cleanup failed:', e);
            alert(`安全清理失败：${e.message}`);
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
        await this.refreshTunnelUrl('teamchat');
    }
    
    async refreshTunnelUrl(type) {
        const url = '/api/tunnel';
        const inputId = 'teamchat-tunnel-url';
        const refreshBtn = this.container.querySelector(`#refresh-${type}-btn`);
        
        try {
            if (refreshBtn) refreshBtn.textContent = '⏳';
            const response = await fetch(url, {
                headers: getAuthHeaders()
            });
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
            
            if (refreshBtn) {
                setTimeout(() => refreshBtn.textContent = '🔄', 1000);
            }
        } catch (e) {
            console.error('[Metrics] Failed to refresh tunnel URL:', e);
            const input = this.container.querySelector(`#${inputId}`);
            if (input) {
                input.value = '获取失败';
            }
            if (refreshBtn) {
                refreshBtn.textContent = '❌';
                setTimeout(() => refreshBtn.textContent = '🔄', 2000);
            }
        }
    }
    
    openTunnelUrl(type) {
        const inputId = 'teamchat-tunnel-url';
        const input = this.container.querySelector(`#${inputId}`);
        const rawValue = this[`${type}TunnelUrl`] || input?.value || '';
        const tunnelUrl = rawValue.replace(/\s+\(本地\)\s*$/, '').trim();
        if (!tunnelUrl) {
            alert('请先点击 🔄 刷新按钮获取最新链接');
            return;
        }
        
        // 自动跳转到登录页
        const loginUrl = `${tunnelUrl}/team_chat_login.html`;
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
        this.stopAutoRefresh();
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
            const response = await fetch('/api/system-metrics', {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            
            // 转换服务器数据格式
            if (data) {
                // 从 data 中提取指标
                this.metrics.cpuUsage = data.cpu?.percent || 0;
                this.metrics.memoryUsage = (data.memory?.used || 0) / (1024 * 1024); // 转换为 MB
                this.metrics.onlineUsers = data.teamchat?.users || 0;
                this.metrics.uptime = data.teamchat?.uptime || 0;
                this.metrics.activeAgents = data.agents?.active || 0;
                this.metrics.totalMessages = data.teamchat?.totalMessages || 0;
                this.metrics.messagesPerSecond = data.messageRate
                    ? (Number(data.messageRate) / 60).toFixed(2)
                    : (this.metrics.totalMessages > 0 ? (this.metrics.totalMessages / (this.metrics.uptime || 1)).toFixed(2) : 0);
                this.metrics.successRate = data.successRate || 100;
                this.cleanup = data.cleanup || this.cleanup;
                this.syncStatus.serverCount = Number(data.teamchat?.totalMessages || 0);
                this.syncStatus.localCount = getVisibleMessageCount();
                this.syncStatus.diff = Math.max(0, this.syncStatus.serverCount - this.syncStatus.localCount);
                this.syncStatus.latency = Number(data.gateway?.latency || 0);
                this.syncStatus.lastSyncTime = Number(data.timestamp || Date.now());
                this.syncStatus.error = getHistoryError() || null;
                
                this.updateDisplay();
                this.renderCleanupTargets(data.agents);
                this.updateSyncStatus();
                this.addToHistory(this.metrics);
            }
        } catch (e) {
            console.error('[Metrics] Failed to fetch:', e);
            this.syncStatus.error = e.message || '监控数据获取失败';
            this.updateSyncStatus();
        }
    }

    updateDisplay() {
        this.container.querySelector('#metric-mps').textContent = `${this.metrics.messagesPerSecond} 条/秒`;
        this.container.querySelector('#metric-total').textContent = this.metrics.totalMessages.toLocaleString();
        this.container.querySelector('#metric-agents').textContent = this.metrics.activeAgents;
        this.container.querySelector('#metric-users').textContent = this.metrics.onlineUsers;
        this.container.querySelector('#metric-cpu').textContent = `${(this.metrics.cpuUsage || 0).toFixed(1)}%`;
        this.container.querySelector('#metric-memory').textContent = `${Math.round(this.metrics.memoryUsage || 0)} MB`;
        this.container.querySelector('#metric-uptime').textContent = this.formatUptime(this.metrics.uptime || 0);
        this.container.querySelector('#metric-success').textContent = `${Math.round(this.metrics.successRate || 0)}%`;
    }

    renderCleanupTargets(agentMetrics = null) {
        const summaryEl = this.container.querySelector('#cleanup-summary');
        const listEl = this.container.querySelector('#cleanup-list');
        if (!summaryEl || !listEl) return;

        const activeText = agentMetrics
            ? `活跃 ${agentMetrics.active || 0} / 总计 ${agentMetrics.total || 0}`
            : '';
        this.container.querySelector('#metric-agents').textContent = activeText || this.metrics.activeAgents;

        summaryEl.textContent = `可释放 ${this.formatBytes(this.cleanup.reclaimableBytes || 0)}${this.cleanup.fileCount ? ` · ${this.cleanup.fileCount} 个文件` : ''}`;
        listEl.innerHTML = '';

        for (const target of this.cleanup.targets || []) {
            const item = document.createElement('div');
            item.className = 'cleanup-item';
            item.innerHTML = `
                <div class="cleanup-item-main">
                    <div class="cleanup-item-title">${target.title}</div>
                    <div class="cleanup-item-meta">${this.formatBytes(target.bytes)} · ${target.fileCount} 个文件</div>
                    <div class="cleanup-item-desc">${target.description}</div>
                    <div class="cleanup-item-impact">${target.impact}</div>
                </div>
                <button class="cleanup-action-btn" ${target.fileCount ? '' : 'disabled'}>清理</button>
            `;
            item.querySelector('.cleanup-action-btn')?.addEventListener('click', () => this.confirmSafeCleanup([target.id]));
            listEl.appendChild(item);
        }

        if (!listEl.children.length) {
            listEl.innerHTML = '<div class="cleanup-empty">当前没有可安全清理的日志或缓存。</div>';
        }
    }

    updateSyncStatus() {
        this.container.querySelector('#sync-server-count').textContent = this.syncStatus.serverCount;
        this.container.querySelector('#sync-local-count').textContent = this.syncStatus.localCount;
        this.container.querySelector('#sync-diff').textContent = this.syncStatus.diff;
        this.container.querySelector('#sync-latency').textContent = `${this.syncStatus.latency}ms`;
        
        if (this.syncStatus.lastSyncTime) {
            this.container.querySelector('#sync-last-time').textContent = 
                new Date(this.syncStatus.lastSyncTime).toLocaleTimeString();
        }
        
        const connectionEl = this.container.querySelector('#sync-connection');
        if (navigator.onLine && isRealtimeConnected()) {
            connectionEl.innerHTML = '<span class="status-dot status-connected"></span> 已连接';
        } else if (navigator.onLine) {
            connectionEl.innerHTML = '<span class="status-dot status-disconnected"></span> 连接中';
        } else {
            connectionEl.innerHTML = '<span class="status-dot status-disconnected"></span> 未连接';
        }
        
        const messageEl = this.container.querySelector('#sync-status-message');
        if (this.syncStatus.syncInProgress) {
            messageEl.textContent = '🔄 同步中...';
            messageEl.className = 'sync-status-message syncing';
        } else if (this.syncStatus.error) {
            messageEl.textContent = `❌ 错误: ${this.syncStatus.error}`;
            messageEl.className = 'sync-status-message error';
        } else if (this.syncStatus.serverCount > 0 && this.syncStatus.localCount === 0 && isHistoryLoaded()) {
            messageEl.textContent = '⚠️ 服务端有消息，但当前页面未显示，请刷新或重新登录';
            messageEl.className = 'sync-status-message warning';
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

    formatBytes(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }
}

// 导出实例供 main.js 使用
export const metricsDashboard = new MetricsDashboard();
export default metricsDashboard;
