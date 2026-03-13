import app from '../../app.js';

class Header {
  constructor() {
    this.element = null;
    this.searchOpen = false;
    this.userMenuOpen = false;
    this.notificationsOpen = false;
    this.notificationCount = 3;
  }

  render() {
    this.element = document.createElement('header');
    this.element.className = 'app-header';
    this.element.innerHTML = this.getTemplate();
    this.bindEvents();
    return this.element;
  }

  getTemplate() {
    return `
      <div class="header-container">
        <div class="header-left">
          <button id="menuToggle" class="menu-toggle" aria-label="Toggle menu">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="logo">
            <svg class="logo-icon" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="var(--accent-primary)" stroke-width="2"/>
              <circle cx="16" cy="16" r="8" fill="var(--accent-primary)" opacity="0.3"/>
              <circle cx="16" cy="16" r="4" fill="var(--accent-primary)"/>
            </svg>
            <span class="logo-text">Muse</span>
          </div>
        </div>

        <div class="header-center">
          <button id="searchToggle" class="search-button" aria-label="Search">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span class="search-text">Search...</span>
            <kbd class="search-shortcut">
              <span class="shortcut-key">⌘</span>
              <span class="shortcut-key">K</span>
            </kbd>
          </button>
        </div>

        <div class="header-right">
          <button id="themeToggle" class="icon-button" aria-label="Toggle theme">
            <svg id="themeIcon" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          </button>

          <div class="notification-wrapper">
            <button id="notificationToggle" class="icon-button" aria-label="Notifications">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              ${this.notificationCount > 0 ? `<span class="notification-badge">${this.notificationCount}</span>` : ''}
            </button>
            <div id="notificationDropdown" class="dropdown notification-dropdown hidden">
              <div class="dropdown-header">
                <h3>Notifications</h3>
                <button class="text-button">Mark all read</button>
              </div>
              <div class="dropdown-content">
                <div class="notification-item unread">
                  <div class="notification-icon success">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  </div>
                  <div class="notification-content">
                    <p class="notification-text">Task "Design Review" completed</p>
                    <span class="notification-time">2 minutes ago</span>
                  </div>
                </div>
                <div class="notification-item unread">
                  <div class="notification-icon info">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                  </div>
                  <div class="notification-content">
                    <p class="notification-text">New memory added to collection</p>
                    <span class="notification-time">15 minutes ago</span>
                  </div>
                </div>
                <div class="notification-item">
                  <div class="notification-icon warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <div class="notification-content">
                    <p class="notification-text">Event "Team Meeting" in 1 hour</p>
                    <span class="notification-time">1 hour ago</span>
                  </div>
                </div>
              </div>
              <div class="dropdown-footer">
                <button class="text-button">View all notifications</button>
              </div>
            </div>
          </div>

          <div class="user-menu-wrapper">
            <button id="userMenuToggle" class="user-menu-button" aria-label="User menu">
              <div class="user-avatar">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=muse" alt="User avatar" />
              </div>
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>
            <div id="userMenuDropdown" class="dropdown user-dropdown hidden">
              <div class="dropdown-header user-header">
                <div class="user-avatar large">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=muse" alt="User avatar" />
                </div>
                <div class="user-info">
                  <p class="user-name">Muse User</p>
                  <p class="user-email">user@muse.app</p>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <div class="dropdown-menu">
                <button class="dropdown-item" data-action="profile">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span>Profile</span>
                </button>
                <button class="dropdown-item" data-action="settings">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                  </svg>
                  <span>Settings</span>
                </button>
                <button class="dropdown-item" data-action="help">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span>Help & Support</span>
                </button>
              </div>
              <div class="dropdown-divider"></div>
              <div class="dropdown-menu">
                <button class="dropdown-item danger" data-action="logout">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16,17 21,12 16,7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const searchToggle = this.element.querySelector('#searchToggle');
    const notificationToggle = this.element.querySelector('#notificationToggle');
    const userMenuToggle = this.element.querySelector('#userMenuToggle');
    const notificationDropdown = this.element.querySelector('#notificationDropdown');
    const userMenuDropdown = this.element.querySelector('#userMenuDropdown');

    searchToggle.addEventListener('click', () => this.openSearch());

    notificationToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNotifications();
    });

    userMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleUserMenu();
    });

    document.addEventListener('click', (e) => {
      if (!notificationDropdown.contains(e.target)) {
        this.closeNotifications();
      }
      if (!userMenuDropdown.contains(e.target)) {
        this.closeUserMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.openSearch();
      }
      if (e.key === 'Escape') {
        this.closeNotifications();
        this.closeUserMenu();
      }
    });

    const dropdownItems = this.element.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.handleUserAction(action);
      });
    });
  }

  openSearch() {
    const event = new CustomEvent('openSearch');
    document.dispatchEvent(event);
  }

  toggleNotifications() {
    this.notificationsOpen = !this.notificationsOpen;
    const dropdown = this.element.querySelector('#notificationDropdown');
    dropdown.classList.toggle('hidden', !this.notificationsOpen);
    if (this.notificationsOpen) {
      this.closeUserMenu();
    }
  }

  closeNotifications() {
    this.notificationsOpen = false;
    const dropdown = this.element.querySelector('#notificationDropdown');
    dropdown.classList.add('hidden');
  }

  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
    const dropdown = this.element.querySelector('#userMenuDropdown');
    dropdown.classList.toggle('hidden', !this.userMenuOpen);
    if (this.userMenuOpen) {
      this.closeNotifications();
    }
  }

  closeUserMenu() {
    this.userMenuOpen = false;
    const dropdown = this.element.querySelector('#userMenuDropdown');
    dropdown.classList.add('hidden');
  }

  handleUserAction(action) {
    this.closeUserMenu();
    const event = new CustomEvent('userAction', { detail: { action } });
    document.dispatchEvent(event);

    switch (action) {
      case 'profile':
        window.location.hash = '#/profile';
        break;
      case 'settings':
        window.location.hash = '#/settings';
        break;
      case 'logout':
        this.handleLogout();
        break;
    }
  }

  handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
      app.state.clearState();
      window.location.hash = '#/login';
    }
  }

  setNotificationCount(count) {
    this.notificationCount = count;
    const badge = this.element.querySelector('.notification-badge');
    if (count > 0) {
      if (badge) {
        badge.textContent = count;
      } else {
        const notificationToggle = this.element.querySelector('#notificationToggle');
        const newBadge = document.createElement('span');
        newBadge.className = 'notification-badge';
        newBadge.textContent = count;
        notificationToggle.appendChild(newBadge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  destroy() {
    this.element.remove();
  }
}

export { Header };
