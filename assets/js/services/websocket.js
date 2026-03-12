const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const GATEWAY_URL = `${WS_PROTOCOL}//${window.location.host}/v1/gateway`;
const AUTH_TOKEN = '6ed82a04d1ee1f774459f0a64d19a79afda1dc10d8d1c49a';
const MAIN_KEY = 'main';
const CLIENT_ID = 'cli';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const HEARTBEAT_INTERVAL = 25000;
const MAX_MISSED_HEARTBEATS = 3;

class WebSocketService {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isManualClose = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.missedHeartbeats = 0;
        this.lastPongTime = Date.now();
        this.connectionQuality = 'good';
        this.connectReqId = null;

        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        this.onerror = null;
        this.onReconnecting = null;
        this.onQualityChange = null;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('[WS] Already connecting, skip');
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('[WS] Already connected, skip');
            return;
        }

        this.isManualClose = false;
        this.cancelReconnect();

        try {
            this.ws = new WebSocket(GATEWAY_URL);
        } catch (e) {
            console.error('[WS] Creation Failed:', e);
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[WS] Connected to gateway');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.missedHeartbeats = 0;
            this.updateConnectionQuality('good');

            this.connectReqId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            this.ws.send(JSON.stringify({
                type: 'connect',
                client_id: CLIENT_ID,
                auth_token: AUTH_TOKEN,
                channel: MAIN_KEY,
                request_id: this.connectReqId
            }));

            if (this.pingTimer) clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(JSON.stringify({ type: 'ping' }));
                        this.missedHeartbeats++;
                        if (this.missedHeartbeats > MAX_MISSED_HEARTBEATS) {
                            console.warn('[WS] Too many missed heartbeats, reconnecting...');
                            this.updateConnectionQuality('poor');
                            this.ws.close();
                        }
                    } catch (e) {
                        console.error('[WS] Ping failed:', e);
                    }
                }
            }, HEARTBEAT_INTERVAL);

            if (this.onopen) this.onopen();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'ping' || msg.event === 'ping') {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ type: 'pong' }));
                    }
                    return;
                }

                if (msg.type === 'pong') {
                    this.missedHeartbeats = 0;
                    this.lastPongTime = Date.now();
                    this.updateConnectionQuality('good');
                    return;
                }

                if (this.onmessage) this.onmessage(msg);
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        this.ws.onerror = (error) => {
            console.error('[WS] Error:', error);
            if (this.onerror) this.onerror(error);
        };

        this.ws.onclose = (event) => {
            console.log('[WS] Disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.connectReqId = null;

            if (this.pingTimer) {
                clearInterval(this.pingTimer);
                this.pingTimer = null;
            }

            if (this.onclose) this.onclose(event);

            if (!this.isManualClose) {
                this.scheduleReconnect();
            }
        };
    }

    disconnect() {
        this.isManualClose = true;
        this.cancelReconnect();

        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
    }

    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[WS] Cannot send: not connected');
            return false;
        }

        try {
            const payload = typeof data === 'string' ? data : JSON.stringify(data);
            this.ws.send(payload);
            return true;
        } catch (e) {
            console.error('[WS] Send failed:', e);
            return false;
        }
    }

    scheduleReconnect() {
        if (this.isManualClose) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

        this.reconnectAttempts++;
        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1),
            RECONNECT_MAX_DELAY
        );

        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        if (this.onReconnecting) {
            this.onReconnecting(this.reconnectAttempts, delay);
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    cancelReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    updateConnectionQuality(quality) {
        if (this.connectionQuality !== quality) {
            this.connectionQuality = quality;
            if (this.onQualityChange) {
                this.onQualityChange(quality);
            }
        }
    }

    resetReconnectAttempts() {
        this.reconnectAttempts = 0;
    }

    getConnectionLatency() {
        return Date.now() - this.lastPongTime;
    }
}

export const wsService = new WebSocketService();
export const websocketService = wsService;
export { GATEWAY_URL, AUTH_TOKEN, MAIN_KEY, CLIENT_ID };
export default WebSocketService;
