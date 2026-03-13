const ICONS = {
    memory: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>`,
    task: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l3 3L22 4"></path>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>`,
    event: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>`,
    system: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>`,
    trendUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
        <polyline points="17 6 23 6 23 12"></polyline>
    </svg>`,
    trendDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
        <polyline points="17 18 23 18 23 12"></polyline>
    </svg>`,
    storage: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
    </svg>`,
    checkCircle: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>`,
    clock: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>`,
    wifi: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
        <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
    </svg>`
};

class StatCard {
    constructor(options = {}) {
        this.id = options.id || `stat-card-${Date.now()}`;
        this.title = options.title || '统计';
        this.value = options.value || 0;
        this.subtitle = options.subtitle || '';
        this.icon = options.icon || 'memory';
        this.trend = options.trend || null;
        this.trendValue = options.trendValue || 0;
        this.color = options.color || 'primary';
        this.onClick = options.onClick || null;
        this.loading = options.loading || false;
        this.animated = options.animated !== false;
        this.element = null;
    }

    render() {
        const card = document.createElement('div');
        card.className = `stat-card stat-card--${this.color}`;
        card.id = this.id;

        if (this.loading) {
            card.innerHTML = this.renderSkeleton();
            this.element = card;
            return card;
        }

        card.innerHTML = `
            <div class="stat-card__icon">
                ${ICONS[this.icon] || ICONS.memory}
            </div>
            <div class="stat-card__content">
                <div class="stat-card__value" data-value="${this.value}">
                    ${this.formatValue(this.value)}
                </div>
                <div class="stat-card__title">${this.title}</div>
                ${this.subtitle ? `<div class="stat-card__subtitle">${this.subtitle}</div>` : ''}
            </div>
            ${this.trend ? this.renderTrend() : ''}
        `;

        if (this.onClick) {
            card.classList.add('stat-card--clickable');
            card.addEventListener('click', this.onClick);
        }

        this.element = card;

        if (this.animated) {
            requestAnimationFrame(() => {
                this.animateValue();
            });
        }

        return card;
    }

    renderSkeleton() {
        return `
            <div class="stat-card__icon skeleton skeleton-avatar"></div>
            <div class="stat-card__content">
                <div class="stat-card__value skeleton skeleton-text" style="width: 60%;"></div>
                <div class="stat-card__title skeleton skeleton-text" style="width: 80%;"></div>
            </div>
        `;
    }

    renderTrend() {
        const isUp = this.trend === 'up';
        const trendClass = isUp ? 'stat-card__trend--up' : 'stat-card__trend--down';
        const trendIcon = isUp ? ICONS.trendUp : ICONS.trendDown;

        return `
            <div class="stat-card__trend ${trendClass}">
                ${trendIcon}
                <span>${Math.abs(this.trendValue)}%</span>
            </div>
        `;
    }

