const ANALYTICS_STORAGE_KEY = 'muse_analytics';
const PERFORMANCE_METRICS_KEY = 'muse_performance';
const ERROR_LOG_KEY = 'muse_errors';

class AnalyticsEvent {
    constructor(type, data = {}) {
        this.id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;
        this.data = data;
        this.timestamp = Date.now();
        this.sessionId = AnalyticsService.getSessionId();
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            data: this.data,
            timestamp: this.timestamp,
            sessionId: this.sessionId
        };
    }
}

class PerformanceMetric {
    constructor(name, value, unit = 'ms') {
        this.name = name;
        this.value = value;
        this.unit = unit;
        this.timestamp = Date.now();
    }

    toJSON() {
        return {
            name: this.name,
            value: this.value,
            unit: this.unit,
            timestamp: this.timestamp
        };
    }
}

class ErrorLog {
    constructor(error, context = {}) {
        this.id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.message = error.message || String(error);
        this.stack = error.stack || null;
        this.name = error.name || 'Error';
        this.context = context;
        this.timestamp = Date.now();
        this.url = typeof window !== 'undefined' ? window.location.href : '';
        this.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    }

    toJSON() {
        return {
            id: this.id,
            message: this.message,
            stack: this.stack,
            name: this.name,
            context: this.context,
            timestamp: this.timestamp,
            url: this.url,
            userAgent: this.userAgent
        };
    }
}

class AnalyticsService {
    static sessionId = null;

    static getSessionId() {
        if (!this.sessionId) {
            this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        return this.sessionId;
    }

    static resetSessionId() {
        this.sessionId = null;
    }

    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.debug = options.debug || false;
        this.maxEvents = options.maxEvents || 1000;
        this.maxErrors = options.maxErrors || 100;
        this.flushInterval = options.flushInterval || 60000;
        this.endpoint = options.endpoint || null;

        this.events = [];
        this.metrics = [];
        this.errors = [];

        this.performanceObserver = null;
        this.flushTimer = null;

        if (this.enabled) {
            this.init();
        }
    }

