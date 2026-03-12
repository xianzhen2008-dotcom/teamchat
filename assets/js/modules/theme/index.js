/**
 * Theme Module - 主题管理
 * 简化版：直接操作DOM，确保可靠
 */

const THEME_KEY = 'team_chat_theme';

function getCurrentTheme() {
    return document.body.getAttribute('data-theme') || 'dark';
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    
    const iconEl = document.getElementById('theme-icon');
    if (iconEl) {
        iconEl.textContent = theme === 'light' ? '☀️' : '🌙';
    }
    
    const darkLink = document.getElementById('theme-dark');
    const lightLink = document.getElementById('theme-light');
    if (darkLink && lightLink) {
        darkLink.disabled = theme === 'light';
        lightLink.disabled = theme === 'dark';
    }
    
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {}
    
    console.log('[Theme] Theme set to:', theme);
}

function toggleTheme() {
    const current = getCurrentTheme();
    const newTheme = current === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function initTheme() {
    let savedTheme = 'dark';
    try {
        savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    } catch {}
    
    if (!['dark', 'light'].includes(savedTheme)) {
        savedTheme = 'dark';
    }
    
    setTheme(savedTheme);
    
    const toggleBtns = [
        document.getElementById('theme-toggle'),
        document.getElementById('theme-toggle-2')
    ].filter(Boolean);
    
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Theme] Toggle button clicked');
            toggleTheme();
        });
    });
    
    if (toggleBtns.length > 0) {
        console.log('[Theme] Toggle buttons initialized:', toggleBtns.length);
    } else {
        console.warn('[Theme] Toggle button not found');
    }
}

export const themeModule = {
    init: initTheme,
    toggle: toggleTheme,
    setTheme: setTheme,
    getTheme: getCurrentTheme
};

export default themeModule;
