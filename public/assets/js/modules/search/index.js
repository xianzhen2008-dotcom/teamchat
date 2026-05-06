/**
 * Search Module - 消息搜索增强版 v2
 * 功能：本地搜索 + 时间范围筛选 + 搜索历史 + 结果列表 + 高亮导航
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, $$, on, addClass, removeClass, toggleClass } from '../../utils/dom.js';
import { debounce } from '../../utils/debounce.js';
import { getAgentDisplayName } from '../../utils/agent-meta.js';

const SEARCH_HISTORY_KEY = 'teamchat_search_history';
const MAX_HISTORY = 20;

class SearchModule {
    constructor() {
        this.container = null;
        this.input = null;
        this.visible = false;
        this.query = '';
        this.matches = [];
        this.currentIndex = -1;
        this.initialized = false;
        this.timeRange = 'all'; // all | today | week | month | custom
        this.senderFilter = 'all'; // all | sender name
        this.history = this.loadHistory();
        this.historyVisible = false;
    }

    init(options = {}) {
        this.container = document.getElementById('search-container');
        this.input = document.getElementById('search-input');
        
        if (!this.container) {
            this.createUI();
        }
        
        this.injectEnhancements();
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

    /** 注入增强UI（搜索历史下拉 + 时间筛选 + 结果列表） */
    injectEnhancements() {
        if (!this.container) return;
        
        // 避免重复注入
        if (this.container.querySelector('.search-panel-body')) return;

        // 搜索历史下拉
        const historyDropdown = document.createElement('div');
        historyDropdown.className = 'search-history-dropdown';
        historyDropdown.id = 'search-history-dropdown';

        // 时间范围筛选栏
        const filterBar = document.createElement('div');
        filterBar.className = 'search-filter-bar';
        filterBar.id = 'search-filter-bar';
        filterBar.innerHTML = `
            <span class="search-filter-label">时间:</span>
            <button class="search-filter-btn active" data-range="all">全部</button>
            <button class="search-filter-btn" data-range="today">今天</button>
            <button class="search-filter-btn" data-range="week">本周</button>
            <button class="search-filter-btn" data-range="month">本月</button>
        `;

        // 搜索结果列表
        const resultPanel = document.createElement('div');
        resultPanel.className = 'search-result-panel';
        resultPanel.id = 'search-result-panel';

        // 组装到container
        this.container.appendChild(historyDropdown);
        this.container.appendChild(filterBar);
        this.container.appendChild(resultPanel);

        // 绑定时间筛选
        filterBar.querySelectorAll('.search-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBar.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.timeRange = e.target.dataset.range;
                if (this.query) this.searchMessages(this.query);
            });
        });
    }

    loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    saveHistory(query) {
        if (!query || query.length < 2) return;
        this.history = this.history.filter(h => h !== query);
        this.history.unshift(query);
        if (this.history.length > MAX_HISTORY) this.history = this.history.slice(0, MAX_HISTORY);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(this.history));
    }

    showHistoryDropdown() {
        const dropdown = document.getElementById('search-history-dropdown');
        if (!dropdown || this.history.length === 0) return;
        
        dropdown.innerHTML = `
            <div class="search-history-header">
                <span>🔍 搜索历史</span>
                <button class="search-history-clear" onclick="window.__searchModule?.clearHistory()">清空</button>
            </div>
            <div class="search-history-list">
                ${this.history.slice(0, 10).map(h => `
                    <div class="search-history-item" data-query="${this.escapeHtml(h)}">
                        <span class="history-icon">🕐</span>
                        <span class="history-query">${this.escapeHtml(h)}</span>
                        <button class="history-del" data-query="${this.escapeHtml(h)}">✕</button>
                    </div>
                `).join('')}
            </div>
        `;

        dropdown.querySelectorAll('.search-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('history-del')) return;
                const q = item.dataset.query;
                if (this.input) this.input.value = q;
                this.input.dispatchEvent(new Event('input'));
            });
        });

        dropdown.querySelectorAll('.history-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const q = btn.dataset.query;
                this.deleteHistoryItem(q);
            });
        });

        dropdown.style.display = 'block';
        this.historyVisible = true;
    }

    hideHistoryDropdown() {
        const dropdown = document.getElementById('search-history-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        this.historyVisible = false;
    }

    deleteHistoryItem(query) {
        this.history = this.history.filter(h => h !== query);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(this.history));
        if (this.history.length > 0) {
            this.showHistoryDropdown();
        } else {
            this.hideHistoryDropdown();
        }
    }

    clearHistory() {
        this.history = [];
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        this.hideHistoryDropdown();
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    bindEvents() {
        if (this.input) {
            on(this.input, 'input', debounce(this.handleSearch.bind(this), 300));
            on(this.input, 'keydown', this.handleKeydown.bind(this));
            on(this.input, 'focus', () => {
                if (!this.query) this.showHistoryDropdown();
            });
        }

        on(document, 'click', (e) => {
            if (!this.container?.contains(e.target)) {
                this.hideHistoryDropdown();
            }
        });

        const closeBtn = this.container?.querySelector('.search-close');
        if (closeBtn) {
            on(closeBtn, 'click', this.close.bind(this));
        }
    }

    handleSearch(e) {
        const query = e.target.value.trim();
        this.query = query;
        
        if (!query) {
            this.clearHighlight();
            this.hideHistoryDropdown();
            return;
        }

        this.hideHistoryDropdown();
        this.searchMessages(query);
    }

    searchMessages(query) {
        const messages = stateManager.getState('messages') || [];
        const lowerQuery = query.toLowerCase();
        
        // 时间范围过滤
        const now = Date.now();
        const ranges = {
            today: 86400000,
            week: 86400000 * 7,
            month: 86400000 * 30,
        };

        this.matches = [];
        
        messages.forEach((msg, index) => {
            const ts = msg.timestamp || 0;
            const text = (msg.text || '').toLowerCase();
            const senderRaw = msg.sender || '';
            const sender = getAgentDisplayName(senderRaw, senderRaw).toLowerCase();
            const searchableSender = `${senderRaw} ${sender}`.toLowerCase();
            
            // 时间过滤
            if (this.timeRange !== 'all') {
                const rangeMs = ranges[this.timeRange];
                if (rangeMs && (now - ts) > rangeMs) return;
            }

            // 发送者过滤
            if (this.senderFilter !== 'all' && !searchableSender.includes(this.senderFilter.toLowerCase())) {
                return;
            }
            
            if (text.includes(lowerQuery) || searchableSender.includes(lowerQuery)) {
                this.matches.push({ index, msg });
            }
        });

        this.highlightMatches(query);
        this.updateSearchInfo();
        this.renderResultPanel(query);
        
        // 保存搜索历史
        this.saveHistory(query);

        if (this.matches.length > 0) {
            this.currentIndex = 0;
            this.scrollToMatch();
        }
    }

    updateSearchInfo() {
        const searchInfo = this.container?.querySelector('.search-info');
        if (!searchInfo) return;
        
        if (this.matches.length > 0) {
            searchInfo.textContent = `${this.currentIndex + 1}/${this.matches.length}`;
        } else if (this.query) {
            searchInfo.textContent = '无结果';
        } else {
            searchInfo.textContent = '';
        }
    }

    renderResultPanel(query) {
        const panel = document.getElementById('search-result-panel');
        if (!panel) return;

        if (!this.query) {
            panel.style.display = 'none';
            return;
        }

        if (this.matches.length === 0) {
            panel.innerHTML = `<div class="search-result-empty">❌ 未找到包含"${this.escapeHtml(query)}"的消息</div>`;
            panel.style.display = 'block';
            return;
        }

        const lowerQuery = query.toLowerCase();
        panel.innerHTML = `
            <div class="search-result-header">
                <span>📋 找到 ${this.matches.length} 条结果</span>
                <button class="search-result-close" onclick="window.__searchModule?.closeResultPanel()">✕</button>
            </div>
            <div class="search-result-list">
                ${this.matches.slice(0, 50).map((m, i) => {
                    const text = (m.msg.text || '').substring(0, 120);
                    const highlighted = text.replace(
                        new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                        '<mark class="sr-highlight">$1</mark>'
                    );
                    const time = new Date(m.msg.timestamp || 0).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    const senderName = getAgentDisplayName(m.msg.sender || '?', m.msg.sender || '?');
                    return `
                    <div class="search-result-item ${i === this.currentIndex ? 'active' : ''}" data-index="${i}" onclick="window.__searchModule?.jumpToResult(${i})">
                        <div class="sr-meta"><span class="sr-sender">${this.escapeHtml(senderName)}</span><span class="sr-time">${time}</span></div>
                        <div class="sr-text">${highlighted}${text.length >= 120 ? '...' : ''}</div>
                    </div>`;
                }).join('')}
                ${this.matches.length > 50 ? `<div class="search-result-more">还有 ${this.matches.length - 50} 条结果，请缩小范围...</div>` : ''}
            </div>
        `;
        panel.style.display = 'block';
    }

    closeResultPanel() {
        const panel = document.getElementById('search-result-panel');
        if (panel) panel.style.display = 'none';
    }

    jumpToResult(index) {
        this.currentIndex = index;
        this.scrollToMatch();
        this.highlightCurrentResult();
    }

    highlightCurrentResult() {
        const panel = document.getElementById('search-result-panel');
        if (!panel) return;
        panel.querySelectorAll('.search-result-item').forEach((el, i) => {
            toggleClass(el, 'active', i === this.currentIndex);
        });
    }

    highlightMatches(query) {
        this.clearHighlight();
        
        const messageElements = document.querySelectorAll('.msg');
        messageElements.forEach((el) => {
            const contentEl = el.querySelector('.msg-content');
            if (!contentEl) return;

            const text = contentEl.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                addClass(el, 'search-match');
                const html = contentEl.innerHTML;
                // 转义query中的特殊字符再构建正则
                const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escaped})`, 'gi');
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
        
        const timestamp = match.msg.timestamp;
        const msgEl = document.querySelector(`.msg[data-timestamp="${timestamp}"]`);
        
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            msgEl.style.animation = 'none';
            msgEl.offsetHeight;
            msgEl.style.animation = 'pulse 0.5s ease';
        }
        
        this.updateSearchInfo();
        this.highlightCurrentResult();
    }

    handleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                this.prevMatch();
            } else {
                this.nextMatch();
            }
        } else if (e.key === 'Escape') {
            this.close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.nextMatch();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.prevMatch();
        }
    }

    nextMatch() {
        if (this.matches.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.matches.length;
        this.scrollToMatch();
    }

    prevMatch() {
        if (this.matches.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
        this.scrollToMatch();
    }

    toggle() {
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
        document.body.classList.add('search-active');
        this.visible = true;
        if (this.input) {
            this.input.focus();
            if (!this.query) this.showHistoryDropdown();
        }
    }

    close() {
        this.hideHistoryDropdown();
        this.closeResultPanel();
        if (this.container) {
            removeClass(this.container, 'active');
        }
        document.body.classList.remove('search-active');
        this.visible = false;
        this.clearHighlight();
        if (this.input) {
            this.input.value = '';
        }
        this.query = '';
        this.matches = [];
        this.currentIndex = -1;
    }

    destroy() {
        this.close();
        this.initialized = false;
    }
}

export const searchModule = new SearchModule();
// 挂到window上供外部调用（如onclick）
window.__searchModule = searchModule;
export default searchModule;
