const STORAGE_PREFIX = 'muse_';

const STORAGE_KEYS = {
    MEMORIES: `${STORAGE_PREFIX}memories`,
    TASKS: `${STORAGE_PREFIX}tasks`,
    EVENTS: `${STORAGE_PREFIX}events`,
    SETTINGS: `${STORAGE_PREFIX}settings`,
    CACHE: `${STORAGE_PREFIX}cache`,
    USER: `${STORAGE_PREFIX}user`,
    SESSION: `${STORAGE_PREFIX}session`,
    ANALYTICS: `${STORAGE_PREFIX}analytics`
};

class StorageItem {
    constructor(value, ttl = null) {
        this.value = value;
        this.createdAt = Date.now();
        this.ttl = ttl;
        this.expiry = ttl ? this.createdAt + ttl : null;
    }

    isExpired() {
        if (!this.expiry) return false;
        return Date.now() > this.expiry;
    }

    toJSON() {
        return {
            value: this.value,
            createdAt: this.createdAt,
            ttl: this.ttl,
            expiry: this.expiry
        };
    }

    static fromJSON(json) {
        const item = new StorageItem(json.value, json.ttl);
        item.createdAt = json.createdAt;
        item.expiry = json.expiry;
        return item;
    }
}

class StorageService {
    constructor() {
        this.isAvailable = this.checkAvailability();
        this.listeners = new Map();
        this.setupStorageListener();
    }

    checkAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            console.warn('[Storage] localStorage not available');
            return false;
        }
    }

    setupStorageListener() {
        if (typeof window === 'undefined') return;

        window.addEventListener('storage', (event) => {
            if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;

            const key = event.key.replace(STORAGE_PREFIX, '');
            const listeners = this.listeners.get(key);

            if (listeners && listeners.size > 0) {
                const newValue = event.newValue ? this.parseValue(event.newValue) : null;
                const oldValue = event.oldValue ? this.parseValue(event.oldValue) : null;

                listeners.forEach(callback => {
                    try {
                        callback(newValue, oldValue, key);
                    } catch (error) {
                        console.error('[Storage] Listener error:', error);
                    }
                });
            }
        });
    }

    serialize(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            console.error('[Storage] Serialization error:', error);
            return null;
        }
    }

    deserialize(data) {
        try {
            return JSON.parse(data);
        } catch (error) {
            return data;
        }
    }

    parseValue(data) {
        if (!data) return null;

        const parsed = this.deserialize(data);
        if (parsed && typeof parsed === 'object' && 'value' in parsed && 'createdAt' in parsed) {
            const item = StorageItem.fromJSON(parsed);
            if (item.isExpired()) {
                return null;
            }
            return item.value;
        }

        return parsed;
    }

    get(key, defaultValue = null) {
        if (!this.isAvailable) return defaultValue;

        try {
            const item = localStorage.getItem(key);
            if (item === null) return defaultValue;

            return this.parseValue(item) ?? defaultValue;
        } catch (error) {
            console.warn(`[Storage] Failed to get ${key}:`, error);
            return defaultValue;
        }
    }

    set(key, value, ttl = null) {
        if (!this.isAvailable) return false;

        try {
            const storageItem = new StorageItem(value, ttl);
            const serialized = this.serialize(storageItem.toJSON());

            if (serialized === null) return false;

            localStorage.setItem(key, serialized);
            return true;
        } catch (error) {
            console.warn(`[Storage] Failed to set ${key}:`, error);

            if (error.name === 'QuotaExceededError') {
                this.handleQuotaExceeded();
                return this.set(key, value, ttl);
            }

            return false;
        }
    }

    remove(key) {
        if (!this.isAvailable) return false;

        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn(`[Storage] Failed to remove ${key}:`, error);
            return false;
        }
    }

    has(key) {
        if (!this.isAvailable) return false;

        try {
            const item = localStorage.getItem(key);
            if (item === null) return false;

            const parsed = this.parseValue(item);
            return parsed !== null;
        } catch (error) {
            return false;
        }
    }

    clear(prefix = STORAGE_PREFIX) {
        if (!this.isAvailable) return false;

        try {
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (error) {
            console.warn('[Storage] Failed to clear:', error);
            return false;
        }
    }

    handleQuotaExceeded() {
        console.warn('[Storage] Quota exceeded, attempting cleanup...');

        this.removeExpired();

        const cacheKey = STORAGE_KEYS.CACHE;
        this.remove(cacheKey);
    }

    removeExpired() {
        if (!this.isAvailable) return 0;

        let removed = 0;

        try {
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith(STORAGE_PREFIX)) continue;

                try {
                    const item = localStorage.getItem(key);
                    if (item) {
                        const parsed = this.deserialize(item);
                        if (parsed && typeof parsed === 'object' && 'expiry' in parsed) {
                            if (Date.now() > parsed.expiry) {
                                keysToRemove.push(key);
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                removed++;
            });
        } catch (error) {
            console.warn('[Storage] Failed to remove expired items:', error);
        }

        return removed;
    }

    subscribe(key, callback) {
        const normalizedKey = key.replace(STORAGE_PREFIX, '');

        if (!this.listeners.has(normalizedKey)) {
            this.listeners.set(normalizedKey, new Set());
        }

        this.listeners.get(normalizedKey).add(callback);

        return () => {
            const listeners = this.listeners.get(normalizedKey);
            if (listeners) {
                listeners.delete(callback);
                if (listeners.size === 0) {
                    this.listeners.delete(normalizedKey);
                }
            }
        };
    }

    unsubscribe(key, callback) {
        const normalizedKey = key.replace(STORAGE_PREFIX, '');
        const listeners = this.listeners.get(normalizedKey);

        if (listeners) {
            listeners.delete(callback);
        }
    }

    getSize() {
        if (!this.isAvailable) return 0;

        let total = 0;

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    const value = localStorage.getItem(key);
                    if (value) {
                        total += key.length * 2 + value.length * 2;
                    }
                }
            }
        } catch (error) {
            console.warn('[Storage] Failed to calculate size:', error);
        }

        return total;
    }

    getSizeFormatted() {
        const bytes = this.getSize();
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    getKeys() {
        if (!this.isAvailable) return [];

        const keys = [];

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    keys.push(key);
                }
            }
        } catch (error) {
            console.warn('[Storage] Failed to get keys:', error);
        }

        return keys;
    }

    getMemories() {
        return this.get(STORAGE_KEYS.MEMORIES, []);
    }

    setMemories(memories) {
        return this.set(STORAGE_KEYS.MEMORIES, memories);
    }

    addMemory(memory) {
        const memories = this.getMemories();
        memories.unshift({
            ...memory,
            id: memory.id || Date.now().toString(),
            createdAt: memory.createdAt || new Date().toISOString()
        });
        return this.setMemories(memories.slice(0, 1000));
    }

    updateMemory(id, updates) {
        const memories = this.getMemories();
        const index = memories.findIndex(m => m.id === id);
        if (index !== -1) {
            memories[index] = { ...memories[index], ...updates, updatedAt: new Date().toISOString() };
            return this.setMemories(memories);
        }
        return false;
    }

    deleteMemory(id) {
        const memories = this.getMemories();
        const filtered = memories.filter(m => m.id !== id);
        return this.setMemories(filtered);
    }

    getTasks() {
        return this.get(STORAGE_KEYS.TASKS, []);
    }

    setTasks(tasks) {
        return this.set(STORAGE_KEYS.TASKS, tasks);
    }

    addTask(task) {
        const tasks = this.getTasks();
        tasks.unshift({
            ...task,
            id: task.id || Date.now().toString(),
            createdAt: task.createdAt || new Date().toISOString(),
            status: task.status || 'pending'
        });
        return this.setTasks(tasks.slice(0, 500));
    }

    updateTask(id, updates) {
        const tasks = this.getTasks();
        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            tasks[index] = { ...tasks[index], ...updates, updatedAt: new Date().toISOString() };
            return this.setTasks(tasks);
        }
        return false;
    }

    deleteTask(id) {
        const tasks = this.getTasks();
        const filtered = tasks.filter(t => t.id !== id);
        return this.setTasks(filtered);
    }

    getEvents() {
        return this.get(STORAGE_KEYS.EVENTS, []);
    }

    setEvents(events) {
        return this.set(STORAGE_KEYS.EVENTS, events);
    }

    addEvent(event) {
        const events = this.getEvents();
        events.unshift({
            ...event,
            id: event.id || Date.now().toString(),
            timestamp: event.timestamp || new Date().toISOString()
        });
        return this.setEvents(events.slice(0, 500));
    }

    getSettings() {
        return this.get(STORAGE_KEYS.SETTINGS, {});
    }

    setSettings(settings) {
        return this.set(STORAGE_KEYS.SETTINGS, settings);
    }

    updateSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        return this.setSettings(settings);
    }

    getSession() {
        return this.get(STORAGE_KEYS.SESSION, null);
    }

    setSession(session) {
        return this.set(STORAGE_KEYS.SESSION, session, 24 * 60 * 60 * 1000);
    }

    clearSession() {
        return this.remove(STORAGE_KEYS.SESSION);
    }

    getUser() {
        return this.get(STORAGE_KEYS.USER, null);
    }

    setUser(user) {
        return this.set(STORAGE_KEYS.USER, user);
    }

    clearUser() {
        return this.remove(STORAGE_KEYS.USER);
    }
}

const storageService = new StorageService();

export { StorageService, StorageItem, STORAGE_KEYS, STORAGE_PREFIX };
export default storageService;
