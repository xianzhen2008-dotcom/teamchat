/**
 * Input Module - 输入区域管理
 * 输入框管理、文件预览、发送处理
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, on, createElement, addClass, removeClass } from '../../utils/dom.js';
import { uploadService } from '../../services/upload.js';
import { mentionModule } from './mention.js';

const FILE_BASE_URL = window.location.origin;

class InputModule {
    constructor() {
        this.container = null;
        this.input = null;
        this.sendBtn = null;
        this.uploadBtn = null;
        this.fileInput = null;
        this.previewContainer = null;
        this.pendingFiles = [];
        this.isSending = false;
        this.initialized = false;
        this.draftKey = 'team_chat_draft';
    }

    init(options = {}) {
        this.container = options.container || $('.input-area');
        this.input = options.input || $('#chat-input');
        this.sendBtn = options.sendBtn || $('#send-btn');
        this.uploadBtn = options.uploadBtn || $('#upload-btn');
        this.fileInput = options.fileInput || $('#file-input');
        this.previewContainer = options.previewContainer || $('#file-preview');
        
        if (!this.input) {
            console.warn('[Input] Input element not found');
            return this;
        }

        this.createPreviewContainerIfNeeded();
        this.bindEvents();
        mentionModule.init({ input: this.input });
        this.bindGlobalEvents();
        this.loadDraft();
        this.initialized = true;

        return this;
    }

    createPreviewContainerIfNeeded() {
        if (!this.previewContainer && this.container) {
            this.previewContainer = createElement('div', {
                id: 'file-preview',
                className: 'file-preview'
            });
            this.container.insertBefore(this.previewContainer, this.container.firstChild);
        }
    }

    bindEvents() {
        if (this.sendBtn) {
            on(this.sendBtn, 'click', this.handleSend.bind(this));
        }

        if (this.input) {
            on(this.input, 'keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.handleSend();
                }
            });

            on(this.input, 'input', () => {
                this.handleInputResize();
                this.saveDraft();
            });
            
            on(this.input, 'paste', this.handlePaste.bind(this));
        }

        if (this.uploadBtn) {
            on(this.uploadBtn, 'click', () => this.fileInput && this.fileInput.click());
        }

        if (this.fileInput) {
            on(this.fileInput, 'change', this.handleFileSelect.bind(this));
        }

        if (this.previewContainer) {
            this.previewContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.preview-remove');
                if (btn) {
                    this.handleRemovePreview(e);
                }
            });
        }
    }

    handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        let hasFiles = false;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    this.addPendingFile(file);
                    hasFiles = true;
                }
            } else if (item.kind === 'file') {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    this.addPendingFile(file);
                    hasFiles = true;
                }
            }
        }
        
        if (hasFiles) {
            eventBus.emit('toast:show', { message: '已添加粘贴的文件', type: 'info' });
        }
    }

    saveDraft() {
        if (!this.input) return;
        try {
            const draft = this.input.value;
            if (draft) {
                localStorage.setItem(this.draftKey, draft);
            } else {
                localStorage.removeItem(this.draftKey);
            }
        } catch {}
    }

    loadDraft() {
        if (!this.input) return;
        try {
            const draft = localStorage.getItem(this.draftKey);
            if (draft) {
                this.input.value = draft;
                this.handleInputResize();
            }
        } catch {}
    }

    clearDraft() {
        try {
            localStorage.removeItem(this.draftKey);
        } catch {}
    }

    handleInputResize() {
        if (!this.input) return;
        this.input.style.height = 'auto';
        this.input.style.height = Math.min(this.input.scrollHeight, 150) + 'px';
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (!files || !files.length) return;

        for (const file of files) {
            this.addPendingFile(file);
        }

        e.target.value = '';
    }

    addPendingFile(file) {
        const fileObj = {
            id: Date.now() + Math.random(),
            file: file,
            preview: null
        };

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                fileObj.preview = e.target.result;
                this.renderPreview();
            };
            reader.readAsDataURL(file);
        }

        this.pendingFiles.push(fileObj);
        this.renderPreview();
    }

    removePendingFile(id) {
        this.pendingFiles = this.pendingFiles.filter(f => f.id !== id);
        this.renderPreview();
    }

    handleRemovePreview(e) {
        const btn = e.target.closest('.preview-remove');
        if (btn) {
            const id = parseFloat(btn.dataset.id);
            this.removePendingFile(id);
        }
    }

    renderPreview() {
        if (!this.previewContainer) return;

        this.previewContainer.innerHTML = this.pendingFiles.map(f => {
            const ext = f.file.name.split('.').pop().toUpperCase();
            
            if (f.preview) {
                return `
                    <div class="preview-item" data-id="${f.id}">
                        <img src="${f.preview}" alt="${f.file.name}">
                        <button class="preview-remove" data-id="${f.id}">✕</button>
                    </div>
                `;
            }
            
            return `
                <div class="preview-item" data-id="${f.id}">
                    <div class="preview-icon">${this.getFileIcon(f.file.name)}</div>
                    <div class="preview-ext">${ext}</div>
                    <button class="preview-remove" data-id="${f.id}">✕</button>
                </div>
            `;
        }).join('');
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
        if (['pdf'].includes(ext)) return '📕';
        if (['doc', 'docx'].includes(ext)) return '📘';
        if (['xls', 'xlsx'].includes(ext)) return '📊';
        if (['zip', 'rar', '7z'].includes(ext)) return '📦';
        return '📄';
    }

    async handleSend() {
        if (this.isSending) return;

        const text = this.input ? this.input.value.trim() : '';
        if (!text && this.pendingFiles.length === 0) return;

        const isConnected = stateManager.getState('isConnected');
        if (!navigator.onLine) {
            eventBus.emit('toast:show', { message: '当前网络不可用', type: 'error' });
            return;
        }

        if (!isConnected) {
            eventBus.emit('toast:show', { message: '实时连接不可用，将尝试兼容发送', type: 'info' });
        }

        this.isSending = true;
        this.updateSendButton(true);

        try {
            let messageText = text;

            if (this.pendingFiles.length > 0) {
                eventBus.emit('toast:show', { message: '上传中...', type: 'info' });
                
                const uploaded = await uploadService.uploadFiles(this.pendingFiles.map(f => f.file));
                
                const lines = [];
                for (const f of uploaded) {
                    const url = f.url;
                    const isImage = f.mime?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name);
                    if (isImage) {
                        lines.push(`![${f.name}](${url})`);
                    } else {
                        lines.push(`[📁 ${f.name}](${url})`);
                    }
                }

                if (messageText) {
                    messageText = messageText + '\n' + lines.join('\n');
                } else {
                    messageText = lines.join('\n');
                }
            }

            this.pendingFiles = [];
            this.renderPreview();

            if (messageText) {
                eventBus.emit('message:send', { text: messageText });
            }

            if (this.input) {
                this.input.value = '';
                this.handleInputResize();
                this.clearDraft();
            }
        } catch (err) {
            eventBus.emit('toast:show', { message: '发送失败: ' + err.message, type: 'error' });
        } finally {
            this.isSending = false;
            this.updateSendButton(false);
        }
    }

    updateSendButton(loading) {
        if (!this.sendBtn) return;
        
        if (loading) {
            this.sendBtn.disabled = true;
            this.sendBtn.textContent = '...';
        } else {
            this.sendBtn.disabled = false;
            this.sendBtn.textContent = '➤';
        }
    }

    bindGlobalEvents() {
        // 监听mention请求
        eventBus.on('mention:request', ({ name }) => {
            if (this.input) {
                const currentValue = this.input.value;
                const mention = '@' + name + ' ';
                if (currentValue && !currentValue.endsWith(' ')) {
                    this.input.value = currentValue + ' ' + mention;
                } else {
                    this.input.value = currentValue + mention;
                }
                this.input.focus();
            }
        });

        // 监听reply请求
        eventBus.on('reply:request', ({ text, sender }) => {
            if (this.input) {
                const quote = text?.split('\n').map(line => '> ' + line).join('\n');
                const currentValue = this.input.value;
                const replyText = `@${sender}:\n${quote}\n\n`;
                if (currentValue && !currentValue.endsWith('\n')) {
                    this.input.value = currentValue + '\n' + replyText;
                } else {
                    this.input.value = currentValue + replyText;
                }
                this.input.focus();
                this.handleInputResize();
            }
        });
    }

    destroy() {
        this.pendingFiles = [];
        this.isSending = false;
        this.initialized = false;
    }
}

export const inputModule = new InputModule();
export default inputModule;
