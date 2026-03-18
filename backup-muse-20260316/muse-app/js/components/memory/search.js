import api from '../../services/api.js';

const SEARCH_HISTORY_KEY = 'muse-search-history';
const MAX_HISTORY_ITEMS = 10;
const DEBOUNCE_DELAY = 300;

export class MemorySearch {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      placeholder: '搜索记忆...',
      onSearch: null,
      onSelect: null,
      onClear: null,
      ...options
    };

    this.searchHistory = this.loadSearchHistory();
    this.currentQuery = '';
    this.debounceTimer = null;
    this.isLoading = false;
    this.suggestions = [];
    this.showSuggestions = false;

    this.render();
    this.bindEvents();
  }

  loadSearchHistory() {
    try {
      const history = localStorage.getItem(SEARCH_HISTORY_KEY);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Failed to load search history:', error);
      return [];
    }
  }

  saveSearchHistory() {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(this.searchHistory));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  }

  addToHistory(query) {
    if (!query || query.trim().length === 0) return;

    const normalizedQuery = query.trim();
    const existingIndex = this.searchHistory.indexOf(normalizedQuery);

    if (existingIndex > -1) {
      this.searchHistory.splice(existingIndex, 1);
    }

    this.searchHistory.unshift(normalizedQuery);

    if (this.searchHistory.length > MAX_HISTORY_ITEMS) {
      this.searchHistory = this.searchHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    this.saveSearchHistory();
    this.renderHistory();
  }

  clearHistory() {
    this.searchHistory = [];
    this.saveSearchHistory();
    this.renderHistory();
    this.hideSuggestions();
  }

  render() {
    this.container.innerHTML = `
      <div class="memory-search">
        <div class="memory-search-wrapper">
          <div class="memory-search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
          </div>
          <input 
            type="text" 
            class="memory-search-input" 
            placeholder="${this.options.placeholder}"
            autocomplete="off"
          />
          <div class="memory-search-actions">
            <button class="memory-search-clear btn btn-ghost btn-icon btn-sm" style="display: none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div class="memory-search-loading" style="display: none;">
              <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="memory-search-suggestions" style="display: none;">
          <div class="memory-search-history">
            <div class="memory-search-history-header">
              <span class="memory-search-history-title">搜索历史</span>
              <button class="memory-search-history-clear btn btn-ghost btn-sm">清空</button>
            </div>
            <div class="memory-search-history-list"></div>
          </div>
          <div class="memory-search-results" style="display: none;">
            <div class="memory-search-results-title">搜索结果</div>
            <div class="memory-search-results-list"></div>
          </div>
        </div>
      </div>
    `;

    this.searchInput = this.container.querySelector('.memory-search-input');
    this.clearBtn = this.container.querySelector('.memory-search-clear');
    this.loadingIndicator = this.container.querySelector('.memory-search-loading');
    this.suggestionsPanel = this.container.querySelector('.memory-search-suggestions');
    this.historyPanel = this.container.querySelector('.memory-search-history');
    this.historyList = this.container.querySelector('.memory-search-history-list');
    this.historyClearBtn = this.container.querySelector('.memory-search-history-clear');
    this.resultsPanel = this.container.querySelector('.memory-search-results');
    this.resultsList = this.container.querySelector('.memory-search-results-list');

    this.renderHistory();
  }

  renderHistory() {
    if (this.searchHistory.length === 0) {
      this.historyPanel.style.display = 'none';
      return;
    }

    this.historyPanel.style.display = 'block';
    this.historyList.innerHTML = this.searchHistory.map(item => `
      <div class="memory-search-history-item" data-query="${this.escapeHtml(item)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="memory-search-history-text">${this.escapeHtml(item)}</span>
        <button class="memory-search-history-remove" data-query="${this.escapeHtml(item)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  bindEvents() {
    this.searchInput.addEventListener('input', (e) => {
      this.handleInput(e.target.value);
    });

    this.searchInput.addEventListener('focus', () => {
      this.showSuggestionsPanel();
    });

    this.searchInput.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    this.clearBtn.addEventListener('click', () => {
      this.clearSearch();
    });

    this.historyClearBtn.addEventListener('click', () => {
      this.clearHistory();
    });

    this.historyList.addEventListener('click', (e) => {
      const item = e.target.closest('.memory-search-history-item');
      const removeBtn = e.target.closest('.memory-search-history-remove');

      if (removeBtn) {
        e.stopPropagation();
        const query = removeBtn.dataset.query;
        this.removeFromHistory(query);
      } else if (item) {
        const query = item.dataset.query;
        this.searchInput.value = query;
        this.handleInput(query);
      }
    });

    this.resultsList.addEventListener('click', (e) => {
      const item = e.target.closest('.memory-search-result-item');
      if (item) {
        const id = item.dataset.id;
        if (this.options.onSelect) {
          this.options.onSelect(id, this.suggestions.find(s => s.id === id));
        }
        this.hideSuggestions();
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.hideSuggestions();
      }
    });
  }

  handleInput(value) {
    this.currentQuery = value;
    this.updateClearButton();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (value.trim().length === 0) {
      this.showHistory();
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.performSearch(value);
    }, DEBOUNCE_DELAY);
  }

  handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.currentQuery.trim()) {
        this.addToHistory(this.currentQuery);
        this.performSearch(this.currentQuery, true);
      }
    } else if (e.key === 'Escape') {
      this.hideSuggestions();
      this.searchInput.blur();
    }
  }

  async performSearch(query, force = false) {
    if (!query || query.trim().length === 0) return;

    this.setLoading(true);

    try {
      const results = await api.searchMemories(query, { limit: 5 });
      this.suggestions = results.items || results || [];
      this.renderResults(query);
      this.showResults();

      if (force && this.options.onSearch) {
        this.options.onSearch(query, this.suggestions);
      }
    } catch (error) {
      console.error('Search failed:', error);
      this.suggestions = [];
      this.renderResults(query);
    } finally {
      this.setLoading(false);
    }
  }

  renderResults(query) {
    if (this.suggestions.length === 0) {
      this.resultsList.innerHTML = `
        <div class="memory-search-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <span>未找到相关记忆</span>
        </div>
      `;
      return;
    }

    this.resultsList.innerHTML = this.suggestions.map(item => `
      <div class="memory-search-result-item" data-id="${item.id}">
        <div class="memory-search-result-content">
          ${this.highlightText(this.truncateText(item.content, 100), query)}
        </div>
        <div class="memory-search-result-meta">
          <span class="memory-search-result-source">${this.escapeHtml(item.source || '未知来源')}</span>
          <span class="memory-search-result-time">${this.formatTime(item.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  highlightText(text, query) {
    if (!query) return this.escapeHtml(text);

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const escaped = this.escapeHtml(text);

    return escaped.replace(regex, '<mark class="memory-search-highlight">$1</mark>');
  }

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;

    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  showSuggestionsPanel() {
    this.suggestionsPanel.style.display = 'block';
    if (this.currentQuery.trim().length === 0) {
      this.showHistory();
    } else {
      this.showResults();
    }
  }

  hideSuggestions() {
    this.suggestionsPanel.style.display = 'none';
    this.showSuggestions = false;
  }

  showHistory() {
    this.historyPanel.style.display = this.searchHistory.length > 0 ? 'block' : 'none';
    this.resultsPanel.style.display = 'none';
  }

  showResults() {
    this.historyPanel.style.display = 'none';
    this.resultsPanel.style.display = 'block';
  }

  setLoading(loading) {
    this.isLoading = loading;
    this.loadingIndicator.style.display = loading ? 'block' : 'none';
    this.searchInput.disabled = loading;
  }

  updateClearButton() {
    this.clearBtn.style.display = this.currentQuery.length > 0 ? 'flex' : 'none';
  }

  clearSearch() {
    this.searchInput.value = '';
    this.currentQuery = '';
    this.suggestions = [];
    this.updateClearButton();
    this.showHistory();

    if (this.options.onClear) {
      this.options.onClear();
    }
  }

  removeFromHistory(query) {
    const index = this.searchHistory.indexOf(query);
    if (index > -1) {
      this.searchHistory.splice(index, 1);
      this.saveSearchHistory();
      this.renderHistory();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  focus() {
    this.searchInput.focus();
  }

  blur() {
    this.searchInput.blur();
  }

  getValue() {
    return this.currentQuery;
  }

  setValue(value) {
    this.searchInput.value = value;
    this.currentQuery = value;
    this.updateClearButton();
  }

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.container.innerHTML = '';
  }
}

export default MemorySearch;
