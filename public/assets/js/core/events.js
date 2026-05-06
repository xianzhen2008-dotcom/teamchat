/**
 * EventBus - 事件总线模块
 * 
 * 提供模块间的松耦合通信机制
 * 
 * 支持的事件类型：
 * - 'message:received': 收到新消息
 * - 'message:sent': 发送消息
 * - 'message:updated': 消息更新
 * - 'message:deleted': 消息删除
 * - 'agent:selected': 选择 Agent
 * - 'agent:busy': Agent 忙碌
 * - 'agent:idle': Agent 空闲
 * - 'agent:log': Agent 日志
 * - 'connection:changed': 连接状态变化
 * - 'connection:quality': 连接质量变化
 * - 'theme:changed': 主题变化
 * - 'filter:changed': 筛选变化
 * - 'search:changed': 搜索变化
 * - 'ui:sidebar:toggle': 侧边栏切换
 * - 'ui:scroll:bottom': 滚动到底部
 * - 'error:occurred': 错误发生
 */

const EventTypes = {
    MESSAGE_RECEIVED: 'message:received',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_UPDATED: 'message:updated',
    MESSAGE_DELETED: 'message:deleted',
    MESSAGE_QUEUED: 'message:queued',
    
    AGENT_SELECTED: 'agent:selected',
    AGENT_BUSY: 'agent:busy',
    AGENT_IDLE: 'agent:idle',
    AGENT_LOG: 'agent:log',
    AGENT_EXPAND: 'agent:expand',
    
    CONNECTION_CHANGED: 'connection:changed',
    CONNECTION_QUALITY: 'connection:quality',
    CONNECTION_RECONNECT: 'connection:reconnect',
    
    THEME_CHANGED: 'theme:changed',
    
    FILTER_CHANGED: 'filter:changed',
    
    SEARCH_CHANGED: 'search:changed',
    
    UI_SIDEBAR_TOGGLE: 'ui:sidebar:toggle',
    UI_SCROLL_BOTTOM: 'ui:scroll:bottom',
    UI_TOAST: 'ui:toast',
    
    ERROR_OCCURRED: 'error:occurred',
    
    APP_INIT: 'app:init',
    APP_READY: 'app:ready',
    APP_DESTROY: 'app:destroy'
};

class EventBus {
    constructor() {
        this._listeners = new Map();
        this._onceListeners = new Map();
        this._eventHistory = [];
        this._maxHistorySize = 100;
        this._debugMode = false;
    }

    on(event, callback, options = {}) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        
        const listener = {
            callback,
            priority: options.priority || 0,
            once: options.once || false
        };
        
        this._listeners.get(event).add(listener);
        
        if (this._debugMode) {
            console.log(`[EventBus] Registered listener for: ${event}`);
        }
        
        return () => this.off(event, callback);
    }

    once(event, callback, options = {}) {
        return this.on(event, callback, { ...options, once: true });
    }

    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (!listeners) return;
        
        for (const listener of listeners) {
            if (listener.callback === callback) {
                listeners.delete(listener);
                break;
            }
        }
        
        if (listeners.size === 0) {
            this._listeners.delete(event);
        }
        
        if (this._debugMode) {
            console.log(`[EventBus] Unregistered listener for: ${event}`);
        }
    }

    emit(event, payload = {}) {
        if (this._debugMode) {
            console.log(`[EventBus] Emitting: ${event}`, payload);
        }
        
        this._addToHistory(event, payload);
        
        const listeners = this._listeners.get(event);
        if (!listeners || listeners.size === 0) return;
        
        const sortedListeners = Array.from(listeners)
            .sort((a, b) => b.priority - a.priority);
        
        const toRemove = [];
        
        for (const listener of sortedListeners) {
            try {
                listener.callback(payload);
                
                if (listener.once) {
                    toRemove.push(listener);
                }
            } catch (error) {
                console.error(`[EventBus] Error in listener for ${event}:`, error);
                this.emit(EventTypes.ERROR_OCCURRED, {
                    event,
                    error,
                    payload
                });
            }
        }
        
        for (const listener of toRemove) {
            listeners.delete(listener);
        }
    }

    emitAsync(event, payload = {}) {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.emit(event, payload);
                resolve();
            }, 0);
        });
    }

    _addToHistory(event, payload) {
        this._eventHistory.push({
            event,
            payload,
            timestamp: Date.now()
        });
        
        if (this._eventHistory.length > this._maxHistorySize) {
            this._eventHistory.shift();
        }
    }

    getHistory(filter = null) {
        if (!filter) {
            return [...this._eventHistory];
        }
        
        return this._eventHistory.filter(entry => 
            entry.event === filter || entry.event.startsWith(filter)
        );
    }

    clearHistory() {
        this._eventHistory = [];
    }

    hasListeners(event) {
        const listeners = this._listeners.get(event);
        return listeners && listeners.size > 0;
    }

    listenerCount(event) {
        const listeners = this._listeners.get(event);
        return listeners ? listeners.size : 0;
    }

    removeAllListeners(event = null) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }

    setDebugMode(enabled) {
        this._debugMode = enabled;
    }

    createEmitter(prefix) {
        return {
            emit: (event, payload) => this.emit(`${prefix}:${event}`, payload),
            on: (event, callback) => this.on(`${prefix}:${event}`, callback),
            off: (event, callback) => this.off(`${prefix}:${event}`, callback)
        };
    }
}

const eventBus = new EventBus();

const on = eventBus.on.bind(eventBus);
const once = eventBus.once.bind(eventBus);
const off = eventBus.off.bind(eventBus);
const emit = eventBus.emit.bind(eventBus);
const emitAsync = eventBus.emitAsync.bind(eventBus);

export { 
    EventBus, 
    eventBus, 
    EventTypes,
    on, 
    once, 
    off, 
    emit, 
    emitAsync 
};

export default eventBus;