    formatValue(value) {
        if (typeof value === 'number') {
            if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M';
            }
            if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K';
            }
            return value.toLocaleString();
        }
        return value;
    }

    animateValue() {
        const valueElement = this.element.querySelector('.stat-card__value');
        if (!valueElement) return;

        const targetValue = parseInt(valueElement.dataset.value) || 0;
        const duration = 1000;
        const startTime = performance.now();
        const startValue = 0;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.floor(startValue + (targetValue - startValue) * easeProgress);

            valueElement.textContent = this.formatValue(currentValue);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    update(newValue, options = {}) {
        this.value = newValue;
        if (options.trend !== undefined) this.trend = options.trend;
        if (options.trendValue !== undefined) this.trendValue = options.trendValue;
        if (options.subtitle !== undefined) this.subtitle = options.subtitle;

        if (this.element) {
            const valueElement = this.element.querySelector('.stat-card__value');
            if (valueElement) {
                valueElement.dataset.value = newValue;
                if (this.animated) {
                    this.animateValue();
                } else {
                    valueElement.textContent = this.formatValue(newValue);
                }
            }

            const trendElement = this.element.querySelector('.stat-card__trend');
            if (trendElement && this.trend) {
                trendElement.outerHTML = this.renderTrend();
            }
        }
    }

    setLoading(loading) {
        this.loading = loading;
        if (this.element) {
            this.element.innerHTML = loading ? this.renderSkeleton() : this.render().innerHTML;
        }
    }

    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

class StatsGrid {
    constructor(options = {}) {
        this.id = options.id || `stats-grid-${Date.now()}`;
        this.cards = [];
        this.columns = options.columns || 4;
        this.gap = options.gap || 'var(--spacing-lg)';
        this.element = null;
        this.container = options.container || null;
    }

    addCard(cardOptions) {
        const card = cardOptions instanceof StatCard ? cardOptions : new StatCard(cardOptions);
        this.cards.push(card);
        return card;
    }

    removeCard(cardId) {
        const index = this.cards.findIndex(card => card.id === cardId);
        if (index !== -1) {
            this.cards[index].destroy();
            this.cards.splice(index, 1);
        }
    }

    render() {
        const grid = document.createElement('div');
        grid.className = 'stats-grid';
        grid.id = this.id;
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${this.columns}, 1fr);
            gap: ${this.gap};
        `;

        this.cards.forEach(card => {
            grid.appendChild(card.render());
        });

        this.element = grid;
        return grid;
    }

    mount(container) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (this.container) {
            this.container.appendChild(this.render());
        }
        return this;
    }

    updateCard(cardId, newValue, options = {}) {
        const card = this.cards.find(c => c.id === cardId);
        if (card) {
            card.update(newValue, options);
        }
    }

    setLoading(cardId, loading) {
        const card = this.cards.find(c => c.id === cardId);
        if (card) {
            card.setLoading(loading);
        }
    }

    destroy() {
        this.cards.forEach(card => card.destroy());
        this.cards = [];
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

function createMemoryStats(api, state) {
    const grid = new StatsGrid({ columns: 4 });

    grid.addCard({
        id: 'memory-total',
        title: '记忆总数',
        value: state.get('memories')?.length || 0,
        icon: 'memory',
        color: 'primary',
        trend: 'up',
        trendValue: 12,
        onClick: () => window.location.hash = '#/memories'
    });

    grid.addCard({
        id: 'memory-today',
        title: '今日新增',
        value: 0,
        subtitle: '条记忆',
        icon: 'memory',
        color: 'secondary',
        trend: 'up',
        trendValue: 8
    });

    grid.addCard({
        id: 'memory-storage',
        title: '存储使用',
        value: '2.4',
        subtitle: 'GB / 10 GB',
        icon: 'storage',
        color: 'info'
    });

    grid.addCard({
        id: 'system-status',
        title: '系统状态',
        value: '正常',
        subtitle: 'API 已连接',
        icon: 'wifi',
        color: 'success'
    });

    return grid;
}

function createTaskStats(api, state) {
    const tasks = state.get('tasks') || [];
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'pending').length;

    const grid = new StatsGrid({ columns: 3 });

    grid.addCard({
        id: 'task-in-progress',
        title: '进行中',
        value: inProgress,
        icon: 'clock',
        color: 'primary'
    });

    grid.addCard({
        id: 'task-completed',
        title: '已完成',
        value: completed,
        icon: 'checkCircle',
        color: 'success',
        trend: completed > 0 ? 'up' : null,
        trendValue: 15
    });

    grid.addCard({
        id: 'task-pending',
        title: '待处理',
        value: pending,
        icon: 'task',
        color: 'warning'
    });

    return grid;
}

function createEventStats(api, state) {
    const events = state.get('events') || [];
    const today = new Date().toDateString();
    const todayEvents = events.filter(e => new Date(e.date).toDateString() === today);
    const activeEvents = events.filter(e => e.status === 'active');

    const grid = new StatsGrid({ columns: 2 });

    grid.addCard({
        id: 'event-today',
        title: '今日事件',
        value: todayEvents.length,
        icon: 'event',
        color: 'primary'
    });

    grid.addCard({
        id: 'event-active',
        title: '进行中事件',
        value: activeEvents.length,
        icon: 'event',
        color: 'secondary'
    });

    return grid;
}

function injectStyles() {
    if (document.getElementById('stats-card-styles')) return;

    const style = document.createElement('style');
    style.id = 'stats-card-styles';
    style.textContent = `
        .stats-grid {
            width: 100%;
        }

        @media (max-width: 1200px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr) !important;
            }
        }

        @media (max-width: 640px) {
            .stats-grid {
                grid-template-columns: 1fr !important;
            }
        }

        .stat-card {
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
            height: 120px;
            padding: var(--spacing-lg);
            background: var(--bg-glass);
            backdrop-filter: blur(var(--blur-lg));
            -webkit-backdrop-filter: blur(var(--blur-lg));
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-glass);
            transition: all var(--transition-normal) var(--easing-default);
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--accent-primary);
            opacity: 0;
            transition: opacity var(--transition-fast) var(--easing-default);
        }

        .stat-card:hover {
            border-color: var(--border-accent);
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg), var(--shadow-glow-sm);
        }

        .stat-card:hover::before {
            opacity: 1;
        }

        .stat-card--clickable {
            cursor: pointer;
        }

        .stat-card--primary::before { background: var(--accent-primary); }
        .stat-card--secondary::before { background: var(--accent-secondary); }
        .stat-card--success::before { background: var(--accent-success); }
        .stat-card--warning::before { background: var(--accent-warning); }
        .stat-card--danger::before { background: var(--accent-danger); }
        .stat-card--info::before { background: var(--accent-info); }

        .stat-card__icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 56px;
            height: 56px;
            border-radius: var(--radius-lg);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            flex-shrink: 0;
            transition: all var(--transition-normal) var(--easing-default);
        }

        .stat-card:hover .stat-card__icon {
            background: var(--bg-elevated);
            color: var(--accent-primary);
            transform: scale(1.05);
        }

        .stat-card--primary .stat-card__icon { color: var(--accent-primary); }
        .stat-card--secondary .stat-card__icon { color: var(--accent-secondary); }
        .stat-card--success .stat-card__icon { color: var(--accent-success); }
        .stat-card--warning .stat-card__icon { color: var(--accent-warning); }
        .stat-card--danger .stat-card__icon { color: var(--accent-danger); }
        .stat-card--info .stat-card__icon { color: var(--accent-info); }

        .stat-card__content {
            flex: 1;
            min-width: 0;
        }

        .stat-card__value {
            font-size: var(--font-size-3xl);
            font-weight: var(--font-weight-bold);
            color: var(--text-primary);
            line-height: var(--line-height-tight);
            font-family: var(--font-family-display);
        }

        .stat-card__title {
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            margin-top: var(--spacing-xs);
        }

        .stat-card__subtitle {
            font-size: var(--font-size-xs);
            color: var(--text-tertiary);
            margin-top: 2px;
        }

        .stat-card__trend {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: var(--spacing-xs) var(--spacing-sm);
            border-radius: var(--radius-full);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
        }

        .stat-card__trend--up {
            color: var(--accent-success);
            background: rgba(0, 200, 83, 0.1);
        }

        .stat-card__trend--down {
            color: var(--accent-danger);
            background: rgba(255, 61, 0, 0.1);
        }

        .stat-card .skeleton-avatar {
            width: 56px;
            height: 56px;
            border-radius: var(--radius-lg);
        }
    `;

    document.head.appendChild(style);
}

injectStyles();

export { StatCard, StatsGrid, createMemoryStats, createTaskStats, createEventStats, ICONS };
