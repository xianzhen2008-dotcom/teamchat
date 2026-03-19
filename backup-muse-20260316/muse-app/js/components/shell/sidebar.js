import app from '../../app.js';

class Sidebar {
  constructor() {
    this.element = null;
    this.collapsed = false;
    this.activeItem = 'dashboard';
    this.menuItems = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
        route: '#/dashboard',
        shortcut: '⌘D'
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
        route: '#/memory',
        shortcut: '⌘M'
      },
      {
        id: 'tasks',
        label: 'Tasks',
        icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
        route: '#/tasks',
        shortcut: '⌘T',
        badge: 5
      },
      {
        id: 'events',
        label: 'Events',
        icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        route: '#/events',
        shortcut: '⌘E'
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
        route: '#/analytics',
        shortcut: '⌘A'
      }
    ];
    this.bottomItems = [
      {
        id: 'settings',
        label: 'Settings',
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>',
        route: '#/settings',
        shortcut: '⌘,'
      }
    ];
  }

  render() {
    this.element = document.createElement('aside');
    this.element.id = 'sidebar';
    this.element.className = 'app-sidebar';
    this.element.innerHTML = this.getTemplate();
    this.bindEvents();
    this.updateActiveFromRoute();
    return this.element;
  }

  getTemplate() {
    return `
      <div class="sidebar-content">
        <nav class="sidebar-nav">
          <ul class="nav-list">
            ${this.menuItems.map(item => this.renderMenuItem(item)).join('')}
          </ul>
        </nav>

        <div class="sidebar-bottom">
          <ul class="nav-list">
            ${this.bottomItems.map(item => this.renderMenuItem(item)).join('')}
          </ul>
          <button id="sidebarToggle" class="sidebar-toggle" aria-label="Toggle sidebar">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="sidebar-overlay"></div>
    `;
  }

  renderMenuItem(item) {
    const isActive = this.activeItem === item.id;
    return `
      <li class="nav-item${isActive ? ' active' : ''}" data-id="${item.id}">
        <a href="${item.route}" class="nav-link" data-route="${item.route}">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${item.icon}
          </svg>
          <span class="nav-label">${item.label}</span>
          ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
          <span class="nav-shortcut">${item.shortcut}</span>
        </a>
        <div class="active-indicator"></div>
      </li>
    `;
  }

  bindEvents() {
    const sidebarToggle = this.element.querySelector('#sidebarToggle');
    const overlay = this.element.querySelector('.sidebar-overlay');
    const navLinks = this.element.querySelectorAll('.nav-link');

    sidebarToggle.addEventListener('click', () => this.toggle());

    overlay.addEventListener('click', () => this.closeMobile());

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        const navItem = link.closest('.nav-item');
        const id = navItem.dataset.id;
        this.setActive(id);
        
        if (window.innerWidth <= 992) {
          this.closeMobile();
        }
      });
    });

    window.addEventListener('hashchange', () => this.updateActiveFromRoute());

    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        const shortcuts = {
          'd': 'dashboard',
          'm': 'memory',
          't': 'tasks',
          'e': 'events',
          'a': 'analytics',
          ',': 'settings'
        };

        const key = e.key.toLowerCase();
        if (shortcuts[key]) {
          e.preventDefault();
          const item = [...this.menuItems, ...this.bottomItems].find(i => i.id === shortcuts[key]);
          if (item) {
            window.location.hash = item.route;
          }
        }

        if (e.key === 'b') {
          e.preventDefault();
          this.toggle();
        }
      }
    });

    this.checkResponsive();
    window.addEventListener('resize', () => this.checkResponsive());
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.element.classList.toggle('collapsed', this.collapsed);
    app.state.update('settings', { sidebarCollapsed: this.collapsed });

    const toggleIcon = this.element.querySelector('.sidebar-toggle .icon');
    if (toggleIcon) {
      toggleIcon.style.transform = this.collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

  collapse() {
    this.collapsed = true;
    this.element.classList.add('collapsed');
    app.state.update('settings', { sidebarCollapsed: true });
  }

  expand() {
    this.collapsed = false;
    this.element.classList.remove('collapsed');
    app.state.update('settings', { sidebarCollapsed: false });
  }

  openMobile() {
    this.element.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  closeMobile() {
    this.element.classList.remove('open');
    document.body.style.overflow = '';
  }

  setActive(id) {
    this.activeItem = id;
    const navItems = this.element.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.id === id);
    });
  }

  updateActiveFromRoute() {
    const hash = window.location.hash || '#/dashboard';
    const route = hash.slice(1);
    const allItems = [...this.menuItems, ...this.bottomItems];
    const item = allItems.find(i => i.route === hash || i.route === `#${route}`);
    if (item) {
      this.setActive(item.id);
    }
  }

  checkResponsive() {
    const width = window.innerWidth;
    
    if (width <= 768) {
      this.element.classList.add('mobile');
    } else {
      this.element.classList.remove('mobile');
      this.closeMobile();
    }

    if (width <= 992 && width > 768) {
      if (!this.collapsed) {
        this.collapse();
      }
    }
  }

  updateBadge(id, count) {
    const navItem = this.element.querySelector(`.nav-item[data-id="${id}"]`);
    if (navItem) {
      let badge = navItem.querySelector('.nav-badge');
      if (count > 0) {
        if (badge) {
          badge.textContent = count;
        } else {
          const navLink = navItem.querySelector('.nav-link');
          badge = document.createElement('span');
          badge.className = 'nav-badge';
          badge.textContent = count;
          navLink.insertBefore(badge, navLink.querySelector('.nav-shortcut'));
        }
      } else if (badge) {
        badge.remove();
      }
    }
  }

  destroy() {
    this.element.remove();
  }
}

export { Sidebar };
