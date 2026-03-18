import { storageService, STORAGE_KEYS } from './storage.js';

const IMAGE_PATH = 'images/';
const COMPRESSED_PATH = 'images/compressed/';
const AVATAR_CACHE_VERSION = 'v2';  // 版本更新，强制刷新缓存

class AvatarService {
    constructor() {
        this.cache = new Map();
        this.loading = new Set();
        this.version = AVATAR_CACHE_VERSION;
    }

    init() {
        try {
            const saved = storageService.getAvatarCache();
            if (saved) {
                if (saved.version === this.version) {
                    const entries = Object.entries(saved.cache || {});
                    entries.forEach(([filename, base64]) => {
                        this.cache.set(filename, base64);
                    });
                    console.log(`[AvatarService] Loaded ${this.cache.size} cached avatars`);
                } else {
                    console.log('[AvatarService] Cache version mismatch, clearing...');
                    this.clear();
                }
            }
        } catch (e) {
            console.warn('[AvatarService] Failed to load cache:', e);
        }
    }

    save() {
        try {
            const cacheObj = {};
            this.cache.forEach((value, key) => {
                cacheObj[key] = value;
            });

            storageService.setAvatarCache({
                version: this.version,
                cache: cacheObj,
                timestamp: Date.now()
            });
        } catch (e) {
            console.warn('[AvatarService] Failed to save cache:', e);
        }
    }

    get(filename) {
        return this.cache.get(filename) || null;
    }

    set(filename, base64) {
        this.cache.set(filename, base64);
        this.save();
    }

    has(filename) {
        return this.cache.has(filename);
    }

    getUrl(filename) {
        const cached = this.get(filename);
        if (cached) {
            return cached;
        }

        // 如果已经是压缩版本路径，直接使用
        if (filename.includes('compressed/') || filename.includes('_compressed')) {
            return `${IMAGE_PATH}${filename}`;
        }

        // 尝试使用压缩版本
        const name = filename.replace(/\.[^/.]+$/, '');
        const compressedFilename = `compressed/${name}_compressed.jpg`;

        // 返回压缩版本路径
        return `${IMAGE_PATH}${compressedFilename}`;
    }

    async preload(filename) {
        if (this.cache.has(filename) || this.loading.has(filename)) {
            return;
        }

        this.loading.add(filename);

        try {
            const response = await fetch(`${IMAGE_PATH}${filename}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const base64 = await this.blobToBase64(blob);

            this.set(filename, base64);
            this.updateAvatarInDOM(filename, base64);
        } catch (e) {
            console.warn(`[AvatarService] Failed to preload ${filename}:`, e);
        } finally {
            this.loading.delete(filename);
        }
    }

    async preloadAll(filenames) {
        // 使用 requestIdleCallback 在空闲时预加载，不阻塞主流程
        const preloadTask = () => {
            filenames.forEach(filename => {
                if (!this.cache.has(filename) && !this.loading.has(filename)) {
                    this.preload(filename).catch(() => {});
                }
            });
        };
        
        if ('requestIdleCallback' in window) {
            requestIdleCallback(preloadTask, { timeout: 3000 });
        } else {
            setTimeout(preloadTask, 2000);
        }
    }

    // 智能获取头像 URL，优先使用压缩版本
    getOptimizedUrl(filename) {
        // 检查缓存
        const cached = this.get(filename);
        if (cached) {
            return cached;
        }

        // 如果已经是压缩版本路径
        if (filename.includes('compressed/') || filename.includes('_compressed')) {
            return `${IMAGE_PATH}${filename}`;
        }

        // 尝试使用压缩版本
        const name = filename.replace(/\.[^/.]+$/, '');
        const compressedPath = `compressed/${name}_compressed.jpg`;

        // 返回压缩版本路径
        return `${IMAGE_PATH}${compressedPath}`;
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    updateAvatarInDOM(filename, base64) {
        const selector = `[style*="${IMAGE_PATH}${filename}"], [style*="${filename}"]`;
        document.querySelectorAll(selector).forEach(el => {
            const currentStyle = el.style.backgroundImage;
            if (currentStyle.includes(filename)) {
                el.style.backgroundImage = `url('${base64}')`;
            }
        });
    }

    clear() {
        this.cache.clear();
        storageService.clearAvatarCache();
    }

    getCacheSize() {
        return this.cache.size;
    }

    isLoading(filename) {
        return this.loading.has(filename);
    }
}

export const avatarService = new AvatarService();
export { IMAGE_PATH, AVATAR_CACHE_VERSION };
export default AvatarService;
