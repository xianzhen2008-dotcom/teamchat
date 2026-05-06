/**
 * Filter Module - 消息筛选
 * 筛选面板切换、Agent 多选筛选、快速筛选
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, on, addClass, removeClass, toggleClass } from '../../utils/dom.js';

class FilterModule {
    constructor() {
        this.panel = null;
        this.overlay = null;
        this.grid = null;
        this.optionsContainer = null;
        this.visible = false;
        this.selectedAgents = new Set(); // 支持多选
        this.showSystemMessages = false;
        this.hideHeartbeatPrompts = true;
        this.initialized = false;
    }

    init(options = {}) {
        this.panel = options.panel || $('#filter-panel');
        this.overlay = options.overlay || $('.filter-panel-overlay');
        this.grid = options.grid || $('#filter-agent-grid');
        this.optionsContainer = options.optionsContainer || $('#filter-options');
        this.showSystemMessages = Boolean(stateManager.getStateValue('showSystemMessages'));
        this.hideHeartbeatPrompts = stateManager.getStateValue('hideHeartbeatPrompts') !== false;
        
        if (!this.panel) {
            console.warn('[Filter] Panel not found');
            return this;
        }

        this.bindEvents();
        this.render();
        this.initialized = true;

        return this;
    }

    bindEvents() {
        // 注意：toggle 按钮事件在 main.js 中绑定，避免重复绑定
        
        if (this.overlay) {
            on(this.overlay, 'click', this.hide.bind(this));
        }

        const closeBtn = $('.filter-panel-close', this.panel);
        if (closeBtn) {
            on(closeBtn, 'click', this.hide.bind(this));
        }

        if (this.grid) {
            this.grid.addEventListener('click', (e) => {
                const item = e.target.closest('.filter-agent-item');
                if (item) {
                    this.handleAgentClick(e, item);
                }
            });
        }

        if (this.optionsContainer) {
            this.optionsContainer.addEventListener('click', (e) => {
                const toggleBtn = e.target.closest('.filter-toggle-btn');
                if (!toggleBtn) return;
                const toggleName = toggleBtn.dataset.toggle;
                if (toggleName === 'system-messages') {
                    this.showSystemMessages = !this.showSystemMessages;
                    stateManager.setShowSystemMessages(this.showSystemMessages);
                    this.applyFilter();
                    this.render();
                } else if (toggleName === 'heartbeat-prompts') {
                    this.hideHeartbeatPrompts = !this.hideHeartbeatPrompts;
                    stateManager.setHideHeartbeatPrompts(this.hideHeartbeatPrompts);
                    this.applyFilter();
                    this.render();
                }
            });
        }

        const quickBtns = document.querySelectorAll('.filter-quick-btn');
        quickBtns.forEach(btn => {
            on(btn, 'click', () => {
                const filter = btn.dataset.filter;
                this.setQuickFilter(filter);
            });
        });
    }

    handleAgentClick(e, item) {
        const agentId = item.dataset.agentId;
        if (!agentId) return;

        // 点击切换选中状态（支持多选）
        if (this.selectedAgents.has(agentId)) {
            // 已选中则取消
            this.selectedAgents.delete(agentId);
        } else {
            // 未选中则添加
            this.selectedAgents.add(agentId);
        }

        this.applyFilter();
        this.render();
    }

    applyFilter() {
        const filterArray = this.selectedAgents.size > 0 ? Array.from(this.selectedAgents) : null;
        if (filterArray && filterArray.length > 0) {
            stateManager.setFilterAgents(filterArray);
        } else {
            stateManager.clearFilter();
        }
        eventBus.emit('filter:changed', {
            agentNames: filterArray,
            showSystemMessages: this.showSystemMessages,
            hideHeartbeatPrompts: this.hideHeartbeatPrompts
        });
    }

    toggle() {
        console.log("FILTER_TOGGLE_CALLED_20260317");
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        if (this.panel) {
            addClass(this.panel, 'show');
        }
        if (this.overlay) {
            addClass(this.overlay, 'show');
        }
        this.visible = true;
        this.render();
    }

    hide() {
        if (this.panel) {
            removeClass(this.panel, 'show');
        }
        if (this.overlay) {
            removeClass(this.overlay, 'show');
        }
        this.visible = false;
    }

    setQuickFilter(filter) {
        if (filter === 'all') {
            this.selectedAgents.clear();
            this.applyFilter();
            this.render();
            this.hide();
        } else if (filter === 'dev') {
            this.selectedAgents.clear();
            const devAgents = ['dev', 'frontend', 'backend', 'devops', 'qa', 'mobile'];
            devAgents.forEach(id => this.selectedAgents.add(id));
            this.applyFilter();
            this.render();
            this.hide();
        }
    }

    clearFilter() {
        this.selectedAgents.clear();
        this.applyFilter();
        this.render();
    }

    render() {
        if (!this.grid) return;

        const agents = stateManager.getState('agents') || [];
        const currentAgent = stateManager.getState('currentAgent');
        const hasSelection = this.selectedAgents.size > 0;
        this.showSystemMessages = Boolean(stateManager.getStateValue('showSystemMessages'));
        this.hideHeartbeatPrompts = stateManager.getStateValue('hideHeartbeatPrompts') !== false;

        if (this.optionsContainer) {
            this.optionsContainer.innerHTML = `
                <button
                    class="filter-toggle-btn ${this.showSystemMessages ? 'active' : ''}"
                    type="button"
                    data-toggle="system-messages"
                    aria-pressed="${this.showSystemMessages ? 'true' : 'false'}"
                >
                    <span class="filter-toggle-label">系统消息</span>
                    <span class="filter-toggle-state">${this.showSystemMessages ? '显示' : '默认隐藏'}</span>
                </button>
                <button
                    class="filter-toggle-btn ${this.hideHeartbeatPrompts ? 'active' : ''}"
                    type="button"
                    data-toggle="heartbeat-prompts"
                    aria-pressed="${this.hideHeartbeatPrompts ? 'true' : 'false'}"
                >
                    <span class="filter-toggle-label">心跳提示（系统@Agent）</span>
                    <span class="filter-toggle-state">${this.hideHeartbeatPrompts ? '隐藏' : '显示'}</span>
                </button>
            `;
        }

        this.grid.innerHTML = agents.map(agent => {
            const isSelected = this.selectedAgents.has(agent.agentId);
            const isCurrent = currentAgent && currentAgent.agentId === agent.agentId;
            
            return `
                <div class="filter-agent-item ${isSelected ? 'active' : ''} ${isCurrent ? 'current' : ''}" 
                     data-agent-id="${agent.agentId}"
                     title="${isSelected ? '已选中' : '点击选中，Ctrl+点击多选'}">
                    <div class="filter-agent-avatar" style="background-image: url('assets/avatars/${agent.img}')"></div>
                    <div class="filter-agent-name">${agent.name}</div>
                    ${isSelected ? '<div class="filter-check">✓</div>' : ''}
                </div>
            `;
        }).join('');

        // 更新筛选计数显示
        const filterCount = this.panel?.querySelector('.filter-count');
        if (filterCount) {
            filterCount.textContent = hasSelection ? `已选 ${this.selectedAgents.size} 人` : '';
        }
    }

    destroy() {
        this.hide();
        this.initialized = false;
    }
}

export const filterModule = new FilterModule();
export default filterModule;
