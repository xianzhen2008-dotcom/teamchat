const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, char => ESCAPE_MAP[char]);
}

export function unescapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'file:'];

export function sanitizeLink(href) {
    if (!href) return null;
    
    const h = String(href).trim();
    if (!h) return null;
    
    if (h.startsWith('http://') || h.startsWith('https://')) return h;
    if (h.startsWith('file://')) return h;
    if (h.startsWith('mailto:')) return h;
    if (h.startsWith('tel:')) return h;
    if (h.startsWith('/')) return h;
    if (h.startsWith('#')) return h;
    
    return null;
}

export function isSafeUrl(url) {
    if (!url) return false;
    
    try {
        const parsed = new URL(url, window.location.origin);
        return ALLOWED_PROTOCOLS.includes(parsed.protocol);
    } catch {
        return false;
    }
}

export function sanitizeUrl(url) {
    if (!url) return null;
    
    const trimmed = String(url).trim();
    if (!trimmed) return null;
    
    try {
        const parsed = new URL(trimmed, window.location.origin);
        
        if (ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            return parsed.href;
        }
        
        return null;
    } catch {
        return null;
    }
}

export function stripFileEmojiLabel(label) {
    if (!label) return '';
    const s = String(label).trim();
    if (!s) return '';
    return s.replace(/^📁\s*/g, '').trim();
}

export function sanitizeFilename(filename) {
    if (!filename) return '';
    
    return String(filename)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .substring(0, 255);
}

export function stripTags(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]*>/g, '');
}

export function sanitizeObject(obj, depth = 5) {
    if (depth <= 0) return null;
    
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj === 'string') {
        return escapeHtml(obj);
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, depth - 1));
    }
    
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitizedKey = escapeHtml(key);
            result[sanitizedKey] = sanitizeObject(value, depth - 1);
        }
        return result;
    }
    
    return String(obj);
}

export function createSafeAttribute(name, value) {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedName) return '';
    
    const sanitizedValue = escapeHtml(String(value));
    return `${sanitizedName}="${sanitizedValue}"`;
}

const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'];
const DANGEROUS_ATTRS = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'];

export function sanitizeHtml(html, options = {}) {
    if (!html) return '';
    
    const { allowedTags = [], allowedAttrs = [] } = options;
    
    let result = String(html);
    
    DANGEROUS_TAGS.forEach(tag => {
        if (!allowedTags.includes(tag)) {
            const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gis');
            result = result.replace(regex, '');
            const selfClosingRegex = new RegExp(`<${tag}[^>]*/?>`, 'gi');
            result = result.replace(selfClosingRegex, '');
        }
    });
    
    DANGEROUS_ATTRS.forEach(attr => {
        if (!allowedAttrs.includes(attr)) {
            const regex = new RegExp(`\\s*${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
            result = result.replace(regex, '');
        }
    });
    
    result = result.replace(/javascript:/gi, '');
    result = result.replace(/data:/gi, '');
    
    return result;
}

export function extractUploadsToken(href) {
    const h = String(href || '').trim();
    if (!h) return null;
    
    try {
        const u = new URL(h, window.location.origin);
        if (u.pathname.startsWith('/uploads/')) {
            const token = u.pathname.slice('/uploads/'.length);
            if (!token) return null;
            const one = token.split('/')[0];
            return one || null;
        }
    } catch {}
    
    return null;
}

export function recoverNameFromToken(token) {
    if (!token) return null;
    try {
        const decoded = decodeURIComponent(token);
        const match = decoded.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}-)?(.+)$/);
        return match ? match[2] : null;
    } catch {
        return null;
    }
}
