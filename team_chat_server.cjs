#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

try {
  require('dotenv').config();
} catch {
  // dotenv is optional at runtime.
}

const BASE_DIR = __dirname;
const PORT = Number(process.env.TEAMCHAT_PORT || process.env.PORT || 18788);
const DATA_DIR = path.resolve(BASE_DIR, process.env.TEAMCHAT_DATA_DIR || 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const HISTORY_FILE = path.join(DATA_DIR, 'messages.json');
const NOTIFICATION_FILE = path.join(DATA_DIR, 'notifications.json');
const PUBLIC_BASE_URL = process.env.TEAMCHAT_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const AUTH_MODE = String(process.env.TEAMCHAT_AUTH_MODE || 'none').toLowerCase();
const LOGIN_PASSWORD = process.env.TEAMCHAT_PASSWORD || '';
const DEMO_MODE = String(process.env.TEAMCHAT_DEMO_MODE || 'true').toLowerCase() !== 'false';
const VERSION = readVersion();
const startedAt = Date.now();

const AGENTS = [
  { id: 'main', agentId: 'main', name: 'Coordinator', role: 'Team lead', status: 'idle', img: 'agent-main.svg' },
  { id: 'writer', agentId: 'writer', name: 'Writer', role: 'Content and documentation', status: 'idle', img: 'agent-writer.svg' },
  { id: 'mail', agentId: 'mail', name: 'Mail', role: 'Inbox adapter', status: 'idle', img: 'agent-mail.svg' },
  { id: 'data', agentId: 'data', name: 'Data', role: 'Analytics', status: 'idle', img: 'agent-data.svg' },
  { id: 'qa', agentId: 'qa', name: 'QA', role: 'Quality assurance', status: 'idle', img: 'agent-qa.svg' },
  { id: 'pm', agentId: 'pm', name: 'PM', role: 'Product planning', status: 'idle', img: 'agent-pm.svg' },
  { id: 'dev', agentId: 'dev', name: 'Developer', role: 'Implementation', status: 'idle', img: 'agent-dev.svg' },
  { id: 'frontend', agentId: 'frontend', name: 'Frontend', role: 'UI engineering', status: 'idle', img: 'agent-fe.svg' },
  { id: 'backend', agentId: 'backend', name: 'Backend', role: 'Server engineering', status: 'idle', img: 'agent-be.svg' },
  { id: 'mobile', agentId: 'mobile', name: 'Mobile', role: 'Mobile app', status: 'idle', img: 'agent-mobile.svg' },
  { id: 'devops', agentId: 'devops', name: 'Ops', role: 'Operations', status: 'idle', img: 'agent-ops.svg' },
  { id: 'finance', agentId: 'finance', name: 'Finance', role: 'Finance assistant', status: 'idle', img: 'agent-finance.svg' }
];

const clients = new Set();
const sessions = new Map();

ensureRuntimeFiles();

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error('[TeamChat] Request failed:', error);
    sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
});

const wss = new WebSocketServer({ server, path: '/v1/gateway' });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw || ''));
    } catch {
      ws.send(JSON.stringify({ type: 'res', ok: false, error: { message: 'Invalid JSON' } }));
      return;
    }
    handleWsMessage(ws, msg);
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      clients.delete(ws);
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      clients.delete(ws);
    }
  }
}, 30_000).unref();

