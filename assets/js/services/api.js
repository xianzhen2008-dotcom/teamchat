const API_BASE = window.location.origin;
const GATEWAY_TOKEN_KEY = 'team_chat_token';

function getInitialGatewayToken() {
    return new URLSearchParams(window.location.search).get('token')
        || localStorage.getItem(GATEWAY_TOKEN_KEY)
        || '';
}

class ApiService {
    constructor() {
        this.baseUrl = API_BASE;
        this.authToken = getInitialGatewayToken();
    }

    withToken(endpoint) {
        if (!this.authToken) return endpoint;
        const separator = endpoint.includes('?') ? '&' : '?';
        return `${endpoint}${separator}token=${encodeURIComponent(this.authToken)}`;
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
        if (sessionToken) {
            defaultHeaders['X-Session-Token'] = sessionToken;
        }
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
        return this.request(this.withToken('/history'));
    }

    async saveMessage(message) {
        return this.request(this.withToken('/history'), {
            method: 'POST',
            body: JSON.stringify(message)
        });
    }

    async updateMessage(timestamp, updates) {
        return this.request(this.withToken('/history'), {
            method: 'PUT',
            body: JSON.stringify({
                timestamp,
                updates
            })
        });
    }

    async deleteMessage(timestamp) {
        return this.request(this.withToken('/history'), {
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
        return this.request(this.withToken('/metrics'));
    }

    async sendToAgent(agentId, message, sender = '我', targetSessionId = null, options = {}) {
        return this.request('/api/send-to-agent', {
            method: 'POST',
            body: JSON.stringify({
                agentId,
                message,
                sender,
                targetSessionId,
                channel: options?.channel || undefined,
                source: options?.source || undefined,
                routeAgentId: options?.routeAgentId || undefined,
                metadata: options?.metadata || undefined
            })
        });
    }

    async getAgentThreadSummary() {
        return this.request('/api/agent-threads/summary');
    }

    async listAgentThreads(agentId = 'main', options = {}) {
        const params = new URLSearchParams();
        params.set('agentId', agentId);
        if (options.threadType) params.set('threadType', options.threadType);
        if (options.decision) params.set('decision', '1');
        if (options.overdue) params.set('overdue', '1');
        return this.request(`/api/agent-threads/threads?${params.toString()}`);
    }

    async getAgentThread(threadId) {
        return this.request(`/api/agent-threads/threads/${encodeURIComponent(threadId)}`);
    }

    async createAgentThread(payload) {
        return this.request('/api/agent-threads/threads', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async postAgentThreadMessage(payload) {
        return this.request('/api/agent-threads/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async updateAgentThreadState(payload) {
        return this.request('/api/agent-threads/state', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async heartbeatAgentThread(agentId, note) {
        return this.request('/api/agent-threads/heartbeat', {
            method: 'POST',
            body: JSON.stringify({ agentId, note })
        });
    }

    async uploadFiles(formData, onProgress) {
        const sessionToken = this.getSessionToken();
        const url = sessionToken
            ? `${this.baseUrl}/upload?session=${encodeURIComponent(sessionToken)}`
            : `${this.baseUrl}/upload`;

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
            if (this.authToken) {
                xhr.setRequestHeader('X-Auth-Token', this.authToken);
            }
            if (sessionToken) {
                xhr.setRequestHeader('X-Session-Token', sessionToken);
            }
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
