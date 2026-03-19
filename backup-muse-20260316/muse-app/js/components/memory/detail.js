import api from '../../services/api.js';

const PANEL_WIDTH = 480;

export class MemoryDetail {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      onClose: null,
      onEdit: null,
      onDelete: null,
      onShare: null,
      ...options
    };

    this.memory = null;
    this.relatedMemories = [];
    this.isOpen = false;

    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="memory-detail-backdrop"></div>
      <div class="memory-detail-panel">
        <div class="memory-detail-header">
          <div class="memory-detail-title">
            <span class="memory-detail-title-text">记忆详情</span>
          </div>
          <div class="memory-detail-actions">
            <button class="memory-detail-edit btn btn-ghost btn-sm" title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span>编辑</span>
            </button>
            <button class="memory-detail-share btn btn-ghost btn-sm" title="分享">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              <span>分享</span>
            </button>
            <button class="memory-detail-delete btn btn-ghost btn-sm btn-danger-text" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
              <span>删除</span>
            </button>
            <button class="memory-detail-close btn btn-ghost btn-icon btn-sm" title="关闭">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="memory-detail-body">
          <div class="memory-detail-content">
            <div class="memory-detail-empty">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
              <p>选择一条记忆查看详情</p>
            </div>
          </div>
          <div class="memory-detail-related" style="display: none;">
            <div class="memory-detail-related-header">
              <h3 class="memory-detail-related-title">相关记忆</h3>
            </div>
            <div class="memory-detail-related-list"></div>
          </div>
        </div>
        <div class="memory-detail-loading" style="display: none;">
          <div class="memory-detail-loading-content">
            <svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
            </svg>
            <span>加载中...</span>
          </div>
        </div>
      </div>
    `;

    this.backdrop = this.container.querySelector('.memory-detail-backdrop');
    this.panel = this.container.querySelector('.memory-detail-panel');
    this.contentArea = this.container.querySelector('.memory-detail-content');
    this.relatedArea = this.container.querySelector('.memory-detail-related');
    this.relatedList = this.container.querySelector('.memory-detail-related-list');
    this.loadingElement = this.container.querySelector('.memory-detail-loading');
    this.closeBtn = this.container.querySelector('.memory-detail-close');
    this.editBtn = this.container.querySelector('.memory-detail-edit');
    this.shareBtn = this.container.querySelector('.memory-detail-share');
    this.deleteBtn = this.container.querySelector('.memory-detail-delete');
  }

  bindEvents() {
    this.closeBtn.addEventListener('click', () => {
      this.close();
    });

    this.backdrop.addEventListener('click', () => {
      this.close();
    });

    this.editBtn.addEventListener('click', () => {
      this.handleEdit();
    });

    this.shareBtn.addEventListener('click', () => {
      this.handleShare();
    });

    this.deleteBtn.addEventListener('click', () => {
      this.handleDelete();
    });

    this.relatedList.addEventListener('click', (e) => {
      const item = e.target.closest('.memory-detail-related-item');
      if (item) {
        const id = item.dataset.id;
        this.loadMemory(id);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  async loadMemory(id) {
    if (!id) return;

    this.showLoading();

    try {
      const memory = await api.get(`/api/muse/memories/${id}`);
      this.memory = memory;
      this.renderMemory();

      await this.loadRelatedMemories(id);
    } catch (error) {
      console.error('Failed to load memory:', error);
      this.showError(error.message);
    } finally {
      this.hideLoading();
    }
  }

  async loadRelatedMemories(id) {
    try {
      const results = await api.get(`/api/muse/memories/${id}/related`, { limit: 5 });
      this.relatedMemories = results.items || results || [];
      this.renderRelatedMemories();
    } catch (error) {
      console.error('Failed to load related memories:', error);
      this.relatedMemories = [];
    }
  }

  renderMemory() {
    if (!this.memory) {
      this.contentArea.innerHTML = `
        <div class="memory-detail-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <p>选择一条记忆查看详情</p>
        </div>
      `;
      return;
    }

    this.contentArea.innerHTML = `
      <div class="memory-detail-card">
        <div class="memory-detail-meta">
          <div class="memory-detail-priority priority-${(this.memory.priority || 'medium').toLowerCase()}">
            <span class="priority-dot"></span>
            <span class="priority-label">${this.getPriorityLabel(this.memory.priority)}</span>
          </div>
          <div class="memory-detail-badges">
            ${this.memory.tags && this.memory.tags.length > 0 ? `
              <div class="memory-detail-tags">
                ${this.memory.tags.map(tag => `
                  <span class="tag">${this.escapeHtml(tag)}</span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="memory-detail-text">
          ${this.renderMarkdown(this.memory.content)}
        </div>
        <div class="memory-detail-info">
          <div class="memory-detail-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <div class="memory-detail-info-content">
              <span class="memory-detail-info-label">来源</span>
              <span class="memory-detail-info-value">${this.escapeHtml(this.memory.source || '未知来源')}</span>
            </div>
          </div>
          <div class="memory-detail-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <div class="memory-detail-info-content">
              <span class="memory-detail-info-label">创建时间</span>
              <span class="memory-detail-info-value">${this.formatDateTime(this.memory.createdAt)}</span>
            </div>
          </div>
          ${this.memory.updatedAt ? `
            <div class="memory-detail-info-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              <div class="memory-detail-info-content">
                <span class="memory-detail-info-label">更新时间</span>
                <span class="memory-detail-info-value">${this.formatDateTime(this.memory.updatedAt)}</span>
              </div>
            </div>
          ` : ''}
          ${this.memory.id ? `
            <div class="memory-detail-info-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              <div class="memory-detail-info-content">
                <span class="memory-detail-info-label">ID</span>
                <span class="memory-detail-info-value memory-detail-id">${this.escapeHtml(this.memory.id)}</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderRelatedMemories() {
    if (this.relatedMemories.length === 0) {
      this.relatedArea.style.display = 'none';
      return;
    }

    this.relatedArea.style.display = 'block';
    this.relatedList.innerHTML = this.relatedMemories.map(memory => `
      <div class="memory-detail-related-item" data-id="${memory.id}">
        <div class="memory-detail-related-content">
          ${this.escapeHtml(this.truncateText(memory.content, 80))}
        </div>
        <div class="memory-detail-related-meta">
          <span class="memory-detail-related-source">${this.escapeHtml(memory.source || '未知来源')}</span>
          <span class="memory-detail-related-time">${this.formatTime(memory.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  renderMarkdown(content) {
    if (!content) return '';

    let html = this.escapeHtml(content);

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code class="memory-detail-code">$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h3 class="memory-detail-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="memory-detail-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="memory-detail-h1">$1</h1>');
    html = html.replace(/^- (.+)$/gm, '<li class="memory-detail-li">$1</li>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="memory-detail-li" value="$1">$2</li>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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

  formatDateTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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

  open(memoryId) {
    if (memoryId) {
      this.loadMemory(memoryId);
    }

    this.isOpen = true;
    this.container.classList.add('open');
    this.backdrop.classList.add('open');
    this.panel.classList.add('open');

    document.body.style.overflow = 'hidden';
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove('open');
    this.backdrop.classList.remove('open');
    this.panel.classList.remove('open');

    document.body.style.overflow = '';

    if (this.options.onClose) {
      this.options.onClose();
    }
  }

  showLoading() {
    this.loadingElement.style.display = 'flex';
    this.contentArea.style.display = 'none';
    this.relatedArea.style.display = 'none';
  }

  hideLoading() {
    this.loadingElement.style.display = 'none';
    this.contentArea.style.display = 'block';
  }

  showError(message) {
    this.contentArea.innerHTML = `
      <div class="memory-detail-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>加载失败：${this.escapeHtml(message)}</p>
        <button class="btn btn-primary memory-detail-retry">重试</button>
      </div>
    `;

    const retryBtn = this.contentArea.querySelector('.memory-detail-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (this.memory && this.memory.id) {
          this.loadMemory(this.memory.id);
        }
      });
    }

    this.hideLoading();
  }

  handleEdit() {
    if (this.memory && this.options.onEdit) {
      this.options.onEdit(this.memory);
    }
  }

  handleShare() {
    if (this.memory && this.options.onShare) {
      this.options.onShare(this.memory);
    }
  }

  async handleDelete() {
    if (!this.memory) return;

    if (!confirm('确定要删除这条记忆吗？此操作无法撤销。')) return;

    try {
      await api.delete(`/api/muse/memories/${this.memory.id}`);

      if (this.options.onDelete) {
        this.options.onDelete(this.memory.id);
      }

      this.close();
    } catch (error) {
      console.error('Failed to delete memory:', error);
      alert('删除失败：' + error.message);
    }
  }

  setMemory(memory) {
    this.memory = memory;
    this.renderMemory();
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.close();
    this.container.innerHTML = '';
  }
}

export default MemoryDetail;
