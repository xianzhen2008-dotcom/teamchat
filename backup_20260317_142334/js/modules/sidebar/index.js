/**
 * Sidebar Module - 侧边栏模块
 * Agent 列表渲染、选择处理、移动端侧边栏切换
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, $$, on, addClass, removeClass, toggleClass } from '../../utils/dom.js';
import { avatarService } from '../../services/avatar.js';
import { formatTimeWithDate } from '../../utils/format.js';

class SidebarModule {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.agentListEl = null;
        this.sessionListEl = null;
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
        eventBus.on('state:changed:sessions', this.renderSessionList.bind(this));

        return this;
    }

    bindEvents() {
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                const agentItem = e.target.closest('.agent-item');
                if (agentItem) {
                    this.handleAgentClick(e);
                }
                const sessionItem = e.target.closest('.session-item');
                if (sessionItem) {
                    this.handleSessionClick(e);
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
        const avatar = e.target.closest('.agent-avatar');
        if (avatar) {
            const agentItem = avatar.closest('.agent-item');
            if (agentItem) {
                const agentId = agentItem.dataset.agentId;
                const agents = stateManager.getState('agents') || [];
                const agent = agents.find(a => a.agentId === agentId);
                if (agent) {
                    eventBus.emit('mention:request', { name: agent.name });
                }
            }
            return;
        }
        
        const agentItem = e.target.closest('.agent-item');
        if (!agentItem) return;
        
        const agentId = agentItem.dataset.agentId;
        if (agentId) {
            this.selectAgent(agentId);
        }
    }

    handleSessionClick(e) {
        const sessionItem = e.target.closest('.session-item');
        if (!sessionItem) return;
        
        const sessionId = sessionItem.dataset.sessionId;
        if (sessionId) {
            eventBus.emit('session:selected', { sessionId });
            this.highlightMessagesBySession(sessionId);
        }
    }

    highlightMessagesBySession(sessionId) {
        const messages = $$('.msg');
        messages.forEach(msg => {
            msg.classList.remove('session-highlight');
            if (msg.dataset.sessionId === sessionId) {
                msg.classList.add('session-highlight');
                msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
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
            
            let statusText = '待命';
            let statusClass = 'online';
            let borderColor = agent.color || '#00f5d4';
            
            if (isBusy) {
                statusText = '任务中';
                statusClass = 'busy';
                borderColor = agent.color || '#ff006e';
            } else if (activity) {
                if (activity.status === 'busy') {
                    statusText = '任务中';
                    statusClass = 'busy';
                    borderColor = agent.color || '#ff006e';
                } else if (activity.status === 'offline') {
                    statusText = '离线';
                    statusClass = 'offline';
                    borderColor = '#606070';
                }
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

        this.renderSessionList();
    }

    renderSessionList() {
        const sessions = stateManager.getSessions();
        
        if (!this.sessionListEl) {
            this.sessionListEl = $('.session-list', this.container);
            if (!this.sessionListEl) {
                const sessionSection = document.createElement('div');
                sessionSection.className = 'session-section';
                sessionSection.innerHTML = `
                    <div class="session-header">
                        <span>📋 活跃会话</span>
                    </div>
                    <div class="session-list"></div>
                `;
                this.container.appendChild(sessionSection);
                this.sessionListEl = sessionSection.querySelector('.session-list');
            }
        }

        if (!this.sessionListEl) return;

        if (sessions.length === 0) {
            this.sessionListEl.innerHTML = `
                <div class="session-empty">
                    <span>暂无活跃会话</span>
                </div>
            `;
            return;
        }

        this.sessionListEl.innerHTML = sessions.slice(0, 10).map(session => {
            const agent = stateManager.getAgentById(session.agentId);
            const avatarUrl = agent ? avatarService.getUrl(agent.img) : '';
            const timeAgo = this.formatTimeAgo(session.lastMessageTime);
            
            return `
                <div class="session-item" data-session-id="${session.id}">
                    <div class="session-avatar" style="background-image: url('${avatarUrl}');"></div>
                    <div class="session-info">
                        <div class="session-agent">${session.agentName || '未知'}</div>
                        <div class="session-meta">
                            <span class="session-id">#${session.shortId}</span>
                            <span class="session-time">${timeAgo}</span>
                        </div>
                    </div>
                    <div class="session-count">${session.messageCount}</div>
                </div>
            `;
        }).join('');
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return formatTimeWithDate(new Date(timestamp));
    }

    destroy() {
        this.initialized = false;
    }
}

export const sidebarModule = new SidebarModule();
export default sidebarModule;
