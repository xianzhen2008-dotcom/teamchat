/**
 * Sidebar Module - 侧边栏模块
 * Agent 列表渲染、选择处理、移动端侧边栏切换
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, $$, on, addClass, removeClass, toggleClass } from '../../utils/dom.js';
import { avatarService } from '../../services/avatar.js';

class SidebarModule {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.agentListEl = null;
        this.initialized = false;
    }

    init(options = {}) {
        this.container = options.container || $('.sidebar');
        this.overlay = options.overlay || $('.sidebar-overlay');
        this.agentListEl = options.agentListEl || $('.agent-list');
        
        if (!this.container) {
            console.warn('[Sidebar] Container not found');
            return this;
        }

        this.bindEvents();
        this.render();
        this.initialized = true;

        eventBus.on('agent:selected', this.onAgentSelected.bind(this));
        eventBus.on('state:changed:agents', this.render.bind(this));
        eventBus.on('state:changed:isConnected', this.render.bind(this));
        eventBus.on('state:changed:agentActivity', this.render.bind(this));

        return this;
    }

    bindEvents() {
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                const agentItem = e.target.closest('.agent-item');
                if (agentItem) {
                    this.handleAgentClick(e);
                }
            });
        }
        
        if (this.overlay) {
            on(this.overlay, 'click', this.toggle.bind(this));
        }

        const menuToggle = $('#menu-toggle');
        if (menuToggle) {
            on(menuToggle, 'click', this.toggle.bind(this));
        }
    }

    handleAgentClick(e) {
        // 点击头像或整个item都选择agent并触发mention
        const avatar = e.target.closest('.agent-avatar');
        const agentItem = avatar ? avatar.closest('.agent-item') : e.target.closest('.agent-item');
        if (!agentItem) return;

        const agentId = agentItem.dataset.agentId;
        if (!agentId) return;

        const agents = stateManager.getState('agents') || [];
        const agent = agents.find(a => a.agentId === agentId);
        if (agent) {
            eventBus.emit('mention:request', { name: agent.name });
        }
        this.selectAgent(agentId);
    }

    selectAgent(agentId) {
        const agents = stateManager.getState('agents') || [];
        const agent = agents.find(a => a.agentId === agentId);
        
        if (agent) {
            stateManager.setState('currentAgent', agent);
            eventBus.emit('agent:selected', agent);
            
            if (this.isMobile()) {
                this.close();
            }
        }
    }

    onAgentSelected(agent) {
        this.render();
    }

    toggle() {
        if (!this.container) return;
        
        toggleClass(this.container, 'active');
        if (this.overlay) {
            toggleClass(this.overlay, 'active');
        }
    }

    open() {
        if (!this.container) return;
        addClass(this.container, 'active');
        if (this.overlay) addClass(this.overlay, 'active');
    }

    close() {
        if (!this.container) return;
        removeClass(this.container, 'active');
        if (this.overlay) removeClass(this.overlay, 'active');
    }

    isMobile() {
        return window.innerWidth <= 768;
    }

    render() {
        const agents = stateManager.getState('agents') || [];
        const currentAgent = stateManager.getState('currentAgent');
        const agentBusyMap = stateManager.getState('agentBusyMap') || new Map();
        const agentActivity = stateManager.getState('agentActivity') || new Map();
        const isConnected = stateManager.getState('isConnected') || false;

        if (!this.agentListEl) {
            this.agentListEl = $('.agent-list', this.container);
        }
        
        if (!this.agentListEl) return;

        this.agentListEl.innerHTML = agents.map(agent => {
            const isBusy = agentBusyMap.get(agent.agentId);
            const activity = agentActivity.get(agent.agentId);
            const isActive = currentAgent && currentAgent.agentId === agent.agentId;
            const avatarUrl = avatarService.getUrl(agent.img);
            
            // 确定状态文本和颜色
            // 默认显示待命（假设已连接），除非明确知道离线
            let statusText = '待命';
            let statusClass = 'online';
            let borderColor = agent.color || '#00f5d4';
            
            // 优先级：对话活动 > 日志活动 > 待命
            if (isBusy) {
                statusText = '任务中';
                statusClass = 'busy';
                borderColor = agent.color || '#ff006e';
            } else if (activity) {
                // 根据活动状态判断
                if (activity.status === 'busy') {
                    statusText = '任务中';
                    statusClass = 'busy';
                    borderColor = agent.color || '#ff006e';
                } else if (activity.status === 'offline') {
                    statusText = '离线';
                    statusClass = 'offline';
                    borderColor = '#606070';
                }
                // online 和 stale 都显示待命（使用默认值）
            }

            const isWorking = isBusy || (activity && activity.status === 'busy');

            return `
                <div class="agent-item ${isActive ? 'active' : ''} ${isBusy ? 'busy' : ''} ${isWorking ? 'working' : ''}" 
                     data-agent-id="${agent.agentId}">
                    <div class="agent-avatar-wrap" style="color: ${borderColor};">
                        <div class="agent-avatar" style="background-image: url('${avatarUrl}'); border-color: ${borderColor};"></div>
                        <div class="agent-presence ${statusClass}"></div>
                    </div>
                    <div class="agent-info">
                        <div class="agent-name">${agent.name}</div>
                        <div class="agent-status ${statusClass}">${statusText}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    destroy() {
        this.initialized = false;
    }
}

export const sidebarModule = new SidebarModule();
export default sidebarModule;