    init() {
        this.loadFromStorage();
        this.setupPerformanceMonitoring();
        this.setupErrorHandling();
        this.startFlushTimer();
        this.trackPageView();

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                this.flush();
            });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.flush();
                }
            });
        }
    }

    loadFromStorage() {
        try {
            if (typeof localStorage === 'undefined') return;

            const events = localStorage.getItem(ANALYTICS_STORAGE_KEY);
            if (events) {
                this.events = JSON.parse(events).slice(-this.maxEvents);
            }

            const metrics = localStorage.getItem(PERFORMANCE_METRICS_KEY);
            if (metrics) {
                this.metrics = JSON.parse(metrics);
            }

            const errors = localStorage.getItem(ERROR_LOG_KEY);
            if (errors) {
                this.errors = JSON.parse(errors).slice(-this.maxErrors);
            }
        } catch (error) {
            console.warn('[Analytics] Failed to load from storage:', error);
        }
    }

    saveToStorage() {
        try {
            if (typeof localStorage === 'undefined') return;

            localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(this.events.slice(-this.maxEvents)));
            localStorage.setItem(PERFORMANCE_METRICS_KEY, JSON.stringify(this.metrics));
            localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(this.errors.slice(-this.maxErrors)));
        } catch (error) {
            console.warn('[Analytics] Failed to save to storage:', error);
        }
    }

    setupPerformanceMonitoring() {
        if (typeof window === 'undefined' || !window.performance) return;

        if (window.performance.timing) {
            const timing = window.performance.timing;
            const metrics = {
                dns: timing.domainLookupEnd - timing.domainLookupStart,
                tcp: timing.connectEnd - timing.connectStart,
                request: timing.responseStart - timing.requestStart,
                response: timing.responseEnd - timing.responseStart,
                domProcessing: timing.domComplete - timing.domInteractive,
                totalLoad: timing.loadEventEnd - timing.navigationStart
            };

            Object.entries(metrics).forEach(([name, value]) => {
                if (value > 0) {
                    this.recordMetric(`page_load_${name}`, value);
                }
            });
        }

        if (typeof PerformanceObserver !== 'undefined') {
            try {
                this.performanceObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => {
                        if (entry.entryType === 'paint') {
                            this.recordMetric(entry.name, entry.startTime);
                        } else if (entry.entryType === 'largest-contentful-paint') {
                            this.recordMetric('lcp', entry.startTime);
                        } else if (entry.entryType === 'first-input') {
                            this.recordMetric('fid', entry.processingStart - entry.startTime);
                        } else if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
                            this.recordMetric('cls', entry.value, 'score');
                        }
                    });
                });

                const entryTypes = ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift'];
                entryTypes.forEach(type => {
                    try {
                        this.performanceObserver.observe({ type, buffered: true });
                    } catch (e) {
                        // Entry type not supported
                    }
                });
            } catch (error) {
                // PerformanceObserver not supported
            }
        }
    }

    setupErrorHandling() {
        if (typeof window === 'undefined') return;

        window.addEventListener('error', (event) => {
            this.logError(event.error || new Error(event.message), {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            const error = event.reason instanceof Error
                ? event.reason
                : new Error(String(event.reason));
            this.logError(error, { type: 'unhandledrejection' });
        });
    }

    startFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.flushInterval);
    }

    track(eventType, data = {}) {
        if (!this.enabled) return;

        const event = new AnalyticsEvent(eventType, data);
        this.events.push(event.toJSON());

        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents);
        }

        if (this.debug) {
            console.log('[Analytics] Event:', event.toJSON());
        }

        this.saveToStorage();
    }

    trackPageView(pageName = null) {
        const page = pageName || (typeof window !== 'undefined' ? window.location.pathname : 'unknown');
        this.track('page_view', {
            page,
            title: typeof document !== 'undefined' ? document.title : '',
            referrer: typeof document !== 'undefined' ? document.referrer : ''
        });
    }

    trackUserAction(action, details = {}) {
        this.track('user_action', {
            action,
            ...details
        });
    }

    trackFeatureUsage(feature, details = {}) {
        this.track('feature_usage', {
            feature,
            ...details
        });
    }

    trackApiCall(endpoint, method, duration, success, error = null) {
        this.track('api_call', {
            endpoint,
            method,
            duration,
            success,
            error: error ? error.message : null
        });

        this.recordMetric(`api_${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`, duration);
    }

    recordMetric(name, value, unit = 'ms') {
        if (!this.enabled) return;

        const metric = new PerformanceMetric(name, value, unit);
        this.metrics.push(metric.toJSON());

        if (this.metrics.length > 500) {
            this.metrics = this.metrics.slice(-500);
        }

        if (this.debug) {
            console.log('[Analytics] Metric:', metric.toJSON());
        }

        this.saveToStorage();
    }

    logError(error, context = {}) {
        if (!this.enabled) return;

        const errorLog = new ErrorLog(error, context);
        this.errors.push(errorLog.toJSON());

        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(-this.maxErrors);
        }

        if (this.debug) {
            console.error('[Analytics] Error logged:', errorLog.toJSON());
        }

        this.saveToStorage();
    }

    getEvents(filter = null) {
        let events = [...this.events];

        if (filter) {
            if (filter.type) {
                events = events.filter(e => e.type === filter.type);
            }
            if (filter.startTime) {
                events = events.filter(e => e.timestamp >= filter.startTime);
            }
            if (filter.endTime) {
                events = events.filter(e => e.timestamp <= filter.endTime);
            }
            if (filter.sessionId) {
                events = events.filter(e => e.sessionId === filter.sessionId);
            }
        }

        return events;
    }

    getMetrics(name = null) {
        let metrics = [...this.metrics];

        if (name) {
            metrics = metrics.filter(m => m.name === name);
        }

        return metrics;
    }

    getMetricStats(name) {
        const metrics = this.getMetrics(name);
        if (metrics.length === 0) return null;

        const values = metrics.map(m => m.value);
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        return {
            count: values.length,
            sum,
            avg,
            min,
            max,
            median,
            latest: values[values.length - 1]
        };
    }

    getErrors(filter = null) {
        let errors = [...this.errors];

        if (filter) {
            if (filter.name) {
                errors = errors.filter(e => e.name === filter.name);
            }
            if (filter.startTime) {
                errors = errors.filter(e => e.timestamp >= filter.startTime);
            }
            if (filter.endTime) {
                errors = errors.filter(e => e.timestamp <= filter.endTime);
            }
        }

        return errors;
    }

    getSummary() {
        const pageViews = this.events.filter(e => e.type === 'page_view').length;
        const userActions = this.events.filter(e => e.type === 'user_action').length;
        const apiCalls = this.events.filter(e => e.type === 'api_call').length;
        const featureUsage = this.events.filter(e => e.type === 'feature_usage').length;

        const apiSuccessRate = apiCalls > 0
            ? (this.events.filter(e => e.type === 'api_call' && e.data.success).length / apiCalls * 100).toFixed(2)
            : 0;

        const uniquePages = new Set(
            this.events
                .filter(e => e.type === 'page_view')
                .map(e => e.data.page)
        ).size;

        const uniqueFeatures = new Set(
            this.events
                .filter(e => e.type === 'feature_usage')
                .map(e => e.data.feature)
        ).size;

        return {
            totalEvents: this.events.length,
            pageViews,
            userActions,
            apiCalls,
            featureUsage,
            apiSuccessRate: `${apiSuccessRate}%`,
            uniquePages,
            uniqueFeatures,
            totalErrors: this.errors.length,
            totalMetrics: this.metrics.length
        };
    }

    async flush() {
        if (!this.enabled || !this.endpoint) return;

        const pendingEvents = [...this.events];
        const pendingMetrics = [...this.metrics];
        const pendingErrors = [...this.errors];

        if (pendingEvents.length === 0 && pendingMetrics.length === 0 && pendingErrors.length === 0) {
            return;
        }

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    events: pendingEvents,
                    metrics: pendingMetrics,
                    errors: pendingErrors,
                    timestamp: Date.now(),
                    sessionId: AnalyticsService.getSessionId()
                })
            });

            if (response.ok) {
                this.events = [];
                this.metrics = [];
                this.errors = [];
                this.saveToStorage();

                if (this.debug) {
                    console.log('[Analytics] Flushed data successfully');
                }
            }
        } catch (error) {
            if (this.debug) {
                console.error('[Analytics] Failed to flush:', error);
            }
        }
    }

    clear() {
        this.events = [];
        this.metrics = [];
        this.errors = [];
        this.saveToStorage();
    }

    enable() {
        this.enabled = true;
        if (!this.flushTimer) {
            this.startFlushTimer();
        }
    }

    disable() {
        this.enabled = false;
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }

    setDebug(enabled) {
        this.debug = enabled;
    }

    setEndpoint(endpoint) {
        this.endpoint = endpoint;
    }

    destroy() {
        this.disable();
        if (this.performanceObserver) {
            this.performanceObserver.disconnect();
            this.performanceObserver = null;
        }
        this.flush();
    }
}

const analyticsService = new AnalyticsService();

export { AnalyticsService, AnalyticsEvent, PerformanceMetric, ErrorLog };
export default analyticsService;
