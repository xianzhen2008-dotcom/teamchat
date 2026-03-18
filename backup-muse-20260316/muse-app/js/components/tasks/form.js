import { emit } from '../../events.js';
import { PRIORITY_LABELS } from './card.js';

const COMPLEXITY_LEVELS = [1, 2, 3, 4, 5];

class TaskForm {
  constructor(options = {}) {
    this.options = {
      task: null,
      status: 'pending',
      onSubmit: null,
      onCancel: null,
      ...options
    };
    this.element = null;
    this.isOpen = false;
    this.formData = {
      title: '',
      description: '',
      priority: 'medium',
      complexity: 3,
      tags: [],
      dueDate: '',
      status: this.options.status
    };
    this.errors = {};
    this.tagInput = '';
  }

  render() {
    const isEditing = this.options.task !== null;
    
    if (isEditing) {
      this.formData = { ...this.formData, ...this.options.task };
    }

    this.element = document.createElement('div');
    this.element.className = 'task-form-overlay';

    this.element.innerHTML = `
      <div class="task-form-backdrop"></div>
      <div class="task-form-modal modal">
        <div class="modal-header">
          <h2 class="modal-title">${isEditing ? '编辑任务' : '创建任务'}</h2>
          <button class="modal-close task-form-close" aria-label="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        <form class="task-form" novalidate>
          <div class="modal-body">
            <div class="input-group ${this.errors.title ? 'error' : ''}">
              <label for="taskTitle">标题 <span class="required">*</span></label>
              <input 
                type="text" 
                id="taskTitle" 
                class="task-form-title" 
                placeholder="输入任务标题"
                value="${this.escapeHtml(this.formData.title)}"
                required
              >
              ${this.errors.title ? `<span class="input-error">${this.errors.title}</span>` : ''}
            </div>

            <div class="input-group">
              <label for="taskDescription">描述</label>
              <textarea 
                id="taskDescription" 
                class="task-form-description" 
                placeholder="输入任务描述（支持 Markdown）"
                rows="4"
              >${this.escapeHtml(this.formData.description)}</textarea>
              <span class="input-hint">支持 Markdown 格式</span>
            </div>

            <div class="task-form-row">
              <div class="input-group">
                <label>优先级</label>
                <div class="task-form-priority">
                  ${Object.entries(PRIORITY_LABELS).map(([key, label]) => `
                    <label class="task-form-priority-option ${this.formData.priority === key ? 'selected' : ''}">
                      <input type="radio" name="priority" value="${key}" ${this.formData.priority === key ? 'checked' : ''}>
                      <span class="priority-indicator priority-${key}">
                        <span class="priority-dot"></span>
                        ${label}
                      </span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div class="input-group">
                <label>复杂度</label>
                <div class="task-form-complexity">
                  ${COMPLEXITY_LEVELS.map(level => `
                    <button type="button" class="task-form-complexity-star ${this.formData.complexity >= level ? 'active' : ''}" data-value="${level}">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="${this.formData.complexity >= level ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </button>
                  `).join('')}
                  <span class="task-form-complexity-label">${this.formData.complexity}/5</span>
                </div>
              </div>
            </div>

            <div class="input-group">
              <label for="taskTags">标签</label>
              <div class="task-form-tags-input">
                <div class="task-form-tags-list">
                  ${this.formData.tags.map(tag => `
                    <span class="tag tag-removable" data-tag="${this.escapeHtml(tag)}">
                      ${this.escapeHtml(tag)}
                      <span class="tag-remove">×</span>
                    </span>
                  `).join('')}
                </div>
                <input 
                  type="text" 
                  id="taskTags" 
                  class="task-form-tag-input" 
                  placeholder="输入标签后按回车添加"
                  value="${this.escapeHtml(this.tagInput)}"
                >
              </div>
              <span class="input-hint">按回车添加标签，点击 × 删除标签</span>
            </div>

            <div class="task-form-row">
              <div class="input-group">
                <label for="taskDueDate">截止日期</label>
                <input 
                  type="date" 
                  id="taskDueDate" 
                  class="task-form-due-date"
                  value="${this.formData.dueDate}"
                >
              </div>

              <div class="input-group">
                <label for="taskStatus">状态</label>
                <select id="taskStatus" class="task-form-status">
                  <option value="pending" ${this.formData.status === 'pending' ? 'selected' : ''}>待处理</option>
                  <option value="in-progress" ${this.formData.status === 'in-progress' ? 'selected' : ''}>进行中</option>
                  <option value="completed" ${this.formData.status === 'completed' ? 'selected' : ''}>已完成</option>
                  <option value="cancelled" ${this.formData.status === 'cancelled' ? 'selected' : ''}>已取消</option>
                </select>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary task-form-cancel">取消</button>
            <button type="submit" class="btn btn-primary task-form-submit">
              ${isEditing ? '保存更改' : '创建任务'}
            </button>
          </div>
        </form>
      </div>
    `;

    this.bindEvents();
    return this.element;
  }

  bindEvents() {
    const backdrop = this.element.querySelector('.task-form-backdrop');
    const closeBtn = this.element.querySelector('.task-form-close');
    const cancelBtn = this.element.querySelector('.task-form-cancel');
    const form = this.element.querySelector('.task-form');
    const titleInput = this.element.querySelector('.task-form-title');
    const priorityInputs = this.element.querySelectorAll('input[name="priority"]');
    const complexityStars = this.element.querySelectorAll('.task-form-complexity-star');
    const tagInput = this.element.querySelector('.task-form-tag-input');
    const tagRemoveButtons = this.element.querySelectorAll('.tag-remove');

    backdrop.addEventListener('click', () => this.close());
    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.close());

    titleInput.addEventListener('input', (e) => {
      this.formData.title = e.target.value;
      this.clearError('title');
    });

    const descriptionInput = this.element.querySelector('.task-form-description');
    descriptionInput.addEventListener('input', (e) => {
      this.formData.description = e.target.value;
    });

    priorityInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        this.formData.priority = e.target.value;
        this.updatePrioritySelection();
      });
    });

    complexityStars.forEach(star => {
      star.addEventListener('click', (e) => {
        e.preventDefault();
        const value = parseInt(star.dataset.value, 10);
        this.formData.complexity = value;
        this.updateComplexityDisplay();
      });
    });

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = tagInput.value.trim();
        if (tag && !this.formData.tags.includes(tag)) {
          this.addTag(tag);
          tagInput.value = '';
        }
      }
    });

    tagRemoveButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tagElement = e.target.closest('.tag');
        const tag = tagElement.dataset.tag;
        this.removeTag(tag);
      });
    });

    const dueDateInput = this.element.querySelector('.task-form-due-date');
    dueDateInput.addEventListener('change', (e) => {
      this.formData.dueDate = e.target.value;
    });

    const statusSelect = this.element.querySelector('.task-form-status');
    statusSelect.addEventListener('change', (e) => {
      this.formData.status = e.target.value;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  updatePrioritySelection() {
    const options = this.element.querySelectorAll('.task-form-priority-option');
    options.forEach(option => {
      const input = option.querySelector('input');
      option.classList.toggle('selected', input.value === this.formData.priority);
    });
  }

  updateComplexityDisplay() {
    const stars = this.element.querySelectorAll('.task-form-complexity-star');
    stars.forEach(star => {
      const value = parseInt(star.dataset.value, 10);
      const isActive = value <= this.formData.complexity;
      star.classList.toggle('active', isActive);
      
      const svg = star.querySelector('svg');
      svg.setAttribute('fill', isActive ? 'currentColor' : 'none');
    });

    const label = this.element.querySelector('.task-form-complexity-label');
    label.textContent = `${this.formData.complexity}/5`;
  }

  addTag(tag) {
    if (!this.formData.tags.includes(tag)) {
      this.formData.tags.push(tag);
      this.renderTags();
    }
  }

  removeTag(tag) {
    this.formData.tags = this.formData.tags.filter(t => t !== tag);
    this.renderTags();
  }

  renderTags() {
    const tagsList = this.element.querySelector('.task-form-tags-list');
    tagsList.innerHTML = this.formData.tags.map(tag => `
      <span class="tag tag-removable" data-tag="${this.escapeHtml(tag)}">
        ${this.escapeHtml(tag)}
        <span class="tag-remove">×</span>
      </span>
    `).join('');

    const tagRemoveButtons = tagsList.querySelectorAll('.tag-remove');
    tagRemoveButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tagElement = e.target.closest('.tag');
        const tag = tagElement.dataset.tag;
        this.removeTag(tag);
      });
    });
  }

  validate() {
    this.errors = {};

    if (!this.formData.title.trim()) {
      this.errors.title = '请输入任务标题';
    } else if (this.formData.title.length > 100) {
      this.errors.title = '标题长度不能超过100个字符';
    }

    if (this.formData.dueDate) {
      const dueDate = new Date(this.formData.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dueDate < today && !this.options.task) {
        this.errors.dueDate = '截止日期不能早于今天';
      }
    }

    return Object.keys(this.errors).length === 0;
  }

  clearError(field) {
    delete this.errors[field];
    const inputGroup = this.element.querySelector(`#${field === 'title' ? 'taskTitle' : 'taskDueDate'}`).closest('.input-group');
    if (inputGroup) {
      inputGroup.classList.remove('error');
      const errorElement = inputGroup.querySelector('.input-error');
      if (errorElement) {
        errorElement.remove();
      }
    }
  }

