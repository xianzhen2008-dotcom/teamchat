let deferredPrompt = null;
const APP_VERSION = '278';

export function initPwaSupport() {
    registerServiceWorker();
    bindInstallPrompt();
}

function shouldUseServiceWorker() {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone;
    return isLocal || isStandalone;
}

async function clearServiceWorkersAndCaches() {
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
        console.warn('[PWA] failed to unregister service workers:', error?.message || error);
    }

    if (!('caches' in window)) return;
    try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('teamchat-shell-')).map((key) => caches.delete(key)));
    } catch (error) {
        console.warn('[PWA] failed to clear caches:', error?.message || error);
    }
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        if (!shouldUseServiceWorker()) {
            clearServiceWorkersAndCaches();
            return;
        }

        navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch((error) => {
            console.warn('[PWA] service worker register failed:', error?.message || error);
        });
    });
}

function bindInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        window.__TEAMCHAT_INSTALL_PROMPT__ = event;
        document.body.dataset.installReady = 'true';
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        window.__TEAMCHAT_INSTALL_PROMPT__ = null;
        document.body.dataset.installReady = 'false';
        console.log('[PWA] app installed');
    });
}

export async function promptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    if (choice?.outcome !== 'accepted') return false;
    deferredPrompt = null;
    window.__TEAMCHAT_INSTALL_PROMPT__ = null;
    document.body.dataset.installReady = 'false';
    return true;
}
