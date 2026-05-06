export function formatTime(date, options = {}) {
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) {
        return '-';
    }
    
    const defaultOptions = {
        hour: '2-digit',
        minute: '2-digit',
        ...options
    };
    
    return d.toLocaleTimeString('zh-CN', defaultOptions);
}

export function formatTimeWithSeconds(date) {
    return formatTime(date, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatTimeWithDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) {
        return '-';
    }
    
    const now = new Date();
    const isToday = d.getFullYear() === now.getFullYear() && 
                    d.getMonth() === now.getMonth() && 
                    d.getDate() === now.getDate();
    
    if (isToday) {
        return d.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    }
    
    return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function formatDate(date, options = {}) {
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) {
        return '-';
    }
    
    const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...options
    };
    
    return d.toLocaleDateString('zh-CN', defaultOptions);
}

export function formatDateTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) {
        return '-';
    }
    
    return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function formatRelativeTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    
    if (isNaN(d.getTime())) {
        return '-';
    }
    
    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) {
        return '刚刚';
    } else if (minutes < 60) {
        return `${minutes}分钟前`;
    } else if (hours < 24) {
        return `${hours}小时前`;
    } else if (days < 7) {
        return `${days}天前`;
    } else {
        return formatDate(d);
    }
}

export function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '-';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const parts = [];
    
    if (days > 0) parts.push(`${days}d`);
    if (hours % 60 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length === 0) parts.push(`${seconds % 60}s`);
    
    return parts.join(' ') || '0s';
}

export function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return Number(num).toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

export function truncate(str, maxLength, suffix = '...') {
    if (!str) return '';
    const s = String(str);
    if (s.length <= maxLength) return s;
    return s.substring(0, maxLength - suffix.length) + suffix;
}

export function capitalize(str) {
    if (!str) return '';
    return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

export function camelToKebab(str) {
    return String(str).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function kebabToCamel(str) {
    return String(str).replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}