server.listen(PORT, () => {
  console.log(`[TeamChat] Open-source server running at ${PUBLIC_BASE_URL}`);
  console.log(`[TeamChat] Data directory: ${DATA_DIR}`);
  console.log(`[TeamChat] Auth mode: ${AUTH_MODE}`);
});

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  if (pathname === '/api/version' && method === 'GET') {
    return sendJson(res, 200, { version: VERSION, timestamp: Date.now() });
  }

  if (pathname === '/api/check-auth' && method === 'GET') {
    return sendJson(res, 200, { ok: true, authenticated: isRequestAuthenticated(req, url), authMode: AUTH_MODE });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const body = await readJsonBody(req);
    if (AUTH_MODE === 'password' && LOGIN_PASSWORD && body.password !== LOGIN_PASSWORD) {
      return sendJson(res, 401, { ok: false, error: 'Invalid password' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { createdAt: Date.now() });
    return sendJson(res, 200, { ok: true, token, session: token, sessionToken: token, authMode: AUTH_MODE });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = req.headers['x-session-token'] || url.searchParams.get('session');
    if (token) sessions.delete(String(token));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/trusted-device/check' && method === 'GET') {
    return sendJson(res, 200, { ok: true, trusted: false, enabled: false });
  }

  if (pathname === '/api/gateway-token' && method === 'GET') {
    return sendJson(res, 200, { token: process.env.TEAMCHAT_GATEWAY_TOKEN || '', enabled: Boolean(process.env.TEAMCHAT_GATEWAY_TOKEN) });
  }

  if (pathname === '/api/agents' && method === 'GET') {
    return sendJson(res, 200, AGENTS);
  }

  if (pathname === '/history') {
    return handleHistory(req, res, url);
  }

  if (pathname === '/api/messages/since' && method === 'GET') {
    const timestamp = Number(url.searchParams.get('timestamp') || 0);
    const messages = loadMessages().filter((message) => Number(message.timestamp || 0) > timestamp);
    const latestTimestamp = messages.reduce((max, message) => Math.max(max, Number(message.timestamp || 0)), timestamp);
    return sendJson(res, 200, { ok: true, count: messages.length, latestTimestamp, messages });
  }

  if (pathname === '/api/send-to-agent' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = createAgentExchange(body);
    broadcastChat(result.agentMessage);
    return sendJson(res, 200, { ok: true, message: 'Message accepted', agentId: result.agentId, sessionId: result.sessionId });
  }

  if (pathname === '/metrics' && method === 'GET') {
    return sendJson(res, 200, buildMetrics());
  }

  if (pathname === '/api/system-metrics' && method === 'GET') {
    return sendJson(res, 200, buildSystemMetrics());
  }

  if (pathname === '/api/health/status' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      gateway: { status: adapterEnabled('TEAMCHAT_GATEWAY_ENABLED') ? 'configured' : 'disabled' },
      adapters: buildAdapterStatus(),
      updatedAt: Date.now()
    });
  }

  if (pathname === '/api/email-sync/status' && method === 'GET') {
    return sendJson(res, 200, {
      enabled: adapterEnabled('TEAMCHAT_EMAIL_ENABLED'),
      status: adapterEnabled('TEAMCHAT_EMAIL_ENABLED') ? 'configured' : 'disabled',
      pendingSync: 0,
      pendingIndex: 0,
      lastCheckTime: Date.now(),
      lastSyncTime: null,
      error: null
    });
  }

  if (pathname === '/api/email-sync/trigger' && method === 'POST') {
    return sendJson(res, 200, { ok: true, status: 'disabled', message: 'Email adapter is disabled in the open-source default configuration.' });
  }

  if (pathname === '/api/notifications/history' && method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 80)));
    return sendJson(res, 200, { ok: true, notifications: loadNotifications().slice(-limit).reverse() });
  }

  if (pathname === '/api/open-local-file' && method === 'POST') {
    return sendJson(res, 200, { ok: false, disabled: true, message: 'Local file opening is disabled in the open-source web build.' });
  }

  if (pathname.startsWith('/api/ops/') || pathname.startsWith('/api/admin/') || pathname === '/api/tunnel' || pathname === '/api/mail-tunnel') {
    return sendJson(res, 200, { ok: true, status: 'disabled', message: 'Operations adapters are disabled by default.' });
  }

  if (pathname === '/upload' && method === 'POST') {
    return handleUpload(req, res);
  }

  if (pathname.startsWith('/uploads/')) {
    return serveFile(res, path.join(UPLOAD_DIR, pathname.slice('/uploads/'.length)), UPLOAD_DIR);
  }

  if (pathname === '/v1/gateway' && method === 'GET') {
    return sendJson(res, 200, { ok: true, websocket: true, path: '/v1/gateway' });
  }

  return serveStatic(req, res, pathname);
}

function handleWsMessage(ws, msg) {
  if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  if (msg.type === 'req' && msg.method === 'connect') {
    ws.send(JSON.stringify({
      type: 'res',
      id: msg.id,
      ok: true,
      result: {
        server: 'teamchat-oss',
        version: VERSION,
        adapters: buildAdapterStatus()
      }
    }));
    return;
  }

  if (msg.type === 'req' && msg.method === 'agent') {
    const params = msg.params || {};
    const result = createAgentExchange({
      agentId: params.agentId || 'main',
      message: stripSystemHint(params.message || ''),
      sender: 'You',
      targetSessionId: params.sessionKey || null,
      channel: 'teamchat',
      source: 'teamchat'
    });
    ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, result: { sessionId: result.sessionId } }));
    setTimeout(() => broadcastChat(result.agentMessage), 180);
    return;
  }

  ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: false, error: { message: 'Unsupported method' } }));
}

