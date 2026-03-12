const STORAGE_KEYS = {
    HISTORY: 'team_chat_history',
    THEME: 'team_chat_theme',
    SESSION: 'team_chat_session',
    AVATAR_CACHE: 'team_chat_avatar_cache',
    MESSAGE_QUEUE: 'team_chat_message_queue',
    GREETED: 'team_chat_greeted'
};

class StorageService {
    constructor() {
        this.isAvailable = this.checkAvailability();
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

    get(key, defaultValue = null) {
        if (!this.isAvailable) return defaultValue;

        try {
            const item = localStorage.getItem(key);
            if (item === null) return defaultValue;

            try {
                return JSON.parse(item);
            } catch (e) {
                return item;
            }
        } catch (e) {
            console.warn(`[Storage] Failed to get ${key}:`, e);
            return defaultValue;
        }
    }

    set(key, value) {
        if (!this.isAvailable) return false;

        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, serialized);
            return true;
        } catch (e) {
            console.warn(`[Storage] Failed to set ${key}:`, e);

            if (e.name === 'QuotaExceededError') {
                this.handleQuotaExceeded();
            }
            return false;
        }
    }

    remove(key) {
        if (!this.isAvailable) return false;

        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn(`[Storage] Failed to remove ${key}:`, e);
            return false;
        }
    }

    clear() {
        if (!this.isAvailable) return false;

        try {
            Object.values(STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            return true;
        } catch (e) {
            console.warn('[Storage] Failed to clear:', e);
            return false;
        }
    }

    handleQuotaExceeded() {
        console.warn('[Storage] Quota exceeded, attempting cleanup...');

        this.remove(STORAGE_KEYS.AVATAR_CACHE);

        const history = this.get(STORAGE_KEYS.HISTORY, []);
        if (history.length > 100) {
            this.set(STORAGE_KEYS.HISTORY, history.slice(-100));
        }
    }

    getHistory() {
        return this.get(STORAGE_KEYS.HISTORY, []);
    }

    setHistory(history) {
        const toSave = Array.isArray(history) ? history.slice(-1000) : [];
        return this.set(STORAGE_KEYS.HISTORY, toSave);
    }

    appendHistory(message) {
        const history = this.getHistory();
        history.push(message);
        return this.setHistory(history);
    }

    clearHistory() {
        return this.remove(STORAGE_KEYS.HISTORY);
    }

    getTheme() {
        return this.get(STORAGE_KEYS.THEME, 'dark');
    }

    setTheme(theme) {
        return this.set(STORAGE_KEYS.THEME, theme);
    }

    getSession() {
        return this.get(STORAGE_KEYS.SESSION, '');
    }

    setSession(token) {
        if (token) {
            return this.set(STORAGE_KEYS.SESSION, token);
        }
        return this.remove(STORAGE_KEYS.SESSION);
    }

    getMessageQueue() {
        return this.get(STORAGE_KEYS.MESSAGE_QUEUE, []);
    }

    setMessageQueue(queue) {
        return this.set(STORAGE_KEYS.MESSAGE_QUEUE, queue.slice(-50));
    }

    clearMessageQueue() {
        return this.remove(STORAGE_KEYS.MESSAGE_QUEUE);
    }

    isGreeted() {
        return this.get(STORAGE_KEYS.GREETED) === 'true';
    }

    setGreeted(value = true) {
        return this.set(STORAGE_KEYS.GREETED, value ? 'true' : 'false');
    }

    getAvatarCache() {
        return this.get(STORAGE_KEYS.AVATAR_CACHE, null);
    }

    setAvatarCache(cache) {
        return this.set(STORAGE_KEYS.AVATAR_CACHE, cache);
    }

    clearAvatarCache() {
        return this.remove(STORAGE_KEYS.AVATAR_CACHE);
    }

    getSize() {
        if (!this.isAvailable) return 0;

        let total = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage.getItem(key).length * 2;
            }
        }
        return total;
    }

    getSizeFormatted() {
        const bytes = this.getSize();
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
}

export const storageService = new StorageService();
export { STORAGE_KEYS };
export default StorageService;
