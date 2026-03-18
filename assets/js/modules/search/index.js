/**
 * Search Module - 消息搜索
 * 搜索切换、高亮匹配、导航匹配结果
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, $$, on, addClass, removeClass } from '../../utils/dom.js';
import { debounce } from '../../utils/debounce.js';

class SearchModule {
    constructor() {
        this.container = null;
        this.input = null;
        this.visible = false;
        this.query = '';
        this.matches = [];
        this.currentIndex = -1;
        this.initialized = false;
    }

    init(options = {}) {
        this.container = document.getElementById('search-container');
        this.input = document.getElementById('search-input');
        
        if (!this.container) {
            this.createUI();
        }
        
        this.bindEvents();
        this.initialized = true;
        return this;
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'search-container';
        this.container.className = 'search-container';
        
        const header = document.querySelector('.chat-header');
        if (header) {
            header.appendChild(this.container);
        }
    }

    bindEvents() {
        // 注意：toggle 按钮事件在 main.js 中绑定，避免重复绑定
        
        if (this.input) {
            on(this.input, 'input', debounce(this.handleSearch.bind(this), 300));
            on(this.input, 'keydown', this.handleKeydown.bind(this));
        }

        const closeBtn = this.container?.querySelector('.search-close');
        if (closeBtn) {
            on(closeBtn, 'click', this.close.bind(this));
        }
    }

    handleSearch(e) {
        const query = e.target.value.trim().toLowerCase();
        this.query = query;
        
        if (!query) {
            this.clearHighlight();
            return;
        }

        this.searchMessages(query);
    }

    searchMessages(query) {
        const messages = stateManager.getState('messages') || [];
        this.matches = [];
        
        messages.forEach((msg, index) => {
            const text = (msg.text || '').toLowerCase();
            const sender = (msg.sender || '').toLowerCase();
            
            if (text.includes(query) || sender.includes(query)) {
                this.matches.push({ index, msg });
            }
        });

        this.highlightMatches(query);
        this.updateSearchInfo();
        
        if (this.matches.length > 0) {
            this.currentIndex = 0;
            this.scrollToMatch();
        }
    }

    updateSearchInfo() {
        const searchInfo = this.container?.querySelector('.search-info');
        if (searchInfo) {
            if (this.matches.length > 0) {
                searchInfo.textContent = `${this.currentIndex + 1}/${this.matches.length}`;
            } else if (this.query) {
                searchInfo.textContent = '无结果';
            } else {
                searchInfo.textContent = '';
            }
        }
    }

    highlightMatches(query) {
        this.clearHighlight();
        
        const messageElements = document.querySelectorAll('.msg');
        messageElements.forEach((el, index) => {
            const contentEl = el.querySelector('.msg-content');
            if (!contentEl) return;

            const text = contentEl.textContent.toLowerCase();
            if (text.includes(query)) {
                addClass(el, 'search-match');
                // 高亮文本
                const html = contentEl.innerHTML;
                const regex = new RegExp(`(${query})`, 'gi');
                contentEl.innerHTML = html.replace(regex, '<mark class="search-highlight">$1</mark>');
            }
        });
    }

    clearHighlight() {
        const messageElements = document.querySelectorAll('.msg');
        messageElements.forEach(el => {
            removeClass(el, 'search-match');
            const contentEl = el.querySelector('.msg-content');
            if (contentEl) {
                // 移除高亮标记
                const marks = contentEl.querySelectorAll('mark.search-highlight');
                marks.forEach(mark => {
                    const parent = mark.parentNode;
                    parent.replaceChild(document.createTextNode(mark.textContent), mark);
                    parent.normalize();
                });
            }
        });
    }

    scrollToMatch() {
        if (this.matches.length === 0) return;
        
        const match = this.matches[this.currentIndex];
        if (!match) return;
        
        // 使用 data-timestamp 来定位消息
        const timestamp = match.msg.timestamp;
        const msgEl = document.querySelector(`.msg[data-timestamp="${timestamp}"]`);
        
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 添加高亮动画
            msgEl.style.animation = 'none';
            msgEl.offsetHeight; // 触发重排
            msgEl.style.animation = 'pulse 0.5s ease';
        }
        
        this.updateSearchInfo();
    }

    handleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.nextMatch();
        } else if (e.key === 'Escape') {
            this.close();
        }
    }

    nextMatch() {
        if (this.matches.length === 0) return;
        
        this.currentIndex = (this.currentIndex + 1) % this.matches.length;
        this.scrollToMatch();
    }

    toggle() {
        console.log("SEARCH_TOGGLE_CALLED_20260317");
        if (this.visible) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.container) {
            addClass(this.container, 'active');
        }
        this.visible = true;
        if (this.input) {
            this.input.focus();
        }
    }

    close() {
        if (this.container) {
            removeClass(this.container, 'active');
        }
        this.visible = false;
        this.clearHighlight();
        if (this.input) {
            this.input.value = '';
        }
        this.query = '';
        this.matches = [];
    }

    destroy() {
        this.close();
        this.initialized = false;
    }
}

export const searchModule = new SearchModule();
export default searchModule;
