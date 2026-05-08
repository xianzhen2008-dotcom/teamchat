import { eventBus } from '../../core/events.js';

const REFRESH_INTERVAL = 30000;
const AUTO_HIDE_MS = 60_000;

function getAuthHeaders() {
    const sessionToken = localStorage.getItem('team_chat_session') || '';
    return sessionToken ? { 'X-Session-Token': sessionToken } : {};
}

function formatRelativeTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return '刚刚';
    const diff = Math.max(0, Date.now() - value);
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} 小时前`;
    return `${Math.round(diff / 86_400_000)} 天前`;
}

class TeamChatNotificationsModule {
    constructor() {
        this.container = null;
        this.visible = true;
        this.interval = null;
        this.snapshotKey = '';
        this.history = [];
        this.historyPanel = null;
        this.historyList = null;
        this.autoHideTimer = null;
        this.autoHideDeadline = 0;
        this.dismissedIds = new Set();
        this.dismissedSnapshotKey = '';
        this.lastNotices = [];
    }

    init(options = {}) {
        this.container = options.container || document.getElementById('teamchat-notice-strip');
        if (!this.container) {
            console.warn('[Notifications] Container not found');
            return this;
        }

        this.ensureHistoryPanel();
        this.container.addEventListener('click', (e) => this.handleClick(e));
        this.refresh();
        this.start();
        return this;
    }

    start() {
        this.stop();
        this.interval = setInterval(() => {
            this.refresh();
        }, REFRESH_INTERVAL);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refresh();
            }
        });
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    handleClick(e) {
        if (e.target.closest('.teamchat-notice-history-btn')) {
            this.openHistory();
            return;
        }

        if (e.target.closest('.teamchat-notice-expand-btn')) {
            this.visible = true;
            this.autoHideDeadline = Date.now() + AUTO_HIDE_MS;
            this.container?.classList.remove('is-collapsed');
            this.render(this.lastNotices || []);
            return;
        }

        if (e.target.closest('.teamchat-notice-history-close')) {
            this.closeHistory();
            return;
        }

        if (e.target.closest('.teamchat-notice-close-btn')) {
            e.stopPropagation();
            const card = e.target.closest('.teamchat-notice-card');
            const noticeId = card?.dataset.noticeId;
            if (noticeId) {
                this.dismissedIds.add(noticeId);
                this.render(this.lastNotices || []);
            }
            return;
        }

        if (e.target.closest('.teamchat-notice-hide-btn')) {
            this.visible = false;
            this.container?.classList.add('is-collapsed');
            this.render(this.lastNotices || []);
            return;
        }

        const card = e.target.closest('.teamchat-notice-card');
        if (!card) return;

        const action = card.dataset.action || '';
        if (action === 'open-metrics') {
            eventBus.emit('toast:show', { message: '已为你打开性能监控', type: 'info' });
            document.getElementById('metrics-toggle')?.click();
        }
    }

    ensureHistoryPanel() {
        if (this.historyPanel) return;
        const panel = document.createElement('div');
        panel.className = 'teamchat-notice-history-panel';
        panel.innerHTML = `
            <div class="teamchat-notice-history-backdrop"></div>
            <div class="teamchat-notice-history-dialog">
                <div class="teamchat-notice-history-header">
                    <div>
                        <div class="teamchat-notice-history-title">通知记录</div>
                        <div class="teamchat-notice-history-subtitle">保留最近的 TeamChat 服务提醒与状态变化</div>
                    </div>
                    <button type="button" class="teamchat-notice-history-close" aria-label="关闭通知记录">✕</button>
                </div>
                <div class="teamchat-notice-history-list"></div>
            </div>
        `;
        document.body.appendChild(panel);
        panel.addEventListener('click', (event) => this.handleClick(event));
        this.historyPanel = panel;
        this.historyList = panel.querySelector('.teamchat-notice-history-list');
    }

    openHistory() {
        this.ensureHistoryPanel();
        this.renderHistory();
        this.historyPanel?.classList.add('active');
    }

    closeHistory() {
        this.historyPanel?.classList.remove('active');
    }

    formatAbsoluteTime(timestamp) {
        const value = Number(timestamp || 0);
        if (!value) return '未知时间';
        return new Date(value).toLocaleString('zh-CN', {
            hour12: false,
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    renderHistory() {
        if (!this.historyList) return;
        const items = this.history.length ? this.history : [{
            id: 'notifications-empty',
            level: 'ok',
            title: '还没有历史通知',
            body: '后续 Gateway 异常、通道状态变化和系统提醒会记录在这里。',
            timestamp: Date.now()
        }];

        this.historyList.innerHTML = items.map((notice) => `
            <article class="teamchat-notice-history-item ${notice.level || 'info'}">
                <div class="teamchat-notice-history-item-top">
                    <span class="teamchat-notice-badge">${notice.level === 'warn' ? '提醒' : notice.level === 'ok' ? '正常' : '通知'}</span>
                    <time class="teamchat-notice-history-time">${this.formatAbsoluteTime(notice.timestamp)}</time>
                </div>
                <div class="teamchat-notice-history-item-title">${notice.title || 'TeamChat 通知'}</div>
                <div class="teamchat-notice-history-item-body">${notice.body || ''}</div>
                ${notice.meta ? `<div class="teamchat-notice-history-item-meta">${notice.meta}</div>` : ''}
            </article>
        `).join('');
    }

    async refresh() {
        if (!this.container) return;

        try {
            const [metricsResult, channelResult, historyResult, healthResult] = await Promise.allSettled([
                fetch('/api/system-metrics', { headers: getAuthHeaders() }),
                fetch('/api/channels/status', { headers: getAuthHeaders() }),
                fetch('/api/notifications/history?limit=80', { headers: getAuthHeaders() }),
                fetch('/api/health/status', { headers: getAuthHeaders() })
            ]);

            const metricsRes = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
            const channelRes = channelResult.status === 'fulfilled' ? channelResult.value : null;
            const historyRes = historyResult.status === 'fulfilled' ? historyResult.value : null;
            const healthRes = healthResult.status === 'fulfilled' ? healthResult.value : null;

            const metrics = metricsRes?.ok ? await metricsRes.json() : null;
            const channelPayload = channelRes?.ok ? await channelRes.json() : null;
            const historyPayload = historyRes?.ok ? await historyRes.json() : null;
            const health = healthRes?.ok ? await healthRes.json() : null;
            this.history = Array.isArray(historyPayload?.notifications) ? historyPayload.notifications : [];
            const notices = this.buildNotices(metrics, channelPayload, health);
            this.lastNotices = notices;
            this.render(notices);
            this.renderHistory();
        } catch (error) {
            console.error('[Notifications] Failed to refresh notices:', error);
            this.render([{
                id: 'service-fetch-error',
                level: 'warn',
                title: 'TeamChat 通知暂时不可用',
                body: '监控提醒拉取失败，稍后会自动重试。',
                meta: '状态同步异常',
                action: 'open-metrics'
            }]);
        }
    }

    buildNotices(metrics, channelPayload, health) {
        const notices = [];

        const channelIssues = Array.isArray(channelPayload?.channels)
            ? channelPayload.channels.filter((channel) => channel.enabled && channel.status === 'needs_config')
            : [];
        if (channelIssues.length) {
            notices.push({
                id: 'channel-needs-config',
                level: 'info',
                title: '有通道等待配置',
                body: `${channelIssues.map((channel) => channel.name).join('、')} 已启用但还缺少 token、webhook 或 URL。`,
                meta: `通道检查 ${formatRelativeTime(Date.now())}`,
                action: 'open-metrics'
            });
        }

        if (metrics || health) {
            const runtimeGateway = health?.services?.gateway || null;
            const runtimeGatewayHealthy = typeof runtimeGateway?.healthy === 'boolean' ? runtimeGateway.healthy : null;
            const runtimeGatewayStatus = runtimeGatewayHealthy === true
                ? 'healthy'
                : (runtimeGateway?.status || runtimeGateway?.state || runtimeGateway?.health || null);
            const gatewayStatus = runtimeGatewayStatus || metrics?.gateway?.status || null;

            if (gatewayStatus && gatewayStatus !== 'healthy' && runtimeGatewayHealthy !== true) {
                notices.push({
                    id: 'gateway-warning',
                    level: 'warn',
                    title: 'Gateway 状态异常',
                    body: `当前网关状态为 ${gatewayStatus}，消息实时性可能受影响。`,
                    meta: `监控更新 ${formatRelativeTime(health?.status?.lastCheckTime || metrics?.timestamp || Date.now())}`,
                    action: 'open-metrics'
                });
            }

            if (Number(metrics?.disk?.percent || 0) >= 85) {
                notices.push({
                    id: 'disk-warning',
                    level: 'warn',
                    title: '磁盘空间偏紧',
                    body: `当前磁盘已使用 ${Math.round(metrics.disk.percent)}%，建议检查安全清理项。`,
                    meta: `系统监控 ${formatRelativeTime(metrics.timestamp)}`,
                    action: 'open-metrics'
                });
            }

            if (Number(metrics?.successRate || 100) < 95) {
                notices.push({
                    id: 'success-rate-warning',
                    level: 'warn',
                    title: '系统成功率下降',
                    body: `最近系统成功率约 ${Math.round(metrics.successRate)}%，值得留意异常波动。`,
                    meta: `系统监控 ${formatRelativeTime(metrics.timestamp)}`,
                    action: 'open-metrics'
                });
            }
        }

        if (!notices.length) {
            notices.push({
                id: 'system-healthy',
                level: 'ok',
                title: 'TeamChat 通知已开启',
                body: '当前没有需要优先处理的服务提醒，通道和系统状态整体正常。',
                meta: `最近刷新 ${formatRelativeTime(metrics?.timestamp || Date.now())}`,
                action: 'open-metrics'
            });
        }

        return notices.slice(0, 4);
    }

    render(notices = []) {
        if (!this.container) return;

        const snapshotKey = JSON.stringify(notices.map((notice) => ({
            id: notice.id,
            level: notice.level,
            title: notice.title,
            body: notice.body
        })));

        if (this.dismissedSnapshotKey !== snapshotKey) {
            this.dismissedIds.clear();
            this.dismissedSnapshotKey = snapshotKey;
            this.visible = true;
            this.autoHideDeadline = Date.now() + AUTO_HIDE_MS;
        }

        const filteredNotices = notices.filter((notice) => !this.dismissedIds.has(notice.id));
        const dismissedAll = filteredNotices.length === 0 && notices.length > 0;

        this.snapshotKey = snapshotKey;
        clearTimeout(this.autoHideTimer);
        if (filteredNotices.length && this.visible) {
            const remainingMs = Math.max(0, this.autoHideDeadline - Date.now());
            if (remainingMs === 0) {
                this.visible = false;
            } else {
            this.autoHideTimer = setTimeout(() => {
                this.visible = false;
                this.container?.classList.add('is-collapsed');
                this.render(this.lastNotices || []);
            }, remainingMs);
            }
        }

        const isCollapsed = !this.visible || dismissedAll;
        const cardsMarkup = filteredNotices.map((notice) => `
            <article
                class="teamchat-notice-card ${notice.level || 'info'}"
                data-action="${notice.action || ''}"
                data-notice-id="${notice.id || ''}"
            >
                <span class="teamchat-notice-badge">${notice.level === 'warn' ? '提醒' : notice.level === 'ok' ? '正常' : '通知'}</span>
                <div class="teamchat-notice-main">
                    <div class="teamchat-notice-title-row">
                        <div class="teamchat-notice-title">${notice.title}</div>
                        <button type="button" class="teamchat-notice-close-btn" aria-label="关闭这条通知">✕</button>
                    </div>
                    <div class="teamchat-notice-body">${notice.body}</div>
                    <div class="teamchat-notice-meta">${notice.meta || '刚刚更新'}</div>
                </div>
            </article>
        `).join('');

        this.container.innerHTML = `
            <div class="teamchat-notice-strip-header">
                <div class="teamchat-notice-strip-title">TeamChat 通知</div>
                <div class="teamchat-notice-strip-actions">
                    ${isCollapsed ? '<button type="button" class="teamchat-notice-expand-btn">展开</button>' : '<button type="button" class="teamchat-notice-hide-btn">隐藏</button>'}
                    <button type="button" class="teamchat-notice-history-btn">通知记录</button>
                </div>
            </div>
            <div class="teamchat-notice-cards ${isCollapsed ? 'is-collapsed' : ''}">
                ${cardsMarkup}
            </div>`;
        this.container.dataset.noticeCount = String(filteredNotices.length);
        this.container.classList.toggle('is-empty', filteredNotices.length === 0);
        this.container.classList.toggle('is-collapsed', isCollapsed);
    }
}

export const teamchatNotificationsModule = new TeamChatNotificationsModule();
export default teamchatNotificationsModule;
