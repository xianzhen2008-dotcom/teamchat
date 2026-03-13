export class Modal {
  constructor(options = {}) {
    this.id = options.id || `modal-${Date.now()}`;
    this.title = options.title || '';
    this.content = options.content || '';
    this.size = options.size || 'md';
    this.onConfirm = options.onConfirm || null;
    this.onCancel = options.onCancel || null;
    this.confirmText = options.confirmText || '确定';
    this.cancelText = options.cancelText || '取消';
    this.showCancel = options.showCancel !== false;
    this.closeOnOverlay = options.closeOnOverlay !== false;
    this.element = null;
  }

  open() {
    if (this.element) {
      this.element.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    return this;
  }

  close() {
    if (this.element) {
      this.element.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => {
        this.element.remove();
        this.element = null;
      }, 300);
    }
    return this;
  }

  render() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = this.id;

    const modal = document.createElement('div');
    modal.className = `modal modal-${this.size}`;

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${this.title}</h3>
        <button class="modal-close" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        ${this.content}
      </div>
      <div class="modal-footer">
        ${this.showCancel ? `<button class="btn btn-ghost modal-cancel">${this.cancelText}</button>` : ''}
        <button class="btn btn-primary modal-confirm">${this.confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.element = overlay;

    this.bindEvents();
    requestAnimationFrame(() => this.open());

    return this;
  }

  bindEvents() {
    if (!this.element) return;

    const closeBtn = this.element.querySelector('.modal-close');
    const cancelBtn = this.element.querySelector('.modal-cancel');
    const confirmBtn = this.element.querySelector('.modal-confirm');
    const overlay = this.element;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.close();
        if (this.onCancel) this.onCancel();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.close();
        if (this.onCancel) this.onCancel();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (this.onConfirm) {
          const result = this.onConfirm();
          if (result !== false) {
            this.close();
          }
        } else {
          this.close();
        }
      });
    }

    if (this.closeOnOverlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.close();
          if (this.onCancel) this.onCancel();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.element) {
        this.close();
        if (this.onCancel) this.onCancel();
      }
    });
  }

  setContent(content) {
    this.content = content;
    if (this.element) {
      const body = this.element.querySelector('.modal-body');
      if (body) {
        body.innerHTML = content;
      }
    }
    return this;
  }

  static confirm(title, message, onConfirm) {
    const modal = new Modal({
      title,
      content: `<p>${message}</p>`,
      onConfirm,
      size: 'sm'
    });
    return modal.render();
  }

  static alert(title, message) {
    const modal = new Modal({
      title,
      content: `<p>${message}</p>`,
      showCancel: false,
      size: 'sm'
    });
    return modal.render();
  }
}

export default Modal;
