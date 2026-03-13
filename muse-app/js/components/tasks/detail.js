import { emit } from '../../events.js';
import { PRIORITY_LABELS } from './card.js';

const STATUS_LABELS = {
  pending: '待处理',
  'in-progress': '进行中',
  completed: '已完成',
  cancelled: '已取消'
};

class TaskDetail {
  constructor(task, options = {}) {
    this.task = task;
    this.options = {
      onClose: null,
      onEdit: null,
      onDelete: null,
      onSubtaskToggle: null,
      onProgressChange: null,
      ...options
    };
    this.element = null;
    this.isOpen = false;
  }

  render() {
    this.element = document.createElement('div');
    this.element.className = 'task-detail-overlay';

    this.element.innerHTML = `
      <div class="task-detail-backdrop"></div>
      <div class="task-detail-panel">
        <div class="task-detail-header">
          <div class="task-detail-header-content">
            <span class="task-detail-status status-${this.task.status}">
              <span class="status-dot"></span>
              ${STATUS_LABELS[this.task.status] || '未知'}
            </span>
            <h2 class="task-detail-title">${this.escapeHtml(this.task.title)}</h2>
          </div>
          <button class="task-detail-close btn btn-ghost btn-icon" aria-label="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        <div class="task-detail-body">
          <div class="task-detail-section">
            <h3 class="task-detail-section-title">描述</h3>
            <div class="task-detail-description">
              ${this.task.description ? this.escapeHtml(this.task.description) : '<span class="text-muted">暂无描述</span>'}
            </div>
          </div>

          <div class="task-detail-section">
            <h3 class="task-detail-section-title">进度</h3>
            <div class="task-detail-progress">
              <div class="progress progress-lg">
                <div class="progress-bar" style="width: ${this.task.progress || 0}%"></div>
              </div>
              <div class="task-detail-progress-controls">
                <input type="range" class="task-detail-progress-slider" min="0" max="100" value="${this.task.progress || 0}">
                <span class="task-detail-progress-value">${this.task.progress || 0}%</span>
              </div>
            </div>
          </div>

          ${this.task.subtasks && this.task.subtasks.length > 0 ? `
            <div class="task-detail-section">
              <h3 class="task-detail-section-title">子任务 (${this.getCompletedSubtasks()}/${this.task.subtasks.length})</h3>
              <ul class="task-detail-subtasks">
                ${this.task.subtasks.map((subtask, index) => `
                  <li class="task-detail-subtask ${subtask.completed ? 'completed' : ''}">
                    <label class="checkbox">
                      <input type="checkbox" ${subtask.completed ? 'checked' : ''} data-subtask-index="${index}">
                      <span class="checkbox-label">${this.escapeHtml(subtask.title)}</span>
                    </label>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${this.task.memories && this.task.memories.length > 0 ? `
            <div class="task-detail-section">
              <h3 class="task-detail-section-title">关联记忆</h3>
              <div class="task-detail-memories">
                ${this.task.memories.map(memory => `
                  <div class="task-detail-memory card card-glass">
                    <div class="task-detail-memory-content">
                      <p>${this.escapeHtml(memory.content)}</p>
                      <span class="task-detail-memory-time">${this.formatDateTime(memory.timestamp)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${this.task.history && this.task.history.length > 0 ? `
            <div class="task-detail-section">
              <h3 class="task-detail-section-title">操作历史</h3>
              <ul class="task-detail-history">
                ${this.task.history.map(item => `
                  <li class="task-detail-history-item">
                    <div class="task-detail-history-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </div>
                    <div class="task-detail-history-content">
                      <p>${this.escapeHtml(item.action)}</p>
                      <span class="task-detail-history-time">${this.formatDateTime(item.timestamp)}</span>
                    </div>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          <div class="task-detail-section task-detail-meta-section">
            <div class="task-detail-meta-item">
              <span class="task-detail-meta-label">优先级</span>
              <span class="priority-indicator priority-${this.task.priority || 'medium'}">
                <span class="priority-dot"></span>
                ${PRIORITY_LABELS[this.task.priority] || '中'}
              </span>
            </div>
            ${this.task.dueDate ? `
              <div class="task-detail-meta-item">
                <span class="task-detail-meta-label">截止日期</span>
                <span>${this.formatDate(this.task.dueDate)}</span>
              </div>
            ` : ''}
            ${this.task.complexity ? `
              <div class="task-detail-meta-item">
                <span class="task-detail-meta-label">复杂度</span>
                <span>${'★'.repeat(this.task.complexity)}${'☆'.repeat(5 - this.task.complexity)}</span>
              </div>
            ` : ''}
            ${this.task.tags && this.task.tags.length > 0 ? `
              <div class="task-detail-meta-item">
                <span class="task-detail-meta-label">标签</span>
                <div class="task-detail-tags">
                  ${this.task.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="task-detail-footer">
          <button class="btn btn-danger task-detail-delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            删除任务
          </button>
          <button class="btn btn-primary task-detail-edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            编辑任务
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
    return this.element;
  }

  bindEvents() {
    const backdrop = this.element.querySelector('.task-detail-backdrop');
    const closeBtn = this.element.querySelector('.task-detail-close');
    const editBtn = this.element.querySelector('.task-detail-edit');
    const deleteBtn = this.element.querySelector('.task-detail-delete');
    const progressSlider = this.element.querySelector('.task-detail-progress-slider');
    const subtaskCheckboxes = this.element.querySelectorAll('.task-detail-subtask input[type="checkbox"]');

    backdrop.addEventListener('click', () => this.close());
    closeBtn.addEventListener('click', () => this.close());

    editBtn.addEventListener('click', () => {
      if (this.options.onEdit) {
        this.options.onEdit(this.task);
      }
      emit('task:edit', { task: this.task });
    });

    deleteBtn.addEventListener('click', () => {
      if (confirm('确定要删除这个任务吗？')) {
        if (this.options.onDelete) {
          this.options.onDelete(this.task);
        }
        emit('task:delete', { task: this.task });
        this.close();
      }
    });

    if (progressSlider) {
      progressSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        this.updateProgress(value);
        
        if (this.options.onProgressChange) {
          this.options.onProgressChange(this.task, value);
        }
        emit('task:progressChange', { task: this.task, progress: value });
      });
    }

    subtaskCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.subtaskIndex, 10);
        this.toggleSubtask(index, e.target.checked);
        
        if (this.options.onSubtaskToggle) {
          this.options.onSubtaskToggle(this.task, index, e.target.checked);
        }
        emit('task:subtaskToggle', { task: this.task, index, completed: e.target.checked });
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  updateProgress(value) {
    this.task.progress = value;
    
    const progressBar = this.element.querySelector('.task-detail-progress .progress-bar');
    const progressValue = this.element.querySelector('.task-detail-progress-value');
    
    if (progressBar) {
      progressBar.style.width = `${value}%`;
    }
    if (progressValue) {
      progressValue.textContent = `${value}%`;
    }
  }

  toggleSubtask(index, completed) {
    if (this.task.subtasks && this.task.subtasks[index]) {
      this.task.subtasks[index].completed = completed;
      
      const subtaskItem = this.element.querySelectorAll('.task-detail-subtask')[index];
      if (subtaskItem) {
        subtaskItem.classList.toggle('completed', completed);
      }

      const sectionTitle = this.element.querySelector('.task-detail-section-title');
      if (sectionTitle && sectionTitle.textContent.includes('子任务')) {
        sectionTitle.textContent = `子任务 (${this.getCompletedSubtasks()}/${this.task.subtasks.length})`;
      }
    }
  }

  getCompletedSubtasks() {
    if (!this.task.subtasks) return 0;
    return this.task.subtasks.filter(s => s.completed).length;
  }

  open() {
    if (!this.element) {
      this.render();
    }
    
    document.body.appendChild(this.element);
    document.body.style.overflow = 'hidden';
    
    requestAnimationFrame(() => {
      this.element.classList.add('open');
      this.isOpen = true;
    });
  }

  close() {
    this.element.classList.remove('open');
    this.isOpen = false;
    
    setTimeout(() => {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      document.body.style.overflow = '';
      
      if (this.options.onClose) {
        this.options.onClose();
      }
    }, 300);
  }

  update(task) {
    this.task = { ...this.task, ...task };
    const newElement = this.render();
    if (this.element.parentNode) {
      this.element.replaceWith(newElement);
    }
    this.element = newElement;
  }

  formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    document.body.style.overflow = '';
  }
}

export { TaskDetail, STATUS_LABELS };
