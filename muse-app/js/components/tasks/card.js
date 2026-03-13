import { emit } from '../../events.js';

const PRIORITY_COLORS = {
  critical: 'var(--priority-critical)',
  high: 'var(--priority-high)',
  medium: 'var(--priority-medium)',
  low: 'var(--priority-low)'
};

const PRIORITY_LABELS = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低'
};

class TaskCard {
  constructor(task, options = {}) {
    this.task = task;
    this.options = {
      onEdit: null,
      onDelete: null,
      onDragStart: null,
      onDragEnd: null,
      onClick: null,
      ...options
    };
    this.element = null;
    this.isDragging = false;
    this.menuOpen = false;
  }

  render() {
    this.element = document.createElement('div');
    this.element.className = 'task-card';
    this.element.setAttribute('data-task-id', this.task.id);
    this.element.setAttribute('draggable', 'true');
    
    this.element.innerHTML = `
      <div class="task-card-priority-bar" style="background-color: ${PRIORITY_COLORS[this.task.priority] || PRIORITY_COLORS.medium}"></div>
      <div class="task-card-content">
        <div class="task-card-header">
          <h4 class="task-card-title">${this.escapeHtml(this.task.title)}</h4>
          <div class="task-card-menu">
            <button class="task-card-menu-btn btn btn-ghost btn-icon btn-sm" aria-label="更多操作">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            <div class="task-card-dropdown">
              <button class="dropdown-item task-card-edit" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>编辑</span>
              </button>
              <button class="dropdown-item task-card-delete" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
        ${this.task.description ? `
          <p class="task-card-description">${this.escapeHtml(this.task.description)}</p>
        ` : ''}
        <div class="task-card-progress">
          <div class="progress progress-sm">
            <div class="progress-bar" style="width: ${this.task.progress || 0}%"></div>
          </div>
          <span class="task-card-progress-text">${this.task.progress || 0}%</span>
        </div>
        ${this.task.tags && this.task.tags.length > 0 ? `
          <div class="task-card-tags">
            ${this.task.tags.map(tag => `
              <span class="tag">${this.escapeHtml(tag)}</span>
            `).join('')}
          </div>
        ` : ''}
        <div class="task-card-footer">
          <div class="task-card-meta">
            ${this.task.dueDate ? `
              <span class="task-card-due-date">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${this.formatDate(this.task.dueDate)}
              </span>
            ` : ''}
            <span class="priority-indicator priority-${this.task.priority || 'medium'}">
              <span class="priority-dot"></span>
              ${PRIORITY_LABELS[this.task.priority] || '中'}
            </span>
          </div>
          <div class="task-card-drag-handle" aria-label="拖拽手柄">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="5" r="1"/>
              <circle cx="9" cy="12" r="1"/>
              <circle cx="9" cy="19" r="1"/>
              <circle cx="15" cy="5" r="1"/>
              <circle cx="15" cy="12" r="1"/>
              <circle cx="15" cy="19" r="1"/>
            </svg>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    return this.element;
  }

  bindEvents() {
    const menuBtn = this.element.querySelector('.task-card-menu-btn');
    const dropdown = this.element.querySelector('.task-card-dropdown');
    const editBtn = this.element.querySelector('.task-card-edit');
    const deleteBtn = this.element.querySelector('.task-card-delete');

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeMenu();
      if (this.options.onEdit) {
        this.options.onEdit(this.task);
      }
      emit('task:edit', { task: this.task });
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeMenu();
      if (this.options.onDelete) {
        this.options.onDelete(this.task);
      }
      emit('task:delete', { task: this.task });
    });

    this.element.addEventListener('click', (e) => {
      if (!e.target.closest('.task-card-menu')) {
        if (this.options.onClick) {
          this.options.onClick(this.task);
        }
        emit('task:click', { task: this.task });
      }
    });

    this.element.addEventListener('dragstart', (e) => {
      this.isDragging = true;
      this.element.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.task.id);
      
      if (this.options.onDragStart) {
        this.options.onDragStart(this.task, e);
      }
      emit('task:dragStart', { task: this.task, event: e });
    });

    this.element.addEventListener('dragend', (e) => {
      this.isDragging = false;
      this.element.classList.remove('dragging');
      
      if (this.options.onDragEnd) {
        this.options.onDragEnd(this.task, e);
      }
      emit('task:dragEnd', { task: this.task, event: e });
    });

    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target)) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    const dropdown = this.element.querySelector('.task-card-dropdown');
    const menuBtn = this.element.querySelector('.task-card-menu-btn');
    
    if (this.menuOpen) {
      dropdown.classList.add('open');
      menuBtn.classList.add('active');
    } else {
      dropdown.classList.remove('open');
      menuBtn.classList.remove('active');
    }
  }

  closeMenu() {
    this.menuOpen = false;
    const dropdown = this.element.querySelector('.task-card-dropdown');
    const menuBtn = this.element.querySelector('.task-card-menu-btn');
    dropdown.classList.remove('open');
    menuBtn.classList.remove('active');
  }

  update(task) {
    this.task = { ...this.task, ...task };
    const newElement = this.render();
    this.element.replaceWith(newElement);
    this.element = newElement;
  }

  setDragging(isDragging) {
    this.isDragging = isDragging;
    if (isDragging) {
      this.element.classList.add('dragging');
    } else {
      this.element.classList.remove('dragging');
    }
  }

  formatDate(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = d - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days === -1) return '昨天';
    if (days < -1) return `已过期 ${Math.abs(days)} 天`;
    if (days <= 7) return `${days} 天后`;

    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.element.remove();
  }
}

export { TaskCard, PRIORITY_COLORS, PRIORITY_LABELS };
