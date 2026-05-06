/**
 * Upload Service - 文件上传服务
 * 处理文件上传、进度跟踪、错误处理
 */

// 开发环境下使用 team_chat_server 端口
const UPLOAD_ENDPOINT = window.location.port === '5173' 
    ? 'http://localhost:18788/upload' 
    : '/upload';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export class UploadService {
    constructor(options = {}) {
        this.endpoint = options.endpoint || UPLOAD_ENDPOINT;
        this.maxSize = options.maxSize || MAX_FILE_SIZE;
        this.onProgress = options.onProgress || null;
        this.onError = options.onError || null;
        this.onSuccess = options.onSuccess || null;
    }

    isValidFile(file) {
        if (!file) return false;
        if (file.size > this.maxSize) {
            return { valid: false, error: `文件过大，最大支持 ${this.maxSize / 1024 / 1024}MB` };
        }
        return { valid: true };
    }

    async uploadFiles(files, options = {}) {
        const fileList = Array.from(files || []).filter(Boolean);
        if (!fileList.length) return [];

        for (const file of fileList) {
            const validation = this.isValidFile(file);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
        }

        const form = new FormData();
        for (const f of fileList) {
            form.append('files', f, f.name);
        }

        const sessionToken = localStorage.getItem('team_chat_session') || '';
        const endpoint = options.endpoint || this.endpoint;
        const uploadUrl = sessionToken && !endpoint.includes('session=')
            ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}session=${encodeURIComponent(sessionToken)}`
            : endpoint;
        
        try {
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: form,
                signal: options.signal,
                headers: sessionToken ? { 'X-Session-Token': sessionToken } : undefined
            });

            const data = await response.json().catch(() => null);

            if (!response.ok || !data?.ok) {
                throw new Error(data?.error || `上传失败 (${response.status})`);
            }

            const results = (data.files || []).map(f => ({
                name: f.name,
                url: f.url,
                mime: f.mime,
                size: f.size,
                path: f.path
            }));

            if (this.onSuccess) {
                this.onSuccess(results);
            }

            return results;
        } catch (error) {
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    async uploadSingle(file, options = {}) {
        const results = await this.uploadFiles([file], options);
        return results[0] || null;
    }

    createUploader(options = {}) {
        return {
            upload: (files) => this.uploadFiles(files, options),
            uploadSingle: (file) => this.uploadSingle(file, options)
        };
    }
}

export const uploadService = new UploadService();

export default uploadService;