  showErrors() {
    Object.entries(this.errors).forEach(([field, message]) => {
      const inputId = field === 'title' ? 'taskTitle' : 'taskDueDate';
      const inputGroup = this.element.querySelector(`#${inputId}`).closest('.input-group');
      
      if (inputGroup) {
        inputGroup.classList.add('error');
        
        let errorElement = inputGroup.querySelector('.input-error');
        if (!errorElement) {
          errorElement = document.createElement('span');
          errorElement.className = 'input-error';
          inputGroup.appendChild(errorElement);
        }
        errorElement.textContent = message;
      }
    });
  }

  handleSubmit() {
    if (!this.validate()) {
      this.showErrors();
      return;
    }

    const taskData = {
      id: this.options.task?.id || this.generateId(),
      title: this.formData.title.trim(),
      description: this.formData.description.trim(),
      priority: this.formData.priority,
      complexity: this.formData.complexity,
      tags: [...this.formData.tags],
      dueDate: this.formData.dueDate,
      status: this.formData.status,
      progress: this.options.task?.progress || 0,
      subtasks: this.options.task?.subtasks || [],
      memories: this.options.task?.memories || [],
      history: this.options.task?.history || [],
      createdAt: this.options.task?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (this.options.onSubmit) {
      this.options.onSubmit(taskData);
    }

    if (this.options.task) {
      emit('task:updated', { task: taskData });
    } else {
      emit('task:created', { task: taskData });
    }

    this.close();
  }

  generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  open() {
    if (!this.element) {
      this.render();
    }
    
    document.body.appendChild(this.element);
    document.body.style.overflow = 'hidden';
    
    requestAnimationFrame(() => {
      this.element.classList.add('open');
      this.element.querySelector('.modal').classList.add('open');
      this.isOpen = true;
      
      const titleInput = this.element.querySelector('.task-form-title');
      if (titleInput) {
        titleInput.focus();
      }
    });
  }

  close() {
    this.element.classList.remove('open');
    this.element.querySelector('.modal').classList.remove('open');
    this.isOpen = false;
    
    setTimeout(() => {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      document.body.style.overflow = '';
      
      if (this.options.onCancel) {
        this.options.onCancel();
      }
    }, 300);
  }

  reset() {
    this.formData = {
      title: '',
      description: '',
      priority: 'medium',
      complexity: 3,
      tags: [],
      dueDate: '',
      status: this.options.status
    };
    this.errors = {};
    this.tagInput = '';
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

export { TaskForm, COMPLEXITY_LEVELS };
