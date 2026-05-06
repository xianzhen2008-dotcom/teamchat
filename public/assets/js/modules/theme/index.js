/**
 * Theme Module - 皮肤管理
 * 每套皮肤完整定义全局配色，不再叠加 dark/light 模式。
 */

import { emit, EventTypes } from '../../core/events.js';

const SKIN_KEY = 'team_chat_skin';
const LEGACY_THEME_KEY = 'team_chat_theme';
const SKINS = [
    { id: 'fresh', name: '小清新' },
    { id: 'glass', name: '黑色玻璃' },
    { id: 'cyber', name: '赛博科技' },
    { id: 'editorial', name: '杂志阅读' }
];

function getCurrentSkin() {
    return document.body.getAttribute('data-skin') || 'fresh';
}

function getCurrentTheme() {
    return getCurrentSkin();
}

function getSkinMeta(skinId) {
    return SKINS.find((item) => item.id === skinId) || SKINS[0];
}

function closeDropdown() {
    const dropdown = document.getElementById('header-dropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

function updateThemeUi() {
    const skin = getCurrentSkin();
    const skinBadge = document.getElementById('skin-current-badge');
    if (skinBadge) {
        skinBadge.textContent = getSkinMeta(skin).name;
    }

    document.querySelectorAll('.skin-option[data-skin]').forEach((button) => {
        const isActive = button.getAttribute('data-skin') === skin;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function setSkin(skin) {
    const nextSkin = getSkinMeta(skin).id;
    document.body.setAttribute('data-skin', nextSkin);
    document.body.removeAttribute('data-theme');

    try {
        localStorage.setItem(SKIN_KEY, nextSkin);
        localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {}

    updateThemeUi();
    emit(EventTypes.THEME_CHANGED, { theme: nextSkin, skin: nextSkin });
    window.dispatchEvent(new CustomEvent('teamchat:skin-changed', {
        detail: { skin: nextSkin }
    }));
}

function setTheme(theme) {
    setSkin(theme);
}

function toggleTheme() {
    cycleSkin();
}

function cycleSkin() {
    const current = getCurrentSkin();
    const index = SKINS.findIndex((item) => item.id === current);
    const nextIndex = index === -1 ? 0 : (index + 1) % SKINS.length;
    setSkin(SKINS[nextIndex].id);
}

function initTheme() {
    let savedSkin = 'fresh';

    try {
        savedSkin = localStorage.getItem(SKIN_KEY) || 'fresh';
        localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {}

    if (!SKINS.some((item) => item.id === savedSkin)) {
        savedSkin = 'fresh';
    }

    setSkin(savedSkin);

    const skinCycleBtn = document.getElementById('skin-toggle-2');
    if (skinCycleBtn) {
        skinCycleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cycleSkin();
            closeDropdown();
        });
    }

    document.querySelectorAll('.skin-option[data-skin]').forEach((button) => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setSkin(button.getAttribute('data-skin') || 'fresh');
            closeDropdown();
        });
    });

    updateThemeUi();
}

export const themeModule = {
    init: initTheme,
    toggle: toggleTheme,
    setTheme,
    getTheme: getCurrentTheme,
    setSkin,
    getSkin: getCurrentSkin,
    cycleSkin,
    skins: SKINS
};

export default themeModule;
