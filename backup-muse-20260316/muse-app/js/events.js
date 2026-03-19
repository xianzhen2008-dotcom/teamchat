/**
 * EventBus - 事件总线模块
 * 
 * 提供模块间的松耦合通信机制
 * 支持：事件订阅/发布、一次性事件、事件命名空间、事件清理
 */

const EventTypes = {
    APP_INIT: 'app:init',
    APP_READY: 'app:ready',
    APP_DESTROY: 'app:destroy',
    
    ROUTER_CHANGE: 'router:change',
    ROUTER_BEFORE_CHANGE: 'router:beforeChange',
    ROUTER_AFTER_CHANGE: 'router:afterChange',
    
    STATE_CHANGE: 'state:change',
    STATE_PERSIST: 'state:persist',
    STATE_RESTORE: 'state:restore',
    
    MESSAGE_RECEIVED: 'message:received',
    MESSAGE_SENT: 'message:sent',
    
    ERROR_OCCURRED: 'error:occurred',
    
    UI_TOAST: 'ui:toast',
    UI_LOADING: 'ui:loading'
};

class EventBus {
    constructor() {
        this._listeners = new Map();
        this._namespaces = new Map();
        this._eventHistory = [];
        this._maxHistorySize = 100;
        this._debugMode = false;
        this._wildcardChar = '*';
    }

    on(event, callback, options = {}) {
        const { priority = 0, once = false, namespace = null } = options;
        
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        
        const listener = {
            callback,
            priority,
            once,
            namespace
        };
        
        this._listeners.get(event).add(listener);
        
        if (namespace) {
            if (!this._namespaces.has(namespace)) {
                this._namespaces.set(namespace, new Set());
            }
            this._namespaces.get(namespace).add({ event, listener });
        }
        
        if (this._debugMode) {
            console.log(`[EventBus] Registered listener for: ${event}`, { namespace, once });
        }
        
        return () => this.off(event, callback);
    }

    once(event, callback, options = {}) {
        return this.on(event, callback, { ...options, once: true });
    }

    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (!listeners) return false;
        
        for (const listener of listeners) {
            if (listener.callback === callback) {
                listeners.delete(listener);
                
                if (listener.namespace) {
                    const nsListeners = this._namespaces.get(listener.namespace);
                    if (nsListeners) {
                        for (const item of nsListeners) {
                            if (item.event === event && item.listener === listener) {
                                nsListeners.delete(item);
                                break;
                            }
                        }
                    }
                }
                
                if (this._debugMode) {
                    console.log(`[EventBus] Unregistered listener for: ${event}`);
                }
                return true;
            }
        }
        
        return false;
    }

    emit(event, payload = {}) {
        if (this._debugMode) {
            console.log(`[EventBus] Emitting: ${event}`, payload);
        }
        
        this._addToHistory(event, payload);
        
        const toRemove = [];
        let emitted = false;
        
        const listeners = this._listeners.get(event);
        if (listeners && listeners.size > 0) {
            const sortedListeners = Array.from(listeners)
                .sort((a, b) => b.priority - a.priority);
            
            for (const listener of sortedListeners) {
                try {
                    listener.callback(payload);
                    emitted = true;
                    
                    if (listener.once) {
                        toRemove.push(listener);
                    }
                } catch (error) {
                    console.error(`[EventBus] Error in listener for ${event}:`, error);
                    this._handleError(event, error, payload);
                }
            }
            
            for (const listener of toRemove) {
                listeners.delete(listener);
            }
        }
        
        const wildcardListeners = this._listeners.get(this._wildcardChar);
        if (wildcardListeners && wildcardListeners.size > 0) {
            for (const listener of wildcardListeners) {
                try {
                    listener.callback({ event, payload });
                } catch (error) {
                    console.error(`[EventBus] Error in wildcard listener:`, error);
                }
            }
        }
        
        return emitted;
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

    clearNamespace(namespace) {
        const nsListeners = this._namespaces.get(namespace);
        if (!nsListeners) return;
        
        for (const { event, listener } of nsListeners) {
            const listeners = this._listeners.get(event);
            if (listeners) {
                listeners.delete(listener);
            }
        }
        
        this._namespaces.delete(namespace);
        
        if (this._debugMode) {
            console.log(`[EventBus] Cleared namespace: ${namespace}`);
        }
    }

    removeAllListeners(event = null) {
        if (event) {
            const listeners = this._listeners.get(event);
            if (listeners) {
                for (const listener of listeners) {
                    if (listener.namespace) {
                        const nsListeners = this._namespaces.get(listener.namespace);
                        if (nsListeners) {
                            for (const item of nsListeners) {
                                if (item.event === event) {
                                    nsListeners.delete(item);
                                }
                            }
                        }
                    }
                }
            }
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
            this._namespaces.clear();
        }
    }

    setDebugMode(enabled) {
        this._debugMode = enabled;
    }

    createNamespace(name) {
        return {
            on: (event, callback, options = {}) => 
                this.on(event, callback, { ...options, namespace: name }),
            once: (event, callback, options = {}) => 
                this.once(event, callback, { ...options, namespace: name }),
            emit: (event, payload) => this.emit(event, payload),
            off: (event, callback) => this.off(event, callback),
            clear: () => this.clearNamespace(name)
        };
    }

    _handleError(event, error, payload) {
        if (event !== EventTypes.ERROR_OCCURRED) {
            this.emit(EventTypes.ERROR_OCCURRED, {
                event,
                error,
                payload,
                timestamp: Date.now()
            });
        }
    }

    createEmitter(prefix) {
        return {
            emit: (event, payload) => this.emit(`${prefix}:${event}`, payload),
            on: (event, callback, options) => 
                this.on(`${prefix}:${event}`, callback, options),
            once: (event, callback, options) => 
                this.once(`${prefix}:${event}`, callback, options),
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
