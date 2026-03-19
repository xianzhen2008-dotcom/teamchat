import app from '../../app.js';

class Navigation {
  constructor() {
    this.element = null;
    this.activeTab = 'dashboard';
    this.tabs = [
      {
        id: 'dashboard',
        label: 'Home',
        icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
        route: '#/dashboard'
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
        route: '#/memory'
      },
      {
        id: 'tasks',
        label: 'Tasks',
        icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
        route: '#/tasks',
        badge: 5
      },
      {
        id: 'events',
        label: 'Events',
        icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        route: '#/events'
      }
    ];
  }

  render() {
    this.element = document.createElement('nav');
    this.element.className = 'app-navigation';
    this.element.setAttribute('role', 'navigation');
    this.element.setAttribute('aria-label', 'Main navigation');
    this.element.innerHTML = this.getTemplate();
    this.bindEvents();
    this.updateActiveFromRoute();
    return this.element;
  }

  getTemplate() {
    return `
      <div class="navigation-container">
        ${this.tabs.map(tab => this.renderTab(tab)).join('')}
      </div>
    `;
  }

  renderTab(tab) {
    const isActive = this.activeTab === tab.id;
    return `
      <a href="${tab.route}" 
         class="nav-tab${isActive ? ' active' : ''}" 
         data-id="${tab.id}"
         data-route="${tab.route}"
         role="tab"
         aria-selected="${isActive}"
         aria-label="${tab.label}">
        <div class="tab-icon-wrapper">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${tab.icon}
          </svg>
          ${tab.badge ? `<span class="tab-badge">${tab.badge}</span>` : ''}
        </div>
        <span class="tab-label">${tab.label}</span>
        <div class="tab-indicator"></div>
      </a>
    `;
  }

  bindEvents() {
    const tabs = this.element.querySelectorAll('.nav-tab');

    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const id = tab.dataset.id;
        this.setActive(id);
      });

      tab.addEventListener('touchstart', () => {
        tab.classList.add('touching');
      }, { passive: true });

      tab.addEventListener('touchend', () => {
        tab.classList.remove('touching');
      }, { passive: true });
    });

    window.addEventListener('hashchange', () => this.updateActiveFromRoute());

    this.checkVisibility();
    window.addEventListener('resize', () => this.checkVisibility());
  }

  setActive(id) {
    this.activeTab = id;
    const tabs = this.element.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      const isActive = tab.dataset.id === id;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });
  }

  updateActiveFromRoute() {
    const hash = window.location.hash || '#/dashboard';
    const route = hash.slice(1);
    const tab = this.tabs.find(t => t.route === hash || t.route === `#${route}`);
    if (tab) {
      this.setActive(tab.id);
    }
  }

  checkVisibility() {
    const width = window.innerWidth;
    
    if (width <= 768) {
      this.element.classList.remove('hidden');
    } else {
      this.element.classList.add('hidden');
    }
  }

  updateBadge(id, count) {
    const tab = this.element.querySelector(`.nav-tab[data-id="${id}"]`);
    if (tab) {
      let badge = tab.querySelector('.tab-badge');
      if (count > 0) {
        if (badge) {
          badge.textContent = count;
        } else {
          const iconWrapper = tab.querySelector('.tab-icon-wrapper');
          badge = document.createElement('span');
          badge.className = 'tab-badge';
          badge.textContent = count;
          iconWrapper.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  }

  show() {
    this.element.classList.remove('hidden');
  }

  hide() {
    this.element.classList.add('hidden');
  }

  destroy() {
    this.element.remove();
  }
}

export { Navigation };
