import { Router } from './router.js';
import { State } from './state.js';

class App {
  constructor() {
    this.router = null;
    this.state = null;
    this.theme = 'dark';
    this.sidebarCollapsed = false;
    
    this.init();
  }
  
  async init() {
    this.state = new State();
    this.router = new Router(this);
    
    this.loadTheme();
    this.bindEvents();
    this.hideLoading();
    
    this.router.navigate(window.location.hash || '#/dashboard');
  }
  
  loadTheme() {
    const savedTheme = localStorage.getItem('muse-theme') || 'dark';
    this.setTheme(savedTheme);
  }
  
  setTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('muse-theme', theme);
    this.updateThemeIcon();
  }
  
  toggleTheme() {
    const newTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }
  
  updateThemeIcon() {
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
      if (this.theme === 'dark') {
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
      } else {
        themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      }
    }
  }
  
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
    }
  }
  
  toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('open');
    }
  }
  
  bindEvents() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }
    
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => this.toggleSidebar());
    }
    
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => this.toggleMobileSidebar());
    }
    
    window.addEventListener('hashchange', () => {
      this.router.navigate(window.location.hash);
    });
    
    window.addEventListener('resize', () => {
      if (window.innerWidth > 992) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          sidebar.classList.remove('open');
        }
      }
    });
    
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      const menuToggle = document.getElementById('menuToggle');
      
      if (
        sidebar &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !menuToggle.contains(e.target)
      ) {
        sidebar.classList.remove('open');
      }
    });
  }
  
  hideLoading() {
    const loading = document.getElementById('appLoading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(() => {
        loading.remove();
      }, 300);
    }
  }
  
  setPageTitle(title) {
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
      pageTitle.textContent = title;
    }
    document.title = `${title} - Muse App`;
  }
}

const app = new App();

export default app;