function handleHistory(req, res, url) {
  const method = req.method || 'GET';
  const messages = loadMessages();

  if (method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || 0);
    const result = limit > 0 ? messages.slice(-limit) : messages;
    return sendJson(res, 200, result);
  }

  if (method === 'POST') {
    return readJsonBody(req).then((message) => {
      const saved = saveMessage(normalizeMessage(message));
      sendJson(res, 200, { ok: true, message: saved });
    });
  }

  if (method === 'PUT') {
    return readJsonBody(req).then((body) => {
      const timestamp = Number(body.timestamp || 0);
      const updates = body.updates || {};
      const next = messages.map((message) => Number(message.timestamp || 0) === timestamp ? { ...message, ...updates } : message);
      saveMessages(next);
      sendJson(res, 200, { ok: true });
    });
  }

  if (method === 'DELETE') {
    return readJsonBody(req).then((body) => {
      const timestamp = Number(body.timestamp || 0);
      saveMessages(messages.filter((message) => Number(message.timestamp || 0) !== timestamp));
      sendJson(res, 200, { ok: true });
    });
  }

  return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
}

function createAgentExchange(payload = {}) {
  const agentId = normalizeAgentId(payload.agentId || 'main');
  const agent = AGENTS.find((item) => item.agentId === agentId) || AGENTS[0];
  const now = Date.now();
  const sessionId = payload.targetSessionId || `agent:${agentId}:${shortId()}`;
  const userText = String(payload.message || '').trim();
  const userMessage = normalizeMessage({
    id: payload.metadata?.clientMessageId || `msg_${shortId()}`,
    sender: payload.sender || 'You',
    text: userText,
    isUser: true,
    timestamp: now,
    status: 'sent',
    channel: payload.channel || 'teamchat',
    source: payload.source || 'teamchat',
    sessionId,
    agentId,
    metadata: {
      ...(payload.metadata || {}),
      channel: payload.channel || 'teamchat',
      source: payload.source || 'teamchat',
      routeAgentId: agentId,
      routeSessionKey: sessionId
    }
  });

  const agentMessage = normalizeMessage({
    id: `run_${shortId()}`,
    runId: `run_${shortId()}`,
    sender: agent.name,
    agentId,
    text: buildDemoReply(agent, userText),
    isUser: false,
    timestamp: now + 200,
    status: 'received',
    channel: 'teamchat',
    source: 'teamchat',
    sessionId,
    model: process.env.TEAMCHAT_DEMO_MODEL || 'demo-agent',
    modelInfo: { modelId: process.env.TEAMCHAT_DEMO_MODEL || 'demo-agent' },
    thinking: 'Demo mode: TeamChat accepted the message, routed it to a mock adapter, and rendered a simulated agent response.',
    actionLogs: [
      {
        type: 'thinking',
        title: 'Routing',
        content: `Resolved target agent: ${agent.name} (${agent.agentId})`,
        status: 'success',
        time: now
      },
      {
        type: 'tool_use',
        title: 'Mock adapter',
        content: 'Open-source default mode does not call private OpenClaw, WeCom, Weixin, Feishu, or email services.',
        status: 'info',
        time: now + 80
      }
    ]
  });

  saveMessage(userMessage);
  saveMessage(agentMessage);
  appendNotification({
    id: `notice_${shortId()}`,
    level: 'ok',
    title: 'Demo message routed',
    body: `${agent.name} received a TeamChat demo message.`,
    timestamp: Date.now(),
    meta: 'Open-source mock adapter'
  });

  return { agentId, sessionId, userMessage, agentMessage };
}

function broadcastChat(message) {
  const payload = {
    type: 'event',
    event: 'chat',
    payload: {
      runId: message.runId || message.id || `run_${shortId()}`,
      state: 'final',
      sessionKey: message.sessionId || `agent:${message.agentId || 'main'}:demo`,
      model: message.model || 'demo-agent',
      message: {
        role: 'assistant',
        sessionId: message.sessionId,
        model: message.model || 'demo-agent',
        content: [
          { type: 'thinking', thinking: message.thinking || '' },
          ...(message.actionLogs || []).map((item) => ({
            type: item.type === 'tool_use' ? 'tool_use' : 'text',
            name: item.type === 'tool_use' ? item.title : undefined,
            text: item.type === 'tool_use' ? undefined : item.content,
            input: item.type === 'tool_use' ? { note: item.content } : undefined
          })),
          { type: 'text', text: message.text || '' }
        ]
      }
    }
  };
  const raw = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(raw);
    }
  }
}

