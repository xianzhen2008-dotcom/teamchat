/**
 * Status Dashboard - Agent 工作日志看板
 * 瀑布流展示 agent 的工作过程：思考、行动、工具调用、报错等
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { avatarService } from '../../services/avatar.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_LOGS_PER_AGENT = 200;

export class StatusDashboard {
    constructor() {
        this.container = null;
        this.visible = false;
        this.agentLogs = new Map();
        this.agentLastActive = new Map();
        this.selectedAgentId = null;
        this.initialized = false;
        this.sseConnection = null;
    }

    init(options = {}) {
        this.container = options.container || document.getElementById('status-dashboard');
        
        if (!this.container) {
            this.createUI();
        }
        
        this.bindEvents();
        this.initialized = true;

        // 监听来自 Gateway 的事件
        eventBus.on('agent:thinking', this.onThinking.bind(this));
        eventBus.on('agent:tool_call', this.onToolCall.bind(this));
        eventBus.on('agent:tool_result', this.onToolResult.bind(this));
        eventBus.on('agent:planning', this.onPlanning.bind(this));
        eventBus.on('agent:reflecting', this.onReflecting.bind(this));
        eventBus.on('agent:action', this.onAction.bind(this));
        eventBus.on('agent:complete', this.onComplete.bind(this));
        eventBus.on('agent:error', this.onError.bind(this));
        
        // 连接 SSE 日志流
        this.connectSSE();

        return this;
    }
    
    createUI() {
        const container = document.createElement('div');
        container.className = 'status-dashboard';
        container.id = 'status-dashboard';
        container.innerHTML = `
            <div class="dashboard-header">
                <span>📋 Agent 工作日志</span>
                <span class="dashboard-close" id="status-close">✕</span>
            </div>
            <div class="dashboard-agents" id="dashboard-agents">
                <div class="agents-list"></div>
            </div>
            <div class="dashboard-content" id="dashboard-content">
                <div class="logs-container"></div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
    }
    
    bindEvents() {
        const closeBtn = this.container.querySelector('#status-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
        
        // Agent 标签页点击事件
        this.container.addEventListener('click', (e) => {
            const agentTab = e.target.closest('.agent-tab');
            if (agentTab) {
                e.stopPropagation();
                const agentId = agentTab.dataset.agentId;
                this.selectAgent(agentId);
            }
        });
    }
    
    connectSSE() {
        const apiHost = window.location.port === '5173' ? 'http://localhost:18788' : window.location.origin;
        const sseUrl = `${apiHost}/api/agent-logs/stream`;
        
        try {
            this.sseConnection = new EventSource(sseUrl);
            
            this.sseConnection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // 处理广播消息
                    if (data.type === 'broadcast' && data.data) {
                        this.handleBroadcast(data.data);
                        return;
                    }
                    
                    // 处理活动状态更新
                    if (data.type === 'activity_status' && data.activity) {
                        this.updateAgentActivity(data.activity);
                        return;
                    }
                    
                    // 处理日志
                    if (data.agentId) {
                        this.addLog(data.agentId, data);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };
            
            this.sseConnection.onerror = () => {
                console.log('[Dashboard] SSE connection error, will retry');
                // EventSource 会自动重连
            };
            
            console.log('[Dashboard] SSE connected');
        } catch (e) {
            console.error('[Dashboard] SSE connection failed:', e);
        }
    }
    
    handleBroadcast(broadcastMsg) {
        // 触发消息事件
        eventBus.emit('message:received', {
            sender: broadcastMsg.sender || '系统',
            text: broadcastMsg.text,
            isUser: false,
            timestamp: Date.now()
        });
    }
    
    updateAgentActivity(activity) {
        if (!activity || !activity.agentId) return;
        
        const { agentId, timestamp } = activity;
        this.agentLastActive.set(agentId, timestamp);
        
        if (this.visible) {
            this.renderAgentsList();
        }
    }

    onThinking({ agentId, content, thought }) {
        const thinkingContent = content || thought;
        if (!thinkingContent) return;
        
        this.addLog(agentId, {
            type: 'thinking',
            icon: '🧠',
            title: '思考中',
            content: thinkingContent,
            time: Date.now()
        });
        
        stateManager.addAgentLog(agentId, {
            text: '🧠 思考: ' + thinkingContent.substring(0, 80),
            type: 'thinking'
        });
    }

    onToolCall({ agentId, tool, toolName, params, toolArgs }) {
        const name = tool || toolName;
        const args = params || toolArgs;
        
        this.addLog(agentId, {
            type: 'tool_call',
            icon: '🔧',
            title: '调用工具',
            content: `${name}(${JSON.stringify(args, null, 2)})`,
            time: Date.now()
        });
        
        stateManager.addAgentLog(agentId, {
            text: '🔧 调用: ' + name,
            type: 'tool'
        });
    }

    onToolResult({ agentId, tool, toolName, result, content }) {
        const name = tool || toolName;
        const resultContent = result || content;
        
        this.addLog(agentId, {
            type: 'tool_result',
            icon: '✓',
            title: '工具返回',
            content: typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2),
            time: Date.now()
        });
        
        stateManager.addAgentLog(agentId, {
            text: '✓ 工具返回: ' + (typeof resultContent === 'string' ? resultContent.substring(0, 50) : '完成'),
            type: 'success'
        });
    }

    onPlanning({ agentId, plan }) {
        this.addLog(agentId, {
            type: 'planning',
            icon: '📋',
            title: '制定计划',
            content: plan,
            time: Date.now()
        });
    }

    onReflecting({ agentId, reflection }) {
        this.addLog(agentId, {
            type: 'reflecting',
            icon: '💭',
            title: '自我反思',
            content: reflection,
            time: Date.now()
        });
    }

    onAction({ agentId, action }) {
        this.addLog(agentId, {
            type: 'action',
            icon: '⚡',
            title: '执行动作',
            content: action,
            time: Date.now()
        });
    }

    onComplete({ agentId, result }) {
        this.addLog(agentId, {
            type: 'complete',
            icon: '✅',
            title: '任务完成',
            content: result,
            time: Date.now()
        });
    }

    onError({ agentId, error }) {
        this.addLog(agentId, {
            type: 'error',
            icon: '❌',
            title: '发生错误',
            content: error,
            time: Date.now()
        });
    }

    addLog(agentId, log) {
        if (!this.agentLogs.has(agentId)) {
            this.agentLogs.set(agentId, []);
        }
        
        const logs = this.agentLogs.get(agentId);
        
        // 清理超过 3 天的日志
        const threeDaysAgo = Date.now() - THREE_DAYS_MS;
        const validLogs = logs.filter(l => l.time >= threeDaysAgo);
        
        // 添加新日志到开头
        validLogs.unshift(log);
        
        // 限制每个 agent 最多 200 条日志
        if (validLogs.length > MAX_LOGS_PER_AGENT) {
            validLogs.splice(MAX_LOGS_PER_AGENT);
        }
        
        this.agentLogs.set(agentId, validLogs);
        this.agentLastActive.set(agentId, log.time);
        
        if (this.visible) {
            this.render();
        }
    }

    selectAgent(agentId) {
        this.selectedAgentId = agentId;
        this.render();
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
        this.render();
    }

    hide() {
        if (this.container) {
            this.container.classList.remove('active');
        }
        this.visible = false;
    }

    render() {
        this.renderAgentsList();
        this.renderLogs();
    }

    renderAgentsList() {
        const agentsList = this.container?.querySelector('.agents-list');
        if (!agentsList) return;

        const agents = stateManager.getState('agents') || [];
        const agentBusyMap = stateManager.getState('agentBusyMap') || new Map();
        
        // 按最后活跃时间排序
        const sortedAgents = [...agents].sort((a, b) => {
            const aTime = this.agentLastActive.get(a.agentId) || 0;
            const bTime = this.agentLastActive.get(b.agentId) || 0;
            return bTime - aTime;
        });
        
        if (sortedAgents.length > 0 && !this.selectedAgentId) {
            this.selectedAgentId = sortedAgents[0].agentId;
        }

        agentsList.innerHTML = sortedAgents.map(agent => {
            const isBusy = agentBusyMap.get(agent.agentId);
            const isSelected = this.selectedAgentId === agent.agentId;
            const avatarUrl = avatarService.getUrl(agent.img);
            const logCount = (this.agentLogs.get(agent.agentId) || []).length;
            
            return `
                <div class="agent-tab ${isSelected ? 'selected' : ''} ${isBusy ? 'busy' : ''}" 
                     data-agent-id="${agent.agentId}">
                    <div class="agent-tab-avatar" style="background-image: url('${avatarUrl}')"></div>
                    <div class="agent-tab-info">
                        <span class="agent-tab-name">${agent.name}</span>
                        <span class="agent-tab-count">${logCount}条</span>
                    </div>
                    ${isBusy ? '<span class="agent-busy-dot"></span>' : ''}
                </div>
            `;
        }).join('');
    }

    renderLogs() {
        const content = this.container?.querySelector('.logs-container');
        if (!content) return;

        if (!this.selectedAgentId) {
            content.innerHTML = '<div class="empty-state">选择一个 Agent 查看工作日志</div>';
            return;
        }

        const agents = stateManager.getState('agents') || [];
        const agent = agents.find(a => a.agentId === this.selectedAgentId);
        const logs = this.agentLogs.get(this.selectedAgentId) || [];
        const agentBusyMap = stateManager.getState('agentBusyMap') || new Map();
        const isBusy = agentBusyMap.get(this.selectedAgentId);

        if (logs.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${isBusy ? '🔥' : '💤'}</div>
                    <div class="empty-text">${isBusy ? '正在工作中...' : '暂无工作日志'}</div>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="logs-header">
                <span class="logs-agent-name">${agent?.name || 'Unknown'}</span>
                <span class="logs-count">${logs.length} 条记录</span>
            </div>
            <div class="logs-list">
                ${logs.map(log => this.renderLogItem(log)).join('')}
            </div>
        `;
    }

    renderLogItem(log) {
        return `
            <div class="work-log-item ${log.type}">
                <div class="log-item-header">
                    <span class="log-icon">${log.icon}</span>
                    <span class="log-title">${log.title}</span>
                    <span class="log-time">${this.formatTime(new Date(log.time))}</span>
                </div>
                ${log.content ? `
                    <div class="log-content">
                        <pre>${this.escapeHtml(log.content)}</pre>
                    </div>
                ` : ''}
            </div>
        `;
    }

    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        this.hide();
        this.agentLogs.clear();
        this.agentLastActive.clear();
        if (this.sseConnection) {
            this.sseConnection.close();
            this.sseConnection = null;
        }
        this.sseConnected = false;
    }
}

// 导出实例供 main.js 使用
export const statusDashboard = new StatusDashboard();
export default statusDashboard;
