import api from '../../services/api.js';

const PRIORITIES = [
  { value: 'critical', label: '紧急', color: 'var(--priority-critical)' },
  { value: 'high', label: '高', color: 'var(--priority-high)' },
  { value: 'medium', label: '中', color: 'var(--priority-medium)' },
  { value: 'low', label: '低', color: 'var(--priority-low)' }
];

export class MemoryForm {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      onSubmit: null,
      onCancel: null,
      memory: null,
      ...options
    };

    this.isEditing = !!this.options.memory;
    this.formData = {
      content: this.options.memory?.content || '',
      priority: this.options.memory?.priority || 'medium',
      tags: this.options.memory?.tags || [],
      source: this.options.memory?.source || ''
    };
    this.tagInput = '';
    this.isSubmitting = false;
    this.isOpen = false;

    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="memory-form-backdrop"></div>
      <div class="memory-form-modal">
        <div class="memory-form-header">
          <h2 class="memory-form-title">${this.isEditing ? '编辑记忆' : '添加记忆'}</h2>
          <button class="memory-form-close btn btn-ghost btn-icon btn-sm" title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form class="memory-form-body">
          <div class="memory-form-group input-group">
            <label class="memory-form-label" for="memoryContent">
              内容 <span class="memory-form-required">*</span>
            </label>
            <textarea 
              id="memoryContent" 
              class="memory-form-textarea" 
              placeholder="输入记忆内容，支持 Markdown 格式..."
              rows="6"
              required
            >${this.escapeHtml(this.formData.content)}</textarea>
            <div class="memory-form-hint">
              支持 Markdown 格式：**粗体**、*斜体*、`代码`、# 标题等
            </div>
            <div class="memory-form-error" style="display: none;"></div>
          </div>

          <div class="memory-form-group input-group">
            <label class="memory-form-label" for="memoryPriority">优先级</label>
            <div class="memory-form-priority">
              ${PRIORITIES.map(p => `
                <label class="memory-form-priority-item ${this.formData.priority === p.value ? 'selected' : ''}" data-priority="${p.value}">
                  <input type="radio" name="priority" value="${p.value}" ${this.formData.priority === p.value ? 'checked' : ''}>
                  <span class="memory-form-priority-dot" style="background-color: ${p.color};"></span>
                  <span class="memory-form-priority-label">${p.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="memory-form-group input-group">
            <label class="memory-form-label" for="memoryTags">标签</label>
            <div class="memory-form-tags">
              <div class="memory-form-tags-list">
                ${this.formData.tags.map(tag => `
                  <span class="tag tag-removable">
                    ${this.escapeHtml(tag)}
                    <button type="button" class="tag-remove" data-tag="${this.escapeHtml(tag)}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </span>
                `).join('')}
              </div>
              <div class="memory-form-tags-input-wrapper">
                <input 
                  type="text" 
                  id="memoryTagInput" 
                  class="memory-form-tags-input" 
                  placeholder="输入标签后按 Enter 添加"
                />
              </div>
            </div>
            <div class="memory-form-hint">按 Enter 键添加标签</div>
          </div>

          <div class="memory-form-group input-group">
            <label class="memory-form-label" for="memorySource">来源</label>
            <input 
              type="text" 
              id="memorySource" 
              class="memory-form-input" 
              placeholder="例如：会议记录、读书笔记、灵感..."
              value="${this.escapeHtml(this.formData.source)}"
            />
          </div>
        </form>
        <div class="memory-form-footer">
          <button type="button" class="btn btn-secondary memory-form-cancel">取消</button>
          <button type="submit" class="btn btn-primary memory-form-submit" form="memoryFormBody">
            <span class="memory-form-submit-text">${this.isEditing ? '保存修改' : '添加记忆'}</span>
            <svg class="memory-form-submit-loading animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.backdrop = this.container.querySelector('.memory-form-backdrop');
    this.modal = this.container.querySelector('.memory-form-modal');
    this.form = this.container.querySelector('.memory-form-body');
    this.closeBtn = this.container.querySelector('.memory-form-close');
    this.cancelBtn = this.container.querySelector('.memory-form-cancel');
    this.submitBtn = this.container.querySelector('.memory-form-submit');
    this.contentInput = this.container.querySelector('#memoryContent');
    this.priorityInputs = this.container.querySelectorAll('input[name="priority"]');
    this.tagsList = this.container.querySelector('.memory-form-tags-list');
    this.tagInputField = this.container.querySelector('#memoryTagInput');
    this.sourceInput = this.container.querySelector('#memorySource');
    this.errorDisplay = this.container.querySelector('.memory-form-error');
  }

  bindEvents() {
    this.closeBtn.addEventListener('click', () => {
      this.close();
    });

    this.cancelBtn.addEventListener('click', () => {
      this.close();
    });

    this.backdrop.addEventListener('click', () => {
      this.close();
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    this.contentInput.addEventListener('input', (e) => {
      this.formData.content = e.target.value;
      this.validateContent();
    });

    this.priorityInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        this.formData.priority = e.target.value;
        this.updatePrioritySelection();
      });
    });

    this.tagInputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addTag(e.target.value);
      }
    });

    this.tagsList.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.tag-remove');
      if (removeBtn) {
        const tag = removeBtn.dataset.tag;
        this.removeTag(tag);
      }
    });

    this.sourceInput.addEventListener('input', (e) => {
      this.formData.source = e.target.value;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  updatePrioritySelection() {
    const items = this.container.querySelectorAll('.memory-form-priority-item');
    items.forEach(item => {
      const isSelected = item.dataset.priority === this.formData.priority;
      item.classList.toggle('selected', isSelected);
    });
  }

  addTag(tag) {
    const normalizedTag = tag.trim().toLowerCase();

    if (!normalizedTag) return;
    if (this.formData.tags.includes(normalizedTag)) {
      this.tagInputField.value = '';
      return;
    }
    if (this.formData.tags.length >= 10) {
      alert('最多添加 10 个标签');
      return;
    }

    this.formData.tags.push(normalizedTag);
    this.renderTags();
    this.tagInputField.value = '';
  }

  removeTag(tag) {
    this.formData.tags = this.formData.tags.filter(t => t !== tag);
    this.renderTags();
  }

  renderTags() {
    this.tagsList.innerHTML = this.formData.tags.map(tag => `
      <span class="tag tag-removable">
        ${this.escapeHtml(tag)}
        <button type="button" class="tag-remove" data-tag="${this.escapeHtml(tag)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </span>
    `).join('');
  }

  validateContent() {
    const content = this.formData.content.trim();

    if (!content) {
      this.showError('请输入记忆内容');
      return false;
    }

    if (content.length < 10) {
      this.showError('记忆内容至少需要 10 个字符');
      return false;
    }

    if (content.length > 10000) {
      this.showError('记忆内容不能超过 10000 个字符');
      return false;
    }

    this.hideError();
    return true;
  }

  showError(message) {
    this.errorDisplay.textContent = message;
    this.errorDisplay.style.display = 'block';
    this.contentInput.classList.add('error');
  }

  hideError() {
    this.errorDisplay.style.display = 'none';
    this.contentInput.classList.remove('error');
  }

  async handleSubmit() {
    if (!this.validateContent()) return;
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.setSubmitting(true);

    try {
      const data = {
        content: this.formData.content.trim(),
        priority: this.formData.priority,
        tags: this.formData.tags,
        source: this.formData.source.trim() || '手动添加'
      };

      let result;
      if (this.isEditing && this.options.memory) {
        result = await api.put(`/api/muse/memories/${this.options.memory.id}`, data);
      } else {
        result = await api.addMemory(data);
      }

      if (this.options.onSubmit) {
        this.options.onSubmit(result);
      }

      this.close();
    } catch (error) {
      console.error('Failed to submit memory:', error);
      this.showError(error.message || '提交失败，请重试');
    } finally {
      this.isSubmitting = false;
      this.setSubmitting(false);
    }
  }

  setSubmitting(submitting) {
    this.submitBtn.disabled = submitting;
    const textEl = this.submitBtn.querySelector('.memory-form-submit-text');
    const loadingEl = this.submitBtn.querySelector('.memory-form-submit-loading');

    if (submitting) {
      textEl.textContent = this.isEditing ? '保存中...' : '添加中...';
      loadingEl.style.display = 'inline-block';
    } else {
      textEl.textContent = this.isEditing ? '保存修改' : '添加记忆';
      loadingEl.style.display = 'none';
    }
  }

  open() {
    this.isOpen = true;
    this.container.classList.add('open');
    this.backdrop.classList.add('open');
    this.modal.classList.add('open');

    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      this.contentInput.focus();
    }, 100);
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove('open');
    this.backdrop.classList.remove('open');
    this.modal.classList.remove('open');

    document.body.style.overflow = '';

    if (this.options.onCancel) {
      this.options.onCancel();
    }
  }

  reset() {
    this.formData = {
      content: '',
      priority: 'medium',
      tags: [],
      source: ''
    };

    this.contentInput.value = '';
    this.sourceInput.value = '';
    this.tagInputField.value = '';

    const mediumRadio = this.container.querySelector('input[value="medium"]');
    if (mediumRadio) {
      mediumRadio.checked = true;
    }
    this.updatePrioritySelection();

    this.renderTags();
    this.hideError();
  }

  setMemory(memory) {
    this.options.memory = memory;
    this.isEditing = !!memory;

    this.formData = {
      content: memory?.content || '',
      priority: memory?.priority || 'medium',
      tags: memory?.tags || [],
      source: memory?.source || ''
    };

    this.contentInput.value = this.formData.content;
    this.sourceInput.value = this.formData.source;

    const priorityRadio = this.container.querySelector(`input[value="${this.formData.priority}"]`);
    if (priorityRadio) {
      priorityRadio.checked = true;
    }
    this.updatePrioritySelection();

    this.renderTags();

    const titleEl = this.container.querySelector('.memory-form-title');
    if (titleEl) {
      titleEl.textContent = this.isEditing ? '编辑记忆' : '添加记忆';
    }

    const submitTextEl = this.submitBtn.querySelector('.memory-form-submit-text');
    if (submitTextEl) {
      submitTextEl.textContent = this.isEditing ? '保存修改' : '添加记忆';
    }
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

export default MemoryForm;