function normalizeMessage(message = {}) {
  return {
    id: message.id || message.runId || `msg_${shortId()}`,
    sender: message.sender || (message.isUser ? 'You' : 'Coordinator'),
    text: String(message.text || ''),
    isUser: Boolean(message.isUser),
    timestamp: Number(message.timestamp || Date.now()),
    status: message.status || (message.isUser ? 'sent' : 'received'),
    channel: message.channel || message.metadata?.channel || 'teamchat',
    source: message.source || message.metadata?.source || 'teamchat',
    sessionId: message.sessionId || null,
    agentId: message.agentId || null,
    runId: message.runId || null,
    model: message.model || null,
    modelInfo: message.modelInfo || undefined,
    thinking: message.thinking || '',
    tools: Array.isArray(message.tools) ? message.tools : [],
    actionLogs: Array.isArray(message.actionLogs) ? message.actionLogs : [],
    metadata: message.metadata || {}
  };
}

function saveMessage(message) {
  const normalized = normalizeMessage(message);
  const messages = loadMessages();
  const key = normalized.id || normalized.runId;
  const duplicate = messages.find((item) => (key && (item.id === key || item.runId === key))
    || (item.timestamp === normalized.timestamp && item.sender === normalized.sender && item.text === normalized.text));
  if (!duplicate) {
    messages.push(normalized);
    saveMessages(messages.slice(-1000));
  }
  return normalized;
}

function loadMessages() {
  return readJsonFile(HISTORY_FILE, []);
}

function saveMessages(messages) {
  writeJsonFile(HISTORY_FILE, messages.map(normalizeMessage));
}

function loadNotifications() {
  return readJsonFile(NOTIFICATION_FILE, []);
}

function appendNotification(notice) {
  const next = [...loadNotifications(), notice].slice(-200);
  writeJsonFile(NOTIFICATION_FILE, next);
}

function buildDemoReply(agent, message) {
  const text = message ? `I received: “${message.slice(0, 160)}”.` : 'I received your message.';
  return `${text}\n\nThis is the open-source demo adapter. Connect your own OpenClaw, LLM, or workflow backend through the documented adapter environment variables.`;
}

function buildMetrics() {
  const messages = loadMessages();
  const activeAgents = new Set(messages.filter((message) => !message.isUser && message.agentId).map((message) => message.agentId)).size;
  return {
    totalMessages: messages.length,
    activeAgents,
    onlineUsers: clients.size,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    messagesPerSecond: 0,
    successRate: 100
  };
}

function buildSystemMetrics() {
  const mem = process.memoryUsage();
  return {
    ok: true,
    status: 'ok',
    totalMessages: loadMessages().length,
    activeAgents: buildMetrics().activeAgents,
    onlineUsers: clients.size,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    memoryUsage: Math.round(mem.rss / 1024 / 1024),
    cpuUsage: 0,
    cleanup: {
      reclaimableBytes: 0,
      fileCount: 0,
      targets: []
    },
    adapters: buildAdapterStatus()
  };
}

function buildAdapterStatus() {
  return {
    openclawGateway: adapterEnabled('TEAMCHAT_GATEWAY_ENABLED') ? 'configured' : 'disabled',
    wecom: adapterEnabled('TEAMCHAT_WECOM_ENABLED') ? 'configured' : 'disabled',
    weixin: adapterEnabled('TEAMCHAT_WEIXIN_ENABLED') ? 'configured' : 'disabled',
    feishu: adapterEnabled('TEAMCHAT_FEISHU_ENABLED') ? 'configured' : 'disabled',
    email: adapterEnabled('TEAMCHAT_EMAIL_ENABLED') ? 'configured' : 'disabled',
    tunnel: adapterEnabled('TEAMCHAT_TUNNEL_ENABLED') ? 'configured' : 'disabled'
  };
}

