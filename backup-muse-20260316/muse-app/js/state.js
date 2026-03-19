class State {
  constructor() {
    this.state = {
      user: null,
      tasks: [],
      memories: [],
      events: [],
      settings: {
        theme: 'dark',
        notifications: true,
        sidebarCollapsed: false
      }
    };
    
    this.listeners = new Map();
    this.loadState();
  }
  
  get(key) {
    return key ? this.state[key] : this.state;
  }
  
  set(key, value) {
    if (typeof key === 'object') {
      this.state = { ...this.state, ...key };
    } else {
      this.state[key] = value;
    }
    
    this.saveState();
    this.notify(key);
  }
  
  update(key, updates) {
    if (this.state[key] && typeof this.state[key] === 'object') {
      this.state[key] = { ...this.state[key], ...updates };
      this.saveState();
      this.notify(key);
    }
  }
  
  push(key, item) {
    if (Array.isArray(this.state[key])) {
      this.state[key].push(item);
      this.saveState();
      this.notify(key);
    }
  }
  
  remove(key, id) {
    if (Array.isArray(this.state[key])) {
      this.state[key] = this.state[key].filter(item => item.id !== id);
      this.saveState();
      this.notify(key);
    }
  }
  
  find(key, id) {
    if (Array.isArray(this.state[key])) {
      return this.state[key].find(item => item.id === id);
    }
    return null;
  }
  
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    return () => {
      this.listeners.get(key).delete(callback);
    };
  }
  
  notify(key) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(callback => {
        callback(this.state[key]);
      });
    }
  }
  
  saveState() {
    try {
      const serialized = JSON.stringify(this.state);
      localStorage.setItem('muse-state', serialized);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }
  
  loadState() {
    try {
      const serialized = localStorage.getItem('muse-state');
      if (serialized) {
        this.state = { ...this.state, ...JSON.parse(serialized) };
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }
  
  clearState() {
    this.state = {
      user: null,
      tasks: [],
      memories: [],
      events: [],
      settings: {
        theme: 'dark',
        notifications: true,
        sidebarCollapsed: false
      }
    };
    localStorage.removeItem('muse-state');
    this.notify('all');
  }
  
  reset() {
    this.clearState();
  }
}

export { State };
