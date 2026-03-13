import { Modal } from './components/modal.js';

const routes = {
  '/dashboard': {
    title: '仪表盘',
    template: 'dashboard'
  },
  '/tasks': {
    title: '任务',
    template: 'tasks'
  },
  '/memory': {
    title: '记忆',
    template: 'memory'
  },
  '/events': {
    title: '事件',
    template: 'events'
  },
  '/settings': {
    title: '设置',
    template: 'settings'
  }
};

export class Router {
  constructor(app) {
    this.app = app;
    this.currentRoute = null;
    this.content = document.getElementById('content');
    this.data = {
      tasks: [],
      memories: [],
      events: [],
      stats: null
    };
  }
  
  navigate(hash) {
    const path = hash ? hash.replace('#', '') : '/dashboard';
    const route = routes[path];
    
    if (route) {
      this.currentRoute = path;
      this.updateActiveNav(path);
      this.app.setPageTitle(route.title);
      this.render(route);
    } else {
      this.navigate('#/dashboard');
    }
  }
  
  updateActiveNav(path) {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      const itemPath = href ? href.replace('#', '') : '';
      item.classList.toggle('active', itemPath === path);
    });
  }
  
  async render(route) {
    if (!this.content) return;
    
    this.content.style.opacity = '0';
    this.showLoading();
    
    try {
      await this.fetchData(route.template);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    }
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    this.content.innerHTML = this.getTemplate(route.template);
    this.content.style.opacity = '1';
    this.hideLoading();
    
    this.bindEvents(route.template);
    this.initAnimations();
  }
  
  showLoading() {
    let loader = document.getElementById('page-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'page-loader';
      loader.className = 'page-loader';
      loader.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
  }
  
  hideLoading() {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.style.display = 'none';
    }
  }
  
  async fetchData(template) {
    const apiBase = 'http://localhost:18788';
    
    try {
      if (template === 'dashboard' || template === 'tasks') {
        const res = await fetch(`${apiBase}/api/muse/tasks`);
        if (res.ok) {
          this.data.tasks = await res.json();
        }
      }
      
      if (template === 'dashboard' || template === 'memory') {
        const res = await fetch(`${apiBase}/api/muse/memories?limit=50`);
        if (res.ok) {
          this.data.memories = await res.json();
        }
      }
      
      if (template === 'dashboard' || template === 'events') {
        const res = await fetch(`${apiBase}/api/muse/events`);
        if (res.ok) {
          this.data.events = await res.json();
        }
      }
    } catch (e) {
      console.error('API fetch error:', e);
    }
  }
  
  bindEvents(template) {
    this.bindButtonEvents(template);
    this.bindCardEvents(template);
    this.bindSettingsEvents(template);
  }
  
  bindButtonEvents(template) {
    const createTaskBtn = this.content.querySelector('.btn-primary');
    if (createTaskBtn) {
      createTaskBtn.addEventListener('click', () => {
        if (template === 'tasks') {
          this.showTaskForm();
        } else if (template === 'memory') {
          this.showMemoryForm();
        } else if (template === 'events') {
          this.showEventForm();
        } else {
          this.showTaskForm();
        }
      });
    }
  }
  
  bindCardEvents(template) {
    if (template === 'dashboard') {
      const cards = this.content.querySelectorAll('.stat-card');
      cards.forEach((card, index) => {
        card.addEventListener('click', () => {
          const routes = ['#/tasks', '#/tasks', '#/tasks', '#/tasks'];
          if (routes[index]) {
            window.location.hash = routes[index];
          }
        });
      });
    }
  }
  
  bindSettingsEvents(template) {
    if (template === 'settings') {
      const darkModeToggle = this.content.querySelector('#darkModeToggle');
      if (darkModeToggle) {
        darkModeToggle.checked = document.documentElement.getAttribute('data-theme') !== 'light';
        darkModeToggle.addEventListener('change', (e) => {
          const theme = e.target.checked ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('muse-theme', theme);
        });
      }
    }
  }
  
  showTaskForm() {
    const modal = new Modal({
      title: '新建任务',
      size: 'md',
      confirmText: '创建',
      content: `
        <form id="taskForm" class="form">
          <div class="form-group">
            <label class="form-label">任务标题</label>
            <input type="text" class="form-input" id="taskTitle" placeholder="输入任务标题" required>
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea class="form-input form-textarea" id="taskDesc" placeholder="输入任务描述" rows="3"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">优先级</label>
              <select class="form-input form-select" id="taskPriority">
                <option value="low">低</option>
                <option value="medium" selected>中</option>
                <option value="high">高</option>
                <option value="critical">紧急</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">复杂度</label>
              <select class="form-input form-select" id="taskComplexity">
                <option value="1">1 - 简单</option>
                <option value="2">2 - 一般</option>
                <option value="3" selected>3 - 中等</option>
                <option value="4">4 - 复杂</option>
                <option value="5">5 - 困难</option>
              </select>
            </div>
          </div>
        </form>
      `,
      onConfirm: async () => {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
          this.app.toast('请输入任务标题', 'error');
          return false;
        }
        
        const task = {
          title,
          description: document.getElementById('taskDesc').value.trim(),
          priority: document.getElementById('taskPriority').value,
          complexity: parseInt(document.getElementById('taskComplexity').value),
          status: 'pending'
        };
        
        try {
          const res = await fetch('http://localhost:18788/api/muse/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
          });
          
          if (res.ok) {
            this.app.toast('任务创建成功', 'success');
            this.navigate('#/tasks');
          } else {
            this.app.toast('创建失败', 'error');
          }
        } catch (e) {
          this.app.toast('网络错误', 'error');
        }
      }
    });
    modal.render();
  }
  
  showMemoryForm() {
    const modal = new Modal({
      title: '添加记忆',
      size: 'md',
      confirmText: '保存',
      content: `
        <form id="memoryForm" class="form">
          <div class="form-group">
            <label class="form-label">记忆内容</label>
            <textarea class="form-input form-textarea" id="memoryContent" placeholder="输入记忆内容" rows="4" required></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">优先级</label>
              <select class="form-input form-select" id="memoryPriority">
                <option value="low">低</option>
                <option value="medium" selected>中</option>
                <option value="high">高</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">标签</label>
              <input type="text" class="form-input" id="memoryTags" placeholder="用逗号分隔">
            </div>
          </div>
        </form>
      `,
      onConfirm: async () => {
        const content = document.getElementById('memoryContent').value.trim();
        if (!content) {
          this.app.toast('请输入记忆内容', 'error');
          return false;
        }
        
        const memory = {
          content,
          priority: document.getElementById('memoryPriority').value,
          tags: document.getElementById('memoryTags').value.split(',').map(t => t.trim()).filter(t => t)
        };
        
        try {
          const res = await fetch('http://localhost:18788/api/muse/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(memory)
          });
          
          if (res.ok) {
            this.app.toast('记忆保存成功', 'success');
            this.navigate('#/memory');
          } else {
            this.app.toast('保存失败', 'error');
          }
        } catch (e) {
          this.app.toast('网络错误', 'error');
        }
      }
    });
    modal.render();
  }
  
  showEventForm() {
    const modal = new Modal({
      title: '添加事件',
      size: 'md',
      confirmText: '保存',
      content: `
        <form id="eventForm" class="form">
          <div class="form-group">
            <label class="form-label">事件名称</label>
            <input type="text" class="form-input" id="eventName" placeholder="输入事件名称" required>
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea class="form-input form-textarea" id="eventDesc" placeholder="输入事件描述" rows="3"></textarea>
          </div>
        </form>
      `,
      onConfirm: async () => {
        const name = document.getElementById('eventName').value.trim();
        if (!name) {
          this.app.toast('请输入事件名称', 'error');
          return false;
        }
        
        const event = {
          name,
          description: document.getElementById('eventDesc').value.trim()
        };
        
        try {
          const res = await fetch('http://localhost:18788/api/muse/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          });
          
          if (res.ok) {
            this.app.toast('事件保存成功', 'success');
            this.navigate('#/events');
          } else {
            this.app.toast('保存失败', 'error');
          }
        } catch (e) {
          this.app.toast('网络错误', 'error');
        }
      }
    });
    modal.render();
  }
  
  getTemplate(template) {
    const templates = {
      dashboard: this.getDashboardTemplate(),
      tasks: this.getTasksTemplate(),
      memory: this.getMemoryTemplate(),
      events: this.getEventsTemplate(),
      settings: this.getSettingsTemplate()
    };
    
    return templates[template] || templates.dashboard;
  }
  
  getDashboardTemplate() {
    const tasks = this.data.tasks || [];
    const memories = this.data.memories || [];
    const events = this.data.events || [];
    
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const highPriorityTasks = tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length;
    
    return `
      <div class="content-header">
        <div>
          <h2 class="content-title">欢迎回来</h2>
          <p class="content-subtitle">这是您的 Muse 工作空间</p>
        </div>
        <button class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建任务
        </button>
      </div>
      
      <div class="grid grid-auto-fit">
        <div class="card card-glass animate-fadeInUp clickable stat-card">
          <div class="card-body">
            <div class="flex items-center gap-md">
              <div class="avatar avatar-lg" style="background-color: var(--accent-primary);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              </div>
              <div>
                <h3 class="text-primary">${pendingTasks}</h3>
                <p class="text-secondary text-sm">待完成任务</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card card-glass animate-fadeInUp animate-delay-100 clickable stat-card">
          <div class="card-body">
            <div class="flex items-center gap-md">
              <div class="avatar avatar-lg" style="background-color: var(--accent-success);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <h3 class="text-primary">${completedTasks}</h3>
                <p class="text-secondary text-sm">已完成任务</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card card-glass animate-fadeInUp animate-delay-200 clickable stat-card">
          <div class="card-body">
            <div class="flex items-center gap-md">
              <div class="avatar avatar-lg" style="background-color: var(--accent-warning);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <h3 class="text-primary">${inProgressTasks}</h3>
                <p class="text-secondary text-sm">进行中</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card card-glass animate-fadeInUp animate-delay-300 clickable stat-card">
          <div class="card-body">
            <div class="flex items-center gap-md">
              <div class="avatar avatar-lg" style="background-color: var(--accent-danger);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div>
                <h3 class="text-primary">${highPriorityTasks}</h3>
                <p class="text-secondary text-sm">高优先级</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">近期任务</h3>
          <a href="#/tasks" class="text-accent">查看全部</a>
        </div>
        <div class="card">
          <div class="card-body">
            ${tasks.length > 0 ? this.renderTaskList(tasks.slice(0, 5)) : `
              <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <h4 class="empty-state-title">暂无任务</h4>
                <p class="empty-state-description">点击上方"新建任务"按钮创建您的第一个任务</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }
  
  renderTaskList(tasks) {
    return `
      <div class="task-list">
        ${tasks.map(task => `
          <div class="task-item priority-${task.priority || 'medium'}" data-id="${task.id}">
            <div class="task-item-header">
              <span class="task-title">${this.escapeHtml(task.title)}</span>
              <span class="badge badge-${this.getStatusBadge(task.status)}">${this.getStatusText(task.status)}</span>
            </div>
            ${task.description ? `<p class="task-desc">${this.escapeHtml(task.description)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  getStatusBadge(status) {
    const badges = {
      pending: 'warning',
      in_progress: 'primary',
      completed: 'success',
      cancelled: 'secondary'
    };
    return badges[status] || 'secondary';
  }
  
  getStatusText(status) {
    const texts = {
      pending: '待处理',
      in_progress: '进行中',
      completed: '已完成',
      cancelled: '已取消'
    };
    return texts[status] || status;
  }
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  getTasksTemplate() {
    const tasks = this.data.tasks || [];
    
    return `
      <div class="content-header">
        <div>
          <h2 class="content-title">任务管理</h2>
          <p class="content-subtitle">管理您的所有任务</p>
        </div>
        <button class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建任务
        </button>
      </div>
      
      ${tasks.length > 0 ? `
        <div class="task-grid">
          ${tasks.map(task => `
            <div class="card task-card priority-${task.priority || 'medium'}" data-id="${task.id}">
              <div class="card-body">
                <div class="task-header">
                  <h4 class="task-title">${this.escapeHtml(task.title)}</h4>
                  <span class="badge badge-${this.getStatusBadge(task.status)}">${this.getStatusText(task.status)}</span>
                </div>
                ${task.description ? `<p class="task-description">${this.escapeHtml(task.description)}</p>` : ''}
                <div class="task-meta">
                  <span class="priority-indicator priority-${task.priority || 'medium'}">
                    <span class="priority-dot"></span>
                    ${task.priority || 'medium'}
                  </span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              <h4 class="empty-state-title">暂无任务</h4>
              <p class="empty-state-description">创建您的第一个任务开始使用</p>
            </div>
          </div>
        </div>
      `}
    `;
  }
  
  getMemoryTemplate() {
    const memories = this.data.memories || [];
    
    return `
      <div class="content-header">
        <div>
          <h2 class="content-title">记忆库</h2>
          <p class="content-subtitle">存储和检索重要信息</p>
        </div>
        <button class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          添加记忆
        </button>
      </div>
      
      ${memories.length > 0 ? `
        <div class="memory-grid">
          ${memories.map(memory => `
            <div class="card memory-card" data-id="${memory.id}">
              <div class="card-body">
                <p class="memory-content">${this.escapeHtml(memory.content || memory.key)}</p>
                <div class="memory-meta">
                  <span class="text-secondary text-sm">${memory.created_at || ''}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2z"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <h4 class="empty-state-title">暂无记忆</h4>
              <p class="empty-state-description">添加您的第一条记忆</p>
            </div>
          </div>
        </div>
      `}
    `;
  }
  
  getEventsTemplate() {
    const events = this.data.events || [];
    
    return `
      <div class="content-header">
        <div>
          <h2 class="content-title">事件日志</h2>
          <p class="content-subtitle">查看所有事件记录</p>
        </div>
        <button class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          添加事件
        </button>
      </div>
      
      ${events.length > 0 ? `
        <div class="timeline">
          ${events.map(event => `
            <div class="timeline-item" data-id="${event.id}">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <h4 class="timeline-title">${this.escapeHtml(event.name || event.event)}</h4>
                ${event.description ? `<p class="timeline-desc">${this.escapeHtml(event.description)}</p>` : ''}
                <span class="timeline-time text-secondary text-sm">${event.created_at || event.timestamp || ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h4 class="empty-state-title">暂无事件</h4>
              <p class="empty-state-description">添加您的第一个事件</p>
            </div>
          </div>
        </div>
      `}
    `;
  }
  
  getSettingsTemplate() {
    return `
      <div class="content-header">
        <div>
          <h2 class="content-title">设置</h2>
          <p class="content-subtitle">自定义您的应用体验</p>
        </div>
      </div>
      
      <div class="grid grid-cols-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">外观</h3>
          </div>
          <div class="card-body">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-primary">深色模式</p>
                <p class="text-secondary text-sm">切换应用主题</p>
              </div>
              <label class="switch">
                <input type="checkbox" class="switch-input" id="darkModeToggle">
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">通知</h3>
          </div>
          <div class="card-body">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-primary">推送通知</p>
                <p class="text-secondary text-sm">接收任务提醒</p>
              </div>
              <label class="switch">
                <input type="checkbox" class="switch-input" checked>
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  initAnimations() {
    const animatedElements = this.content.querySelectorAll('[data-animate]');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1
    });
    
    animatedElements.forEach(el => observer.observe(el));
  }
}
