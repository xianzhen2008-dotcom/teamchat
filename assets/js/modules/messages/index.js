/**
 * Messages Module - 消息列表管理
 * 消息列表管理、滚动处理、虚拟滚动
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, on, scrollTo } from '../../utils/dom.js';
import { renderMessages, renderMessage } from './renderer.js';
import { renderMarkdown } from './markdown.js';

const MAX_MESSAGES = 200;

class MessagesModule {
    constructor() {
        this.container = null;
        this.initialized = false;
        this.isNearBottom = true;
        this.scrollLocked = false;
        this.replyToMessage = null;
    }

    init(options = {}) {
        this.container = options.container || $('.messages-view');
        
        if (!this.container) {
            console.warn('[Messages] Container not found');
            return this;
        }

        this.bindEvents();
        this.render();
        this.initialized = true;

        eventBus.on('message:received', this.onMessageReceived.bind(this));
        eventBus.on('message:sent', this.onMessageSent.bind(this));
        eventBus.on('state:changed:messages', this.render.bind(this));
        eventBus.on('filter:changed', this.onFilterChanged.bind(this));
        eventBus.on('reply:request', this.handleReplyRequest.bind(this));
        eventBus.on('reply:clear', this.clearReply.bind(this));
        eventBus.on('session:selected', ({ sessionId }) => this.highlightMessagesBySession(sessionId));
        
        window.addEventListener('session:reply', (e) => {
            const { sessionId } = e.detail;
            if (sessionId) {
                this.replyToSession(sessionId);
            }
        });

        return this;
    }
    
    toggleScrollLock() {
        this.scrollLocked = !this.scrollLocked;
        const btn = document.getElementById('scroll-lock-toggle');
        if (btn) {
            btn.textContent = this.scrollLocked ? '🔒' : '🔓';
            btn.title = this.scrollLocked ? '解锁滚动' : '锁定滚动';
        }
        eventBus.emit('toast:show', { 
            message: this.scrollLocked ? '已锁定滚动，新消息不会自动滚动' : '已解锁滚动', 
            type: 'info' 
        });
        return this.scrollLocked;
    }

    bindEvents() {
        if (this.container) {
            this.container.addEventListener('scroll', this.handleScroll.bind(this));
            this.container.addEventListener('click', this.handleClick.bind(this));
        }
    }

    handleClick(e) {
        // 处理会话标签点击
        const sessionTag = e.target.closest('.session-tag');
        if (sessionTag) {
            const sessionId = sessionTag.dataset.sessionId;
            if (sessionId) {
                this.highlightMessagesBySession(sessionId);
                eventBus.emit('session:selected', { sessionId });
            }
            return;
        }

        // 处理头像点击 - 自动@
        const avatar = e.target.closest('.msg-avatar[data-sender]');
        if (avatar) {
            const sender = avatar.dataset.sender;
            if (sender) {
                eventBus.emit('mention:request', { name: sender });
            }
            return;
        }

        // 处理消息操作按钮
        const actionBtn = e.target.closest('.msg-action-btn');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            const msgEl = actionBtn.closest('.msg');
            if (!msgEl) return;

            const text = msgEl.querySelector('.msg-content')?.dataset?.text;
            const sender = msgEl.querySelector('.msg-meta')?.textContent || '用户';
            const msgId = msgEl.dataset.msgId;
            const timestamp = parseInt(msgEl.dataset.timestamp);

            if (action === 'copy' && text) {
                navigator.clipboard.writeText(text).then(() => {
                    eventBus.emit('toast:show', { message: '已复制到剪贴板', type: 'success' });
                }).catch(() => {
                    eventBus.emit('toast:show', { message: '复制失败', type: 'error' });
                });
            } else if (action === 'reply') {
                eventBus.emit('reply:request', { text, sender });
            } else if (action === 'recall' && msgId) {
                this.recallMessage(msgId, timestamp);
            }
        }
    }

    highlightMessagesBySession(sessionId) {
        if (!this.container) return;
        
        const messages = this.container.querySelectorAll('.msg');
        messages.forEach(msg => {
            msg.classList.remove('session-highlight');
            if (msg.dataset.sessionId === sessionId) {
                msg.classList.add('session-highlight');
                msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
        
        const session = stateManager.getSession(sessionId);
        if (session) {
            eventBus.emit('toast:show', { 
                message: `已定位到会话 #${sessionId.slice(0, 8)}`, 
                type: 'info' 
            });
        }
    }

    handleScroll() {
        if (!this.container) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.container;
        this.isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    }

    onMessageReceived(msg) {
        this.addMessage(msg);
    }

    onMessageSent(msg) {
        this.addMessage(msg);
    }

    onFilterChanged(filter) {
        this.activeFilter = filter;
        this.render();
    }

    handleReplyRequest({ text, sender }) {
        this.replyToMessage = { text, sender };
        stateManager.setReplyTo({ text, sender });
        
        const input = document.getElementById('chat-input');
        if (input) {
            input.focus();
            const replyPreview = document.querySelector('.reply-preview');
            if (!replyPreview) {
                const preview = document.createElement('div');
                preview.className = 'reply-preview';
                preview.innerHTML = `
                    <div class="reply-preview-content">
                        <span class="reply-preview-label">回复 ${sender}:</span>
                        <span class="reply-preview-text">${text.substring(0, 50)}${text.length > 50 ? '...' : ''}</span>
                    </div>
                    <button class="reply-preview-close" title="取消引用">✕</button>
                `;
                preview.querySelector('.reply-preview-close').addEventListener('click', () => {
                    this.clearReply();
                });
                input.parentElement.parentElement.insertBefore(preview, input.parentElement);
            } else {
                replyPreview.querySelector('.reply-preview-label').textContent = `回复 ${sender}:`;
                replyPreview.querySelector('.reply-preview-text').textContent = text.substring(0, 50) + (text.length > 50 ? '...' : '');
            }
        }
    }

    clearReply() {
        this.replyToMessage = null;
        stateManager.clearReplyTo();
        
        const replyPreview = document.querySelector('.reply-preview');
        if (replyPreview) {
            replyPreview.remove();
        }
    }

    replyToSession(sessionId) {
        const messages = stateManager.getState('messages') || [];
        const sessionMessages = messages.filter(m => m.sessionId === sessionId || m.runId === sessionId);
        
        if (sessionMessages.length === 0) {
            eventBus.emit('toast:show', { message: '找不到该会话的消息', type: 'warning' });
            return;
        }
        
        const lastMessage = sessionMessages[sessionMessages.length - 1];
        const shortId = sessionId.slice(0, 8);
        
        this.replyToMessage = { 
            text: lastMessage.text, 
            sender: lastMessage.sender,
            sessionId: sessionId
        };
        stateManager.setReplyTo(this.replyToMessage);
        
        const input = document.getElementById('chat-input');
        if (input) {
            input.focus();
            
            const replyPreview = document.querySelector('.reply-preview');
            if (!replyPreview) {
                const preview = document.createElement('div');
                preview.className = 'reply-preview';
                preview.innerHTML = `
                    <div class="reply-preview-content">
                        <span class="reply-preview-label">回复会话 #sess-${shortId}:</span>
                        <span class="reply-preview-text">${lastMessage.text.substring(0, 50)}${lastMessage.text.length > 50 ? '...' : ''}</span>
                    </div>
                    <button class="reply-preview-close" title="取消引用">✕</button>
                `;
                preview.querySelector('.reply-preview-close').addEventListener('click', () => {
                    this.clearReply();
                });
                input.parentElement.parentElement.insertBefore(preview, input.parentElement);
            } else {
                replyPreview.querySelector('.reply-preview-label').textContent = `回复会话 #sess-${shortId}:`;
                replyPreview.querySelector('.reply-preview-text').textContent = lastMessage.text.substring(0, 50) + (lastMessage.text.length > 50 ? '...' : '');
            }
            
            eventBus.emit('toast:show', { message: `已选择会话 #sess-${shortId}，输入消息后将回复此会话`, type: 'info' });
        }
        
        this.highlightMessagesBySession(sessionId);
    }

    getReplyTo() {
        return this.replyToMessage;
    }

    addMessage(msg) {
        let messages = stateManager.getState('messages') || [];
        
        // 如果有runId，检查是否是更新现有消息
        if (msg.runId) {
            const existingIndex = messages.findIndex(m => m.runId === msg.runId);
            if (existingIndex >= 0) {
                // 更新现有消息（保留timestamp）
                const existing = messages[existingIndex];
                messages[existingIndex] = { 
                    ...existing, 
                    ...msg,
                    timestamp: existing.timestamp || msg.timestamp 
                };
                console.log('[Messages] Updated message with runId:', msg.runId);
            } else {
                // 添加新消息
                messages.push(msg);
                console.log('[Messages] Added new message with runId:', msg.runId);
            }
        } else {
            // 普通消息，检查是否重复
            const msgKey = `${msg.timestamp}-${msg.sender}-${(msg.text || '').slice(0, 100)}`;
            const existingIndex = messages.findIndex(m => {
                const mKey = `${m.timestamp}-${m.sender}-${(m.text || '').slice(0, 100)}`;
                return mKey === msgKey;
            });
            
            if (existingIndex >= 0) {
                console.log('[Messages] Skipping duplicate message:', msgKey);
                return;
            }
            
            messages.push(msg);
            console.log('[Messages] Added new message:', msgKey);
        }
        
        if (messages.length > MAX_MESSAGES) {
            messages = messages.slice(-MAX_MESSAGES);
        }
        
        stateManager.setState('messages', messages);
        this.saveHistory(messages);
        this.render();
        this.scrollToBottom();
    }

    updateMessage(runId, text) {
        const messages = stateManager.getState('messages') || [];
        const idx = messages.findIndex(m => m.runId === runId);
        
        if (idx >= 0) {
            messages[idx].text = text;
            stateManager.setState('messages', messages);
            this.render();
        }
    }

    updateStreamingMessage(runId, text, sender, senderAgentId, model, thinking = null, tools = []) {
        if (!this.container) return;

        const msgEl = this.container.querySelector(`[data-run-id="${runId}"]`);
        
        if (msgEl) {
            const contentEl = msgEl.querySelector('.msg-content');
            if (contentEl) {
                contentEl.innerHTML = renderMarkdown(text);
                contentEl.dataset.text = text;
                contentEl.classList.add('streaming');
            }
            
            if (model) {
                const metaEl = msgEl.querySelector('.msg-meta');
                if (metaEl && !metaEl.querySelector('.msg-model-tag')) {
                    const modelTag = document.createElement('span');
                    modelTag.className = 'msg-model-tag';
                    modelTag.title = '使用的大模型';
                    modelTag.textContent = model;
                    metaEl.appendChild(modelTag);
                }
            }
            
            const messages = stateManager.getState('messages') || [];
            const idx = messages.findIndex(m => m.runId === runId);
            if (idx >= 0) {
                messages[idx].text = text;
                if (model) messages[idx].model = model;
                if (thinking) messages[idx].thinking = thinking;
                if (tools.length > 0) messages[idx].tools = tools;
                stateManager.setState('messages', messages);
            } else {
                messages.push({
                    sender: sender || 'Agent',
                    text,
                    isUser: false,
                    runId,
                    sessionId: runId,
                    timestamp: Date.now(),
                    model,
                    thinking,
                    tools
                });
                stateManager.setState('messages', messages);
            }
            
            if (this.isNearBottom && !this.scrollLocked) {
                this.scrollToBottom(false);
            }
            return;
        }
        
        const messages = stateManager.getState('messages') || [];
        const newMsg = {
            sender: sender || 'Agent',
            text,
            isUser: false,
            runId,
            sessionId: runId,
            timestamp: Date.now(),
            model,
            thinking,
            tools
        };
        
        if (senderAgentId) {
            newMsg.agentId = senderAgentId;
        }
        
        messages.push(newMsg);
        stateManager.setState('messages', messages);
        this.saveHistory(messages);
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderMessage(newMsg);
        const newMsgEl = tempDiv.firstElementChild;
        
        if (newMsgEl) {
            const contentEl = newMsgEl.querySelector('.msg-content');
            if (contentEl) {
                contentEl.classList.add('streaming');
            }
            this.container.appendChild(newMsgEl);
        }
        
        if (this.isNearBottom && !this.scrollLocked) {
            this.scrollToBottom(false);
        }
    }

    finalizeStreamingMessage(runId, text, model, thinking = null, tools = []) {
        if (!this.container) return;

        const msgEl = this.container.querySelector(`[data-run-id="${runId}"]`);
        
        if (msgEl) {
            const contentEl = msgEl.querySelector('.msg-content');
            if (contentEl) {
                contentEl.innerHTML = renderMarkdown(text);
                contentEl.dataset.text = text;
                contentEl.classList.remove('streaming');
            }
            
            if (model) {
                const metaEl = msgEl.querySelector('.msg-meta');
                if (metaEl && !metaEl.querySelector('.msg-model-tag')) {
                    const modelTag = document.createElement('span');
                    modelTag.className = 'msg-model-tag';
                    modelTag.title = '使用的大模型';
                    modelTag.textContent = model;
                    metaEl.appendChild(modelTag);
                }
            }
        }
        
        const messages = stateManager.getState('messages') || [];
        const idx = messages.findIndex(m => m.runId === runId);
        if (idx >= 0) {
            messages[idx].text = text;
            if (model) messages[idx].model = model;
            if (thinking) messages[idx].thinking = thinking;
            if (tools.length > 0) messages[idx].tools = tools;
            stateManager.setState('messages', messages);
            this.saveHistory(messages);
        }
    }

    loadHistory() {
        try {
            const raw = localStorage.getItem('team_chat_history');
            if (raw) {
                const messages = JSON.parse(raw).slice(-MAX_MESSAGES);
                stateManager.setState('messages', messages);
            }
        } catch {
            stateManager.setState('messages', []);
        }
    }

    saveHistory(messages) {
        try {
            localStorage.setItem('team_chat_history', JSON.stringify(messages.slice(-MAX_MESSAGES)));
        } catch {}
    }

    clearHistory() {
        stateManager.setState('messages', []);
        localStorage.removeItem('team_chat_history');
        this.render();
    }

    render() {
        // 使用 requestAnimationFrame 优化渲染性能
        if (this._renderPending) {
            return;
        }
        this._renderPending = true;
        
        requestAnimationFrame(() => {
            this._renderPending = false;
            this._doRender();
        });
    }
    
    _doRender() {
        let messages = stateManager.getState('messages') || [];
        const agents = stateManager.getState('agents') || [];
        
        // 应用筛选
        if (this.activeFilter) {
            const filter = this.activeFilter;
            
            // 获取agentId对应的agent名称
            const getAgentNames = (id) => {
                const agent = agents.find(a => a.agentId === id);
                return agent ? [agent.name, agent.agentId] : [id];
            };
            
            // 获取所有筛选的agent名称
            const allNames = Array.isArray(filter) 
                ? filter.flatMap(id => getAgentNames(id))
                : getAgentNames(filter);
            
            // 构建agentId到名称的映射
            const filterAgentIds = Array.isArray(filter) ? filter : [filter];
            
            messages = messages.filter(m => {
                // 用户消息：检查是否@了筛选的agent
                if (m.isUser) {
                    const text = m.text || '';
                    // 检查消息中是否@了筛选的agent
                    for (const agentId of filterAgentIds) {
                        const agent = agents.find(a => a.agentId === agentId);
                        if (agent) {
                            // 检查@agent名称 或 @agentId
                            const atName = `@${agent.name}`;
                            const atId = `@${agent.agentId}`;
                            if (text.includes(atName) || text.includes(atId)) {
                                return true;
                            }
                        }
                    }
                    return false;
                }
                
                // Agent消息：检查sender是否匹配筛选的agent
                const sender = m.sender?.toLowerCase() || '';
                return allNames.some(name => sender.includes(name.toLowerCase()));
            });
        }
        
        renderMessages(messages, this.container);
        // 渲染后滚动到底部
        if (this.isNearBottom && !this.scrollLocked) {
            this.scrollToBottom(false);
        }
    }

    scrollToBottom(smooth = true) {
        if (!this.container) return;
        
        // 如果滚动被锁定，不自动滚动
        if (this.scrollLocked) {
            console.log('[Messages] Scroll locked, skip auto-scroll');
            return;
        }
        
        if (smooth) {
            this.container.scrollTo({
                top: this.container.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }
    
    async recallMessage(msgId, timestamp) {
        // 检查是否是 2 分钟内的消息
        const now = Date.now();
        const twoMinutes = 2 * 60 * 1000;
        
        if (now - timestamp > twoMinutes) {
            eventBus.emit('toast:show', { 
                message: '只能撤回 2 分钟内的消息', 
                type: 'warning' 
            });
            return;
        }
        
        // 确认撤回
        if (!confirm('确定要撤回这条消息吗？')) return;
        
        try {
            // 更新本地消息状态
            let messages = stateManager.getState('messages') || [];
            const msgIndex = messages.findIndex(m => {
                const mId = m.id || m.timestamp;
                return mId == msgId;
            });
            
            if (msgIndex >= 0) {
                messages[msgIndex] = {
                    ...messages[msgIndex],
                    text: '撤回了一条消息',
                    recalled: true,
                    status: 'recalled'
                };
                stateManager.setState('messages', messages);
                this.render();
                
                eventBus.emit('toast:show', { 
                    message: '消息已撤回', 
                    type: 'success' 
                });
                
                // TODO: 发送到服务器
                // await fetch('/api/recall-message', {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify({ msgId, timestamp })
                // });
            }
        } catch (e) {
            console.error('[Messages] Failed to recall message:', e);
            eventBus.emit('toast:show', { 
                message: '撤回失败：' + e.message, 
                type: 'error' 
            });
        }
    }

    destroy() {
        this.initialized = false;
    }
}

export const messagesModule = new MessagesModule();
export default messagesModule;
