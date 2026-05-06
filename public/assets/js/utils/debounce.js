export function debounce(fn, delay = 300) {
    let timer = null;
    
    const debounced = function(...args) {
        const context = this;
        
        if (timer) {
            clearTimeout(timer);
        }
        
        timer = setTimeout(() => {
            fn.apply(context, args);
            timer = null;
        }, delay);
    };
    
    debounced.cancel = function() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    
    debounced.flush = function(...args) {
        debounced.cancel();
        fn.apply(this, args);
    };
    
    debounced.pending = function() {
        return timer !== null;
    };
    
    return debounced;
}

export function throttle(fn, delay = 300) {
    let lastTime = 0;
    let timer = null;
    
    const throttled = function(...args) {
        const context = this;
        const now = Date.now();
        const remaining = delay - (now - lastTime);
        
        if (remaining <= 0 || remaining > delay) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastTime = now;
            fn.apply(context, args);
        } else if (!timer) {
            timer = setTimeout(() => {
                lastTime = Date.now();
                timer = null;
                fn.apply(context, args);
            }, remaining);
        }
    };
    
    throttled.cancel = function() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        lastTime = 0;
    };
    
    throttled.flush = function(...args) {
        throttled.cancel();
        fn.apply(this, args);
    };
    
    return throttled;
}

export function rafThrottle(fn) {
    let rafId = null;
    let lastArgs = null;
    
    const throttled = function(...args) {
        lastArgs = args;
        
        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                fn.apply(this, lastArgs);
                rafId = null;
                lastArgs = null;
            });
        }
    };
    
    throttled.cancel = function() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
            lastArgs = null;
        }
    };
    
    return throttled;
}

export function debounceLeading(fn, delay = 300) {
    let timer = null;
    
    const debounced = function(...args) {
        const context = this;
        
        if (timer === null) {
            fn.apply(context, args);
        }
        
        timer = setTimeout(() => {
            timer = null;
        }, delay);
    };
    
    debounced.cancel = function() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    
    return debounced;
}

export function debounceWithPromise(fn, delay = 300) {
    let timer = null;
    let pendingResolve = null;
    let pendingReject = null;
    
    const debounced = function(...args) {
        return new Promise((resolve, reject) => {
            if (timer) {
                clearTimeout(timer);
                if (pendingReject) {
                    pendingReject(new Error('Debounced'));
                }
            }
            
            pendingResolve = resolve;
            pendingReject = reject;
            
            timer = setTimeout(async () => {
                try {
                    const result = await fn.apply(this, args);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
                timer = null;
                pendingResolve = null;
                pendingReject = null;
            }, delay);
        });
    };
    
    debounced.cancel = function() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            if (pendingReject) {
                pendingReject(new Error('Cancelled'));
                pendingResolve = null;
                pendingReject = null;
            }
        }
    };
    
    return debounced;
}
