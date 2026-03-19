import api from '../../services/api.js';

const PREVIEW_LINE_COUNT = 3;
const LOAD_BATCH_SIZE = 20;
const VIRTUAL_SCROLL_THRESHOLD = 100;

export class MemoryList {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      onItemClick: null,
      onDelete: null,
      onLoadMore: null,
      ...options
    };

    this.memories = [];
    this.isLoading = false;
    this.hasMore = true;
    this.currentPage = 1;
    this.totalCount = 0;
    this.scrollTop = 0;
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.itemHeight = 180;
    this.useVirtualScroll = false;
    this.resizeObserver = null;

    this.render();
    this.bindEvents();
    this.loadMemories();
  }

  render() {
    this.container.innerHTML = `
      <div class="memory-list">
        <div class="memory-list-header">
          <div class="memory-list-count">
            <span class="memory-list-count-number">0</span>
            <span class="memory-list-count-label">条记忆</span>
          </div>
        </div>
        <div class="memory-list-content">
          <div class="memory-list-grid"></div>
          <div class="memory-list-empty" style="display: none;">
            <div class="empty-state">
              <svg class="empty-state-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <h3 class="empty-state-title">暂无记忆</h3>
              <p class="empty-state-description">开始添加你的第一条记忆吧</p>
            </div>
          </div>
          <div class="memory-list-loading" style="display: none;">
            ${this.renderSkeletons()}
          </div>
          <div class="memory-list-more" style="display: none;">
            <button class="btn btn-secondary memory-list-more-btn">
              <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
              </svg>
              <span>加载更多</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.gridElement = this.container.querySelector('.memory-list-grid');
    this.countElement = this.container.querySelector('.memory-list-count-number');
    this.emptyElement = this.container.querySelector('.memory-list-empty');
    this.loadingElement = this.container.querySelector('.memory-list-loading');
    this.moreElement = this.container.querySelector('.memory-list-more');
    this.contentElement = this.container.querySelector('.memory-list-content');
  }

  renderSkeletons(count = 6) {
    let skeletons = '';
    for (let i = 0; i < count; i++) {
      skeletons += `
        <div class="memory-card memory-card-skeleton">
          <div class="memory-card-header">
            <div class="skeleton skeleton-text" style="width: 60%; height: 16px;"></div>
          </div>
          <div class="memory-card-body">
            <div class="skeleton skeleton-text" style="width: 100%; height: 14px;"></div>
            <div class="skeleton skeleton-text" style="width: 90%; height: 14px;"></div>
            <div class="skeleton skeleton-text" style="width: 75%; height: 14px;"></div>
          </div>
          <div class="memory-card-footer">
            <div class="skeleton skeleton-text" style="width: 80px; height: 12px;"></div>
          </div>
        </div>
      `;
    }
    return skeletons;
  }

  bindEvents() {
    this.gridElement.addEventListener('click', (e) => {
      const card = e.target.closest('.memory-card');
      if (!card || card.classList.contains('memory-card-skeleton')) return;

      const deleteBtn = e.target.closest('.memory-card-delete');
      const viewBtn = e.target.closest('.memory-card-view');

      if (deleteBtn) {
        e.stopPropagation();
        this.handleDelete(card.dataset.id);
      } else if (viewBtn) {
        e.stopPropagation();
        this.handleView(card.dataset.id);
      } else {
        this.handleView(card.dataset.id);
      }
    });

    this.moreElement.addEventListener('click', () => {
      this.loadMore();
    });

    this.contentElement.addEventListener('scroll', () => {
      this.handleScroll();
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  handleScroll() {
    if (!this.useVirtualScroll) {
      this.checkInfiniteLoad();
      return;
    }

    this.scrollTop = this.contentElement.scrollTop;
    this.updateVirtualScroll();
  }

  checkInfiniteLoad() {
    const { scrollTop, scrollHeight, clientHeight } = this.contentElement;

    if (scrollHeight - scrollTop - clientHeight < 200 && this.hasMore && !this.isLoading) {
      this.loadMore();
    }
  }

  handleResize() {
    const containerWidth = this.container.clientWidth;
    this.useVirtualScroll = this.memories.length > VIRTUAL_SCROLL_THRESHOLD;

    if (this.useVirtualScroll) {
      this.setupVirtualScroll();
    }
  }

  setupVirtualScroll() {
    const totalHeight = this.memories.length * this.itemHeight;
    this.gridElement.style.height = `${totalHeight}px`;
    this.gridElement.style.position = 'relative';
    this.updateVirtualScroll();
  }

  updateVirtualScroll() {
    if (!this.useVirtualScroll) return;

    const containerHeight = this.contentElement.clientHeight;
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = Math.min(
      start + Math.ceil(containerHeight / this.itemHeight) + 2,
      this.memories.length
    );

    if (start !== this.visibleStart || end !== this.visibleEnd) {
      this.visibleStart = start;
      this.visibleEnd = end;
      this.renderVirtualItems();
    }
  }

  renderVirtualItems() {
    const visibleItems = this.memories.slice(this.visibleStart, this.visibleEnd);

    this.gridElement.innerHTML = visibleItems.map((memory, index) => {
      const actualIndex = this.visibleStart + index;
      const top = actualIndex * this.itemHeight;
      return this.renderMemoryCard(memory, { top, position: 'absolute' });
    }).join('');
  }

  async loadMemories() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.showLoading();

    try {
      const response = await api.getMemories({
        page: this.currentPage,
        limit: LOAD_BATCH_SIZE
      });

      const memories = response.items || response || [];
      this.totalCount = response.total || memories.length;
      this.hasMore = response.hasMore !== false && memories.length === LOAD_BATCH_SIZE;

      this.memories = [...this.memories, ...memories];
      this.currentPage++;

      this.renderMemories();
      this.updateCount();
    } catch (error) {
      console.error('Failed to load memories:', error);
      this.showError(error.message);
    } finally {
      this.isLoading = false;
      this.hideLoading();
    }
  }

  async loadMore() {
    if (!this.hasMore || this.isLoading) return;

    this.showMoreLoading();
    await this.loadMemories();
    this.hideMoreLoading();
  }

  renderMemories() {
    if (this.memories.length === 0) {
      this.showEmpty();
      return;
    }

    this.hideEmpty();

    if (this.useVirtualScroll) {
      this.setupVirtualScroll();
    } else {
      this.gridElement.innerHTML = this.memories.map(memory => 
        this.renderMemoryCard(memory)
      ).join('');
    }

    if (this.hasMore) {
      this.moreElement.style.display = 'flex';
    } else {
      this.moreElement.style.display = 'none';
    }
  }

  renderMemoryCard(memory, options = {}) {
    const { top, position } = options;
    const style = position === 'absolute' ? `position: absolute; top: ${top}px; left: 0; right: 0;` : '';

    return `
      <div class="memory-card card" data-id="${memory.id}" style="${style}">
        <div class="memory-card-header">
          <div class="memory-card-priority priority-${(memory.priority || 'medium').toLowerCase()}">
            <span class="priority-dot"></span>
            <span class="priority-label">${this.getPriorityLabel(memory.priority)}</span>
          </div>
          <div class="memory-card-actions">
            <button class="memory-card-view btn btn-ghost btn-icon btn-sm" title="查看详情">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="memory-card-delete btn btn-ghost btn-icon btn-sm" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="memory-card-body">
          <div class="memory-card-content">
            ${this.truncateContent(memory.content, PREVIEW_LINE_COUNT)}
          </div>
        </div>
        <div class="memory-card-footer">
          <div class="memory-card-meta">
            ${memory.tags && memory.tags.length > 0 ? `
              <div class="memory-card-tags">
                ${memory.tags.slice(0, 3).map(tag => `
                  <span class="tag tag-sm">${this.escapeHtml(tag)}</span>
                `).join('')}
                ${memory.tags.length > 3 ? `<span class="tag tag-sm">+${memory.tags.length - 3}</span>` : ''}
              </div>
            ` : ''}
            <div class="memory-card-info">
              <span class="memory-card-source">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                ${this.escapeHtml(memory.source || '未知来源')}
              </span>
              <span class="memory-card-time">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                ${this.formatTime(memory.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  truncateContent(content, maxLines) {
    if (!content) return '';

    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return this.escapeHtml(content);
    }

    const truncated = lines.slice(0, maxLines).join('\n');
    return `${this.escapeHtml(truncated)}<span class="memory-card-more">...</span>`;
  }

  getPriorityLabel(priority) {
    const labels = {
      critical: '紧急',
      high: '高',
      medium: '中',
      low: '低'
    };
    return labels[(priority || 'medium').toLowerCase()] || '中';
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

  handleView(id) {
    const memory = this.memories.find(m => m.id === id);
    if (memory && this.options.onItemClick) {
      this.options.onItemClick(memory);
    }
  }

  async handleDelete(id) {
    if (!confirm('确定要删除这条记忆吗？')) return;

    try {
      await api.delete(`/api/muse/memories/${id}`);

      this.memories = this.memories.filter(m => m.id !== id);
      this.totalCount--;

      this.renderMemories();
      this.updateCount();

      if (this.options.onDelete) {
        this.options.onDelete(id);
      }
    } catch (error) {
      console.error('Failed to delete memory:', error);
      alert('删除失败：' + error.message);
    }
  }

  updateCount() {
    this.countElement.textContent = this.totalCount;
  }

  showLoading() {
    this.loadingElement.style.display = 'grid';
  }

  hideLoading() {
    this.loadingElement.style.display = 'none';
  }

  showMoreLoading() {
    const btn = this.moreElement.querySelector('.memory-list-more-btn');
    if (btn) {
      btn.disabled = true;
      btn.querySelector('svg').style.display = 'inline-block';
    }
  }

  hideMoreLoading() {
    const btn = this.moreElement.querySelector('.memory-list-more-btn');
    if (btn) {
      btn.disabled = false;
      btn.querySelector('svg').style.display = 'none';
    }
  }

  showEmpty() {
    this.gridElement.style.display = 'none';
    this.emptyElement.style.display = 'flex';
    this.moreElement.style.display = 'none';
  }

  hideEmpty() {
    this.gridElement.style.display = 'grid';
    this.emptyElement.style.display = 'none';
  }

  showError(message) {
    this.gridElement.innerHTML = `
      <div class="memory-list-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>加载失败：${this.escapeHtml(message)}</p>
        <button class="btn btn-primary memory-list-retry">重试</button>
      </div>
    `;

    const retryBtn = this.gridElement.querySelector('.memory-list-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.loadMemories();
      });
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  addMemory(memory) {
    this.memories.unshift(memory);
    this.totalCount++;
    this.renderMemories();
    this.updateCount();
  }

  updateMemory(id, updates) {
    const index = this.memories.findIndex(m => m.id === id);
    if (index > -1) {
      this.memories[index] = { ...this.memories[index], ...updates };
      this.renderMemories();
    }
  }

  removeMemory(id) {
    this.memories = this.memories.filter(m => m.id !== id);
    this.totalCount--;
    this.renderMemories();
    this.updateCount();
  }

  setMemories(memories) {
    this.memories = memories;
    this.totalCount = memories.length;
    this.hasMore = false;
    this.renderMemories();
    this.updateCount();
  }

  refresh() {
    this.memories = [];
    this.currentPage = 1;
    this.hasMore = true;
    this.loadMemories();
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.container.innerHTML = '';
  }
}

export default MemoryList;
