export class StatusDashboard {
    constructor() {
        this.container = null;
        this.sseConnection = null;
        this.sseConnected = false;
        this.agentLogs = new Map();
        this.isVisible = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    init() {
        this.createContainer();
        this.bindEvents();
        this.connectSSE();
        console.log('[Dashboard] Status dashboard initialized');
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'status-dashboard';
        this.container.id = 'status-dashboard';
        this.container.innerHTML = `
            <div class="status-header">
                <h2>📋 Agent 工作日志</h2>
                <button class="status-close" id="status-close">✕</button>
            </div>
            <div class="status-content">
                <div class="agent-tabs" id="agent-tabs"></div>
                <div class="logs-container" id="logs-container">
                    <div class="logs-empty">
                        <p>选择一个 Agent 查看工作日志</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.container);
    }

    bindEvents() {
        const closeBtn = this.container.querySelector('#status-close');
        closeBtn.addEventListener('click', () => this.hide());
    }

    show() {
        this.container.classList.add('visible');
        this.isVisible = true;
        if (!this.sseConnected) {
            this.connectSSE();
        }
        this.refreshAgentList();
    }

    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
    }

    connectSSE() {
        try {
            console.log('[Dashboard] Connecting to SSE...');
            this.sseConnection = new EventSource('/api/agent-logs/stream');
            
            this.sseConnection.onopen = () => {
                console.log('[Dashboard] SSE connection opened successfully');
                this.sseConnected = true;
                this.reconnectAttempts = 0;
            };
            
            this.sseConnection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleSSEMessage(data);
                } catch (e) {
                    console.error('[Dashboard] Failed to parse SSE message:', e);
                }
            };
            
            this.sseConnection.onerror = (error) => {
                console.error('[Dashboard] SSE connection error:', error);
                this.sseConnected = false;
                this.sseConnection.close();
                
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                    console.log(`[Dashboard] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => this.connectSSE(), delay);
                }
            };
        } catch (e) {
            console.error('[Dashboard] Failed to create SSE connection:', e);
        }
    }

    handleSSEMessage(data) {
        if (data.type === 'log') {
            this.addLog(data.agentId, data.log);
        } else if (data.type === 'agent_activity') {
            this.updateAgentActivity(data.agentId, data.timestamp);
        }
    }

    addLog(agentId, log) {
        if (!this.agentLogs.has(agentId)) {
            this.agentLogs.set(agentId, []);
        }
        
        const logs = this.agentLogs.get(agentId);
        logs.push(log);
        
        if (logs.length > 100) {
            logs.shift();
        }
        
        if (this.isVisible) {
            this.updateLogsDisplay(agentId);
        }
    }

    updateAgentActivity(agentId, timestamp) {
    }

    async refreshAgentList() {
        try {
            const response = await fetch('/api/agents');
            const agents = await response.json();
            
            const tabsContainer = this.container.querySelector('#agent-tabs');
            tabsContainer.innerHTML = '';
            
            agents.forEach(agent => {
                const tab = document.createElement('button');
                tab.className = 'agent-tab';
                tab.dataset.agentId = agent.id;
                tab.innerHTML = `
                    <span class="agent-icon">${agent.icon || '🤖'}</span>
                    <span class="agent-name">${agent.name}</span>
                `;
                tab.addEventListener('click', () => this.selectAgent(agent.id));
                tabsContainer.appendChild(tab);
            });
        } catch (e) {
            console.error('[Dashboard] Failed to fetch agents:', e);
        }
    }

    selectAgent(agentId) {
        const tabs = this.container.querySelectorAll('.agent-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.agentId === agentId);
        });
        
        this.updateLogsDisplay(agentId);
    }

    updateLogsDisplay(agentId) {
        const logsContainer = this.container.querySelector('#logs-container');
        const logs = this.agentLogs.get(agentId) || [];
        
        if (logs.length === 0) {
            logsContainer.innerHTML = `
                <div class="logs-empty">
                    <p>该 Agent 暂无工作日志</p>
                </div>
            `;
            return;
        }
        
        logsContainer.innerHTML = logs.map(log => `
            <div class="log-entry log-${log.type || 'info'}">
                <div class="log-time">${new Date(log.time).toLocaleTimeString()}</div>
                <div class="log-icon">${log.icon || '📝'}</div>
                <div class="log-content">
                    <div class="log-title">${log.title || ''}</div>
                    ${log.content ? `<div class="log-text">${this.escapeHtml(log.content)}</div>` : ''}
                </div>
            </div>
        `).join('');
        
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
