/**
 * 邮件监控面板
 * 显示邮件同步状态
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';

class EmailMonitorDashboard {
    constructor() {
        this.container = null;
        this.visible = false;
        this.refreshInterval = null;
        this.syncStatus = {
            lastSyncTime: null,
            serverCount: 0,
            localCount: 0,
            indexedCount: 0,
            serverLatestTime: null,
            localLatestTime: null,
            pendingSync: 0,
            pendingIndex: 0,
            storageSize: 0,
            isSyncing: false,
            error: null
        };
    }

    init() {
        this.createContainer();
        this.bindEvents();
        this.startAutoRefresh();
    }

    createContainer() {
        let container = document.getElementById('email-monitor-dashboard');
        if (container) {
            container.remove();
        }

        container = document.createElement('div');
        container.className = 'email-monitor-dashboard';
        container.id = 'email-monitor-dashboard';
        container.innerHTML = `
            <div class="dashboard-header">
                <span>📧 邮件同步监控</span>
                <span class="dashboard-close" id="email-monitor-close">✕</span>
            </div>
            <div class="email-monitor-content">
                <div class="sync-status-section">
                    <h3>同步状态</h3>
                    <div class="status-grid">
                        <div class="status-item">
                            <span class="status-label">状态</span>
                            <span class="status-value" id="sync-status-value">-</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">上次检查</span>
                            <span class="status-value" id="last-check-time">-</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">上次同步</span>
                            <span class="status-value" id="last-sync-time">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="counts-section">
                    <h3>邮件数量</h3>
                    <div class="counts-grid">
                        <div class="count-item">
                            <span class="count-label">服务器</span>
                            <span class="count-value" id="server-count">-</span>
                        </div>
                        <div class="count-item">
                            <span class="count-label">本地</span>
                            <span class="count-value" id="local-count">-</span>
                        </div>
                        <div class="count-item">
                            <span class="count-label">已索引</span>
                            <span class="count-value" id="indexed-count">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="time-section">
                    <h3>最新邮件时间</h3>
                    <div class="time-grid">
                        <div class="time-item">
                            <span class="time-label">服务器</span>
                            <span class="time-value" id="server-latest-time">-</span>
                        </div>
                        <div class="time-item">
                            <span class="time-label">本地</span>
                            <span class="time-value" id="local-latest-time">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="pending-section">
                    <h3>待处理</h3>
                    <div class="pending-grid">
                        <div class="pending-item">
                            <span class="pending-label">待同步</span>
                            <span class="pending-value" id="pending-sync">-</span>
                        </div>
                        <div class="pending-item">
                            <span class="pending-label">待索引</span>
                            <span class="pending-value" id="pending-index">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="storage-section">
                    <h3>存储</h3>
                    <div class="storage-info">
                        <span class="storage-label">邮件存储大小</span>
                        <span class="storage-value" id="storage-size">-</span>
                    </div>
                </div>
                
                <div class="error-section" id="error-section" style="display: none;">
                    <h3>错误信息</h3>
                    <div class="error-message" id="error-message"></div>
                </div>
                
                <div class="actions-section">
                    <button class="sync-btn" id="manual-sync-btn">
                        <span>🔄 手动同步</span>
                    </button>
                    <button class="refresh-btn" id="refresh-status-btn">
                        <span>📊 刷新状态</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
    }

    bindEvents() {
        const closeBtn = this.container.querySelector('#email-monitor-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });

        const syncBtn = this.container.querySelector('#manual-sync-btn');
        syncBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerManualSync();
        });

        const refreshBtn = this.container.querySelector('#refresh-status-btn');
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.fetchStatus();
        });
    }

    async fetchStatus() {
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const response = await fetch(`${apiHost}/api/email-sync/status`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch email sync status');
            }
            
            const data = await response.json();
            this.syncStatus = {
                ...this.syncStatus,
                ...data,
                lastCheckTime: Date.now()
            };
            
            this.render();
        } catch (error) {
            console.error('[EmailMonitor] Failed to fetch status:', error);
            this.syncStatus.error = error.message;
            this.render();
        }
    }

    async triggerManualSync() {
        const syncBtn = this.container.querySelector('#manual-sync-btn');
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span>⏳ 同步中...</span>';
        
        try {
            const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
            const response = await fetch(`${apiHost}/api/email-sync/trigger`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error('Failed to trigger sync');
            }
            
            const result = await response.json();
            console.log('[EmailMonitor] Sync triggered:', result);
            
            setTimeout(() => this.fetchStatus(), 2000);
        } catch (error) {
            console.error('[EmailMonitor] Failed to trigger sync:', error);
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<span>🔄 手动同步</span>';
        }
    }

    startAutoRefresh() {
        this.fetchStatus();
        this.refreshInterval = setInterval(() => {
            if (this.visible) {
                this.fetchStatus();
            }
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        if (this.container) {
            this.container.classList.add('active');
        }
        this.visible = true;
        this.fetchStatus();
    }

    hide() {
        if (this.container) {
            this.container.classList.remove('active');
        }
        this.visible = false;
    }

    render() {
        if (!this.container) return;

        const statusValue = this.container.querySelector('#sync-status-value');
        const lastCheckTime = this.container.querySelector('#last-check-time');
        const lastSyncTime = this.container.querySelector('#last-sync-time');
        const serverCount = this.container.querySelector('#server-count');
        const localCount = this.container.querySelector('#local-count');
        const indexedCount = this.container.querySelector('#indexed-count');
        const serverLatestTime = this.container.querySelector('#server-latest-time');
        const localLatestTime = this.container.querySelector('#local-latest-time');
        const pendingSync = this.container.querySelector('#pending-sync');
        const pendingIndex = this.container.querySelector('#pending-index');
        const storageSize = this.container.querySelector('#storage-size');
        const errorSection = this.container.querySelector('#error-section');
        const errorMessage = this.container.querySelector('#error-message');

        if (this.syncStatus.isSyncing) {
            statusValue.innerHTML = '<span class="syncing">⏳ 同步中...</span>';
        } else if (this.syncStatus.error) {
            statusValue.innerHTML = '<span class="error">❌ 错误</span>';
        } else {
            statusValue.innerHTML = '<span class="ok">✅ 正常</span>';
        }

        lastCheckTime.textContent = this.formatTime(this.syncStatus.lastCheckTime);
        lastSyncTime.textContent = this.formatTime(this.syncStatus.lastSyncTime);
        serverCount.textContent = this.syncStatus.serverCount.toLocaleString();
        localCount.textContent = this.syncStatus.localCount.toLocaleString();
        indexedCount.textContent = this.syncStatus.indexedCount.toLocaleString();
        serverLatestTime.textContent = this.formatTime(this.syncStatus.serverLatestTime);
        localLatestTime.textContent = this.formatTime(this.syncStatus.localLatestTime);
        pendingSync.textContent = this.syncStatus.pendingSync.toLocaleString();
        pendingIndex.textContent = this.syncStatus.pendingIndex.toLocaleString();
        storageSize.textContent = this.formatSize(this.syncStatus.storageSize);

        if (this.syncStatus.error) {
            errorSection.style.display = 'block';
            errorMessage.textContent = this.syncStatus.error;
        } else {
            errorSection.style.display = 'none';
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '-';
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatSize(bytes) {
        if (!bytes || bytes === 0) return '-';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    destroy() {
        this.hide();
        this.stopAutoRefresh();
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}

export const emailMonitorDashboard = new EmailMonitorDashboard();
