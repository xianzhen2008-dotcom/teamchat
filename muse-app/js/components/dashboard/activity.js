const ACTIVITY_ICONS = {
    memory: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>`,
    task: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l3 3L22 4"></path>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>`,
    event: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>`,
    user: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>`,
    system: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>`,
    create: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`,
    update: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>`,
    delete: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>`,
    view: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
    </svg>`,
    search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>`
};

const ACTIVITY_COLORS = {
    memory: '#0A84FF',
    task: '#00C853',
    event: '#FFAB00',
    user: '#9C27B0',
    system: '#00BCD4',
    create: '#00C853',
    update: '#0A84FF',
    delete: '#FF3D00',
    view: '#00BCD4',
    search: '#FFAB00'
};

const ACTIVITY_LABELS = {
    memory: '记忆',
    task: '任务',
    event: '事件',
    user: '用户',
    system: '系统',
    create: '创建',
    update: '更新',
    delete: '删除',
    view: '查看',
    search: '搜索'
};

class ActivityItem {
    constructor(options = {}) {
        this.id = options.id || `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.type = options.type || 'system';
        this.action = options.action || 'view';
        this.title = options.title || '';
        this.description = options.description || '';
        this.timestamp = options.timestamp || new Date();
        this.metadata = options.metadata || {};
        this.onClick = options.onClick || null;
        this.element = null;
    }

    render() {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.id = this.id;

        const icon = ACTIVITY_ICONS[this.type] || ACTIVITY_ICONS.system;
        const color = ACTIVITY_COLORS[this.type] || ACTIVITY_COLORS.system;
        const actionLabel = ACTIVITY_LABELS[this.action] || '';

        item.innerHTML = `
            <div class="activity-item__time">
                ${this.formatTime(this.timestamp)}
            </div>
            <div class="activity-item__marker" style="background-color: ${color};">
                ${icon}
            </div>
            <div class="activity-item__content">
                <div class="activity-item__header">
                    <span class="activity-item__type" style="color: ${color};">
                        ${ACTIVITY_LABELS[this.type] || this.type}
                    </span>
                    ${actionLabel ? `<span class="activity-item__action">${actionLabel}</span>` : ''}
                </div>
                <div class="activity-item__title">${this.title}</div>
                ${this.description ? `<div class="activity-item__description">${this.description}</div>` : ''}
                ${this.renderMetadata()}
            </div>
        `;

        if (this.onClick) {
            item.classList.add('activity-item--clickable');
            item.addEventListener('click', () => this.onClick(this));
        }

        this.element = item;
        return item;
    }

    renderMetadata() {
        if (!this.metadata || Object.keys(this.metadata).length === 0) {
            return '';
        }

        const items = Object.entries(this.metadata)
            .slice(0, 3)
            .map(([key, value]) => `<span class="activity-item__meta-item">${key}: ${value}</span>`)
            .join('');

        return `<div class="activity-item__meta">${items}</div>`;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) {
            return '刚刚';
        }

        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)} 分钟前`;
        }

        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)} 小时前`;
        }

        if (diff < 604800000) {
            return `${Math.floor(diff / 86400000)} 天前`;
        }

        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

class ActivityTimeline {
    constructor(options = {}) {
        this.id = options.id || `activity-timeline-${Date.now()}`;
        this.activities = [];
        this.maxItems = options.maxItems || 50;
        this.loading = options.loading || false;
        this.showLoadMore = options.showLoadMore !== false;
        this.onLoadMore = options.onLoadMore || null;
        this.onItemClick = options.onItemClick || null;
        this.element = null;
        this.container = null;
        this.observer = null;
    }

    addActivity(activity) {
        const item = activity instanceof ActivityItem ? activity : new ActivityItem(activity);
        this.activities.unshift(item);

        if (this.activities.length > this.maxItems) {
            const removed = this.activities.pop();
            removed.destroy();
        }

        return item;
    }

    addActivities(activities) {
        activities.forEach(activity => this.addActivity(activity));
    }

    removeActivity(activityId) {
        const index = this.activities.findIndex(a => a.id === activityId);
        if (index !== -1) {
            this.activities[index].destroy();
            this.activities.splice(index, 1);
        }
    }

    clear() {
        this.activities.forEach(activity => activity.destroy());
        this.activities = [];
    }

    render() {
        const container = document.createElement('div');
        container.className = 'activity-timeline';
        container.id = this.id;

        const header = document.createElement('div');
        header.className = 'activity-timeline__header';
        header.innerHTML = `
            <h3 class="activity-timeline__title">最近活动</h3>
            <span class="activity-timeline__count">${this.activities.length} 条记录</span>
        `;
        container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'activity-timeline__list';

        if (this.loading) {
            list.innerHTML = this.renderSkeleton();
        } else if (this.activities.length === 0) {
            list.innerHTML = this.renderEmpty();
        } else {
            this.activities.forEach(activity => {
                if (this.onItemClick && !activity.onClick) {
                    activity.onClick = this.onItemClick;
                }
                list.appendChild(activity.render());
            });
        }

        container.appendChild(list);

        if (this.showLoadMore && this.activities.length >= this.maxItems) {
            const loadMore = document.createElement('button');
            loadMore.className = 'activity-timeline__load-more btn btn-ghost';
            loadMore.textContent = '加载更多';
            loadMore.addEventListener('click', () => {
                if (this.onLoadMore) {
                    this.onLoadMore();
                }
            });
            container.appendChild(loadMore);
        }

        this.element = container;
        return container;
    }

    renderSkeleton() {
        let skeleton = '';
        for (let i = 0; i < 5; i++) {
            skeleton += `
                <div class="activity-item activity-item--skeleton">
                    <div class="activity-item__time skeleton skeleton-text" style="width: 60px;"></div>
                    <div class="activity-item__marker skeleton skeleton-avatar"></div>
                    <div class="activity-item__content">
                        <div class="skeleton skeleton-text" style="width: 40%;"></div>
                        <div class="skeleton skeleton-text" style="width: 80%;"></div>
                        <div class="skeleton skeleton-text" style="width: 60%;"></div>
                    </div>
                </div>
            `;
        }
        return skeleton;
    }

    renderEmpty() {
        return `
            <div class="activity-timeline__empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>暂无活动记录</p>
            </div>
        `;
    }

    mount(container) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (this.container) {
            this.container.appendChild(this.render());
        }
        return this;
    }

    setLoading(loading) {
        this.loading = loading;
        if (this.element) {
            const list = this.element.querySelector('.activity-timeline__list');
            if (list) {
                list.innerHTML = loading ? this.renderSkeleton() : '';
                if (!loading) {
                    this.activities.forEach(activity => {
                        list.appendChild(activity.render());
                    });
                    if (this.activities.length === 0) {
                        list.innerHTML = this.renderEmpty();
                    }
                }
            }
        }
    }

    refresh() {
        if (this.element) {
            const parent = this.element.parentNode;
            this.destroy();
            if (parent) {
                parent.appendChild(this.render());
            }
        }
    }

    destroy() {
        this.activities.forEach(activity => activity.destroy());
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

class ActivityPanel {
    constructor(options = {}) {
        this.id = options.id || `activity-panel-${Date.now()}`;
        this.title = options.title || '活动时间线';
        this.timeline = null;
        this.element = null;
        this.filters = options.filters || ['memory', 'task', 'event', 'system'];
        this.activeFilter = 'all';
    }

    setTimeline(timeline) {
        this.timeline = timeline;
        if (this.element) {
            const body = this.element.querySelector('.activity-panel__body');
            if (body) {
                body.innerHTML = '';
                body.appendChild(timeline.render());
            }
        }
    }

    render() {
        const panel = document.createElement('div');
        panel.className = 'activity-panel card-glass';
        panel.id = this.id;

        panel.innerHTML = `
            <div class="activity-panel__header">
                <h3 class="activity-panel__title">${this.title}</h3>
                <div class="activity-panel__filters">
                    <button class="activity-filter activity-filter--active" data-filter="all">全部</button>
                    ${this.filters.map(f => `
                        <button class="activity-filter" data-filter="${f}" style="--filter-color: ${ACTIVITY_COLORS[f]}">
                            ${ACTIVITY_LABELS[f] || f}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="activity-panel__body">
                ${this.timeline ? '' : '<div class="activity-panel__placeholder">加载中...</div>'}
            </div>
        `;

        if (this.timeline) {
            const body = panel.querySelector('.activity-panel__body');
            body.appendChild(this.timeline.render());
        }

        this.setupFilters(panel);
        this.element = panel;
        return panel;
    }

    setupFilters(panel) {
        const filterButtons = panel.querySelectorAll('.activity-filter');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('activity-filter--active'));
                button.classList.add('activity-filter--active');

                const filter = button.dataset.filter;
                this.activeFilter = filter;
                this.applyFilter(filter);
            });
        });
    }

    applyFilter(filter) {
        if (!this.timeline) return;

        const items = this.timeline.element?.querySelectorAll('.activity-item');
        if (!items) return;

        items.forEach(item => {
            if (filter === 'all') {
                item.style.display = '';
            } else {
                const type = item.querySelector('.activity-item__type')?.textContent?.toLowerCase();
                item.style.display = type === filter.toLowerCase() ? '' : 'none';
            }
        });
    }

    destroy() {
        if (this.timeline) {
            this.timeline.destroy();
        }
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

function createActivityTimeline(activities = [], options = {}) {
    const timeline = new ActivityTimeline(options);

    activities.forEach(activity => {
        timeline.addActivity(activity);
    });

    return timeline;
}

function createActivityPanel(activities = [], options = {}) {
    const panel = new ActivityPanel(options);
    const timeline = createActivityTimeline(activities, {
        maxItems: options.maxItems || 20,
        onLoadMore: options.onLoadMore
    });

    panel.setTimeline(timeline);

    return { panel, timeline };
}

function generateMockActivities(count = 10) {
    const types = ['memory', 'task', 'event', 'system'];
    const actions = ['create', 'update', 'view', 'delete'];
    const titles = {
        memory: ['添加了新记忆', '更新了记忆内容', '搜索了记忆', '删除了记忆'],
        task: ['创建了新任务', '完成任务', '更新任务状态', '删除任务'],
        event: ['创建了新事件', '更新事件时间', '查看事件详情', '取消事件'],
        system: ['系统启动', '数据同步', '缓存清理', '配置更新']
    };

    const activities = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const titleList = titles[type];
        const title = titleList[Math.floor(Math.random() * titleList.length)];

        activities.push({
            type,
            action,
            title,
            description: `这是一条${ACTIVITY_LABELS[type]}相关的${ACTIVITY_LABELS[action]}操作记录`,
            timestamp: new Date(now - Math.random() * 86400000 * 7),
            metadata: {
                id: Math.random().toString(36).substr(2, 8),
                user: '用户' + Math.floor(Math.random() * 100)
            }
        });
    }

    return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function injectStyles() {
    if (document.getElementById('activity-styles')) return;

    const style = document.createElement('style');
    style.id = 'activity-styles';
    style.textContent = `
        .activity-timeline {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .activity-timeline__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing-md) var(--spacing-lg);
            border-bottom: 1px solid var(--border-primary);
        }

        .activity-timeline__title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            margin: 0;
        }

        .activity-timeline__count {
            font-size: var(--font-size-sm);
            color: var(--text-tertiary);
        }

        .activity-timeline__list {
            flex: 1;
            overflow-y: auto;
            padding: var(--spacing-md);
        }

        .activity-timeline__load-more {
            width: 100%;
            margin-top: var(--spacing-md);
            padding: var(--spacing-md);
        }

        .activity-timeline__empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--spacing-3xl);
            color: var(--text-tertiary);
            text-align: center;
        }

        .activity-timeline__empty svg {
            margin-bottom: var(--spacing-md);
            opacity: 0.5;
        }

        .activity-timeline__empty p {
            margin: 0;
            font-size: var(--font-size-md);
        }

        .activity-item {
            display: flex;
            gap: var(--spacing-md);
            padding: var(--spacing-md);
            margin-bottom: var(--spacing-sm);
            border-radius: var(--radius-md);
            transition: all var(--transition-fast) var(--easing-default);
            position: relative;
        }

        .activity-item::before {
            content: '';
            position: absolute;
            left: 52px;
            top: 0;
            bottom: -16px;
            width: 2px;
            background: var(--border-primary);
        }

        .activity-item:last-child::before {
            display: none;
        }

        .activity-item:hover {
            background: var(--bg-tertiary);
        }

        .activity-item--clickable {
            cursor: pointer;
        }

        .activity-item--skeleton {
            pointer-events: none;
        }

        .activity-item__time {
            width: 60px;
            flex-shrink: 0;
            font-size: var(--font-size-xs);
            color: var(--text-tertiary);
            text-align: right;
            padding-top: 4px;
        }

        .activity-item__marker {
            width: 32px;
            height: 32px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-full);
            color: white;
            position: relative;
            z-index: 1;
            box-shadow: 0 0 0 4px var(--bg-secondary);
        }

        .activity-item__content {
            flex: 1;
            min-width: 0;
        }

        .activity-item__header {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            margin-bottom: 2px;
        }

        .activity-item__type {
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
        }

        .activity-item__action {
            font-size: var(--font-size-xs);
            color: var(--text-tertiary);
            padding: 2px 6px;
            background: var(--bg-tertiary);
            border-radius: var(--radius-sm);
        }

        .activity-item__title {
            font-size: var(--font-size-sm);
            color: var(--text-primary);
            font-weight: var(--font-weight-medium);
            margin-bottom: 2px;
        }

        .activity-item__description {
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            line-height: var(--line-height-normal);
            margin-bottom: var(--spacing-xs);
        }

        .activity-item__meta {
            display: flex;
            flex-wrap: wrap;
            gap: var(--spacing-sm);
        }

        .activity-item__meta-item {
            font-size: var(--font-size-xs);
            color: var(--text-tertiary);
            padding: 2px 6px;
            background: var(--bg-tertiary);
            border-radius: var(--radius-sm);
        }

        .activity-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            border-radius: var(--radius-lg);
            background: var(--bg-glass);
            backdrop-filter: blur(var(--blur-lg));
            -webkit-backdrop-filter: blur(var(--blur-lg));
            border: 1px solid var(--border-primary);
            box-shadow: var(--shadow-glass);
            overflow: hidden;
        }

        .activity-panel__header {
            padding: var(--spacing-md) var(--spacing-lg);
            border-bottom: 1px solid var(--border-primary);
        }

        .activity-panel__title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            margin: 0 0 var(--spacing-sm) 0;
        }

        .activity-panel__filters {
            display: flex;
            flex-wrap: wrap;
            gap: var(--spacing-xs);
        }

        .activity-filter {
            padding: var(--spacing-xs) var(--spacing-sm);
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            background: transparent;
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-full);
            cursor: pointer;
            transition: all var(--transition-fast) var(--easing-default);
        }

        .activity-filter:hover {
            color: var(--text-primary);
            border-color: var(--border-accent);
        }

        .activity-filter--active {
            color: white;
            background: var(--accent-primary);
            border-color: var(--accent-primary);
        }

        .activity-filter--active[data-filter]:not([data-filter="all"]) {
            background: var(--filter-color, var(--accent-primary));
            border-color: var(--filter-color, var(--accent-primary));
        }

        .activity-panel__body {
            flex: 1;
            overflow: hidden;
        }

        .activity-panel__placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: var(--text-tertiary);
        }

        @media (max-width: 640px) {
            .activity-item__time {
                display: none;
            }

            .activity-item::before {
                left: 16px;
            }

            .activity-panel__filters {
                overflow-x: auto;
                flex-wrap: nowrap;
                padding-bottom: var(--spacing-xs);
            }
        }
    `;

    document.head.appendChild(style);
}

injectStyles();

export {
    ActivityItem,
    ActivityTimeline,
    ActivityPanel,
    ACTIVITY_ICONS,
    ACTIVITY_COLORS,
    ACTIVITY_LABELS,
    createActivityTimeline,
    createActivityPanel,
    generateMockActivities
};
