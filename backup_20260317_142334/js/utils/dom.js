export function $(selector, context = document) {
    return context.querySelector(selector);
}

export function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

export function createElement(tag, options = {}) {
    const { className, id, text, html, attrs = {}, dataset = {}, styles = {} } = options;
    const el = document.createElement(tag);
    
    if (className) el.className = className;
    if (id) el.id = id;
    if (text) el.textContent = text;
    if (html) el.innerHTML = html;
    
    Object.entries(attrs).forEach(([key, value]) => {
        el.setAttribute(key, value);
    });
    
    Object.entries(dataset).forEach(([key, value]) => {
        el.dataset[key] = value;
    });
    
    Object.entries(styles).forEach(([key, value]) => {
        el.style[key] = value;
    });
    
    return el;
}

export function appendChild(parent, child) {
    if (typeof parent === 'string') {
        parent = $(parent);
    }
    if (parent && child) {
        parent.appendChild(child);
    }
    return child;
}

export function removeElement(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element && element.parentNode) {
        element.parentNode.removeChild(element);
    }
    return element;
}

export function addClass(element, ...classNames) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.classList.add(...classNames);
    }
    return element;
}

export function removeClass(element, ...classNames) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.classList.remove(...classNames);
    }
    return element;
}

export function toggleClass(element, className, force) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        return element.classList.toggle(className, force);
    }
    return false;
}

export function hasClass(element, className) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        return element.classList.contains(className);
    }
    return false;
}

export function on(element, eventType, handler, options = {}) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.addEventListener(eventType, handler, options);
    }
    return () => off(element, eventType, handler, options);
}

export function off(element, eventType, handler, options = {}) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.removeEventListener(eventType, handler, options);
    }
}

export function delegate(parent, eventType, selector, handler) {
    if (typeof parent === 'string') {
        parent = $(parent);
    }
    
    const delegatedHandler = (event) => {
        const target = event.target.closest(selector);
        if (target && parent.contains(target)) {
            handler.call(target, event, target);
        }
    };
    
    parent.addEventListener(eventType, delegatedHandler);
    return () => parent.removeEventListener(eventType, delegatedHandler);
}

export function setStyles(element, styles) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        Object.entries(styles).forEach(([key, value]) => {
            element.style[key] = value;
        });
    }
    return element;
}

export function show(element, display = 'block') {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.style.display = display;
    }
    return element;
}

export function hide(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.style.display = 'none';
    }
    return element;
}

export function empty(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
    return element;
}

export function scrollTo(element, options = {}) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', ...options });
    }
}
