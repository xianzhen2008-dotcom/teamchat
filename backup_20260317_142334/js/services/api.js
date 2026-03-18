import { AUTH_TOKEN } from './websocket.js';

const API_BASE = window.location.origin;

class ApiService {
    constructor() {
        this.baseUrl = API_BASE;
        this.authToken = AUTH_TOKEN;
    }

    getSessionToken() {
        return localStorage.getItem('team_chat_session') || '';
    }

    async request(endpoint, options = {}) {
        let url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        const defaultHeaders = {
            'Content-Type': 'application/json'
        };

        if (this.authToken && !endpoint.includes('token=')) {
            defaultHeaders['X-Auth-Token'] = this.authToken;
        }

        const sessionToken = this.getSessionToken();
        if (sessionToken && !endpoint.includes('session=')) {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}session=${sessionToken}`;
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new ApiError(
                    errorData.error || `HTTP Error: ${response.status}`,
                    response.status,
                    errorData
                );
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(error.message || 'Network Error', 0, { originalError: error });
        }
    }

    async getHistory() {
        return this.request(`/history?token=${this.authToken}`);
    }

    async saveMessage(message) {
        return this.request(`/history?token=${this.authToken}`, {
            method: 'POST',
            body: JSON.stringify(message)
        });
    }

    async updateMessage(timestamp, updates) {
        return this.request(`/history?token=${this.authToken}`, {
            method: 'PUT',
            body: JSON.stringify({
                timestamp,
                updates
            })
        });
    }

    async deleteMessage(timestamp) {
        return this.request(`/history?token=${this.authToken}`, {
            method: 'DELETE',
            body: JSON.stringify({ timestamp })
        });
    }

    async checkAuth(sessionToken) {
        return this.request('/api/check-auth', {
            headers: {
                'X-Session-Token': sessionToken
            }
        });
    }

    async login(password) {
        return this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    }

    async logout() {
        return this.request('/api/logout', {
            method: 'POST'
        });
    }

    async getMetrics() {
        return this.request(`/metrics?token=${this.authToken}`);
    }

    async uploadFiles(formData, onProgress) {
        const url = `${this.baseUrl}/upload`;

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable && onProgress) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    onProgress(percent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.ok) {
                            resolve(response.files || []);
                        } else {
                            reject(new Error(response.error || 'Upload failed'));
                        }
                    } catch (e) {
                        reject(new Error('Invalid response format'));
                    }
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });

            xhr.open('POST', url);
            xhr.send(formData);
        });
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    getBaseUrl() {
        return this.baseUrl;
    }
}

class ApiError extends Error {
    constructor(message, status, data = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

export const apiService = new ApiService();
export { ApiError, API_BASE };
export default ApiService;
