const API_BASE_URL = 'http://localhost:18788';

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY = 1000;

class ApiError extends Error {
    constructor(message, status, data = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
        this.timestamp = Date.now();
    }

    isNetworkError() {
        return this.status === 0;
    }

    isClientError() {
        return this.status >= 400 && this.status < 500;
    }

    isServerError() {
        return this.status >= 500;
    }

    isUnauthorized() {
        return this.status === 401;
    }

    isForbidden() {
        return this.status === 403;
    }

    isNotFound() {
        return this.status === 404;
    }
}

class RequestInterceptor {
    constructor() {
        this.handlers = [];
    }

    use(onFulfilled, onRejected) {
        this.handlers.push({ onFulfilled, onRejected });
        return this.handlers.length - 1;
    }

    eject(id) {
        if (this.handlers[id]) {
            this.handlers[id] = null;
        }
    }

    async run(config) {
        let result = config;
        for (const handler of this.handlers) {
            if (handler && handler.onFulfilled) {
                try {
                    result = await handler.onFulfilled(result);
                } catch (error) {
                    if (handler.onRejected) {
                        result = await handler.onRejected(error);
                    } else {
                        throw error;
                    }
                }
            }
        }
        return result;
    }
}

class ResponseInterceptor {
    constructor() {
        this.handlers = [];
    }

    use(onFulfilled, onRejected) {
        this.handlers.push({ onFulfilled, onRejected });
        return this.handlers.length - 1;
    }

    eject(id) {
        if (this.handlers[id]) {
            this.handlers[id] = null;
        }
    }

    async run(response) {
        let result = response;
        for (const handler of this.handlers) {
            if (handler && handler.onFulfilled) {
                try {
                    result = await handler.onFulfilled(result);
                } catch (error) {
                    if (handler.onRejected) {
                        result = await handler.onRejected(error);
                    } else {
                        throw error;
                    }
                }
            }
        }
        return result;
    }
}

class CacheManager {
    constructor(maxSize = 50, defaultTTL = 60000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
    }

    generateKey(url, options) {
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(options.body) : '';
        return `${method}:${url}:${body}`;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.data;
    }

    set(key, data, ttl = this.defaultTTL) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            data,
            expiry: Date.now() + ttl
        });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }
}

class ApiService {
    constructor(baseUrl = API_BASE_URL) {
        this.baseUrl = baseUrl;
        this.authToken = null;
        this.timeout = DEFAULT_TIMEOUT;
        this.retryCount = DEFAULT_RETRY_COUNT;
        this.retryDelay = DEFAULT_RETRY_DELAY;
        this.cache = new CacheManager();
        this.requestInterceptors = new RequestInterceptor();
        this.responseInterceptors = new ResponseInterceptor();
        this.pendingRequests = new Map();
        this.abortControllers = new Map();

        this.setupDefaultInterceptors();
    }

