import { MetricsDashboard } from './modules/dashboard/metrics.js';
import { StatusDashboard } from './modules/dashboard/status.js';

const LOCAL_STORAGE_KEY = 'teamchat_messages';
const AGENT_MODEL_CONFIG = {
    'main': 'gpt-4',
    'dev': 'claude-3-opus',
    'qa': 'gemini-pro'
};

let messages = [];
let ws = null;
let metricsDashboard = null;
let statusDashboard = null;
let scrollLocked = false;

function getAgentModel(agentId, sender) {
    return AGENT_MODEL_CONFIG[agentId] || AGENT_MODEL_CONFIG[sender] || 'gpt-4';
}

async function syncMessagesWithServer(force = false) {
    console.log('[Sync] Starting message sync...');
    
    const startTime = Date.now();
    let latency = 0;
    
    try {
        const localMessages = loadLocalMessages();
        const pingStart = Date.now();
        
        const response = await fetch('/history');
        latency = Date.now() - pingStart;
        const serverHistory = await response.json();
        
        const serverMessageIds = new Set(serverHistory.map(m => `${m.timestamp}-${m.sender}-${m.text.substring(0, 50)}`));
        const localMessageIds = new Set(localMessages.map(m => `${m.timestamp}-${m.sender}-${m.text.substring(0, 50)}`));
        
        const newMessages = serverHistory.filter(m => !localMessageIds.has(`${m.timestamp}-${m.sender}-${m.text.substring(0, 50)}`));
        
        console.log(`[Sync] Server: ${serverHistory.length}, Local: ${localMessages.length}, New: ${newMessages.length}`);
        
        if (metricsDashboard && metricsDashboard.syncStatus) {
            metricsDashboard.syncStatus.serverCount = serverHistory.length;
            metricsDashboard.syncStatus.localCount = localMessages.length;
            metricsDashboard.syncStatus.diff = newMessages.length;
            metricsDashboard.syncStatus.latency = latency;
            metricsDashboard.syncStatus.lastSyncTime = Date.now();
            metricsDashboard.syncStatus.error = null;
            metricsDashboard.updateSyncStatus();
        }
        
        if (newMessages.length > 0 || force) {
            const allMessages = [...localMessages];
            newMessages.forEach(msg => {
                if (!msg.modelInfo && !msg.isUser) {
                    const agentId = msg.agentId || msg.sender;
                    const modelId = getAgentModel(agentId, msg.sender);
                    msg.modelInfo = {
                        modelId: modelId,
                        calls: 1,
                        inputTokens: 0,
                        outputTokens: 0
                    };
                }
                allMessages.push(msg);
            });
            
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            saveLocalMessages(allMessages);
            messages = allMessages;
            renderMessages();
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`[Sync] Complete in ${totalTime}ms (latency: ${latency}ms)`);
        
    } catch (e) {
        console.error('[Sync] Error:', e);
        if (metricsDashboard && metricsDashboard.syncStatus) {
            metricsDashboard.syncStatus.error = e.message;
            metricsDashboard.updateSyncStatus();
        }
    }
}

function loadLocalMessages() {
    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('[LocalStorage] Load error:', e);
        return [];
    }
}

function saveLocalMessages(msgs) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(msgs));
    } catch (e) {
        console.error('[LocalStorage] Save error:', e);
    }
}

function renderMessages() {
    const container = document.getElementById('messages-view');
    if (!container) return;
    
    container.innerHTML = messages.map(msg => renderMessage(msg)).join('');
    
    if (!scrollLocked) {
        container.scrollTop = container.scrollHeight;
    }
}

function renderMessage(msg) {
    const isUser = msg.isUser || msg.sender === '用户';
    const time = new Date(msg.timestamp).toLocaleTimeString();
    
    let modelInfo = '';
    if (msg.modelInfo && !isUser) {
        modelInfo = `
            <div class="message-model-info">
                <span class="model-name">${msg.modelInfo.modelId}</span>
                ${msg.modelInfo.inputTokens ? `<span class="token-count">📥 ${msg.modelInfo.inputTokens}</span>` : ''}
                ${msg.modelInfo.outputTokens ? `<span class="token-count">📤 ${msg.modelInfo.outputTokens}</span>` : ''}
            </div>
        `;
    }
    
    return `
        <div class="message ${isUser ? 'user-message' : 'agent-message'}">
            <div class="message-avatar">${isUser ? '👤' : (msg.avatar || '🤖')}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${msg.sender || '未知'}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${escapeHtml(msg.text || '')}</div>
                ${modelInfo}
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('[WebSocket] Connected');
        updateConnectionStatus(true);
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleNewMessage(msg);
        } catch (e) {
            console.error('[WebSocket] Parse error:', e);
        }
    };
    
    ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        updateConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
    };
}

function handleNewMessage(msg) {
    if (!msg.timestamp) msg.timestamp = Date.now();
    
    if (!msg.modelInfo && !msg.isUser) {
        const agentId = msg.agentId || msg.sender;
        const modelId = getAgentModel(agentId, msg.sender);
        msg.modelInfo = {
            modelId: modelId,
            calls: 1,
            inputTokens: 0,
            outputTokens: 0
        };
    }
    
    messages.push(msg);
    saveLocalMessages(messages);
    renderMessages();
    
    if (metricsDashboard && metricsDashboard.metrics) {
        metricsDashboard.metrics.totalMessages++;
        metricsDashboard.updateDisplay();
    }
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.innerHTML = connected 
            ? '<span class="status-dot status-connected"></span> 在线' 
            : '<span class="status-dot status-disconnected"></span> 离线';
    }
}

function initUI() {
    metricsDashboard = new MetricsDashboard();
    metricsDashboard.init();
    
    statusDashboard = new StatusDashboard();
    statusDashboard.init();
    
    document.getElementById('status-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.add('sidebar-collapsed');
        statusDashboard.show();
    });
    
    document.getElementById('metrics-toggle')?.addEventListener('click', () => {
        metricsDashboard.show();
    });
    
    document.getElementById('scroll-lock-toggle')?.addEventListener('click', (e) => {
        scrollLocked = !scrollLocked;
        e.target.textContent = scrollLocked ? '🔒' : '🔓';
    });
    
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('sidebar-collapsed');
    });
    
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.add('sidebar-collapsed');
    });
    
    const moreToggle = document.getElementById('more-toggle');
    const headerDropdown = document.getElementById('header-dropdown');
    if (moreToggle && headerDropdown) {
        moreToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            headerDropdown.classList.toggle('visible');
        });
        
        document.addEventListener('click', () => {
            headerDropdown.classList.remove('visible');
        });
    }
    
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');
    if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input?.value.trim();
    if (!text) return;
    
    const msg = {
        isUser: true,
        sender: '用户',
        text: text,
        timestamp: Date.now()
    };
    
    handleNewMessage(msg);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    } else {
        try {
            await fetch('/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg)
            });
        } catch (e) {
            console.error('[Send] Error:', e);
        }
    }
    
    input.value = '';
    input.style.height = 'auto';
}

async function init() {
    console.log('[TeamChat] Initializing...');
    
    messages = loadLocalMessages();
    renderMessages();
    
    initUI();
    
    connectWebSocket();
    
    await syncMessagesWithServer();
    
    setInterval(() => {
        syncMessagesWithServer();
    }, 30000);
    
    console.log('[TeamChat] Ready');
}

window.syncMessagesWithServer = syncMessagesWithServer;
window.metricsDashboard = metricsDashboard;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