function adapterEnabled(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function isRequestAuthenticated(req, url) {
  if (AUTH_MODE === 'none') return true;
  const token = req.headers['x-session-token'] || url.searchParams.get('session');
  return Boolean(token && sessions.has(String(token)));
}

async function handleUpload(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) return sendJson(res, 400, { ok: false, error: 'Empty upload' });

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return sendJson(res, 400, { ok: false, error: 'Expected multipart/form-data' });

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const files = [];
  for (const part of splitBuffer(buffer, boundary)) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const filenameMatch = header.match(/filename="([^"]+)"/i);
    if (!filenameMatch) continue;
    const originalName = path.basename(filenameMatch[1]).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
    const token = `${Date.now()}_${shortId()}_${originalName}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, token), body);
    files.push({ name: originalName, url: `/uploads/${encodeURIComponent(token)}`, size: body.length });
  }

  return sendJson(res, 200, { ok: true, files });
}

function splitBuffer(buffer, boundary) {
  const parts = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    start += boundary.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const end = buffer.indexOf(boundary, start);
    if (end === -1) break;
    parts.push(buffer.slice(start, end));
    start = end;
  }
  return parts;
}

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  if (relativePath === '/team_chat_login.html' && AUTH_MODE === 'none') {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  if (relativePath.includes('..')) {
    return sendJson(res, 400, { ok: false, error: 'Invalid path' });
  }

  const filePath = path.join(BASE_DIR, relativePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath, BASE_DIR);
  }

  const publicPath = path.join(BASE_DIR, 'public', relativePath);
  if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
    return serveFile(res, publicPath, path.join(BASE_DIR, 'public'));
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

function serveFile(res, filePath, root) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(root))) {
    return sendJson(res, 403, { ok: false, error: 'Forbidden' });
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return sendJson(res, 404, { ok: false, error: 'Not found' });
  }
  res.writeHead(200, {
    'Content-Type': mimeType(resolved),
    'Cache-Control': resolved.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  fs.createReadStream(resolved).pipe(res);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function ensureRuntimeFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    writeJsonFile(HISTORY_FILE, DEMO_MODE ? demoMessages() : []);
  }
  if (!fs.existsSync(NOTIFICATION_FILE)) {
    writeJsonFile(NOTIFICATION_FILE, [{
      id: 'welcome',
      level: 'ok',
      title: 'TeamChat is ready',
      body: 'Open-source demo mode is running with private adapters disabled.',
      timestamp: Date.now(),
      meta: 'Local demo'
    }]);
  }
}

function demoMessages() {
  const now = Date.now();
  return [
    normalizeMessage({
      id: 'demo-user-1',
      sender: 'You',
      text: 'Show me what TeamChat can do.',
      isUser: true,
      timestamp: now - 60_000,
      status: 'sent',
      channel: 'teamchat',
      source: 'teamchat',
      sessionId: 'agent:main:demo',
      agentId: 'main'
    }),
    normalizeMessage({
      id: 'demo-agent-1',
      runId: 'demo-agent-1',
      sender: 'Coordinator',
      agentId: 'main',
      text: 'TeamChat provides a real-time multi-agent workspace with message routing, action logs, Markdown rendering, notifications, filters, and mobile-friendly layouts.',
      isUser: false,
      timestamp: now - 45_000,
      status: 'received',
      channel: 'teamchat',
      source: 'teamchat',
      sessionId: 'agent:main:demo',
      model: 'demo-agent',
      modelInfo: { modelId: 'demo-agent' },
      thinking: 'Demo mode uses a local mock adapter so the open-source project works without private services.',
      actionLogs: [{
        type: 'thinking',
        title: 'Demo adapter',
        content: 'Loaded a clean demo conversation from the local data directory.',
        status: 'success',
        time: now - 50_000
      }]
    })
  ];
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readVersion() {
  try {
    const html = fs.readFileSync(path.join(BASE_DIR, 'index.html'), 'utf8');
    return html.match(/id="version-info"[^>]*>\s*(v?\d+)/i)?.[1] || 'v1';
  } catch {
    return 'v1';
  }
}

function stripSystemHint(message) {
  return String(message || '').replace(/\n+\[SYSTEM\][\s\S]*?\[\/SYSTEM\]\s*$/i, '').trim();
}

function normalizeAgentId(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = {
    lobster: 'main',
    coordinator: 'main',
    writer: 'writer',
    mail: 'mail',
    data: 'data',
    qa: 'qa',
    pm: 'pm',
    product: 'pm',
    dev: 'dev',
    developer: 'dev',
    frontend: 'frontend',
    fe: 'frontend',
    backend: 'backend',
    be: 'backend',
    mobile: 'mobile',
    devops: 'devops',
    ops: 'devops',
    finance: 'finance'
  };
  return aliases[raw] || raw || 'main';
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
  }[ext] || 'application/octet-stream';
}
