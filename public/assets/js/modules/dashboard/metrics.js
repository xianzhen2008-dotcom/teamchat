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
    }

    show() {
        this.container.classList.add('visible');
        this.isVisible = true;
        this.startAutoRefresh();
        this.updateSyncStatus();
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
            
            if (data && data.metrics) {
                this.metrics = { ...this.metrics, ...data.metrics };
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
        document.getElementById('metric-cpu').textContent = `${this.metrics.cpuUsage.toFixed(1)}%`;
        document.getElementById('metric-memory').textContent = `${Math.round(this.metrics.memoryUsage)} MB`;
        document.getElementById('metric-uptime').textContent = this.formatUptime(this.metrics.uptime);
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