    setupDefaultInterceptors() {
        this.requestInterceptors.use(
            async (config) => {
                const headers = {
                    'Content-Type': 'application/json',
                    ...config.headers
                };

                if (this.authToken) {
                    headers['Authorization'] = `Bearer ${this.authToken}`;
                }

                return {
                    ...config,
                    headers
                };
            },
            (error) => {
                console.error('[API] Request interceptor error:', error);
                throw error;
            }
        );

        this.responseInterceptors.use(
            async (response) => {
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new ApiError(
                        errorData.message || errorData.error || `HTTP Error: ${response.status}`,
                        response.status,
                        errorData
                    );
                }

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                }

                return await response.text();
            },
            async (error) => {
                if (error instanceof ApiError) {
                    if (error.isUnauthorized()) {
                        this.handleUnauthorized();
                    }
                    throw error;
                }

                throw new ApiError(
                    error.message || 'Network Error',
                    0,
                    { originalError: error }
                );
            }
        );
    }

    handleUnauthorized() {
        this.authToken = null;
        window.dispatchEvent(new CustomEvent('api:unauthorized'));
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    getAuthToken() {
        return this.authToken;
    }

    setTimeout(timeout) {
        this.timeout = timeout;
    }

    setRetryCount(count) {
        this.retryCount = count;
    }

    setRetryDelay(delay) {
        this.retryDelay = delay;
    }

    createAbortController(requestKey) {
        const controller = new AbortController();
        this.abortControllers.set(requestKey, controller);
        return controller;
    }

    abortRequest(requestKey) {
        const controller = this.abortControllers.get(requestKey);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(requestKey);
        }
    }

    abortAllRequests() {
        for (const controller of this.abortControllers.values()) {
            controller.abort();
        }
        this.abortControllers.clear();
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        const requestKey = this.cache.generateKey(url, options);

        if (options.method === 'GET' && options.cache !== false) {
            const cachedData = this.cache.get(requestKey);
            if (cachedData) {
                return cachedData;
            }
        }

        if (this.pendingRequests.has(requestKey)) {
            return this.pendingRequests.get(requestKey);
        }

        const requestPromise = this._executeRequest(url, requestKey, options);
        this.pendingRequests.set(requestKey, requestPromise);

        try {
            const result = await requestPromise;

            if (options.method === 'GET' && options.cache !== false) {
                this.cache.set(requestKey, result, options.cacheTTL);
            }

            return result;
        } finally {
            this.pendingRequests.delete(requestKey);
            this.abortControllers.delete(requestKey);
        }
    }

    async _executeRequest(url, requestKey, options, retryAttempt = 0) {
        let config = {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: undefined,
            ...options
        };

        config = await this.requestInterceptors.run(config);

        const controller = this.createAbortController(requestKey);
        config.signal = controller.signal;

        const timeoutId = setTimeout(() => {
            controller.abort();
        }, options.timeout || this.timeout);

        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            const result = await this.responseInterceptors.run(response);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new ApiError('Request was aborted', 0, { aborted: true });
            }

            const shouldRetry = this.shouldRetry(error, retryAttempt, options);
            if (shouldRetry) {
                const delay = options.retryDelay || this.retryDelay;
                await this.delay(delay * Math.pow(2, retryAttempt));
                return this._executeRequest(url, requestKey, options, retryAttempt + 1);
            }

            throw error;
        }
    }

    shouldRetry(error, attempt, options) {
        const maxRetries = options.retryCount ?? this.retryCount;
        if (attempt >= maxRetries) return false;

        if (error instanceof ApiError) {
            if (error.isClientError() && !error.isUnauthorized()) {
                return false;
            }
        }

        return true;
    }

    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    async post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: data,
            cache: false
        });
    }

    async put(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: data,
            cache: false
        });
    }

    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE',
            cache: false
        });
    }

    async patch(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: data,
            cache: false
        });
    }

    clearCache() {
        this.cache.clear();
    }

    getCacheStats() {
        return {
            size: this.cache.cache.size,
            maxSize: this.cache.maxSize
        };
    }

    getMemories(params = {}) {
        const query = new URLSearchParams(params).toString();
        const endpoint = query ? `/api/muse/memories?${query}` : '/api/muse/memories';
        return this.get(endpoint);
    }

    addMemory(data) {
        return this.post('/api/muse/memories', data);
    }

    searchMemories(query, params = {}) {
        const searchParams = new URLSearchParams({ q: query, ...params }).toString();
        return this.get(`/api/muse/memories/search?${searchParams}`);
    }

    getTasks(params = {}) {
        const query = new URLSearchParams(params).toString();
        const endpoint = query ? `/api/muse/tasks?${query}` : '/api/muse/tasks';
        return this.get(endpoint);
    }

    createTask(data) {
        return this.post('/api/muse/tasks', data);
    }

    updateTask(id, data) {
        return this.put(`/api/muse/tasks/${id}`, data);
    }

    deleteTask(id) {
        return this.delete(`/api/muse/tasks/${id}`);
    }

    getEvents(params = {}) {
        const query = new URLSearchParams(params).toString();
        const endpoint = query ? `/api/muse/events?${query}` : '/api/muse/events';
        return this.get(endpoint);
    }

    getStats(params = {}) {
        const query = new URLSearchParams(params).toString();
        const endpoint = query ? `/api/muse/stats?${query}` : '/api/muse/stats';
        return this.get(endpoint);
    }
}

const apiService = new ApiService();

export { ApiService, ApiError, CacheManager, RequestInterceptor, ResponseInterceptor, API_BASE_URL };
export default apiService;
