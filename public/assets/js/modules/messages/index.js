/**
 * Messages Module - 消息列表管理
 * 消息列表管理、滚动处理、虚拟滚动
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, on, scrollTo } from '../../utils/dom.js';
import { renderMessages, renderMessage } from './renderer.js';
import { getCompactSessionId, getMessageDisplayText, getMessageSessionIds, getPrimarySessionId, isHeartbeatPromptMessage, isMessageHidden, messageHasSessionId } from '../../utils/message-meta.js';
import { normalizeMessageAgentFields } from '../../utils/agent-meta.js';

const MAX_MESSAGES = 1000;

class MessagesModule {
    constructor() {
        this.container = null;
        this.initialized = false;
        this.isNearBottom = true;
        this.scrollLocked = false;
        this.replyToMessage = null;
        this.replyToSessionId = null; // 当前要回复的会话ID
        this.lastInteractionKey = '';
        this.lastInteractionAt = 0;
        this.collapsibleState = new Map();
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
        
        // 创建返回底部按钮
        this.createScrollToBottomButton();

        eventBus.on('message:received', this.onMessageReceived.bind(this));
        // 注意：message:sent 不需要监听，因为 app.js 会在发送后触发 message:received
        eventBus.on('state:changed:messages', (newMessages, oldMessages) => {
            console.log('%c[Messages] state:changed:messages event - count: ' + (newMessages?.length || 0), 'background: #2196f3; color: white; font-size: 12px; padding: 2px 6px;');
            this.render();
        });
        eventBus.on('filter:changed', this.onFilterChanged.bind(this));
        eventBus.on('reply:request', this.handleReplyRequest.bind(this));
        eventBus.on('reply:clear', this.clearReply.bind(this));
        eventBus.on('session:selected', ({ sessionId }) => this.highlightMessagesBySession(sessionId));
        eventBus.on('session:reply', ({ sessionId }) => {
            if (sessionId) {
                this.replyToSession(sessionId);
            }
        });
        
        window.addEventListener('session:reply', (e) => {
            const { sessionId } = e.detail;
            if (sessionId) {
                this.replyToSession(sessionId);
            }
        });

        return this;
    }
    
    // 创建返回底部按钮
    createScrollToBottomButton() {
        if (!this.container) return;
        
        // 检查是否已存在
        if (document.getElementById('scroll-to-bottom-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'scroll-to-bottom-btn';
        btn.className = 'scroll-to-bottom-btn';
        btn.innerHTML = '↓ 最新';
        btn.title = '返回最新消息';
        btn.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 100px;
            width: 60px;
            height: 36px;
            border-radius: 18px;
            background: var(--primary-color, #00d4ff);
            color: #000;
            border: none;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 212, 255, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
        `;
        
        btn.addEventListener('click', () => {
            this.scrollToBottom(true);
        });
        
        document.body.appendChild(btn);
        this.scrollToBottomBtn = btn;
    }
    
    // 显示/隐藏返回底部按钮
    updateScrollToBottomButton() {
        if (!this.scrollToBottomBtn || !this.container) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.container;
        const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 300;
        
        if (isFarFromBottom) {
            this.scrollToBottomBtn.style.opacity = '1';
            this.scrollToBottomBtn.style.visibility = 'visible';
        } else {
            this.scrollToBottomBtn.style.opacity = '0';
            this.scrollToBottomBtn.style.visibility = 'hidden';
        }
    }

    isMobileRecoveryActive() {
        return document.body?.dataset?.mobileRecovery === 'true';
    }

    normalizeMobileMessageVisibility() {
        if (!this.container || !this.isMobileRecoveryActive()) return;

        const messageNodes = this.container.querySelectorAll('.msg');
        document.body.dataset.mobileRenderedMessages = String(messageNodes.length);

        if (!messageNodes.length) return;

        messageNodes.forEach((node) => {
            node.style.display = 'flex';
            node.style.flexDirection = 'column';
            node.style.opacity = '1';
            node.style.visibility = 'visible';
            node.style.transform = 'none';
            node.style.animation = 'none';
            node.style.filter = 'none';
            node.style.maxWidth = '100%';

            const wrapper = node.querySelector('.msg-content-wrapper');
            if (wrapper) {
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.opacity = '1';
                wrapper.style.visibility = 'visible';
                wrapper.style.transform = 'none';
                wrapper.style.animation = 'none';
                wrapper.style.overflow = 'visible';
            }

            const header = node.querySelector('.msg-header');
            if (header) {
                header.style.opacity = '1';
                header.style.visibility = 'visible';
                header.style.transform = 'none';
            }

            const content = node.querySelector('.msg-content');
            if (content) {
                content.style.opacity = '1';
                content.style.visibility = 'visible';
                content.style.transform = 'none';
                content.style.animation = 'none';
                content.style.filter = 'none';
                content.style.display = 'block';
                content.style.maxWidth = '100%';
                content.style.minWidth = '0';
                content.style.whiteSpace = 'normal';
            }

            const footer = node.querySelector('.msg-footer');
            if (footer) {
                footer.style.opacity = '1';
                footer.style.visibility = 'visible';
                footer.style.transform = 'none';
            }
        });
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    renderMobileFallbackMessages(messages = []) {
        if (!this.container || !this.isMobileRecoveryActive() || !messages.length) return false;

        const visibleMessages = messages.filter((message) => !isMessageHidden(message)).slice(-80);
        if (!visibleMessages.length) return false;

        const html = visibleMessages.map((message) => {
            const text = this.escapeHtml(getMessageDisplayText(message) || '');
            const sender = this.escapeHtml(message?.sender || (message?.isUser ? '我' : '系统'));
            const compactSessionId = this.escapeHtml(getCompactSessionId(message) || '------');
            const roleClass = message?.kind === 'system' || message?.isSystem
                ? 'system'
                : (message?.isUser ? 'user' : 'agent');

            return `
                <article class="msg ${roleClass} mobile-fallback-msg">
                    <div class="msg-content-wrapper">
                        <div class="msg-header">
                            <div class="msg-meta">
                                <span class="msg-sender">${sender}</span>
                                <div class="msg-tags-wrapper">
                                    <button class="session-tag" type="button">#${compactSessionId}</button>
                                </div>
                            </div>
                        </div>
                        <div class="msg-content"><p>${text.replace(/\n/g, '<br>')}</p></div>
                    </div>
                </article>
            `;
        }).join('');

        this.container.innerHTML = html;
        this.container.dataset.mobileFallback = 'true';
        this.normalizeMobileMessageVisibility();
        return true;
    }
    
    // 滚动到底部
    scrollToBottom(smooth = false) {
        if (!this.container) return;
        
        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
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
            this.container.addEventListener('click', (e) => this.handleCollapsibleToggle(e));
            this.container.addEventListener('click', (e) => this.handleInteraction(e, 'click'));
            this.container.addEventListener('pointerup', (e) => this.handleInteraction(e, 'pointerup'));
        }
    }

    handleCollapsibleToggle(e) {
        const toggleTarget = e?.target?.closest?.('.action-log-header, .thinking-header');
        if (!toggleTarget) return;

        requestAnimationFrame(() => {
            this.captureCollapsibleState();
        });
    }

    getMessageStateKey(messageEl) {
        if (!messageEl) return '';
        return String(
            messageEl.dataset.runId
            || messageEl.dataset.msgId
            || messageEl.dataset.timestamp
            || ''
        ).trim();
    }

    captureMessageCollapsibleState(messageEl) {
        const stateKey = this.getMessageStateKey(messageEl);
        if (!stateKey || !messageEl) return null;

        const actionLogCard = messageEl.querySelector('.action-log-card');
        const thinkingBlocks = Array.from(messageEl.querySelectorAll('.thinking-block'));
        const hasCollapsible = Boolean(actionLogCard) || thinkingBlocks.length > 0;
        if (!hasCollapsible) {
            this.collapsibleState.delete(stateKey);
            return null;
        }

        const nextState = {
            actionLogExpanded: Boolean(actionLogCard?.classList.contains('expanded')),
            thinkingExpanded: thinkingBlocks
                .map((block, index) => (block.classList.contains('expanded') ? index : -1))
                .filter((index) => index >= 0)
        };

        this.collapsibleState.set(stateKey, nextState);
        return nextState;
    }

    applyMessageCollapsibleState(messageEl, savedState = null) {
        const stateKey = this.getMessageStateKey(messageEl);
        const state = savedState || (stateKey ? this.collapsibleState.get(stateKey) : null);
        if (!messageEl || !state) return;

        const actionLogCard = messageEl.querySelector('.action-log-card');
        if (actionLogCard) {
            actionLogCard.classList.toggle('expanded', Boolean(state.actionLogExpanded));
        }

        const expandedThinkingIndexes = new Set(state.thinkingExpanded || []);
        messageEl.querySelectorAll('.thinking-block').forEach((block, index) => {
            block.classList.toggle('expanded', expandedThinkingIndexes.has(index));
        });
    }

    captureCollapsibleState(scope = this.container) {
        if (!scope) return;

        const messageEls = scope.matches?.('.msg')
            ? [scope]
            : Array.from(scope.querySelectorAll('.msg'));

        messageEls.forEach((messageEl) => {
            this.captureMessageCollapsibleState(messageEl);
        });
    }

    applyCollapsibleState(scope = this.container) {
        if (!scope) return;

        const messageEls = scope.matches?.('.msg')
            ? [scope]
            : Array.from(scope.querySelectorAll('.msg'));

        messageEls.forEach((messageEl) => {
            this.applyMessageCollapsibleState(messageEl);
        });
    }

    handleInteraction(e, source = 'click') {
        if (!e?.target) return;

        const interaction = this.getInteractionTarget(e.target);
        if (!interaction) return;

        if (source === 'pointerup' && e.pointerType === 'mouse') {
            return;
        }

        if (source === 'pointerup' && !['session', 'avatar', 'action'].includes(interaction.type)) {
            return;
        }

        if (this.shouldSkipInteraction(interaction.key, source)) {
            return;
        }

        if (source === 'pointerup') {
            e.preventDefault();
        }

        e.stopPropagation();

        this.dispatchInteraction(interaction, e);
    }

    getInteractionTarget(target) {
        const localFileTarget = target.closest('[data-file-path]');
        if (localFileTarget) {
            return {
                type: 'local-file',
                key: `local-file:${localFileTarget.dataset.filePath || ''}`,
                element: localFileTarget
            };
        }

        // 处理文件卡片点击（本地环境复制地址）
        const fileCard = target.closest('.file-card-horizontal');
        if (fileCard) {
            return {
                type: 'file-card',
                key: `file-card:${fileCard.getAttribute('onclick') || fileCard.querySelector('img')?.src || ''}`,
                element: fileCard
            };
        }

        // 处理会话标签点击
        const sessionTag = target.closest('.session-tag');
        if (sessionTag) {
            return {
                type: 'session',
                key: `session:${sessionTag.dataset.sessionId || ''}`,
                element: sessionTag
            };
        }

        // 处理头像点击 - 自动@
        const avatar = target.closest('.msg-avatar');
        if (avatar) {
            return {
                type: 'avatar',
                key: `avatar:${avatar.dataset.sessionId || ''}:${avatar.dataset.sender || avatar.dataset.agentId || ''}`,
                element: avatar
            };
        }

        // 处理消息操作按钮
        const actionBtn = target.closest('.msg-action-btn');
        if (actionBtn) {
            const msgEl = actionBtn.closest('.msg');
            return {
                type: 'action',
                key: `action:${actionBtn.dataset.action || ''}:${msgEl?.dataset?.msgId || msgEl?.dataset?.timestamp || ''}`,
                element: actionBtn
            };
        }

        return null;
    }

    shouldSkipInteraction(key, source) {
        if (!key) return false;
        const now = Date.now();
        const duplicateWindow = source === 'click' ? 550 : 320;
        const isDuplicate = this.lastInteractionKey === key && (now - this.lastInteractionAt) < duplicateWindow;
        if (!isDuplicate) {
            this.lastInteractionKey = key;
            this.lastInteractionAt = now;
        }
        return isDuplicate;
    }

    dispatchInteraction(interaction, e) {
        const target = interaction?.element;
        if (!target) return;

        if (interaction.type === 'local-file') {
            e.preventDefault();
            window.handleFileLinkClick?.(
                target.dataset.filePath,
                target.dataset.openApp || 'Finder',
                target.dataset.openShortcut || 'Cmd+Shift+G'
            );
            return;
        }

        if (interaction.type === 'file-card') {
            if (target.tagName === 'A') {
                return;
            }

            const host = window.location.hostname;
            const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
            if (!isLocal) return;

            e.preventDefault();
            const onclickAttr = target.getAttribute('onclick');
            let url = '';
            if (onclickAttr) {
                const match = onclickAttr.match(/handleFileLinkClick\('([^']+)'/);
                if (match) {
                    url = match[1];
                }
            }
            if (!url) {
                const img = target.querySelector('img');
                if (img && img.src) {
                    url = img.src;
                }
            }
            if (url) {
                window.handleFileLinkClick?.(url, 'Finder', 'Cmd+Shift+G');
            }
            return;
        }

        if (interaction.type === 'session') {
            const sessionId = target.dataset.sessionId;
            if (sessionId) {
                eventBus.emit('session:reply', { sessionId });
            }
            return;
        }

        if (interaction.type === 'avatar') {
            const sessionId = target.dataset.sessionId;
            const sender = target.dataset.sender;
            const channel = target.dataset.channel;
            if (sessionId) {
                eventBus.emit('session:reply', { sessionId, channel, sender });
            }
            if (sender) {
                eventBus.emit('mention:request', { name: sender });
            }
            return;
        }

        if (interaction.type === 'action') {
            const action = target.dataset.action;
            const msgEl = target.closest('.msg');
            if (!msgEl) return;

            const text = msgEl.querySelector('.msg-content')?.dataset?.text;
            const sender = msgEl.querySelector('.msg-sender')?.textContent?.trim() || '用户';
            const msgId = msgEl.dataset.msgId;
            const timestamp = parseInt(msgEl.dataset.timestamp, 10);

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

        // 清除之前的高亮
        const messages = this.container.querySelectorAll('.msg');
        messages.forEach(msg => {
            msg.classList.remove('session-highlight');
        });

        // 高亮当前会话的消息（仅视觉高亮，不滚动跳转）
        messages.forEach(msg => {
            const sessionIds = (msg.dataset.sessionIds || msg.dataset.sessionId || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
            if (sessionIds.includes(sessionId)) {
                msg.classList.add('session-highlight');
            }
        });

        // 设置要回复的会话ID
        this.setReplySessionId(sessionId);

        // 显示提示
        const session = stateManager.getSession(sessionId);
        if (session) {
            eventBus.emit('toast:show', {
                message: `已选择会话 #${getCompactSessionId(sessionId)}，新消息将回复到此会话`,
                type: 'info',
                duration: 3000
            });
        }
    }

    handleScroll() {
        if (!this.container) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.container;
        this.isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        
        // 更新返回底部按钮的显示状态
        this.updateScrollToBottomButton();
    }

    onMessageReceived(msg) {
        this.addMessage(msg);
    }

    onMessageSent(msg) {
        if (msg && msg.timestamp && msg.sender) {
            this.addMessage(msg);
        }
    }

    onFilterChanged(filter) {
        this.activeFilter = Array.isArray(filter) ? filter : (filter?.agentNames || null);
        this.render();
    }

    commitMessages(messages, { render = true, scroll = false, silentState = false, rebuildSessions = true, persist = true } = {}) {
        const normalizedMessages = (messages || []).slice(-MAX_MESSAGES).map((message) => normalizeMessageAgentFields(message));
        stateManager.setState({ messages: normalizedMessages }, silentState);
        if (rebuildSessions) {
            stateManager.rebuildSessionsFromMessages(normalizedMessages, silentState);
        }
        if (persist) {
            this.saveHistory(normalizedMessages);
        }
        if (render) {
            this.render();
        }
        if (scroll && this.isNearBottom && !this.scrollLocked) {
            this.scrollToBottom();
        }
        return normalizedMessages;
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
        this.clearReplySession();

        const replyPreview = document.querySelector('.reply-preview');
        if (replyPreview) {
            replyPreview.remove();
        }
    }

    replyToSession(sessionId) {
        const messages = stateManager.getState('messages') || [];
        const sessionMessages = messages.filter(m => messageHasSessionId(m, sessionId) || m.runId === sessionId);

        if (sessionMessages.length === 0) {
            eventBus.emit('toast:show', { message: '找不到该会话的消息', type: 'warning' });
            return;
        }

        const lastMessage = sessionMessages[sessionMessages.length - 1];
        const shortId = getCompactSessionId(sessionId);
        const lastMessageText = getMessageDisplayText(lastMessage);
        const session = stateManager.getSession(sessionId);
        const channelLabel = this.getChannelLabel(session?.channel || session?.source || lastMessage?.channel || lastMessage?.source || lastMessage?.metadata?.channel || lastMessage?.metadata?.source);
        const previewLabel = channelLabel
            ? `回复 ${channelLabel} 会话 #${shortId}:`
            : `回复会话 #${shortId}:`;

        // 设置要回复的会话ID
        this.setReplySessionId(sessionId);

        this.replyToMessage = {
            text: lastMessageText,
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
                        <span class="reply-preview-label">${previewLabel}</span>
                        <span class="reply-preview-text">${lastMessageText.substring(0, 50)}${lastMessageText.length > 50 ? '...' : ''}</span>
                    </div>
                    <button class="reply-preview-close" title="取消引用">✕</button>
                `;
                preview.querySelector('.reply-preview-close').addEventListener('click', () => {
                    this.clearReply();
                });
                input.parentElement.parentElement.insertBefore(preview, input.parentElement);
            } else {
                replyPreview.querySelector('.reply-preview-label').textContent = previewLabel;
                replyPreview.querySelector('.reply-preview-text').textContent = lastMessageText.substring(0, 50) + (lastMessageText.length > 50 ? '...' : '');
            }
            
            eventBus.emit('toast:show', { message: channelLabel ? `已选择 ${channelLabel} 会话 #${shortId}` : `已选择会话 #${shortId}，输入消息后将回复此会话`, type: 'info' });
        }
        
        this.highlightMessagesBySession(sessionId);
    }

    getChannelLabel(channel = '') {
        const normalized = String(channel || '').trim().toLowerCase();
        const labels = {
            teamchat: 'TeamChat',
            tui: 'TUI',
            qqbot: 'QQBot',
            wecom: 'WeCom',
            weixin: 'Weixin',
            feishu: 'Feishu',
            telegram: 'Telegram',
            whatsapp: 'WhatsApp',
            email: 'Mail',
            system: 'System'
        };
        return labels[normalized] || '';
    }

    isSystemMessage(message = {}) {
        return Boolean(
            message?.isSystem
            || message?.type === 'system'
            || message?.kind === 'system'
            || message?.metadata?.kind === 'control'
        );
    }

    isMirroredEchoPair(existing = {}, incoming = {}) {
        const existingMirror = existing?.metadata?.mirrorSource === 'agent-transcript';
        const incomingMirror = incoming?.metadata?.mirrorSource === 'agent-transcript';
        if (!existingMirror && !incomingMirror) return false;

        const existingText = getMessageDisplayText(existing).trim();
        const incomingText = getMessageDisplayText(incoming).trim();
        if (!existingText || existingText !== incomingText) return false;

        const timeDiff = Math.abs((existing?.timestamp || 0) - (incoming?.timestamp || 0));
        if (timeDiff > 2 * 60 * 1000) return false;

        const bothUsers = !!existing?.isUser && !!incoming?.isUser;
        const bothControl = (existing?.isSystem || existing?.type === 'system' || existing?.metadata?.kind === 'control')
            && (incoming?.isSystem || incoming?.type === 'system' || incoming?.metadata?.kind === 'control');

        return bothUsers || bothControl;
    }

    mergeMirroredEcho(existing = {}, incoming = {}) {
        const incomingRouteSessionKey = incoming?.metadata?.routeSessionKey || incoming?.metadata?.sourceSessionKey || incoming?.sessionId || null;
        const existingRouteSessionKey = existing?.metadata?.routeSessionKey || existing?.metadata?.sourceSessionKey || existing?.sessionId || null;
        const preferredSessionId = incomingRouteSessionKey || existingRouteSessionKey || existing.sessionId || incoming.sessionId || null;
        const choosePreferred = (left, right) => {
            const leftScore = this.getMirrorPreferenceScore(left);
            const rightScore = this.getMirrorPreferenceScore(right);
            if (leftScore === rightScore) {
                return (Number(left?.timestamp) || 0) >= (Number(right?.timestamp) || 0) ? left : right;
            }
            return leftScore > rightScore ? left : right;
        };
        const preferred = choosePreferred(existing, incoming);
        const secondary = preferred === existing ? incoming : existing;

        return {
            ...secondary,
            ...preferred,
            sender: preferred.sender || secondary.sender || '我',
            text: this.pickPreferredText(existing, incoming),
            timestamp: Math.min(existing.timestamp || Infinity, incoming.timestamp || Infinity),
            sessionId: preferredSessionId,
            channel: preferred.channel || preferred.metadata?.channel || secondary.channel || secondary.metadata?.channel || 'teamchat',
            source: preferred.source || preferred.metadata?.source || secondary.source || secondary.metadata?.source || 'teamchat',
            metadata: {
                ...(secondary.metadata || {}),
                ...(preferred.metadata || {}),
                routeSessionKey: incoming?.metadata?.routeSessionKey || existing?.metadata?.routeSessionKey || null,
                sourceSessionKey: incoming?.metadata?.sourceSessionKey || existing?.metadata?.sourceSessionKey || null
            },
            _synced: true
            };
        }

    getMirrorPreferenceScore(message = {}) {
        const channel = String(
            message?.channel
            || message?.metadata?.channel
            || message?.source
            || message?.metadata?.source
            || ''
        ).trim().toLowerCase();
        let score = 0;
        if (message?.metadata?.mirrorSource === 'agent-transcript') score -= 5;
        if (channel === 'teamchat') score += 4;
        else if (channel && channel !== 'system') score += 1;
        if (message?.model || message?.modelInfo?.modelId || message?.metadata?.modelInfo?.modelId) score += 1;
        return score;
    }

    getNormalizedMessageText(message = {}) {
        return getMessageDisplayText(message)
            .replace(/\s+/g, ' ')
            .trim();
    }

    getDedupSenderKey(message = {}) {
        if (message?.isSystem || message?.type === 'system' || message?.metadata?.kind === 'control') {
            return 'system';
        }
        if (message?.isUser) {
            return 'user';
        }
        return String(message?.sender || '').trim().toLowerCase();
    }

    pickPreferredText(existing = {}, incoming = {}) {
        const existingText = this.getNormalizedMessageText(existing);
        const incomingText = this.getNormalizedMessageText(incoming);
        if (!existingText) return incoming.text || '';
        if (!incomingText) return existing.text || '';
        return existingText.length >= incomingText.length ? (existing.text || '') : (incoming.text || '');
    }

    getReplyTo() {
        return this.replyToMessage;
    }

    addMessage(msg) {
        const normalizedIncoming = normalizeMessageAgentFields(msg);
        let messages = stateManager.getState('messages') || [];
        
        // 生成消息的唯一标识key（用于检测重复）
        const msgKey = `${normalizedIncoming.timestamp}-${normalizedIncoming.sender}-${(normalizedIncoming.text || '').slice(0, 100)}`;
        
        // ========== 用户消息处理（优先保证显示）==========
        if (normalizedIncoming.isUser) {
            // 用户消息使用更严格的重复检测：相同timestamp或2秒内相同内容
            const userDuplicateIndex = messages.findIndex(m => {
                if (!m.isUser) return false;
                const currentClientId = normalizedIncoming?.metadata?.clientMessageId || normalizedIncoming?.id;
                const existingClientId = m?.metadata?.clientMessageId || m?.id;
                if (currentClientId && existingClientId && currentClientId === existingClientId) {
                    return true;
                }
                // 完全相同的timestamp
                if (m.timestamp === normalizedIncoming.timestamp) return true;
                // 或2秒内相同内容
                const textMatch = this.getNormalizedMessageText(m) === this.getNormalizedMessageText(normalizedIncoming);
                const timeDiff = Math.abs(m.timestamp - normalizedIncoming.timestamp);
                return textMatch && timeDiff < 180000;
            });
            
            if (userDuplicateIndex >= 0) {
                const existing = messages[userDuplicateIndex];
                if (this.isMirroredEchoPair(existing, normalizedIncoming)) {
                    messages[userDuplicateIndex] = this.mergeMirroredEcho(existing, normalizedIncoming);
                    this.commitMessages(messages);
                    console.log('[Messages] Collapsed mirrored user echo into original message:', msgKey);
                    return;
                }
                // 如果新消息有服务器同步标记，更新现有消息
                if (normalizedIncoming._synced || normalizedIncoming.status === 'synced') {
                    messages[userDuplicateIndex] = {
                        ...existing,
                        ...normalizedIncoming,
                        timestamp: existing.timestamp, // 保留原始timestamp
                        _synced: true
                    };
                    this.commitMessages(messages);
                    console.log('[Messages] User message synced:', msgKey);
                } else {
                    console.log('[Messages] Skipping duplicate user message:', msgKey);
                }
                return;
            }
            
            // 添加用户消息（确保100%显示）
            messages.push(normalizedIncoming);
            console.log('[Messages] Added user message:', msgKey);
            this.commitMessages(messages, { scroll: true });
            return;
        }
        
        // ========== Agent 消息处理 ==========
        // 检查是否有相同内容的消息（无论是否有runId）
        const contentDuplicateIndex = messages.findIndex(m => {
            if (m.sender !== normalizedIncoming.sender) return false;
            const textMatch = this.getNormalizedMessageText(m) === this.getNormalizedMessageText(normalizedIncoming);
            const timeDiff = Math.abs(m.timestamp - normalizedIncoming.timestamp);
            return textMatch && timeDiff < 5000; // 5秒内相同内容视为重复
        });
        
        if (contentDuplicateIndex >= 0) {
            const existing = messages[contentDuplicateIndex];
            let updated = false;
            
            // 🔄 合并多个标签：如果新消息有不同的sessionId，合并到现有消息中
            if (normalizedIncoming.runId && existing.runId && normalizedIncoming.runId !== existing.runId) {
                const existingSessions = getMessageSessionIds(existing);
                const incomingSessions = getMessageSessionIds(normalizedIncoming);
                const mergedSessions = Array.from(new Set([...existingSessions, ...incomingSessions]));
                if (mergedSessions.length > existingSessions.length) {
                    messages[contentDuplicateIndex] = {
                        ...existing,
                        sessionId: mergedSessions.join(','),
                        model: normalizedIncoming.model || existing.model,
                        modelInfo: normalizedIncoming.modelInfo || existing.modelInfo,
                        channel: normalizedIncoming.channel || existing.channel,
                        source: normalizedIncoming.source || existing.source,
                        thinking: normalizedIncoming.thinking || existing.thinking,
                        tools: [...(existing.tools || []), ...(normalizedIncoming.tools || [])],
                        actionLogs: [...(existing.actionLogs || []), ...(normalizedIncoming.actionLogs || [])]
                    };
                    updated = true;
                    console.log('[Messages] Merged duplicate message with multiple sessions:', mergedSessions);
                } else {
                    console.log('[Messages] Skipping duplicate message (same session):', msgKey);
                }
            } else if (normalizedIncoming.runId && !existing.runId) {
                messages[contentDuplicateIndex] = {
                    ...existing,
                    ...normalizedIncoming,
                    timestamp: existing.timestamp || normalizedIncoming.timestamp
                };
                updated = true;
                console.log('[Messages] Updated duplicate message with runId:', normalizedIncoming.runId);
            } else {
                // 同步消息（无runId）替换本地消息，确保数据持久化
                // 但保留原有的timestamp和DOM元素引用
                messages[contentDuplicateIndex] = {
                    ...existing,
                    ...normalizedIncoming,
                    thinking: normalizedIncoming.thinking || existing.thinking,
                    tools: (normalizedIncoming.tools && normalizedIncoming.tools.length > 0) ? normalizedIncoming.tools : (existing.tools || []),
                    actionLogs: (normalizedIncoming.actionLogs && normalizedIncoming.actionLogs.length > 0) ? normalizedIncoming.actionLogs : (existing.actionLogs || []),
                    timestamp: existing.timestamp || normalizedIncoming.timestamp,
                    _synced: true  // 标记为已同步
                };
                updated = true;
                console.log('[Messages] Replaced local message with synced version:', msgKey);
            }
            
            // 如果消息被更新，需要触发 state 更新和重新渲染
            if (updated) {
                this.commitMessages(messages);
            }
            return;
        }
        
        // 如果有runId，检查是否是更新现有消息（相同runId）
        if (normalizedIncoming.runId) {
            const existingIndex = messages.findIndex(m => m.runId === normalizedIncoming.runId);
            if (existingIndex >= 0) {
                // 更新现有消息（保留timestamp）
                const existing = messages[existingIndex];
                messages[existingIndex] = { 
                    ...existing, 
                    ...normalizedIncoming,
                    thinking: normalizedIncoming.thinking || existing.thinking,
                    tools: (normalizedIncoming.tools && normalizedIncoming.tools.length > 0) ? normalizedIncoming.tools : (existing.tools || []),
                    actionLogs: (normalizedIncoming.actionLogs && normalizedIncoming.actionLogs.length > 0) ? normalizedIncoming.actionLogs : (existing.actionLogs || []),
                    timestamp: existing.timestamp || normalizedIncoming.timestamp 
                };
                this.commitMessages(messages);
                console.log('[Messages] Updated message with runId:', normalizedIncoming.runId);
                return;
            }
        }
        
        // 添加新消息
        messages.push(normalizedIncoming);
        console.log('[Messages] Added new message:', msgKey);
        this.commitMessages(messages, { scroll: true });
    }

    updateMessage(runId, text) {
        const messages = stateManager.getState('messages') || [];
        const idx = messages.findIndex(m => m.runId === runId);
        
        if (idx >= 0) {
            messages[idx].text = text;
            stateManager.setState({ messages });
            this.render();
        }
    }

    updateStreamingMessage(runId, text, sender, senderAgentId, model, thinking = null, tools = [], sessionId = null, actionLogs = []) {
        if (!this.container) return;

        const effectiveSessionId = sessionId || runId;
        const messages = stateManager.getState('messages') || [];
        const existingIdx = messages.findIndex(m => m.runId === runId);
        let nextMessage;

        if (existingIdx >= 0) {
            const existingMessage = messages[existingIdx];
            const nextThinking = thinking || existingMessage.thinking || null;
            const nextTools = tools.length > 0 ? tools : (existingMessage.tools || []);
            const nextActionLogs = actionLogs.length > 0 ? actionLogs : (existingMessage.actionLogs || []);
            const nextModel = model || existingMessage.model || null;
            const nextSessionId = sessionId || getPrimarySessionId(existingMessage) || effectiveSessionId;

            if (
                existingMessage.text === text
                && existingMessage.model === nextModel
                && existingMessage.thinking === nextThinking
                && (existingMessage.sessionId || '') === (nextSessionId || '')
                && JSON.stringify(existingMessage.tools || []) === JSON.stringify(nextTools || [])
                && JSON.stringify(existingMessage.actionLogs || []) === JSON.stringify(nextActionLogs || [])
            ) {
                return;
            }

            nextMessage = {
                ...existingMessage,
                text,
                model: nextModel,
                thinking: nextThinking,
                tools: nextTools,
                sessionId: nextSessionId,
                actionLogs: nextActionLogs
            };
            messages[existingIdx] = nextMessage;
            this.commitMessages(messages, { render: false, silentState: true, rebuildSessions: false, persist: false });
        } else {
            nextMessage = {
                sender: sender || 'Agent',
                text,
                isUser: false,
                runId,
                sessionId: effectiveSessionId,
                timestamp: Date.now(),
                model,
                thinking,
                tools,
                actionLogs
            };
            
            if (senderAgentId) {
                nextMessage.agentId = senderAgentId;
            }
            
            messages.push(nextMessage);
            this.commitMessages(messages, { render: false, silentState: true, rebuildSessions: false, persist: false });
        }

        this.upsertRenderedMessage(nextMessage, true);
        
        if (this.isNearBottom && !this.scrollLocked) {
            this.scrollToBottom(false);
        }
    }

    finalizeStreamingMessage(runId, text, model, thinking = null, tools = [], sessionId = null, actionLogs = []) {
        if (!this.container) return;
        
        const messages = stateManager.getState('messages') || [];
        const idx = messages.findIndex(m => m.runId === runId);
        if (idx >= 0) {
            messages[idx] = {
                ...messages[idx],
                text,
                model: model || messages[idx].model || null,
                thinking: thinking || messages[idx].thinking || null,
                tools: tools.length > 0 ? tools : (messages[idx].tools || []),
                sessionId: sessionId || getPrimarySessionId(messages[idx]) || runId,
                actionLogs: actionLogs.length > 0 ? actionLogs : (messages[idx].actionLogs || [])
            };
            this.commitMessages(messages, { render: false, silentState: false, rebuildSessions: true, persist: true });
            this.upsertRenderedMessage(messages[idx], false);
        }
    }

    loadHistory() {
        try {
            const raw = localStorage.getItem('team_chat_history');
            if (raw) {
                const messages = JSON.parse(raw).slice(-MAX_MESSAGES).map((message) => normalizeMessageAgentFields(message));
                stateManager.setState({ messages });
                stateManager.rebuildSessionsFromMessages(messages);
            }
        } catch {
            stateManager.setState({ messages: [] });
        }
    }

    saveHistory(messages) {
        try {
            localStorage.setItem('team_chat_history', JSON.stringify(messages.slice(-MAX_MESSAGES)));
        } catch {}
    }

    clearHistory() {
        stateManager.setState({ messages: [] });
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
        const historyLoading = stateManager.getStateValue('historyLoading');
        const historyError = stateManager.getStateValue('historyError');
        const hadRenderedMessages = Boolean(this.container?.querySelector('.msg'));
        const previousScrollHeight = this.container?.scrollHeight || 0;
        const previousScrollTop = this.container?.scrollTop || 0;
        const previousBottomOffset = previousScrollHeight - previousScrollTop;
        const shouldPreserveScroll = hadRenderedMessages && !this.isNearBottom;
        this.captureCollapsibleState();
        
        console.log('%c[Messages] _doRender: ' + messages.length + ' messages', 'background: #ff9800; color: white; font-size: 12px; padding: 2px 6px;');
        
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
                    const text = getMessageDisplayText(m);
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

        messages = messages.filter((message) => !isMessageHidden(message));
        const showSystemMessages = Boolean(stateManager.getStateValue('showSystemMessages'));
        if (!showSystemMessages) {
            messages = messages.filter((message) => !this.isSystemMessage(message));
        }
        const hideHeartbeatPrompts = stateManager.getStateValue('hideHeartbeatPrompts') !== false;
        if (hideHeartbeatPrompts) {
            messages = messages.filter((message) => !isHeartbeatPromptMessage(message));
        }
        messages = this.dedupeMirroredMessages(messages);

        if (!messages.length) {
            if (historyLoading && hadRenderedMessages) {
                this.container.classList.add('history-refreshing');
                this.updateScrollToBottomButton();
                return;
            }

            this.container.classList.remove('history-refreshing');
            this.container.innerHTML = historyLoading
                ? `
                    <div class="messages-loading-state">
                        <div class="messages-loading-pulse"></div>
                        <div class="messages-loading-lines">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <div class="messages-loading-text">正在加载历史消息...</div>
                    </div>
                `
                : historyError
                ? `
                    <div class="messages-loading-state messages-loading-error">
                        <div class="messages-loading-text">${historyError}</div>
                    </div>
                `
                : `
                    <div class="empty-state">
                        <div class="empty-icon">💬</div>
                        <div class="empty-text">暂无消息，开始新的协作吧</div>
                    </div>
                `;
        } else {
            this.container.classList.remove('history-refreshing');
            renderMessages(messages, this.container);
            this.applyCollapsibleState();
            this.normalizeMobileMessageVisibility();
            if (this.isMobileRecoveryActive() && !this.container.querySelector('.msg')) {
                this.renderMobileFallbackMessages(messages);
            }
        }
        
        if (shouldPreserveScroll) {
            const maxScrollTop = Math.max(0, this.container.scrollHeight - this.container.clientHeight);
            const restoredScrollTop = Math.min(
                Math.max(0, this.container.scrollHeight - previousBottomOffset),
                maxScrollTop
            );
            this.container.scrollTop = restoredScrollTop;
        } else if (this.isNearBottom && !this.scrollLocked) {
            this.scrollToBottom(false);
        }

        this.updateScrollToBottomButton();
    }

    dedupeMirroredMessages(messages = []) {
        const deduped = [];
        const recentIndex = new Map();

        const getChannel = (message) => String(
            message?.channel
            || message?.metadata?.channel
            || message?.source
            || message?.metadata?.source
            || ''
        ).trim().toLowerCase();

        const getRouteKey = (message) => String(
            message?.metadata?.routeSessionKey
            || message?.metadata?.sourceSessionKey
            || message?.sessionId
            || ''
        ).trim();

        const getScore = (message) => {
            const channel = getChannel(message);
            const routeKey = getRouteKey(message);
            let score = 0;
            if (message?.metadata?.mirrorSource === 'agent-transcript') score -= 5;
            if (channel === 'teamchat') score += 4;
            else if (channel && channel !== 'system') score += 1;
            if (routeKey.startsWith('agent:')) score += 1;
            if (message?.model || message?.modelInfo?.modelId || message?.metadata?.modelInfo?.modelId) score += 1;
            if (message?.isSystem || message?.type === 'system') score -= 1;
            return score;
        };

        for (const message of messages) {
            const text = this.getNormalizedMessageText(message);
            if (!text) {
                deduped.push(message);
                continue;
            }

            const signature = [
                this.getDedupSenderKey(message),
                text
            ].join('|');

            const existingIndex = recentIndex.get(signature);
            if (existingIndex === undefined) {
                recentIndex.set(signature, deduped.length);
                deduped.push(message);
                continue;
            }

            const existing = deduped[existingIndex];
            const timeDiff = Math.abs((Number(existing?.timestamp) || 0) - (Number(message?.timestamp) || 0));
            const differentChannel = getChannel(existing) !== getChannel(message);
            const differentRoute = getRouteKey(existing) !== getRouteKey(message);
            const existingMirror = existing?.metadata?.mirrorSource === 'agent-transcript';
            const incomingMirror = message?.metadata?.mirrorSource === 'agent-transcript';
            const bothUsers = !!existing?.isUser && !!message?.isUser;
            const bothAgents = !existing?.isUser
                && !message?.isUser
                && !(existing?.isSystem || existing?.type === 'system' || existing?.metadata?.kind === 'control')
                && !(message?.isSystem || message?.type === 'system' || message?.metadata?.kind === 'control');
            const bothControl = (existing?.isSystem || existing?.type === 'system' || existing?.metadata?.kind === 'control')
                && (message?.isSystem || message?.type === 'system' || message?.metadata?.kind === 'control');
            const crossChannelUserEcho = bothUsers
                && differentChannel
                && timeDiff <= 180000
                && (
                    existingMirror
                    || incomingMirror
                    || (getChannel(existing) === 'teamchat' || getChannel(message) === 'teamchat')
                    || differentRoute
                );
            const crossChannelAgentEcho = bothAgents
                && timeDiff <= 180000
                && (
                    existingMirror
                    || incomingMirror
                )
                && (
                    differentChannel
                    || differentRoute
                );

            if (this.isMirroredEchoPair(existing, message) || crossChannelUserEcho || crossChannelAgentEcho) {
                deduped[existingIndex] = this.mergeMirroredEcho(existing, message);
                continue;
            }

            if (timeDiff > 10000) {
                recentIndex.set(signature, deduped.length);
                deduped.push(message);
                continue;
            }

            if (getScore(message) > getScore(existing) || (getScore(message) === getScore(existing) && (message?.timestamp || 0) >= (existing?.timestamp || 0))) {
                deduped[existingIndex] = message;
            }
        }

        return deduped;
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
                stateManager.setState({ messages });
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

    // ========== 会话回复功能 ==========

    getReplySessionId() {
        return this.replyToSessionId;
    }

    setReplySessionId(sessionId) {
        this.replyToSessionId = sessionId;
        console.log('[Messages] Set reply session:', sessionId);
    }

    clearReplySession() {
        this.replyToSessionId = null;
        console.log('[Messages] Cleared reply session');
    }

    upsertRenderedMessage(message, streaming = false) {
        if (!this.container || !message) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderMessage(message);
        const nextEl = tempDiv.firstElementChild;
        if (!nextEl) return;

        const contentEl = nextEl.querySelector('.msg-content');
        if (contentEl) {
            contentEl.classList.toggle('streaming', Boolean(streaming));
        }

        const existingEl = message.runId
            ? this.container.querySelector(`[data-run-id="${message.runId}"]`)
            : null;

        if (existingEl) {
            this.patchRenderedMessage(existingEl, nextEl, streaming);
        } else {
            nextEl.classList.toggle('msg-streaming', Boolean(streaming));
            this.container.appendChild(nextEl);
        }
    }

    patchRenderedMessage(existingEl, nextEl, streaming = false) {
        if (!existingEl || !nextEl) return;
        const preservedCollapseState = this.captureMessageCollapsibleState(existingEl);

        for (const attr of Array.from(existingEl.attributes)) {
            if (!nextEl.hasAttribute(attr.name)) {
                existingEl.removeAttribute(attr.name);
            }
        }
        for (const attr of Array.from(nextEl.attributes)) {
            existingEl.setAttribute(attr.name, attr.value);
        }

        existingEl.className = nextEl.className;
        existingEl.classList.toggle('msg-streaming', Boolean(streaming));

        const replaceSection = (selector) => {
            const current = existingEl.querySelector(selector);
            const next = nextEl.querySelector(selector);

            if (current && next) {
                current.replaceWith(next.cloneNode(true));
                return;
            }
            if (!current && next) {
                existingEl.querySelector('.msg-content-wrapper')?.insertBefore(next.cloneNode(true), existingEl.querySelector('.msg-content') || null);
                return;
            }
            if (current && !next) {
                current.remove();
            }
        };

        replaceSection('.msg-header');
        replaceSection('.action-log-card');
        replaceSection('.msg-content');
        replaceSection('.msg-footer');

        this.applyMessageCollapsibleState(existingEl, preservedCollapseState);
    }

    destroy() {
        this.initialized = false;
    }
}

export const messagesModule = new MessagesModule();
export default messagesModule;
