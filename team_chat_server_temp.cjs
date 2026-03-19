const http = require("http");
const httpProxy = require("http-proxy");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const axios = require("axios");
const https = require("https");
const url = require("url");
const readline = require("readline");

const { handleMuseApi } = require("./muse-api.cjs");
const { 
  handleRestartGateway, 
  handleRestartTeamChat, 
  handleRestartTunnel, 
  handleClearCache 
} = require("./admin-apis.cjs");
const { 
  initEmailSyncService, 
  stopEmailSyncService, 
  syncEmails 
} = require("./email_sync_service.cjs");

// 企微 Webhook 通知模块
const WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=8603f9a7-daf6-467f-b8e3-beeedafcaf5e';
const WECOM_NOTIFY_ENABLED = false; // 已禁用企微通知

// ===== 基础路径定义 =====
const BASE_DIR = __dirname;
const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const HISTORY_FILE = path.join(BASE_DIR, "team_chat_history.json");
const ERROR_LOG_FILE = path.join(BASE_DIR, 'team_chat_errors.log');
const METRICS_FILE = path.join(BASE_DIR, 'team_chat_metrics.json');
const METRICS_HISTORY_FILE = path.join(BASE_DIR, 'team_chat_metrics_history.json');
const ALERT_COOLDOWN = 60000; // 告警冷却时间 60秒
const DAILY_STATS_INTERVAL = 24 * 60 * 60 * 1000; // 每天统计一次
const DAILY_STATS_FILE = path.join(BASE_DIR, 'team_chat_daily_stats.json');
let lastAlertTime = 0;
let lastDailyStatsTime = 0;

// ===== Agent Sessions 监控 =====
const agentFileStates = new Map(); // agentId -> { currentFile, currentSize }
const agentLogsBuffer = new Map(); // agentId -> [{ type, content, time }]
const agentLastActivity = new Map(); // agentId -> timestamp
const MAX_LOGS_PER_AGENT = 100;
const sseClients = new Set(); // SSE 客户端连接

// 获取所有 agent 的 sessions 目录
function initAgentSessionsMonitor() {
    try {
        if (!fs.existsSync(AGENTS_DIR)) {
            console.log('[Sessions Monitor] Agents directory not found:', AGENTS_DIR);
            return;
        }
        
        const agents = fs.readdirSync(AGENTS_DIR).filter(f => {
            const stat = fs.statSync(path.join(AGENTS_DIR, f));
            return stat.isDirectory();
        });
        
        agents.forEach(agentId => {
            const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
            if (fs.existsSync(sessionsDir)) {
                agentFileStates.set(agentId, { currentFile: null, currentSize: 0 });
                console.log(`[Sessions Monitor] Monitoring: ${agentId}`);
            }
        });
        
        console.log(`[Sessions Monitor] Initialized ${agentFileStates.size} agents`);
        
        // 加载近3天历史日志
        loadHistoryLogs();
        
        // 启动轮询
        setInterval(checkAgentSessions, 500);
        
        // 每30秒广播活动状态
        setInterval(broadcastActivityStatus, 30000);
    } catch (e) {
        console.error('[Sessions Monitor] Init error:', e.message);
    }
}

// 获取最新的 session 文件
function getLatestSessionFile(agentId) {
    const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
    try {
        const files = fs.readdirSync(sessionsDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => {
                const fullPath = path.join(sessionsDir, f);
                return { name: f, path: fullPath, mtime: fs.statSync(fullPath).mtime };
            })
            .sort((a, b) => b.mtime - a.mtime);
        return files.length > 0 ? files[0] : null;
    } catch (e) {
        return null;
    }
}

// 检查 agent sessions 更新
async function checkAgentSessions() {
    for (const [agentId, state] of agentFileStates) {
        try {
            const latest = getLatestSessionFile(agentId);
            if (!latest) continue;
            
            // 检测文件切换
            if (!state.currentFile || latest.path !== state.currentFile.path) {
                state.currentFile = latest;
                state.currentSize = fs.statSync(latest.path).size;
            } else {
                const stats = fs.statSync(latest.path);
                if (stats.size > state.currentSize) {
                    await processNewSessionContent(agentId, latest.path, state.currentSize, stats.size);
                    state.currentSize = stats.size;
                } else if (stats.size < state.currentSize) {
                    state.currentSize = stats.size;
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

// 处理新的 session 内容
async function processNewSessionContent(agentId, filePath, start, end) {
    const stream = fs.createReadStream(filePath, { start, end });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    
    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const data = JSON.parse(line);
            const logs = parseSessionLog(agentId, data);
            logs.forEach(log => {
                addAgentLog(agentId, log);
                broadcastToSSEClients(log);
            });
        } catch (e) {
            // Ignore parse errors
        }
    }
}

// 解析 session 日志
function parseSessionLog(agentId, data) {
    const logs = [];
    if (data.type !== 'message' || !data.message) return logs;
    
    const msg = data.message;
    const role = msg.role;
    const timestamp = data.timestamp || msg.timestamp || Date.now();
    
    // 解析时间戳
    let logTime = Date.now();
    if (typeof timestamp === 'string') {
        logTime = new Date(timestamp).getTime() || Date.now();
    } else if (typeof timestamp === 'number') {
        logTime = timestamp;
    }
    
    if (role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
            // 思考内容
            if (block.type === 'thinking' && block.thinking) {
                logs.push({
                    agentId,
                    type: 'thinking',
                    icon: '🧠',
                    title: '思考中',
                    content: typeof block.thinking === 'string' ? block.thinking : JSON.stringify(block.thinking),
                    time: logTime
                });
            }
            // 文本内容
            if (block.type === 'text' && block.text) {
                // 只记录非空文本，作为完成日志
                if (block.text.trim().length > 0 && block.text.length < 500) {
                    logs.push({
                        agentId,
                        type: 'text',
                        icon: '💬',
                        title: '回复',
                        content: block.text.substring(0, 200),
                        time: logTime
                    });
                }
            }
            // 工具调用
            if (block.type === 'toolCall' || block.type === 'tool_use') {
                const toolName = block.name || block.toolName || 'unknown';
                logs.push({
                    agentId,
                    type: 'tool_call',
                    icon: '🔧',
                    title: `调用工具: ${toolName}`,
                    content: JSON.stringify(block.arguments || block.input || {}, null, 2),
                    time: logTime
                });
            }
            // 工具结果
            if (block.type === 'toolResult' || block.type === 'tool_result') {
                const resultContent = typeof block.content === 'string' 
                    ? block.content 
                    : JSON.stringify(block.content);
                logs.push({
                    agentId,
                    type: 'tool_result',
                    icon: '✅',
                    title: `工具返回`,
                    content: resultContent.substring(0, 500),
                    time: logTime
                });
            }
        }
    }
    
    return logs;
}

// 加载历史日志（近3天）
function loadHistoryLogs() {
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    
    for (const [agentId, state] of agentFileStates) {
        try {
            const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
            if (!fs.existsSync(sessionsDir)) continue;
            
            const files = fs.readdirSync(sessionsDir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => {
                    const fullPath = path.join(sessionsDir, f);
                    const stat = fs.statSync(fullPath);
                    return { name: f, path: fullPath, mtime: stat.mtime };
                })
                .filter(f => f.mtime.getTime() >= threeDaysAgo)
                .sort((a, b) => a.mtime - b.mtime);  // 按时间正序
            
            // 读取每个文件
            for (const file of files) {
                try {
                    const content = fs.readFileSync(file.path, 'utf8');
                    const lines = content.split('\n').filter(l => l.trim());
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            const logs = parseSessionLog(agentId, data);
                            logs.forEach(log => {
                                // 只添加在3天内的日志
                                if (log.time >= threeDaysAgo) {
                                    addAgentLog(agentId, log);
                                }
                            });
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                } catch (e) {
                    // Ignore file read errors
                }
            }
            
            console.log(`[Sessions Monitor] Loaded history for ${agentId}: ${agentLogsBuffer.get(agentId)?.length || 0} logs`);
        } catch (e) {
            console.error(`[Sessions Monitor] Error loading history for ${agentId}:`, e.message);
        }
    }
}

// 添加 agent 日志
function addAgentLog(agentId, log) {
    if (!agentLogsBuffer.has(agentId)) {
        agentLogsBuffer.set(agentId, []);
    }
    const logs = agentLogsBuffer.get(agentId);
    logs.unshift(log);
    if (logs.length > MAX_LOGS_PER_AGENT) {
        logs.pop();
    }
    
    // 更新最后活动时间
    agentLastActivity.set(agentId, log.time || Date.now());
    
    // 实时推送到 SSE 客户端
    pushLogToSSEClients(agentId, log);
}

// 推送日志到 SSE 客户端
function pushLogToSSEClients(agentId, log) {
    if (sseClients.size === 0) return;
    
    const sseData = `data: ${JSON.stringify({ ...log, agentId })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(sseData);
        } catch (e) {
            sseClients.delete(client);
        }
    });
}

// 获取 agent 活动状态
function getAgentActivityStatus(agentId) {
    const lastActivity = agentLastActivity.get(agentId);
    if (!lastActivity) {
        return { status: 'unknown', lastActivity: null };
    }
    
    const now = Date.now();
    const elapsed = now - lastActivity;
    
    if (elapsed < 60000) { // 1分钟内
        return { status: 'busy', lastActivity };
    } else if (elapsed < 300000) { // 5分钟内
        return { status: 'online', lastActivity };
    } else {
        return { status: 'stale', lastActivity };
    }
}

// 获取所有 agent 活动状态
function getAllAgentActivityStatus() {
    const status = {};
    for (const [agentId] of agentFileStates) {
        status[agentId] = getAgentActivityStatus(agentId);
    }
    return status;
}

// Agent 名称映射
const AGENT_NAMES = {
    'main': '小龙虾',
    'dev': '小码',
    'qa': '小测',
    'mail': '小邮',
    'data': '小数',
    'writer': '小文',
    'pm': '小产',
    'finance': '小财',
    'devops': '小运',
    'mobile': '小移',
    'frontend': '小前',
    'backend': '小后'
};

// Agent 图标映射
const AGENT_ICONS = {
    'main': '🦞',
    'dev': '💻',
    'qa': '🧪',
    'mail': '📧',
    'data': '📊',
    'writer': '✍️',
    'pm': '📋',
    'finance': '💰',
    'devops': '🚀',
    'mobile': '📱',
    'frontend': '🎨',
    'backend': '⚙️'
};

function getAgentDisplayName(agentId) {
    return AGENT_NAMES[agentId] || agentId;
}

function getAgentIcon(agentId) {
    return AGENT_ICONS[agentId] || '🤖';
}

// SSE 广播
function broadcastToSSEClients(log) {
    const data = `data: ${JSON.stringify(log)}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(data);
        } catch (e) {
            sseClients.delete(client);
        }
    });
}

// 广播活动状态更新
function broadcastActivityStatus() {
    const activity = getAllAgentActivityStatus();
    const data = `data: ${JSON.stringify({ type: 'activity_status', activity, timestamp: Date.now() })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(data);
        } catch (e) {
            sseClients.delete(client);
        }
    });
}

// 加载上次每日统计时间
try {
  const statsData = fs.readFileSync(DAILY_STATS_FILE, 'utf8');
  const stats = JSON.parse(statsData);
  lastDailyStatsTime = stats.lastDailyStatsTime || 0;
  console.log(`[DAILY STATS] 上次统计时间: ${new Date(lastDailyStatsTime).toISOString()}`);
} catch (e) {
  console.log('[DAILY STATS] 首次运行或无历史记录');
}

// ===== 性能监控系统 =====
const os = require('os');
const MetricsCollector = {
  history: [],
  maxHistory: 288, // 24小时，每5分钟一条
  lastCollectTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  totalResponseTime: 0,
  wsConnections: 0,
  wsConnectionsPeak: 0,
  
  // 消息速率监控
  messageStats: {
    count: 0,
    lastResetTime: Date.now(),
    history: [] // 每分钟的消息数历史
  },
  
  // API 响应时间分布
  responseTimeBuckets: {
    '0-50ms': 0,
    '50-100ms': 0,
    '100-200ms': 0,
    '200-500ms': 0,
    '500-1000ms': 0,
    '1000ms+': 0
  },
  
  // 获取CPU使用率
  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    const usage = 100 - (totalIdle / totalTick * 100);
    return Math.round(usage * 100) / 100;
  },
  
  // 获取内存使用率
  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total: Math.round(total / 1024 / 1024 / 1024 * 100) / 100, // GB
      used: Math.round(used / 1024 / 1024 / 1024 * 100) / 100,
      free: Math.round(free / 1024 / 1024 / 1024 * 100) / 100,
      percentage: Math.round(used / total * 100 * 100) / 100
    };
  },
  
  // 获取进程内存
  getProcessMemory() {
    const mem = process.memoryUsage();
    return {
      rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(mem.external / 1024 / 1024 * 100) / 100
    };
  },
  
  // 记录请求
  recordRequest(responseTime, isError = false) {
    this.requestCount++;
    this.totalResponseTime += responseTime;
    if (isError) this.errorCount++;
    
    // 记录响应时间分布
    if (responseTime < 50) this.responseTimeBuckets['0-50ms']++;
    else if (responseTime < 100) this.responseTimeBuckets['50-100ms']++;
    else if (responseTime < 200) this.responseTimeBuckets['100-200ms']++;
    else if (responseTime < 500) this.responseTimeBuckets['200-500ms']++;
    else if (responseTime < 1000) this.responseTimeBuckets['500-1000ms']++;
    else this.responseTimeBuckets['1000ms+']++;
  },
  
  // 记录消息发送
  recordMessage() {
    this.messageStats.count++;
  },
  
  // 获取消息速率（每分钟）
  getMessageRate() {
    const now = Date.now();
    const elapsed = (now - this.messageStats.lastResetTime) / 1000 / 60; // 分钟
    return elapsed > 0 ? Math.round(this.messageStats.count / elapsed * 100) / 100 : 0;
  },
  
  // WebSocket 连接管理
  addWsConnection() {
    this.wsConnections++;
    if (this.wsConnections > this.wsConnectionsPeak) {
      this.wsConnectionsPeak = this.wsConnections;
    }
  },
  
  removeWsConnection() {
    if (this.wsConnections > 0) this.wsConnections--;
  },
  
  // 获取平均响应时间
  getAvgResponseTime() {
    if (this.requestCount === 0) return 0;
    return Math.round(this.totalResponseTime / this.requestCount * 100) / 100;
  },
  
  // 获取错误率
  getErrorRate() {
    if (this.requestCount === 0) return 0;
    return Math.round(this.errorCount / this.requestCount * 100 * 100) / 100;
  },
  
  // 收集当前指标
  collect() {
    const now = Date.now();
    
    // 计算消息速率并更新历史
    const messageRate = this.getMessageRate();
    this.messageStats.history.push({
      timestamp: now,
      count: this.messageStats.count,
      rate: messageRate
    });
    if (this.messageStats.history.length > 60) { // 保留60分钟历史
      this.messageStats.history.shift();
    }
    
    const metrics = {
      timestamp: now,
      cpu: this.getCPUUsage(),
      memory: this.getMemoryUsage(),
      processMemory: this.getProcessMemory(),
      uptime: process.uptime(),
      wsConnections: this.wsConnections,
      wsConnectionsPeak: this.wsConnectionsPeak,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      avgResponseTime: this.getAvgResponseTime(),
      errorRate: this.getErrorRate(),
      messageRate: messageRate, // 每分钟消息数
      messageTotal: this.messageStats.count,
      messageQueueSize: errorLogBuffer.length,
      historyCacheSize: historyCache ? historyCache.length : 0,
      responseTimeBuckets: { ...this.responseTimeBuckets }
    };
    
    // 重置计数器
    this.requestCount = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0;
    this.messageStats.count = 0;
    this.messageStats.lastResetTime = now;
    
    // 保存到历史
    this.history.push(metrics);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.lastCollectTime = now;
    return metrics;
  },
  
  // 获取历史数据
  getHistory(hours = 1) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.history.filter(m => m.timestamp >= cutoff);
  },
  
  // 检查告警
  checkAlerts(metrics) {
    const alerts = [];
    
    if (metrics.cpu > 80) {
      alerts.push({ type: 'cpu', level: 'warning', message: `CPU使用率过高: ${metrics.cpu}%`, value: metrics.cpu });
    }
    
    if (metrics.memory.percentage > 80) {
      alerts.push({ type: 'memory', level: 'warning', message: `内存使用率过高: ${metrics.memory.percentage}%`, value: metrics.memory.percentage });
    }
    
    if (metrics.avgResponseTime > 1000) {
      alerts.push({ type: 'response', level: 'warning', message: `响应时间过长: ${metrics.avgResponseTime}ms`, value: metrics.avgResponseTime });
    }
    
    if (metrics.errorRate > 5) {
      alerts.push({ type: 'error', level: 'critical', message: `错误率过高: ${metrics.errorRate}%`, value: metrics.errorRate });
    }
    
    return alerts;
  },
  
  // 加载历史数据
  async loadHistory() {
    try {
      const data = await fsp.readFile(METRICS_HISTORY_FILE, 'utf8');
      this.history = JSON.parse(data);
    } catch (e) {
      this.history = [];
    }
  },
  
  // 保存历史数据
  async saveHistory() {
    try {
      await fsp.writeFile(METRICS_HISTORY_FILE, JSON.stringify(this.history, null, 2));
    } catch (e) {
      console.error('[METRICS HISTORY SAVE ERROR]', e.message);
    }
  }
};

// 定期收集指标（每5分钟）
setInterval(() => {
  MetricsCollector.collect();
  MetricsCollector.saveHistory();
}, 5 * 60 * 1000);

// 启动时加载历史数据
MetricsCollector.loadHistory();

// ===== 性能优化：历史记录缓存 =====
let historyCache = null;
let historyCacheTime = 0;
let historyDirty = false;
const HISTORY_CACHE_TTL = 5000; // 缓存5秒
let historySaveTimer = null;

// ===== 性能优化：错误日志批量写入 =====
let errorLogBuffer = [];
let errorLogFlushTimer = null;
const ERROR_LOG_FLUSH_INTERVAL = 5000; // 5秒批量写入

// 错误统计
let errorStats = {
  wsDisconnects: 0,
  wsErrors: 0,
  proxyErrors: 0,
  tokenFailures: 0,
  lastError: null,
  lastErrorTime: null
};

// 记录错误日志 - 批量写入优化
async function logError(category, message, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${category}] ${message} ${JSON.stringify(details)}\n`;
  
  // 添加到缓冲区，延迟批量写入
  errorLogBuffer.push(logEntry);
  
  // 如果没有定时器，启动一个
  if (!errorLogFlushTimer) {
    errorLogFlushTimer = setTimeout(flushErrorLogs, ERROR_LOG_FLUSH_INTERVAL);
  }
  
  // 更新统计
  switch (category) {
    case 'WS_DISCONNECT': errorStats.wsDisconnects++; break;
    case 'WS_ERROR': errorStats.wsErrors++; break;
    case 'PROXY_ERROR': errorStats.proxyErrors++; break;
    case 'TOKEN_FAIL': errorStats.tokenFailures++; break;
  }
  errorStats.lastError = message;
  errorStats.lastErrorTime = timestamp;
  
  // 检查是否需要告警（异步，不阻塞）
  checkAndAlert(category, message).catch(() => {});
}

// 批量写入错误日志
async function flushErrorLogs() {
  if (errorLogBuffer.length === 0) {
    errorLogFlushTimer = null;
    return;
  }
  
  const logsToWrite = errorLogBuffer.join('');
  errorLogBuffer = [];
  errorLogFlushTimer = null;
  
  try {
    await fsp.appendFile(ERROR_LOG_FILE, logsToWrite);
  } catch (e) {
    console.error('[LOG ERROR]', e.message);
  }
}

// 检查并发送告警
async function checkAndAlert(category, message) {
  const now = Date.now();
  
  // 每天发送一次统计信息
  if (now - lastDailyStatsTime >= DAILY_STATS_INTERVAL) {
    lastDailyStatsTime = now;
    
    // 保存统计时间到文件
    try {
      fs.writeFileSync(DAILY_STATS_FILE, JSON.stringify({ lastDailyStatsTime: now }));
    } catch (e) {
      console.error('[DAILY STATS] 保存失败:', e.message);
    }
    
    const dailyMsg = `📊 TeamChat 每日统计\n\n断连: ${errorStats.wsDisconnects}次\n错误: ${errorStats.wsErrors}次\n代理错误: ${errorStats.proxyErrors}次\n运行时间: ${Math.floor(process.uptime() / 3600)}小时`;
    await sendWecomNotification(dailyMsg);
    
    // 重置计数
    errorStats = { wsDisconnects: 0, wsErrors: 0, proxyErrors: 0, tokenFailures: 0, lastError: null, lastErrorTime: null };
    return;
  }
  
  // 只在严重错误时告警（不再发送断连告警）
  if (category === 'CRITICAL' && now - lastAlertTime >= ALERT_COOLDOWN) {
    lastAlertTime = now;
    const alertMsg = `🚨 TeamChat 严重错误\n${message}`;
    await sendWecomNotification(alertMsg);
  }
}

// 保存指标
async function saveMetrics() {
  try {
    const metrics = {
      ...errorStats,
      timestamp: Date.now(),
      uptime: process.uptime()
    };
    await fsp.writeFile(METRICS_FILE, JSON.stringify(metrics, null, 2));
  } catch (e) {
    console.error('[METRICS ERROR]', e.message);
  }
}

// 定期保存指标
setInterval(saveMetrics, 60000);

// 发送企微通知 - 异步非阻塞
async function sendWecomNotification(content) {
  if (!WECOM_NOTIFY_ENABLED) return;
  // 使用 setImmediate 确保不阻塞主线程
  setImmediate(() => {
    axios.post(WEBHOOK_URL, {
      msgtype: 'text',
      text: { content: content }
    }, { timeout: 5000 }).catch(e => {
      console.error('[WECOM NOTIFY ERROR]', e.message);
    });
  });
}

const PORT = 18788;
const GATEWAY_PORT = 18789;
const OPENCLAW_HOME = "/Users/wusiwei/.openclaw";
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");
const AGENTS_DIR = path.join(OPENCLAW_HOME, "agents");

// 上传进度追踪
const uploadProgress = new Map(); // uploadId -> { total, uploaded, startTime, filename }

// Load gateway token for security
let gatewayToken = "";
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  gatewayToken = cfg?.gateway?.auth?.token || cfg?.gateway?.remote?.token || "";
} catch (e) {
  console.error("Failed to load gateway token:", e.message);
}

// 登录密码配置 - 随机6位数
let LOGIN_PASSWORD = Math.floor(100000 + Math.random() * 900000).toString();

// 通知企微的函数
async function notifyWecom(message) {
    try {
        const webhookUrl = process.env.WECOM_WEBHOOK_URL || 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=8603f9a7-daf6-467f-b8e3-beeedafcaf5e';
        const response = await axios.post(webhookUrl, {
            msgtype: 'text',
            text: { content: message }
        }, { 
            timeout: 5000,
            httpAgent: new (require('http').Agent)({ keepAlive: false }),
            httpsAgent: new (require('https').Agent)({ keepAlive: false })
        });
        console.log(`[企微通知] 成功: ${JSON.stringify(response.data)}`);
    } catch (e) {
        console.log(`[企微通知] 失败: ${e.message}`);
        if (e.response) {
            console.log(`[企微通知] 响应: ${JSON.stringify(e.response.data)}`);
        }
    }
}

console.log(`[登录密码] 初始密码: ${LOGIN_PASSWORD}`);

// 读取 TeamChat 隧道 URL
let TEAMCHAT_TUNNEL_URL = '';
const TEAMCHAT_TUNNEL_FILE = '/Users/wusiwei/.openclaw/team_chat_tunnel.url';

function readTunnelUrl() {
    try {
        if (fs.existsSync(TEAMCHAT_TUNNEL_FILE)) {
            return fs.readFileSync(TEAMCHAT_TUNNEL_FILE, 'utf8').trim();
        }
    } catch (e) {
        console.log(`[TeamChat Tunnel] 读取失败: ${e.message}`);
    }
    return '';
}

TEAMCHAT_TUNNEL_URL = readTunnelUrl();
console.log(`[TeamChat Tunnel] ${TEAMCHAT_TUNNEL_URL || '(未配置)'}`);

// ===== Tunnel 自动检测和重启 =====
let tunnelLastRestartTime = 0;
const TUNNEL_RESTART_COOLDOWN = 60000; // 1分钟内不重复重启

async function checkTunnelStatus() {
    try {
        const { execSync } = require('child_process');
        
        // 检查 cloudflared 进程是否运行
        const result = execSync('pgrep -f "cloudflared" | head -1', { encoding: 'utf-8' }).trim();
        const isRunning = !!result;
        
        // 如果配置了固定域名，检查域名是否可访问
        if (TEAMCHAT_TUNNEL_URL && TEAMCHAT_TUNNEL_URL.startsWith('https://')) {
            try {
                const https = require('https');
                const response = await new Promise((resolve) => {
                    const req = https.get(TEAMCHAT_TUNNEL_URL, { timeout: 5000 }, (res) => {
                        resolve(res.statusCode);
                    });
                    req.on('error', () => resolve(0));
                    req.on('timeout', () => { req.destroy(); resolve(0); });
                });
                
                // 如果域名可访问，说明隧道正常
                if (response === 200 || response === 302) {
                    return true;
                }
            } catch (e) {
                // 域名不可访问
            }
        }
        
        return isRunning;
    } catch (e) {
        return false;
    }
}

async function restartTunnel() {
    const now = Date.now();
    if (now - tunnelLastRestartTime < TUNNEL_RESTART_COOLDOWN) {
        console.log('[Tunnel Auto] Restart cooldown, skipping...');
        return;
    }
    
    tunnelLastRestartTime = now;
    console.log('[Tunnel Auto] Tunnel not responding, attempting restart...');
    
    try {
        const { execSync } = require('child_process');
        
        // 停止旧的 cloudflared 进程
        execSync('pkill -f "cloudflared" 2>/dev/null || true', { timeout: 5000 });
        
        await new Promise(r => setTimeout(r, 2000));
        
        // 启动新的 tunnel（使用固定域名配置）
        const tunnelLogPath = path.join(OPENCLAW_HOME, 'tunnel_team_chat.log');
        
        // 检查是否配置了固定域名
        const isFixedDomain = TEAMCHAT_TUNNEL_URL && TEAMCHAT_TUNNEL_URL.includes('qzz.io');
        
        let cmd;
        if (isFixedDomain) {
            // 使用固定域名隧道
            cmd = `nohup cloudflared tunnel run --hostname teamchat.qzz.io --url http://localhost:18788 ef6a19d5-0a69-49d2-9193-0e7ba14fa56a > "${tunnelLogPath}" 2>&1 &`;
        } else {
            // 使用临时域名
            cmd = `nohup cloudflared tunnel --url http://localhost:18788 > "${tunnelLogPath}" 2>&1 &`;
        }
        
        execSync(cmd, { shell: true, detached: true, stdio: 'ignore' });
        
        console.log('[Tunnel Auto] Restart command sent, waiting for connection...');
        
        // 等待隧道启动
        await new Promise(r => setTimeout(r, 10000));
        
        // 验证是否启动成功
        const isNowRunning = await checkTunnelStatus();
        if (isNowRunning) {
            console.log('[Tunnel Auto] Tunnel restarted successfully');
            notifyWecom('🔄 TeamChat 隧道已自动恢复');
        } else {
            console.log('[Tunnel Auto] Tunnel restart may have failed, will retry next check');
        }
        
    } catch (e) {
        console.error('[Tunnel Auto] Restart failed:', e.message);
    }
}

function startTunnelAutoRecovery() {
    console.log('[Tunnel Auto] Starting tunnel auto-recovery monitor...');
    
    // 每 60 秒检查一次隧道状态
    setInterval(async () => {
        const isRunning = await checkTunnelStatus();
        
        if (!isRunning) {
            console.log('[Tunnel Auto] Tunnel not responding, checking domain...');
            
            // 如果配置了固定域名，先检查域名是否可访问
            if (TEAMCHAT_TUNNEL_URL && TEAMCHAT_TUNNEL_URL.includes('qzz.io')) {
                try {
                    const https = require('https');
                    const response = await new Promise((resolve) => {
                        const req = https.get(TEAMCHAT_TUNNEL_URL, { timeout: 5000 }, (res) => {
                            resolve(res.statusCode);
                        });
                        req.on('error', () => resolve(0));
                        req.on('timeout', () => { req.destroy(); resolve(0); });
                    });
                    
                    if (response === 200 || response === 302) {
                        console.log('[Tunnel Auto] Domain is accessible, no restart needed');
                        return;
                    }
                } catch (e) {
                    console.log('[Tunnel Auto] Domain check failed, will restart tunnel');
                }
            }
            
            await restartTunnel();
        }
    }, 60000);
}

// 监听隧道文件变化
let tunnelWatcher = null;
let lastTunnelNotifyTime = 0;
const TUNNEL_NOTIFY_COOLDOWN = 30000; // 30秒冷却

function startTunnelWatcher() {
    try {
        tunnelWatcher = fs.watch(TEAMCHAT_TUNNEL_FILE, (eventType) => {
            if (eventType === 'change') {
                const now = Date.now();
                if (now - lastTunnelNotifyTime < TUNNEL_NOTIFY_COOLDOWN) {
                    return;
                }
                
                setTimeout(() => {
                    const newUrl = readTunnelUrl();
                    if (newUrl && newUrl !== TEAMCHAT_TUNNEL_URL) {
                        TEAMCHAT_TUNNEL_URL = newUrl;
                        lastTunnelNotifyTime = now;
                        console.log(`[TeamChat Tunnel] 链接已更新: ${newUrl}`);
                        notifyWecom(`🔗 TeamChat 隧道链接已更新\n新链接: ${newUrl}`);
                    }
                }, 1000);
            }
        });
        tunnelWatcher.on('error', (e) => {
            console.log(`[TeamChat Tunnel] 监听错误: ${e.message}`);
        });
        console.log('[TeamChat Tunnel] 已启动文件监听');
    } catch (e) {
        console.log(`[TeamChat Tunnel] 启动监听失败: ${e.message}`);
    }
}

if (fs.existsSync(TEAMCHAT_TUNNEL_FILE)) {
    startTunnelWatcher();
}

// 获取最新隧道链接的函数
function getLatestTunnelUrl() {
    return readTunnelUrl();
}
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const activeSessions = new Map(); // sessionId -> { createdAt, lastAccess }

// ===== 会话管理 =====
const chatSessions = new Map(); // sessionId -> { sessionId, agentId, agentName, lastMessage, lastMessageTime, messageCount, createdAt }

function updateChatSession(msg) {
  if (!msg.sender || msg.isUser) return;
  
  const agentId = msg.agentId || msg.sender;
  const sessionId = msg.sessionId || `session-${agentId}-${Date.now()}`;
  
  const existingSession = chatSessions.get(sessionId);
  const truncatedMessage = (msg.text || '').substring(0, 100);
  
  if (existingSession) {
    existingSession.lastMessage = truncatedMessage;
    existingSession.lastMessageTime = msg.timestamp || Date.now();
    existingSession.messageCount++;
  } else {
    chatSessions.set(sessionId, {
      sessionId,
      agentId,
      agentName: getAgentDisplayName(agentId),
      lastMessage: truncatedMessage,
      lastMessageTime: msg.timestamp || Date.now(),
      messageCount: 1,
      createdAt: msg.timestamp || Date.now()
    });
  }
  
  return sessionId;
}

function getChatSessions() {
  const sessions = Array.from(chatSessions.values());
  sessions.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  return sessions;
}

function getSessionHistory(sessionId) {
  const history = historyCache || [];
  return history.filter(msg => msg.sessionId === sessionId);
}

// 生成 session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 验证 session token
function verifySession(sessionToken) {
  if (!sessionToken) return false;
  const session = activeSessions.get(sessionToken);
  if (!session) return false;
  
  // Session 有效期 24 小时
  const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
  if (Date.now() - session.lastAccess > SESSION_TIMEOUT) {
    activeSessions.delete(sessionToken);
    return false;
  }
  
  // 更新最后访问时间
  session.lastAccess = Date.now();
  return true;
}

// 检查是否为本地访问
function isLocalRequest(req) {
  const remoteAddr = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  return remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "::ffff:127.0.0.1";
}

// 从请求中获取 session token
function getSessionToken(req) {
  // 使用请求的实际 host 来解析 URL
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  try {
    const url = new URL(req.url || "/", `${protocol}://${host}`);
    const sessionFromUrl = url.searchParams.get("session");
    if (sessionFromUrl) return sessionFromUrl;
  } catch (e) {
    // URL 解析失败，尝试其他方式
  }
  return req.headers["x-session-token"] || 
         req.headers["cookie"]?.match(/session=([^;]+)/)?.[1] || null;
}

function verifyToken(req) {
  if (!gatewayToken) return true;
  
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const token = url.searchParams.get("token") || req.headers["x-token"];
  
  const referer = req.headers["referer"] || "";
  const remoteAddr = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (token === gatewayToken) return true;
  if (referer.includes(`token=${gatewayToken}`)) return true;
  
  console.warn(`Token verification failed for ${remoteAddr}. Token: ${token ? 'present' : 'missing'}, Referer: ${referer ? 'present' : 'missing'}`);
  return false;
}

// Create a proxy for the gateway
const proxy = httpProxy.createProxyServer({
  ws: true,
  target: `http://127.0.0.1:${GATEWAY_PORT}`,
  changeOrigin: true,
});

// Create a proxy for the mail server
const MAIL_PORT = 3456;
const mailProxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${MAIL_PORT}`,
  changeOrigin: true,
});

mailProxy.on("error", (err, req, res) => {
  console.error(`[MAIL PROXY ERROR]:`, err.message);
  if (res && res.writeHead) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Mail service unavailable" }));
  }
});

proxy.on("error", (err, req, res) => {
  const remoteAddr = req ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress) : "unknown";
  console.error(`[PROXY ERROR] from ${remoteAddr}:`, err.message);
  console.error(`[PROXY ERROR] Request URL: ${req?.url}`);
  console.error(`[PROXY ERROR] Target: http://127.0.0.1:${GATEWAY_PORT}`);
  
  // 记录错误日志
  logError('PROXY_ERROR', `Proxy error from ${remoteAddr}`, {
    error: err.message,
    url: req?.url,
    code: err.code
  });
  
  if (res && res.writeHead) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Proxy error");
  }
});

proxy.on("proxyReq", (proxyReq, req, res, options) => {
  // Override headers to make gateway think request is from local
  proxyReq.setHeader('Host', `127.0.0.1:${GATEWAY_PORT}`);
  proxyReq.setHeader('Origin', `http://127.0.0.1:18788`);
});

proxy.on("open", (proxySocket) => {
  // console.log("Proxy WebSocket connection opened");
});

proxy.on("close", (res, socket, head) => {
  // 记录连接关闭
  if (socket) {
    const remoteAddr = socket.remoteAddress || 'unknown';
    logError('WS_DISCONNECT', `WebSocket connection closed from ${remoteAddr}`, {
      hadError: socket.destroyed
    });
  }
});

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, statusCode, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  const body = Buffer.from(text);
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(BASE_DIR, normalized);
  const rel = path.relative(BASE_DIR, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return filePath;
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBoundaryBuf = Buffer.from(`--${boundary}--`);
  const parts = [];

  let idx = buffer.indexOf(boundaryBuf);
  if (idx === -1) return parts;
  idx += boundaryBuf.length;

  while (idx < buffer.length) {
    if (buffer.slice(idx, idx + 2).toString() === "--") break;
    if (buffer.slice(idx, idx + 2).toString() === "\r\n") idx += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), idx);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(idx, headerEnd).toString("utf8");
    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const p = line.indexOf(":");
      if (p === -1) continue;
      const k = line.slice(0, p).trim().toLowerCase();
      const v = line.slice(p + 1).trim();
      headers[k] = v;
    }
    idx = headerEnd + 4;

    let nextBoundary = buffer.indexOf(boundaryBuf, idx);
    let nextEndBoundary = buffer.indexOf(endBoundaryBuf, idx);
    let endIdx = -1;
    let ended = false;

    if (nextBoundary !== -1 && nextEndBoundary !== -1) {
      if (nextEndBoundary < nextBoundary) {
        endIdx = nextEndBoundary;
        ended = true;
      } else {
        endIdx = nextBoundary;
      }
    } else if (nextBoundary !== -1) {
      endIdx = nextBoundary;
    } else if (nextEndBoundary !== -1) {
      endIdx = nextEndBoundary;
      ended = true;
    } else {
      break;
    }

    let contentEnd = endIdx;
    if (buffer.slice(contentEnd - 2, contentEnd).toString() === "\r\n") contentEnd -= 2;
    const content = buffer.slice(idx, contentEnd);

    const disposition = headers["content-disposition"] || "";
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const name = nameMatch ? nameMatch[1] : "";
    const filename = filenameMatch ? filenameMatch[1] : "";
    const contentType = headers["content-type"] || "application/octet-stream";

    parts.push({ name, filename, contentType, content });

    idx = endIdx + boundaryBuf.length;
    if (ended) break;
  }

  return parts;
}

function sanitizeFilename(name) {
  const base = path.basename(name || "file");
  const safe = base.replace(/[^\p{L}\p{N}\.\-_]+/gu, "_");
  return safe.slice(0, 160) || "file";
}

async function ensureUploadsDir() {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
}

async function loadHistory() {
  // 使用缓存
  const now = Date.now();
  if (historyCache && (now - historyCacheTime) < HISTORY_CACHE_TTL) {
    return historyCache;
  }
  
  try {
    const data = await fsp.readFile(HISTORY_FILE, "utf8");
    historyCache = JSON.parse(data);
    historyCacheTime = now;
    
    // 为 Agent 消息添加模型信息
    historyCache = historyCache.map(msg => {
      if (!msg.isUser && msg.sender) {
        const agentId = msg.agentId || msg.sender;
        const modelId = getAgentModelConfig(agentId, msg.sender);
        const stats = modelStats.models[modelId]?.agents?.[agentId];
        if (stats || modelId) {
          msg.modelInfo = {
            modelId: modelId,
            calls: stats?.calls || 1,
            inputTokens: stats?.inputTokens || 0,
            outputTokens: stats?.outputTokens || 0
          };
        }
      }
      return msg;
    });
    
    return historyCache;
  } catch (e) {
    historyCache = [];
    historyCacheTime = now;
    return [];
  }
}

// 延迟保存历史记录，避免频繁 IO
function scheduleHistorySave() {
  if (historySaveTimer) return;
  historySaveTimer = setTimeout(async () => {
    historySaveTimer = null;
    if (!historyDirty) return;
    
    try {
      // Keep only last 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filtered = historyCache.filter(msg => msg.timestamp > thirtyDaysAgo);
      await fsp.writeFile(HISTORY_FILE, JSON.stringify(filtered.slice(-10000), null, 2));
      historyCache = filtered.slice(-10000);
      historyDirty = false;
      console.log(`[HISTORY] Saved ${filtered.length} messages to ${HISTORY_FILE}`);
    } catch (e) {
      console.error('[HISTORY SAVE ERROR]', e.message);
    }
  }, 500); // 0.5 秒后保存（更快）
}

// 立即保存历史（用于重要消息或进程退出前）
async function saveHistoryImmediate() {
  if (!historyDirty || !historyCache) return;
  
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filtered = historyCache.filter(msg => msg.timestamp > thirtyDaysAgo);
    const toSave = filtered.slice(-10000);
    await fsp.writeFile(HISTORY_FILE, JSON.stringify(toSave, null, 2));
    historyCache = toSave;
    historyDirty = false;
    console.log(`[HISTORY] Immediate save: ${toSave.length} messages`);
  } catch (e) {
    console.error('[HISTORY IMMEDIATE SAVE ERROR]', e.message);
  }
}

async function saveHistory(history, notify = false) {
  historyCache = history;
  historyCacheTime = Date.now();
  historyDirty = true;
  
  // 立即保存到文件，避免重启时丢失
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filtered = historyCache.filter(msg => msg.timestamp > thirtyDaysAgo);
    await fsp.writeFile(HISTORY_FILE, JSON.stringify(filtered.slice(-10000), null, 2));
  } catch (e) {
    console.error('[HISTORY SAVE ERROR]', e.message);
  }
}

// Agent 状态数据缓存
let agentStatusCache = { status: {}, lastUpdate: 0 };

// Agent 日志列表
function handleAgentLogsList(req, res) {
  const logsDir = '/Users/wusiwei/.openclaw/agents';
  const result = [];
  try {
    const agents = fs.readdirSync(logsDir);
    for (const agent of agents) {
      const agentPath = path.join(logsDir, agent, 'sessions');
      if (fs.existsSync(agentPath)) {
        const sessions = fs.readdirSync(agentPath).filter(f => f.endsWith('.jsonl'));
        result.push({ agent, sessionCount: sessions.length });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: result }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// Agent 日志详情
function handleAgentLogs(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathParts = parsedUrl.pathname.split('/');
  const agentId = pathParts[3];
  const logsDir = `/Users/wusiwei/.openclaw/agents/${agentId}/sessions`;
  try {
    if (!fs.existsSync(logsDir)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.jsonl'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agentId, files: files.slice(-5) }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
}

// 模型使用统计
const modelStatsFile = path.join(OPENCLAW_HOME, 'model_stats.json');
let modelStats = { models: {}, sessions: {} };

function loadModelStats() {
  try {
    if (fs.existsSync(modelStatsFile)) {
      modelStats = JSON.parse(fs.readFileSync(modelStatsFile, 'utf8'));
    }
  } catch (e) {
    console.error('[Model Stats] Failed to load:', e.message);
  }
}

function saveModelStats() {
  try {
    fs.writeFileSync(modelStatsFile, JSON.stringify(modelStats, null, 2));
  } catch (e) {
    console.error('[Model Stats] Failed to save:', e.message);
  }
}

function recordModelUsage(agentId, modelId, inputTokens, outputTokens) {
  if (!modelStats.models[modelId]) {
    modelStats.models[modelId] = { calls: 0, inputTokens: 0, outputTokens: 0, agents: {} };
  }
  modelStats.models[modelId].calls++;
  modelStats.models[modelId].inputTokens += inputTokens || 0;
  modelStats.models[modelId].outputTokens += outputTokens || 0;
  
  if (!modelStats.models[modelId].agents[agentId]) {
    modelStats.models[modelId].agents[agentId] = { calls: 0, inputTokens: 0, outputTokens: 0 };
  }
  modelStats.models[modelId].agents[agentId].calls++;
  modelStats.models[modelId].agents[agentId].inputTokens += inputTokens || 0;
  modelStats.models[modelId].agents[agentId].outputTokens += outputTokens || 0;
  
  saveModelStats();
}

loadModelStats();

// 获取 Agent 的模型配置
function getAgentModelConfig(agentId, senderName) {
  try {
    const configPath = path.join(OPENCLAW_HOME, 'openclaw.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const agentList = config.agents?.list || [];
      // 尝试多种匹配方式
      const agent = agentList.find(a => 
        a.id === agentId || 
        a.name === agentId ||
        a.name === senderName ||
        a.id?.toLowerCase() === agentId?.toLowerCase() ||
        a.name?.toLowerCase() === agentId?.toLowerCase() ||
        a.name?.toLowerCase() === senderName?.toLowerCase()
      );
      if (agent?.model?.primary) {
        return agent.model.primary;
      }
    }
  } catch (e) {
    console.error('[Agent Model] Failed to get config:', e.message);
  }
  return 'anthropic/claude-opus-4-6'; // 默认模型
}

// 模型使用统计 API
function handleModelStats(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const agentId = parsedUrl.searchParams.get('agentId');
  
  if (agentId) {
    // 返回特定 agent 的模型使用统计
    const agentStats = {};
    for (const [modelId, data] of Object.entries(modelStats.models)) {
      if (data.agents[agentId]) {
        agentStats[modelId] = {
          calls: data.agents[agentId].calls,
          inputTokens: data.agents[agentId].inputTokens,
          outputTokens: data.agents[agentId].outputTokens
        };
      }
    }
    return sendJson(res, 200, { agentId, models: agentStats });
  }
  
  // 返回所有模型统计
  return sendJson(res, 200, modelStats);
}

// Agent 实时工作日志内容 API
function handleAgentWorkLog(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathParts = parsedUrl.pathname.split('/');
  const agentId = pathParts[3];
  const lines = parseInt(parsedUrl.searchParams.get('lines')) || 50;
  const logsDir = `/Users/wusiwei/.openclaw/agents/${agentId}/sessions`;
  
  try {
    if (!fs.existsSync(logsDir)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    
    // 获取最新的 session 文件
    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(logsDir, f),
        mtime: fs.statSync(path.join(logsDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (files.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agentId, logs: [], message: 'No sessions found' }));
      return;
    }
    
    // 读取最新的 session 文件
    const latestFile = files[0];
    const content = fs.readFileSync(latestFile.path, 'utf8');
    const allLines = content.split('\n').filter(l => l.trim());
    
    // 解析日志条目，提取关键信息
    const logEntries = [];
    const recentLines = allLines.slice(-lines);
    
    for (const line of recentLines) {
      try {
        const data = JSON.parse(line);
        const entry = {
          timestamp: data.timestamp || null,
          type: data.type || 'unknown'
        };
        
        // 提取消息内容
        if (data.type === 'message') {
          const msg = data.message || {};
          entry.role = msg.role || 'unknown';
          
          // 提取文本内容
          if (msg.content) {
            if (Array.isArray(msg.content)) {
              const textContent = msg.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join(' ');
              entry.text = textContent.slice(0, 500); // 限制长度
              
              // 提取工具调用
              const toolCalls = msg.content.filter(c => c.type === 'toolCall');
              if (toolCalls.length > 0) {
                entry.tools = toolCalls.map(t => t.name).join(', ');
              }
            } else if (typeof msg.content === 'string') {
              entry.text = msg.content.slice(0, 500);
            }
          }
          
          // Token 使用
          if (msg.usage) {
            entry.tokens = msg.usage.totalTokens || 0;
          }
        } else if (data.type === 'session') {
          entry.text = `Session started: ${data.id}`;
        } else if (data.type === 'model_change') {
          entry.text = `Model: ${data.modelId}`;
        }
        
        // 格式化时间
        if (entry.timestamp) {
          const date = new Date(entry.timestamp);
          entry.time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
        logEntries.push(entry);
      } catch (e) {
        // 跳过解析失败的行
      }
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      agentId,
      sessionFile: latestFile.name,
      lastModified: latestFile.mtime,
      totalLines: allLines.length,
      logs: logEntries.reverse() // 最新的在前面
    }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

async function handleAgentStatus(req, res) {
  if (!verifyToken(req)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  
  try {
    // 尝试从文件读取缓存的会话数据
    let sessions = [];
    try {
      const cached = JSON.parse(fs.readFileSync('/tmp/gateway_sessions.json', 'utf8'));
      sessions = cached.sessions || [];
    } catch (e) {
      // 文件不存在，使用空数组
      sessions = [];
    }
    
    const AGENT_NAMES = {
      'main': '🦞 小龙虾', 'dev': '💻 小码', 'pm': '📋 小产',
      'frontend': '🎨 小前', 'backend': '⚙️ 小后', 'devops': '🚀 小运',
      'qa': '🧪 小测', 'mobile': '📱 小移', 'mail': '📧 小邮',
      'writer': '✍️ 小文', 'data': '📊 小数', 'finance': '💰 小财'
    };
    
    const now = Date.now();
    const status = {};
    
    for (const [agentId, agentName] of Object.entries(AGENT_NAMES)) {
      const agentSessions = sessions.filter(s => {
        const key = s.sessionKey || s.key || '';
        return key.includes(`:${agentId}:`);
      });
      
      if (agentSessions.length > 0) {
        const activeSessions = agentSessions.filter(s => (now - (s.updatedAt || 0)) < 5 * 60 * 1000);
        if (activeSessions.length > 0) {
          status[agentId] = { name: agentName, state: 'working', lastActive: Math.max(...agentSessions.map(s => s.updatedAt || 0)) };
        } else {
          status[agentId] = { name: agentName, state: 'idle', lastActive: Math.max(...agentSessions.map(s => s.updatedAt || 0)) };
        }
      } else {
        status[agentId] = { name: agentName, state: 'offline', lastActive: 0 };
      }
    }
    
    agentStatusCache = { status, lastUpdate: now };
    return sendJson(res, 200, { status, lastUpdate: now });
  } catch (e) {
    // 返回缓存数据
    return sendJson(res, 200, agentStatusCache);
  }
}

// 邮件同步状态 API 处理函数
async function handleEmailSyncStatus(req, res) {
  try {
    const emailSyncService = require('./email_sync_service.cjs');
    const syncStatus = emailSyncService.getSyncStatus ? emailSyncService.getSyncStatus() : {};
    
    // 修正路径
    const EMAIL_DB_PATH = path.join(BASE_DIR, '../../wecom-mail/emails.db');
    const EMAIL_ARCHIVE_DIR = path.join(BASE_DIR, '../../email_archive');
    
    let serverCount = 0;
    let localCount = 0;
    let indexedCount = 0;
    let serverLatestTime = null;
    let localLatestTime = null;
    let storageSize = 0;
    let serverInbox = 0;
    let serverSent = 0;
    
    // 获取腾讯企业邮箱服务器上的邮件数量
    try {
      const serverInfo = await emailSyncService.getServerMailCount();
      serverCount = serverInfo.total || 0;
      serverInbox = serverInfo.inbox || 0;
      serverSent = serverInfo.sent || 0;
      if (serverInfo.error) {
        console.error('[EmailSync] Server count error:', serverInfo.error);
      }
    } catch (e) {
      console.error('[EmailSync] Failed to get server mail count:', e.message);
    }
    
    // 检查数据库 - 本地已索引的邮件
    let dbError = null;
    if (fs.existsSync(EMAIL_DB_PATH)) {
      try {
        const db = new (require('better-sqlite3'))(EMAIL_DB_PATH, { readonly: true });
        const countResult = db.prepare('SELECT COUNT(*) as count FROM emails').get();
        indexedCount = countResult?.count || 0;
        
        const latestResult = db.prepare('SELECT MAX(created_at) as latest FROM emails').get();
        serverLatestTime = latestResult?.latest || null;
        
        db.close();
      } catch (e) {
        console.error('[EmailSync] Database query error:', e.message);
        dbError = e.message;
      }
      
      try {
        const dbStat = fs.statSync(EMAIL_DB_PATH);
        storageSize += dbStat.size;
      } catch (e) {}
    }
    
    // 检查本地邮件存档
    let archiveSize = 0;
    if (fs.existsSync(EMAIL_ARCHIVE_DIR)) {
      const countEmails = (dir) => {
        let count = 0;
        let latestTime = 0;
        let dirSize = 0;
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const result = countEmails(fullPath);
            count += result.count;
            latestTime = Math.max(latestTime, result.latestTime);
            dirSize += result.size;
          } else if (item.endsWith('.json')) {
            count++;
            latestTime = Math.max(latestTime, stat.mtimeMs);
            dirSize += stat.size;
          }
        }
        return { count, latestTime, size: dirSize };
      };
      
      const result = countEmails(EMAIL_ARCHIVE_DIR);
      localCount = result.count;
      localLatestTime = result.latestTime > 0 ? result.latestTime : null;
      archiveSize = result.size;
      storageSize += archiveSize;
    }
    
    // 计算待同步和待索引数量
    const pendingSync = Math.max(0, serverCount - localCount);
    const pendingIndex = Math.max(0, localCount - indexedCount);
    
    return sendJson(res, 200, {
      isSyncing: syncStatus.isRunning || false,
      lastSyncTime: syncStatus.lastSyncTime || null,
      serverCount,
      serverInbox,
      serverSent,
      localCount,
      indexedCount,
      serverLatestTime,
      localLatestTime,
      pendingSync,
      pendingIndex,
      storageSize,
      error: dbError || syncStatus.error || null
    });
  } catch (e) {
    console.error('[EmailSync] Status API error:', e.message);
    return sendJson(res, 500, { error: e.message });
  }
}

// 邮件同步触发 API 处理函数
async function handleEmailSyncTrigger(req, res) {
  try {
    const emailSyncService = require('./email_sync_service.cjs');
    
    if (emailSyncService.syncEmails) {
      // 手动触发时强制同步
      emailSyncService.syncEmails(true).catch(err => {
        console.error('[EmailSync] Manual sync error:', err.message);
      });
      
      return sendJson(res, 200, { 
        success: true, 
        message: 'Email sync triggered (force mode)' 
      });
    } else {
      return sendJson(res, 501, { 
        error: 'Email sync service not available' 
      });
    }
  } catch (e) {
    console.error('[EmailSync] Trigger API error:', e.message);
    return sendJson(res, 500, { error: e.message });
  }
}

// 搜索消息处理函数
async function handleSearch(req, res) {
  const startTime = Date.now();
  
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    
    let searchParams;
    try {
      searchParams = JSON.parse(body);
    } catch (e) {
      return sendJson(res, 400, { error: "invalid json", results: [], total: 0 });
    }
    
    const { query, startTime: filterStartTime, endTime: filterEndTime, senders, limit = 100 } = searchParams;
    
    // 加载历史记录
    const history = await loadHistory();
    
    // 如果没有搜索条件，返回空结果
    if (!query && !filterStartTime && !filterEndTime && !senders) {
      return sendJson(res, 200, { results: [], total: 0 });
    }
    
    // 筛选消息
    let filtered = history.filter(msg => {
      // 时间范围筛选
      if (filterStartTime && msg.timestamp < filterStartTime) return false;
      if (filterEndTime && msg.timestamp > filterEndTime) return false;
      
      // 发送者筛选
      if (senders && senders.length > 0) {
        if (!msg.sender || !senders.includes(msg.sender)) return false;
      }
      
      // 关键词搜索
      if (query && query.trim()) {
        const searchText = (msg.text || "").toLowerCase();
        const searchQuery = query.toLowerCase();
        if (!searchText.includes(searchQuery)) return false;
      }
      
      return true;
    });
    
    // 按时间倒序排序
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    const total = filtered.length;
    
    // 限制返回数量
    const limited = filtered.slice(0, Math.min(limit, 500));
    
    // 生成高亮文本
    const results = limited.map(msg => {
      let highlight = msg.text || "";
      
      // 如果有搜索关键词，生成高亮
      if (query && query.trim()) {
        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        highlight = highlight.replace(regex, '**$1**');
      }
      
      return {
        sender: msg.sender || 'unknown',
        text: msg.text || '',
        timestamp: msg.timestamp,
        highlight: highlight
      };
    });
    
    const responseTime = Date.now() - startTime;
    
    // 性能日志（如果超过阈值）
    if (responseTime > 200) {
      console.log(`[SEARCH] Slow query: ${responseTime}ms, results: ${total}`);
    }
    
    return sendJson(res, 200, { results, total, queryTime: responseTime });
  } catch (e) {
    console.error('[SEARCH ERROR]', e.message);
    return sendJson(res, 500, { error: e.message, results: [], total: 0 });
  }
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 自动下载外部文件到本地 uploads 目录
async function autoDownloadExternalFile(url, filename) {
  if (!url || !url.startsWith('http')) return null;
  
  // 如果已经是本地 uploads 链接，跳过
  if (url.includes('/uploads/')) return null;
  
  try {
    const safeName = sanitizeFilename(filename || 'downloaded_file');
    const prefix = new Date().toISOString().replace(/[:.]/g, "-");
    const uniq = crypto.randomBytes(4).toString("hex");
    const ext = path.extname(url).split('?')[0] || path.extname(filename) || '';
    const finalName = safeName.endsWith(ext) ? safeName : `${safeName}${ext}`;
    const outName = `${prefix}-${uniq}-${finalName}`;
    const outPath = path.join(UPLOADS_DIR, outName);
    
    console.log(`[AUTO-DOWNLOAD] Starting download: ${url} -> ${outName}`);
    
    await ensureUploadsDir();
    
    // 使用 axios 下载流
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      timeout: 30000 // 30s 超时
    });
    
    const writer = fs.createWriteStream(outPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`[AUTO-DOWNLOAD] Success: ${outName}`);
        resolve(`/uploads/${encodeURIComponent(outName)}`);
      });
      writer.on('error', (err) => {
        console.error(`[AUTO-DOWNLOAD] File write error: ${err.message}`);
        reject(err);
      });
    });
  } catch (e) {
    console.error(`[AUTO-DOWNLOAD] Download failed: ${e.message}`);
    return null;
  }
}

// 检查消息中的文件链接并触发下载
async function processMessageForDownloads(msg) {
  if (!msg || !msg.text) return;
  
  // 匹配 Markdown 链接 [name](url)
  // 排除已经是 /uploads/ 的链接
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  
  while ((match = regex.exec(msg.text)) !== null) {
    const name = match[1];
    const url = match[2];
    
    // 忽略图片（通常由浏览器处理）或已是本地链接
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) continue;
    if (url.includes('/uploads/')) continue;
    
    // 异步下载，不阻塞主流程
    autoDownloadExternalFile(url, name).then(localUrl => {
        if (localUrl) {
            console.log(`[AUTO-DOWNLOAD] Mapped ${url} to local ${localUrl}`);
            // 可选：在这里我们可以更新历史消息中的链接，但为了保持原始性暂不修改
            // 或者发送一条系统通知告诉 Agent 文件已就绪
        }
    }).catch(e => {});
  }
}

// 转发消息到 Gateway 触发 Agent 响应
async function forwardToGateway(msg) {
  console.log('[GATEWAY] forwardToGateway called, isUser:', msg.isUser, 'text:', msg.text);
  
  if (!msg.isUser || !msg.text) {
    console.log('[GATEWAY] Skipping - not a user message or empty text');
    return;
  }
  
  const token = gatewayToken;
  if (!token) {
    console.error('[GATEWAY] No gateway token available');
    return;
  }
  
  console.log('[GATEWAY] Token available, calling API...');
  
  try {
    const GATEWAY_URL = 'http://127.0.0.1:18789/v1/chat/completions';
    
    console.log('[GATEWAY] Sending request to Gateway...');
    const response = await axios.post(GATEWAY_URL, {
      model: 'openclaw',
      messages: [
        { role: 'user', content: msg.text }
      ],
      stream: false,
      user: 'teamchat'
    }, {
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: 60000
    });
    
    console.log('[GATEWAY] Response received:', response.status);
    const content = response.data?.choices?.[0]?.message?.content;
    if (content) {
      console.log('[GATEWAY] Got content, length:', content.length);
      const agentNames = ['小龙虾', '小码', '小测', '小邮', '小数', '小文', '小产', '小财', '小运', '小移', '小前', '小后'];
      let senderName = '小龙虾';
      const mentioned = agentNames.find(name => msg.text.includes(`@${name}`));
      if (mentioned) {
        senderName = mentioned;
      }
      
      const agentMsg = {
        sender: senderName,
        text: content,
        timestamp: Date.now(),
        isUser: false,
        modelInfo: {
          modelId: response.data?.model || 'gpt-4',
          inputTokens: response.data?.usage?.prompt_tokens || 0,
          outputTokens: response.data?.usage?.completion_tokens || 0
        }
      };
      
      handleGatewayMessage(agentMsg);
      console.log(`[GATEWAY] Got response from ${senderName}: ${content.substring(0, 50)}...`);
    }
  } catch (e) {
    console.error(`[GATEWAY] Error: ${e.message}`);
    if (e.response) {
      console.error(`[GATEWAY] Response: ${e.response.status} ${JSON.stringify(e.response.data).substring(0, 200)}`);
    }
  }
}

async function handleGatewayMessage(msg) {
  if (!msg.text) return;
  
  try {
    const history = await loadHistory();
    
    const isDuplicate = history.some(m => 
      m.sender === msg.sender && 
      m.text === msg.text && 
      Math.abs(m.timestamp - msg.timestamp) < 5000
    );
    
    if (!isDuplicate) {
      history.push(msg);
      await saveHistory(history);
      
      broadcastToTeamChatClients(msg);
      console.log(`[GATEWAY] Saved and broadcast message from ${msg.sender}`);
    }
  } catch (e) {
    console.error('[GATEWAY] Handle message error:', e.message);
  }
}

const teamChatWsClients = new Set();

function broadcastToTeamChatClients(msg) {
  const data = JSON.stringify(msg);
  teamChatWsClients.forEach(client => {
    try {
      if (client.readyState === 1) {
        client.send(data);
      }
    } catch (e) {
      console.error('[WS] Broadcast error:', e.message);
    }
  });
}

async function handleHistory(req, res) {
  const startTime = Date.now();
  
  if (req.method === "GET") {
    // 从查询参数获取天数，默认 30 天
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = parseInt(url.searchParams.get('days')) || 30;
    const maxDays = 90;  // 最大允许 90 天
    
    const actualDays = Math.min(days, maxDays);
    const cutoffTime = Date.now() - actualDays * 24 * 60 * 60 * 1000;
    
    const allHistory = await loadHistory();
    const history = allHistory.filter(msg => msg.timestamp > cutoffTime);
    
    console.log(`[HISTORY] Loaded ${history.length} messages (last ${actualDays} days)`);
    
    MetricsCollector.recordRequest(Date.now() - startTime);
    return sendJson(res, 200, history);
  } else if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const msg = JSON.parse(body);
      if (!msg.timestamp) msg.timestamp = Date.now();
      
      // 去重检查：5秒内相同发送者+相同内容不重复添加
      const history = await loadHistory();
      const isDuplicate = history.some(m => 
        m.sender === msg.sender && 
        m.text === msg.text && 
        Math.abs(m.timestamp - msg.timestamp) < 5000
      );
      if (isDuplicate) {
        return sendJson(res, 200, { ok: true, duplicate: true });
      }
      
      // 更新会话状态并获取 sessionId
      const sessionId = updateChatSession(msg);
      if (sessionId) {
        msg.sessionId = sessionId;
      }
      
      history.push(msg);
      await saveHistory(history);
      
      // 记录消息发送
      MetricsCollector.recordMessage();
      
      // 触发后台下载任务（非阻塞）
      processMessageForDownloads(msg);
      
      // 转发消息到 Gateway 触发 Agent 响应
      console.log('[HISTORY] Calling forwardToGateway with:', msg.text);
      forwardToGateway(msg);
      
      MetricsCollector.recordRequest(Date.now() - startTime);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      MetricsCollector.recordRequest(Date.now() - startTime, true);
      return sendJson(res, 400, { ok: false, error: "invalid json" });
    }
  } else if (req.method === "PUT") {
    // 更新消息（用于编辑和删除）
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const updateData = JSON.parse(body);
      const { timestamp, updates } = updateData;
      
      if (!timestamp) {
        return sendJson(res, 400, { ok: false, error: "missing timestamp" });
      }
      
      const history = await loadHistory();
      const msgIndex = history.findIndex(m => m.timestamp === timestamp);
      
      if (msgIndex === -1) {
        return sendJson(res, 404, { ok: false, error: "message not found" });
      }
      
      // 更新消息属性
      const msg = history[msgIndex];
      for (const [key, value] of Object.entries(updates)) {
        msg[key] = value;
      }
      
      await saveHistory(history);
      
      MetricsCollector.recordRequest(Date.now() - startTime);
      return sendJson(res, 200, { ok: true, message: "updated" });
    } catch (e) {
      MetricsCollector.recordRequest(Date.now() - startTime, true);
      return sendJson(res, 400, { ok: false, error: "invalid json" });
    }
  } else if (req.method === "DELETE") {
    // 删除消息
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const deleteData = JSON.parse(body);
      const { timestamp } = deleteData;
      
      if (!timestamp) {
        return sendJson(res, 400, { ok: false, error: "missing timestamp" });
      }
      
      const history = await loadHistory();
      const msgIndex = history.findIndex(m => m.timestamp === timestamp);
      
      if (msgIndex === -1) {
        return sendJson(res, 404, { ok: false, error: "message not found" });
      }
      
      // 标记为已删除而不是真正删除
      history[msgIndex].deleted = true;
      history[msgIndex].deletedAt = Date.now();
      
      await saveHistory(history);
      
      MetricsCollector.recordRequest(Date.now() - startTime);
      return sendJson(res, 200, { ok: true, message: "deleted" });
    } catch (e) {
      MetricsCollector.recordRequest(Date.now() - startTime, true);
      return sendJson(res, 400, { ok: false, error: "invalid json" });
    }
  }
}

async function handleUpload(req, res) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) return sendText(res, 400, "missing multipart boundary");
  const boundary = boundaryMatch[1];

  const chunks = [];
  let total = 0;
  const maxBytes = 50 * 1024 * 1024;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) return sendText(res, 413, "upload too large");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const parts = parseMultipart(body, boundary);
  const files = parts.filter((p) => p.filename);
  if (!files.length) return sendJson(res, 400, { ok: false, error: "no files" });

  await ensureUploadsDir();

  const saved = [];
  for (const f of files) {
    const safeName = sanitizeFilename(f.filename);
    const prefix = new Date().toISOString().replace(/[:.]/g, "-");
    const uniq = crypto.randomBytes(4).toString("hex");
    const outName = `${prefix}-${uniq}-${safeName}`;
    const outPath = path.join(UPLOADS_DIR, outName);
    await fsp.writeFile(outPath, f.content);
    saved.push({
      name: safeName,
      url: `/uploads/${encodeURIComponent(outName)}`,
      mime: f.contentType,
      size: f.content.length,
      path: outPath,
    });
  }

  return sendJson(res, 200, { ok: true, files: saved });
}

async function handleOpen(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  } catch {
    return sendJson(res, 400, { ok: false, error: "invalid url" });
  }

  const fileParam = url.searchParams.get("file");
  if (!fileParam) return sendJson(res, 400, { ok: false, error: "missing file" });

  const decoded = decodeURIComponent(fileParam);
  const safeName = path.basename(decoded);
  if (!safeName || safeName !== decoded) {
    return sendJson(res, 400, { ok: false, error: "invalid file" });
  }

  const filePath = path.join(UPLOADS_DIR, safeName);
  const rel = path.relative(UPLOADS_DIR, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return sendJson(res, 400, { ok: false, error: "invalid file" });
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return sendJson(res, 404, { ok: false, error: "file not found" });
  }
  if (!stat.isFile()) return sendJson(res, 400, { ok: false, error: "not a file" });

  const platform = process.platform;
  let cmd;
  let args;
  if (platform === "darwin") {
    cmd = "open";
    args = [filePath];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", filePath];
  } else {
    cmd = "xdg-open";
    args = [filePath];
  }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : "open failed" });
  }
}

async function serveStatic(req, res) {
  const urlPath = req.url || "/";
  // 优先使用构建后的dist目录
  let targetPath;
  if (urlPath === "/" || urlPath === "/index.html") {
    // 先尝试dist目录
    const distIndex = path.join(BASE_DIR, "dist", "index.html");
    try {
      await fsp.access(distIndex);
      targetPath = distIndex;
    } catch {
      targetPath = path.join(BASE_DIR, "index.html");
    }
  } else if (urlPath.startsWith("/assets/")) {
    // 静态资源优先从dist目录获取
    targetPath = path.join(BASE_DIR, "dist", urlPath);
    try {
      await fsp.access(targetPath);
    } catch {
      targetPath = resolveSafePath(urlPath);
    }
  } else if (urlPath.startsWith("/css/") || urlPath.startsWith("/images/")) {
    // CSS和图片优先从dist目录获取
    targetPath = path.join(BASE_DIR, "dist", urlPath);
    try {
      await fsp.access(targetPath);
    } catch {
      targetPath = resolveSafePath(urlPath);
    }
  } else if (urlPath.endsWith(".html") || urlPath.endsWith(".htm")) {
    // HTML文件优先从dist目录获取
    targetPath = path.join(BASE_DIR, "dist", urlPath);
    try {
      await fsp.access(targetPath);
    } catch {
      targetPath = resolveSafePath(urlPath);
    }
  } else {
    targetPath = resolveSafePath(urlPath);
  }
  if (!targetPath) return sendText(res, 404, "not found");

  let stat;
  try {
    stat = await fsp.stat(targetPath);
  } catch {
    return sendText(res, 404, "not found");
  }
  if (stat.isDirectory()) {
    const indexPath = path.join(targetPath, "index.html");
    try {
      await fsp.access(indexPath);
      return serveFile(res, indexPath);
    } catch {
      return sendText(res, 403, "forbidden");
    }
  }

  return serveFile(res, targetPath);
}

function serveFile(res, filePath, downloadName = null, forceDownload = false) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  
  // 优化：根据文件类型设置缓存策略
  const cacheableExts = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const isCacheable = cacheableExts.includes(ext);
  
  const headers = {
    "Content-Type": mime,
    "Access-Control-Allow-Origin": "*",
  };
  
  // 缓存策略：静态资源缓存 1 天
  if (isCacheable) {
    headers["Cache-Control"] = "public, max-age=86400"; // 1 天
  } else {
    headers["Cache-Control"] = "no-store";
  }
  
  // 静态资源明确设置为 inline，防止 cloudflare tunnel 添加 attachment
  const staticExts = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.html', '.htm'];
  if (staticExts.includes(ext.toLowerCase())) {
    headers["Content-Disposition"] = "";
  } else if (forceDownload || downloadName) {
    const safe = encodeURIComponent(downloadName || path.basename(filePath));
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${safe}`;
  } else if (ext.match(/^\.(html|htm)$/i)) {
    headers["Content-Disposition"] = "inline";
  }
  
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => sendText(res, 500, "read error"));
  res.writeHead(200, headers);
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  // Set default CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Token,X-Session-Token");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const remoteAddr = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const isLocal = isLocalRequest(req);
  const sessionToken = getSessionToken(req);
  const hasValidSession = verifySession(sessionToken);
  
  // 调试日志
  if (!isLocal) {
    console.log(`[AUTH DEBUG] ${method} ${urlPath} | isLocal=${isLocal} | sessionToken=${sessionToken ? sessionToken.substring(0,8)+'...' : 'null'} | hasValidSession=${hasValidSession}`);
  }

  // 登录 API - 无需验证
  if (urlPath === "/api/login" && method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      if (data.password === LOGIN_PASSWORD) {
        const newSessionToken = generateSessionToken();
        activeSessions.set(newSessionToken, {
          createdAt: Date.now(),
          lastAccess: Date.now()
        });
        console.log(`[LOGIN] Successful login from ${remoteAddr}`);
        return sendJson(res, 200, { 
          ok: true, 
          session: newSessionToken,
          message: "登录成功"
        });
      } else {
        console.log(`[LOGIN] Failed login from ${remoteAddr}, expected: ${LOGIN_PASSWORD}, got: ${data.password}`);
      }
    } catch (e) {
      console.error("[LOGIN] Parse error:", e.message);
    }
    return sendJson(res, 401, { error: "密码错误" });
  }
  
  // 更新密码 API
  if (urlPath === "/api/password/update" && method === "POST") {
    return handlePasswordUpdate(req, res);
  }
  
  // 获取当前密码 API
  if (urlPath === "/api/password" && method === "GET") {
    return sendJson(res, 200, { password: LOGIN_PASSWORD });
  }
  
  // 获取 Gateway Token API（供前端动态获取）
  if (urlPath === "/api/gateway-token" && method === "GET") {
    return sendJson(res, 200, { token: gatewayToken });
  }
  
  // 发送密码到企微 API
  if (urlPath === "/api/password/send" && method === "POST") {
    const currentTunnelUrl = getLatestTunnelUrl();
    const loginUrl = currentTunnelUrl ? `${currentTunnelUrl}/team_chat_login.html` : 'http://127.0.0.1:18788/team_chat_login.html';
    notifyWecom(`🔐 TeamChat 登录口令\n密码: ${LOGIN_PASSWORD}\n链接: ${loginUrl}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "密码已发送到企微" }));
    return;
  }
// 管理 API：重启网关
if (urlPath === "/api/admin/restart-gateway" && method === "POST") {
  return handleRestartGateway(req, res);
}

// 管理 API：重启 TeamChat  
if (urlPath === "/api/admin/restart-teamchat" && method === "POST") {
  return handleRestartTeamChat(req, res);
}

// 管理 API：重启 Tunnel
if (urlPath === "/api/admin/restart-tunnel" && method === "POST") {
  return handleRestartTunnel(req, res);
}

// 管理 API：清空缓存
if (urlPath === "/api/admin/clear-cache" && method === "POST") {
  return handleClearCache(req, res);
}

  // 检查登录状态 API
  if (urlPath === "/api/check-auth" && method === "GET") {
    if (isLocal || hasValidSession) {
      return sendJson(res, 200, { authenticated: true });
    }
    return sendJson(res, 200, { authenticated: false });
  }

  // 登出 API
  if (urlPath === "/api/logout" && method === "POST") {
    if (sessionToken) {
      activeSessions.delete(sessionToken);
    }
    return sendJson(res, 200, { ok: true, message: "已登出" });
  }

  // 静态文件和公开 API 路径
  const isStaticFile = /\.(html|js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(urlPath);
  const isPublicApi = urlPath === '/api/login' || urlPath === '/api/check-auth' || urlPath === '/api/health' || urlPath === '/api/mail-tunnel' || urlPath === '/api/tunnel' || urlPath === '/api/agent-logs/stream' || urlPath.startsWith('/api/agent/') || urlPath === '/api/broadcast' || urlPath === '/api/file/path' || urlPath.startsWith('/api/trae/') || urlPath.startsWith('/api/muse/') || urlPath === '/api/system-metrics' || urlPath === '/api/agents' || urlPath === '/api/agents/status' || urlPath.startsWith('/api/sessions') || urlPath.startsWith('/api/ops/') || urlPath === '/history' || urlPath === '/api/model-stats' || urlPath === '/api/export-history' || urlPath.startsWith('/css/') || urlPath.startsWith('/assets/') || urlPath.startsWith('/images/');

  // 本地访问或已登录用户允许访问
  if (!isLocal && !hasValidSession && !isPublicApi) {
    // 对于静态文件，返回登录页面而不是 403
    if (urlPath === "/" || urlPath === "/index.html" || urlPath === "/team_chat.html" || urlPath.endsWith(".html")) {
      const loginPagePath = path.join(BASE_DIR, "team_chat_login.html");
      try {
        await fsp.access(loginPagePath);
        return serveFile(res, loginPagePath);
      } catch {
        // 如果登录页面不存在，返回简单的登录提示
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>需要登录</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0d1117;color:#c9d1d9;font-family:sans-serif;">
        <div style="text-align:center;"><h2>🔒 需要登录</h2><p>请访问本地地址或输入密码登录</p></div></body></html>`);
        return;
      }
    }
    console.warn(`[AUTH] Unauthorized access: ${method} ${urlPath} from ${remoteAddr}`);
    return sendJson(res, 401, { error: "需要登录", needLogin: true });
  }

  if (urlPath === "/upload" && method === "POST") {
    return handleUpload(req, res);
  }

  if (urlPath === "/history") {
    return handleHistory(req, res);
  }

  // Agent 状态 API
  if (urlPath === "/api/agent-status" && method === "GET") {
    return handleAgentStatus(req, res);
  }
  
  // 邮件同步状态 API
  if (urlPath === "/api/email-sync/status" && method === "GET") {
    return handleEmailSyncStatus(req, res);
  }
  
  // 邮件同步触发 API
  if (urlPath === "/api/email-sync/trigger" && method === "POST") {
    return handleEmailSyncTrigger(req, res);
  }
  
  // 搜索 API
  if (urlPath === "/api/search" && method === "POST") {
    return handleSearch(req, res);
  }
  
  // Agent 日志列表 API
  if (urlPath === "/api/agent-logs" && method === "GET") {
    return handleAgentLogsList(req, res);
  }
  
  // Agent 日志详情 API
  if (urlPath.match(/^\/api\/agent\/[^/]+\/logs$/) && method === "GET") {
    return handleAgentLogs(req, res);
  }
  
  // Agent 实时工作日志内容 API
  if (urlPath.match(/^\/api\/agent\/[^/]+\/worklog$/) && method === "GET") {
    return handleAgentWorkLog(req, res);
  }
  
  // 模型使用统计 API
if (urlPath === "/api/model-stats" && method === "GET") {
  return handleModelStats(req, res);
}

if (urlPath === "/api/export-history" && method === "GET") {
  const history = await loadHistory();
  let md = "# TeamChat 历史消息\n\n";
  for (const msg of history) {
    const time = new Date(msg.timestamp).toLocaleString('zh-CN');
    md += `## ${msg.sender} - ${time}\n\n${msg.text}\n\n---\n\n`;
  }
  res.writeHead(200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": "attachment; filename=teamchat-history.md"
  });
  return res.end(md);
}

// 会话列表 API
if (urlPath === "/api/sessions" && method === "GET") {
  const sessions = getChatSessions();
  return sendJson(res, 200, { sessions, count: sessions.length, timestamp: Date.now() });
}

// 会话历史 API
if (urlPath.match(/^\/api\/sessions\/[^/]+\/history$/) && method === "GET") {
  const pathParts = urlPath.split('/');
  const sessionId = pathParts[3];
  const history = getSessionHistory(sessionId);
  return sendJson(res, 200, { sessionId, history, count: history.length, timestamp: Date.now() });
}

// 管理 API：重启网关
if (urlPath === "/api/admin/restart-gateway" && method === "POST") {
  return handleRestartGateway(req, res);
}

// 管理 API：重启 TeamChat  
if (urlPath === "/api/admin/restart-teamchat" && method === "POST") {
  return handleRestartTeamChat(req, res);
}

// 管理 API：重启 Tunnel
if (urlPath === "/api/admin/restart-tunnel" && method === "POST") {
  return handleRestartTunnel(req, res);
}

// 管理 API：清空缓存
if (urlPath === "/api/admin/clear-cache" && method === "POST") {
  return handleClearCache(req, res);
}
  // 获取邮件系统 tunnel URL
  if (urlPath === "/api/mail-tunnel" && method === "GET") {
    const mailTunnelFile = path.join(OPENCLAW_HOME, 'wecom_mail_tunnel.url');
    let mailTunnelUrl = '';
    let isLocal = true;
    
    try {
      if (fs.existsSync(mailTunnelFile)) {
        mailTunnelUrl = fs.readFileSync(mailTunnelFile, 'utf8').trim();
        // 检查是否是 cloudflare 链接（可能是旧的）
        if (mailTunnelUrl.includes('trycloudflare.com')) {
          isLocal = false;
        }
      }
    } catch (e) {
      console.error('Failed to read mail tunnel file:', e);
    }
    
    // 如果没有有效的 URL，返回本地地址
    if (!mailTunnelUrl || mailTunnelUrl === '') {
      mailTunnelUrl = 'http://127.0.0.1:3456';
      isLocal = true;
    }
    
    return sendJson(res, 200, { 
      url: mailTunnelUrl,
      isLocal: isLocal,
      note: isLocal ? '隧道服务未运行，使用本地地址' : ''
    });
  }
  
  // 获取 TeamChat 最新隧道链接
  if (urlPath === "/api/tunnel" && method === "GET") {
    let tunnelUrl = getLatestTunnelUrl();
    let isLocal = true;
    
    // 检查是否有有效的 cloudflare 隧道
    if (tunnelUrl && tunnelUrl.includes('trycloudflare.com')) {
      // 检查 cloudflared 进程是否运行
      try {
        const { execSync } = require('child_process');
        execSync('pgrep -f cloudflared', { stdio: 'ignore' });
        isLocal = false; // 进程存在
      } catch (e) {
        // 进程不存在，使用本地地址
        console.log('[Tunnel] cloudflared not running, using local URL');
        tunnelUrl = 'http://127.0.0.1:18788';
        isLocal = true;
      }
    } else if (!tunnelUrl || tunnelUrl === '') {
      // 没有隧道 URL，使用本地地址
      tunnelUrl = 'http://127.0.0.1:18788';
      isLocal = true;
    }
    
    return sendJson(res, 200, { 
      url: tunnelUrl,
      loginUrl: tunnelUrl ? `${tunnelUrl}/team_chat_login.html` : '',
      chatUrl: tunnelUrl || 'http://127.0.0.1:18788/',
      isLocal: isLocal,
      note: isLocal ? '隧道服务未运行，使用本地地址' : ''
    });
  }
  
  // Muse System API
  if (urlPath.startsWith('/api/muse/')) {
    const handled = await handleMuseApi(req, res, urlPath, method);
    if (handled) return;
  }
  
  // Agent 日志 SSE 流
  if (urlPath === "/api/agent-logs/stream" && method === "GET") {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    // 发送现有日志（按时间正序发送，前端用unshift添加）
    for (const [agentId, logs] of agentLogsBuffer) {
      // 反转顺序，从旧到新发送
      logs.slice(0, 20).reverse().forEach(log => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      });
    }
    
    // 添加到客户端列表
    sseClients.add(res);
    
    // 心跳保持连接
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 15000);
    
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    
    return;
  }
  
  // 获取指定 agent 的日志
  if (urlPath.match(/^\/api\/agent\/[^/]+\/logs$/) && method === "GET") {
    const agentId = urlPath.split('/')[3];
    const logs = agentLogsBuffer.get(agentId) || [];
    return sendJson(res, 200, { agentId, logs: logs.slice(0, 50) });
  }
  
  // 获取所有 agent 列表
  if (urlPath === "/api/agents" && method === "GET") {
    const agents = [];
    const agentsDir = AGENTS_DIR;
    
    try {
      if (fs.existsSync(agentsDir)) {
        const agentDirs = fs.readdirSync(agentsDir).filter(f => {
          const stat = fs.statSync(path.join(agentsDir, f));
          return stat.isDirectory();
        });
        
        for (const agentId of agentDirs) {
          const agentPath = path.join(agentsDir, agentId);
          const sessionsDir = path.join(agentPath, 'sessions');
          let sessionCount = 0;
          
          if (fs.existsSync(sessionsDir)) {
            sessionCount = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl')).length;
          }
          
          const activityStatus = getAgentActivityStatus(agentId);
          const state = agentFileStates.get(agentId);
          
          agents.push({
            id: agentId,
            name: getAgentDisplayName(agentId),
            icon: getAgentIcon(agentId),
            status: activityStatus.status,
            lastActivity: activityStatus.lastActivity,
            sessionCount,
            hasActiveSession: state?.currentFile !== null
          });
        }
      }
    } catch (e) {
      console.error('[API] Error reading agents:', e.message);
    }
    
    return sendJson(res, 200, agents);
  }
  
  // 获取所有 agent 的状态
  if (urlPath === "/api/agents/status" && method === "GET") {
    const status = {};
    for (const [agentId, state] of agentFileStates) {
      const activityStatus = getAgentActivityStatus(agentId);
      status[agentId] = {
        hasActiveSession: state.currentFile !== null,
        currentFile: state.currentFile?.name || null,
        activityStatus: activityStatus.status,
        lastActivity: activityStatus.lastActivity
      };
    }
    return sendJson(res, 200, { agents: status, timestamp: Date.now() });
  }
  
  // 获取所有 agent 的活动状态
  if (urlPath === "/api/agents/activity" && method === "GET") {
    const activity = getAllAgentActivityStatus();
    return sendJson(res, 200, { activity, timestamp: Date.now() });
  }
  
  // 广播消息 API - 用于 Agent 发送系统通知
  if (urlPath === "/api/broadcast" && method === "POST") {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const message = data.message || data.text;
        
        if (!message) {
          return sendJson(res, 400, { error: 'message required' });
        }
        
        // 构造系统消息
        const broadcastMsg = {
          type: 'system',
          sender: data.sender || '系统',
          text: message,
          timestamp: Date.now(),
          isUser: false,
          isSystem: true
        };
        
        // 添加到历史并立即保存
        historyCache.push(broadcastMsg);
        historyDirty = true;
        
        // 立即保存到文件，避免重启时丢失
        (async () => {
            try {
                const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                const filtered = historyCache.filter(msg => msg.timestamp > thirtyDaysAgo);
                await fsp.writeFile(HISTORY_FILE, JSON.stringify(filtered.slice(-10000), null, 2));
                console.log(`[Broadcast] Message saved immediately`);
            } catch (e) {
                console.error('[Broadcast] Save error:', e.message);
            }
        })();
        
        // 通过 SSE 广播给所有客户端
        const sseData = `data: ${JSON.stringify({ type: 'broadcast', data: broadcastMsg })}\n\n`;
        sseClients.forEach(client => {
          try {
            client.write(sseData);
          } catch (e) {
            sseClients.delete(client);
          }
        });
        
        console.log(`[Broadcast] Message sent to ${sseClients.size} SSE clients, added to history`);
        return sendJson(res, 200, { ok: true, sseRecipients: sseClients.size, historyAdded: true });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }
  
  // 获取上传文件的本地路径 API - 供 Agent 使用
  if (urlPath === "/api/file/path" && method === "GET") {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const fileUrl = url.searchParams.get('url');
    
    if (!fileUrl) {
      return sendJson(res, 400, { error: 'url parameter required' });
    }
    
    // 解析文件名
    let fileName;
    if (fileUrl.startsWith('/uploads/')) {
      fileName = decodeURIComponent(fileUrl.slice('/uploads/'.length));
    } else if (fileUrl.includes('/uploads/')) {
      fileName = decodeURIComponent(fileUrl.split('/uploads/')[1].split('?')[0]);
    } else {
      return sendJson(res, 400, { error: 'invalid upload url' });
    }
    
    const localPath = path.join(UPLOADS_DIR, fileName);
    
    try {
      const stat = await fsp.stat(localPath);
      if (!stat.isFile()) {
        return sendJson(res, 404, { error: 'not a file' });
      }
      
      // 恢复原始文件名
      const match = fileName.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}-(.+)$/i);
      const originalName = match ? match[1] : fileName;
      
      return sendJson(res, 200, {
        ok: true,
        localPath,
        originalName,
        size: stat.size,
        mtime: stat.mtime
      });
    } catch (e) {
      return sendJson(res, 404, { error: 'file not found', path: localPath });
    }
  }
  
  // 健康检查 API
  if (urlPath === "/api/health" && method === "GET") {
    const memory = MetricsCollector.getMemoryUsage();
    const processMem = MetricsCollector.getProcessMemory();
    const health = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      cpu: MetricsCollector.getCPUUsage(),
      memory: memory,
      processMemory: processMem,
      wsConnections: MetricsCollector.wsConnections,
      errors: errorStats,
      performance: {
        historyCacheSize: historyCache ? historyCache.length : 0,
        historyCacheAge: historyCacheTime ? Date.now() - historyCacheTime : 0,
        historyDirty: historyDirty,
        errorLogBufferSize: errorLogBuffer.length,
        requestCount: MetricsCollector.requestCount,
        avgResponseTime: MetricsCollector.getAvgResponseTime(),
        errorRate: MetricsCollector.getErrorRate()
      }
    };
    return sendJson(res, 200, health);
  }
  
  // 错误统计 API
  if (urlPath === "/api/metrics" && method === "GET") {
    const metrics = MetricsCollector.collect();
    const alerts = MetricsCollector.checkAlerts(metrics);
    return sendJson(res, 200, {
      ...metrics,
      alerts,
      timestamp: Date.now()
    });
  }
  
  // 系统监控 API
  if (urlPath === "/api/system-metrics" && method === "GET") {
    const os = require('os');
    
    // 内存信息
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // 磁盘信息（异步获取，这里用简化版本）
    let diskInfo = { used: 0, total: 0, percent: 0 };
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'darwin') {
        const dfOutput = execSync('df -k / | tail -1', { encoding: 'utf-8' });
        const parts = dfOutput.split(/\s+/);
        if (parts.length >= 4) {
          diskInfo.total = parseInt(parts[1], 10) * 1024;
          diskInfo.used = parseInt(parts[2], 10) * 1024;
          diskInfo.percent = (diskInfo.used / diskInfo.total) * 100;
        }
      } else if (process.platform === 'linux') {
        const dfOutput = execSync('df -k / | tail -1', { encoding: 'utf-8' });
        const parts = dfOutput.split(/\s+/);
        if (parts.length >= 4) {
          diskInfo.total = parseInt(parts[1], 10) * 1024;
          diskInfo.used = parseInt(parts[2], 10) * 1024;
          diskInfo.percent = (diskInfo.used / diskInfo.total) * 100;
        }
      }
    } catch (e) {
      // 忽略错误
    }
    
    // Gateway 状态
    let gatewayStatus = 'unknown';
    let gatewayLatency = 0;
    try {
      const start = Date.now();
      const gatewayHealth = await axios.get(`http://127.0.0.1:${GATEWAY_PORT}/health`, { timeout: 2000 });
      gatewayLatency = Date.now() - start;
      gatewayStatus = gatewayHealth.status === 200 ? 'healthy' : 'unhealthy';
    } catch (e) {
      gatewayStatus = 'offline';
    }
    
    // 通道状态（从配置文件和进程状态获取）
    let channelStatus = {
      feishu: { status: 'unknown', lastSync: null },
      wecom: { status: 'unknown', lastSync: null },
      telegram: { status: 'unknown', lastSync: null }
    };
    
    try {
      // 读取 openclaw.json 配置
      const openclawConfigPath = path.join(OPENCLAW_HOME, 'openclaw.json');
      if (fs.existsSync(openclawConfigPath)) {
        const openclawConfig = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'));
        const channels = openclawConfig.channels || {};
        
        // 检查飞书配置 - 如果 enabled 则认为已连接
        if (channels.feishu?.enabled) {
          channelStatus.feishu = { status: 'connected', lastSync: Date.now() };
        }
        
        // 检查 Telegram 配置
        if (channels.telegram?.enabled) {
          channelStatus.telegram = { status: 'configured', lastSync: null };
        }
      }
      
      // 检查企业微信（通过端口 3000 检测）
      const wecomPath = path.join(OPENCLAW_HOME, 'wecom');
      if (fs.existsSync(wecomPath)) {
        try {
          // 检查端口 3000 是否有服务在监听
          const wecomCheck = await new Promise((resolve) => {
            const socket = require('net').createConnection(3000, 'localhost');
            socket.setTimeout(1000);
            socket.on('connect', () => {
              socket.destroy();
              resolve(true);
            });
            socket.on('error', () => resolve(false));
            socket.on('timeout', () => {
              socket.destroy();
              resolve(false);
            });
          });
          
          if (wecomCheck) {
            channelStatus.wecom = { status: 'connected', lastSync: Date.now() };
          } else {
            channelStatus.wecom = { status: 'configured', lastSync: null };
          }
        } catch (e) {
          channelStatus.wecom = { status: 'configured', lastSync: null };
        }
      }
    } catch (e) {
      console.warn('[System Metrics] Failed to check channel status:', e);
    }
    
    return sendJson(res, 200, {
      gateway: { status: gatewayStatus, latency: gatewayLatency },
      teamchat: { 
        status: 'healthy', 
        uptime: process.uptime() 
      },
      memory: {
        used: usedMem,
        total: totalMem,
        percent: (usedMem / totalMem) * 100
      },
      disk: diskInfo,
      feishu: channelStatus.feishu || { status: 'unknown', lastSync: null },
      wecom: channelStatus.wecom || { status: 'unknown', lastSync: null },
      telegram: channelStatus.telegram || { status: 'unknown', lastSync: null },
      timestamp: Date.now()
    });
  }
  
  // ========== 运维操作 API ==========
  
  // 重启 Gateway
  if (urlPath === "/api/ops/restart-gateway" && method === "POST") {
    try {
      const { execSync } = require('child_process');
      
      // 先尝试停止 Gateway
      try {
        execSync('openclaw gateway stop 2>/dev/null || true', { timeout: 15000 });
      } catch (e) {}
      
      // 等待进程完全停止
      await new Promise(r => setTimeout(r, 3000));
      
      // 清理锁文件
      try {
        const fs = require('fs');
        const lockFile = '/Users/wusiwei/.openclaw/.gateway.lock';
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
      } catch (e) {}
      
      // 启动 Gateway
      execSync('nohup openclaw gateway > /tmp/gw.log 2>&1 &', { 
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      
      // 等待启动
      await new Promise(r => setTimeout(r, 5000));
      
      // 检查是否启动成功
      let status = 'unknown';
      let pid = null;
      try {
        const gwProcess = execSync('pgrep -f "openclaw-gateway" | head -1', { encoding: 'utf-8' }).trim();
        if (gwProcess) {
          pid = parseInt(gwProcess);
          status = 'running';
        } else {
          status = 'stopped';
        }
      } catch (e) {
        status = 'stopped';
      }
      
      return sendJson(res, 200, { 
        success: true, 
        message: `Gateway 重启命令已执行`,
        status,
        pid
      });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: e.message });
    }
  }
  
  // 启动 Tunnel (cloudflared)
  if (urlPath === "/api/ops/start-tunnel" && method === "POST") {
    try {
      const { execSync } = require('child_process');
      
      // 先停止现有的 cloudflared 进程
      try {
        execSync('pkill -f "cloudflared" 2>/dev/null || true', { timeout: 5000 });
      } catch (e) {}
      
      await new Promise(r => setTimeout(r, 2000));
      
      // 启动新的 tunnel
      const tunnelLogPath = path.join(OPENCLAW_HOME, 'tunnel_team_chat.log');
      const tunnelUrlPath = path.join(OPENCLAW_HOME, 'team_chat_tunnel.url');
      
      execSync(`nohup cloudflared tunnel --url http://localhost:18788 > "${tunnelLogPath}" 2>&1 &`, { 
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      
      // 等待 tunnel 启动
      await new Promise(r => setTimeout(r, 8000));
      
      // 尝试获取 URL
      let tunnelUrl = null;
      try {
        const logContent = fs.readFileSync(tunnelLogPath, 'utf-8');
        const urlMatches = logContent.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
        if (urlMatches && urlMatches.length > 0) {
          tunnelUrl = urlMatches[urlMatches.length - 1];
          fs.writeFileSync(tunnelUrlPath, tunnelUrl);
        }
      } catch (e) {}
      
      // 获取进程状态
      let pid = null;
      try {
        const tunnelProcess = execSync('pgrep -f "cloudflared.*18788" | head -1', { encoding: 'utf-8' }).trim();
        if (tunnelProcess) {
          pid = parseInt(tunnelProcess);
        }
      } catch (e) {}
      
      if (tunnelUrl) {
        return sendJson(res, 200, { 
          success: true, 
          message: `Tunnel 已启动: ${tunnelUrl}`,
          url: tunnelUrl,
          pid
        });
      } else {
        return sendJson(res, 200, { 
          success: true, 
          message: 'Tunnel 启动命令已执行，请稍后点击获取链接',
          pid
        });
      }
    } catch (e) {
      return sendJson(res, 500, { success: false, error: e.message });
    }
  }
  
  // 重启 TeamChat
  if (urlPath === "/api/ops/restart-teamchat" && method === "POST") {
    try {
      const { execSync } = require('child_process');
      
      // 启动新进程
      const serverPath = path.join(process.cwd(), 'team_chat_server.cjs');
      execSync(`nohup node "${serverPath}" > /tmp/teamchat.log 2>&1 &`, { 
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      
      // 等待新进程启动
      await new Promise(r => setTimeout(r, 2000));
      
      // 获取新进程 PID
      let newPid = null;
      try {
        const teamchatProcess = execSync('pgrep -f "team_chat_server" | head -1', { encoding: 'utf-8' }).trim();
        if (teamchatProcess) {
          newPid = parseInt(teamchatProcess);
        }
      } catch (e) {}
      
      // 延迟退出当前进程
      setTimeout(() => {
        process.exit(0);
      }, 500);
      
      return sendJson(res, 200, { 
        success: true, 
        message: 'TeamChat 重启命令已执行',
        newPid
      });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: e.message });
    }
  }
  
  // 获取远程连接URL
  if (urlPath === "/api/remote-url" && method === "GET") {
    try {
      let remoteUrl = null;
      
      // 优先从 team_chat_tunnel.url 文件读取（最新、最可靠）
      const tunnelUrlFile = path.join(OPENCLAW_HOME, 'team_chat_tunnel.url');
      if (fs.existsSync(tunnelUrlFile)) {
        const urlContent = fs.readFileSync(tunnelUrlFile, 'utf-8').trim();
        if (urlContent && urlContent.startsWith('https://')) {
          remoteUrl = urlContent;
        }
      }
      
      // 备选：从 tunnel_team_chat.log 读取
      if (!remoteUrl) {
        const teamChatTunnelLogPath = path.join(OPENCLAW_HOME, 'tunnel_team_chat.log');
        if (fs.existsSync(teamChatTunnelLogPath)) {
          const teamChatLog = fs.readFileSync(teamChatTunnelLogPath, 'utf-8');
          const urlMatches = teamChatLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
          if (urlMatches && urlMatches.length > 0) {
            remoteUrl = urlMatches[urlMatches.length - 1];
          }
        }
      }
      
      // 备选：从 ngrok 日志读取
      if (!remoteUrl) {
        const ngrokLogPath = path.join(OPENCLAW_HOME, 'ngrok.log');
        if (fs.existsSync(ngrokLogPath)) {
          const ngrokLog = fs.readFileSync(ngrokLogPath, 'utf-8');
          const urlMatch = ngrokLog.match(/https:\/\/[a-z0-9-]+\.ngrok-free\.app/);
          if (urlMatch) {
            remoteUrl = urlMatch[0];
          }
        }
      }
      
      // 备选：从 tunnel_cf.log 读取
      if (!remoteUrl) {
        const cfTunnelLogPath = path.join(OPENCLAW_HOME, 'tunnel_cf.log');
        if (fs.existsSync(cfTunnelLogPath)) {
          const cfLog = fs.readFileSync(cfTunnelLogPath, 'utf-8');
          const urlMatches = cfLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
          if (urlMatches && urlMatches.length > 0) {
            remoteUrl = urlMatches[urlMatches.length - 1];
          }
        }
      }
      
      if (remoteUrl) {
        return sendJson(res, 200, { 
          success: true, 
          url: remoteUrl,
          local: `http://localhost:${PORT}`
        });
      } else {
        return sendJson(res, 200, { 
          success: false, 
          error: '未找到远程连接URL，请确保 ngrok、localtunnel 或 cloudflared 已启动',
          local: `http://localhost:${PORT}`
        });
      }
    } catch (e) {
      return sendJson(res, 500, { success: false, error: e.message });
    }
  }
  
  // 清理缓存
  if (urlPath === "/api/ops/clear-cache" && method === "POST") {
    try {
      const fs = require('fs');
      let cleared = 0;
      
      // 清理日志文件
      const logsDir = path.join(process.cwd(), 'logs');
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        for (const f of files) {
          if (f.endsWith('.log')) {
            fs.unlinkSync(path.join(logsDir, f));
            cleared++;
          }
        }
      }
      
      // 清理临时文件
      const tmpDir = '/tmp';
      if (fs.existsSync(tmpDir)) {
        const tmpFiles = fs.readdirSync(tmpDir);
        for (const f of tmpFiles) {
          if (f.startsWith('teamchat_') || f.startsWith('openclaw_')) {
            try {
              fs.unlinkSync(path.join(tmpDir, f));
              cleared++;
            } catch (e) {}
          }
        }
      }
      
      return sendJson(res, 200, { success: true, message: `已清理 ${cleared} 个文件` });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: e.message });
    }
  }
  
  // 历史指标 API
  if (urlPath === "/api/metrics/history" && method === "GET") {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const hours = parseInt(url.searchParams.get('hours') || '1', 10);
    const history = MetricsCollector.getHistory(hours);
    return sendJson(res, 200, {
      history,
      count: history.length,
      hours
    });
  }
  
  // 代理 Gateway API 请求（用于获取会话信息）
  if (urlPath.startsWith("/api/gateway/")) {
    const gatewayPath = urlPath.replace('/api/gateway', '');
    try {
      const gatewayRes = await axios.get(`http://127.0.0.1:${GATEWAY_PORT}${gatewayPath}`, {
        headers: { 'Authorization': `Bearer ${gatewayToken}` },
        timeout: 10000
      });
      return sendJson(res, 200, gatewayRes.data);
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ===== Trae 集成 API =====
  // 获取所有 Agent 状态和最近任务
  if (urlPath === "/api/trae/agents" && method === "GET") {
    const agents = [];
    for (const [agentId, state] of agentFileStates) {
      const activity = getAgentActivityStatus(agentId);
      const logs = agentLogsBuffer.get(agentId) || [];
      agents.push({
        agentId,
        activityStatus: activity.status,
        lastActivity: activity.lastActivity,
        recentLogs: logs.slice(0, 5).map(l => ({
          type: l.type,
          title: l.title,
          time: l.time
        }))
      });
    }
    return sendJson(res, 200, { agents, timestamp: Date.now() });
  }

  // 获取指定 Agent 的任务结果
  if (urlPath.match(/^\/api\/trae\/agent\/[^/]+$/) && method === "GET") {
    const agentId = urlPath.split('/').pop();
    const logs = agentLogsBuffer.get(agentId) || [];
    const activity = getAgentActivityStatus(agentId);
    
    // 读取最近的 session 文件获取完整任务结果
    let lastSessionContent = null;
    try {
      const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({ name: f, path: path.join(sessionsDir, f), mtime: fs.statSync(path.join(sessionsDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);
        
        if (files.length > 0) {
          const content = fs.readFileSync(files[0].path, 'utf8');
          const lines = content.split('\n').filter(l => l.trim());
          lastSessionContent = lines.slice(-10).map(l => {
            try { return JSON.parse(l); } catch { return null; }
          }).filter(Boolean);
        }
      }
    } catch (e) {}
    
    return sendJson(res, 200, {
      agentId,
      activityStatus: activity.status,
      lastActivity: activity.lastActivity,
      logs: logs.slice(0, 20),
      lastSession: lastSessionContent
    });
  }

  // 下达新指令给 Agent
  if (urlPath === "/api/trae/command" && method === "POST") {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { agentId, message, fromTrae = true } = data;
        
        if (!agentId || !message) {
          return sendJson(res, 400, { error: 'agentId and message required' });
        }
        
        // 通过 Gateway 发送消息给 Agent
        const wsUrl = `ws://127.0.0.1:${GATEWAY_PORT}?token=${gatewayToken}`;
        const WebSocket = require('ws');
        
        console.log(`[Trae API] Connecting to Gateway: ${wsUrl.substring(0, 50)}...`);
        
        const ws = new WebSocket(wsUrl, {
          headers: {
            'Origin': 'http://127.0.0.1:18788'
          }
        });
        const connectId = crypto.randomUUID();
        const requestId = crypto.randomUUID();
        
        ws.on('open', () => {
          console.log('[Trae API] WebSocket connected, sending connect request');
          // 先发送 connect 请求
          const connectReq = {
            type: 'req',
            id: connectId,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'cli',
                displayName: 'Trae IDE',
                version: '1.0.0',
                platform: 'web',
                mode: 'webchat'
              },
              auth: { token: gatewayToken },
              scope: ['operator.admin']
            }
          };
          ws.send(JSON.stringify(connectReq));
        });
        
        let connected = false;
        let response = null;
        
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            console.log('[Trae API] Received:', msg.type, msg.id?.substring(0, 8));
            
            // 处理 connect 响应
            if (msg.id === connectId) {
              if (msg.ok) {
                connected = true;
                console.log('[Trae API] Connect successful, sending agent request');
                
                // 自动加载会话历史并注入到消息中
                const injectHistory = (agentId, message, callback) => {
                  const { exec } = require('child_process');
                  const script = `/Users/wusiwei/.openclaw/.muse/inject-history.sh "${agentId}" "${message.replace(/"/g, '\\\\"')}"`;
                  
                  exec(script, { timeout: 3000 }, (error, stdout) => {
                    if (error || !stdout) {
                      callback(message); // 失败则使用原消息
                    } else {
                      callback(stdout.trim());
                    }
                  });
                };
                
                // 注入历史
                injectHistory(agentId, message, (contextMessage) => {
                  if (!fromTrae && contextMessage === message) {
                    // 没有历史，使用原消息
                    contextMessage = message;
                  }
                  
                  const agentReq = {
                    type: 'req',
                    id: requestId,
                    method: 'agent',
                    params: {
                      agentId,
                      sessionKey: `agent:${agentId}:${agentId}`,
                      message: contextMessage,
                      idempotencyKey: requestId
                    }
                  };
                  ws.send(JSON.stringify(agentReq));
                });
              } else {
                console.log('[Trae API] Connect failed:', msg.error);
                response = { error: msg.error };
                ws.close();
              }
            }
            
            // 处理 agent 响应
            if (msg.id === requestId) {
              response = msg;
              ws.close();
            }
          } catch {}
        });
        
        // 超时处理
        setTimeout(() => {
          if (!response) {
            console.log('[Trae API] Timeout, closing connection');
            ws.close();
          }
        }, 10000);
        
        ws.on('close', () => {
          console.log('[Trae API] Connection closed, connected:', connected);
          if (response) {
            return sendJson(res, 200, { ok: true, response });
          } else if (connected) {
            return sendJson(res, 200, { ok: true, message: 'Command sent, agent processing' });
          } else {
            return sendJson(res, 500, { error: 'Failed to connect to gateway' });
          }
        });
        
        ws.on('error', (e) => {
          console.log('[Trae API] WebSocket error:', e.message);
          return sendJson(res, 500, { error: e.message });
        });
        
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  // 获取最近的对话历史
  if (urlPath === "/api/trae/history" && method === "GET") {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const history = historyCache.slice(-limit);
    return sendJson(res, 200, { history, timestamp: Date.now() });
  }

  if (urlPath === "/open" && method === "GET") {
    return handleOpen(req, res);
  }

  // Mail API proxy - 代理邮件相关 API 到邮件服务器 (port 3456)
  if (urlPath.startsWith("/api/sync/") || 
      urlPath.startsWith("/api/email/") ||
      urlPath.startsWith("/api/dashboard") ||
      urlPath.startsWith("/api/stats") ||
      urlPath.startsWith("/api/profiles") ||
      urlPath.startsWith("/api/tasks") ||
      urlPath.startsWith("/api/learning") ||
      urlPath.startsWith("/api/calendar") ||
      urlPath.startsWith("/api/analytics") ||
      urlPath.startsWith("/api/send") ||
      urlPath.startsWith("/api/analyze") ||
      urlPath.startsWith("/api/summary") ||
      urlPath.startsWith("/api/archive/") ||
      urlPath.startsWith("/api/insights") ||
      urlPath.startsWith("/api/check") ||
      urlPath === "/api/contacts" ||
      urlPath.startsWith("/api/contacts/")) {
    return mailProxy.web(req, res);
  }

  // Proxy WebSocket-like requests or gateway API requests
  if (urlPath.startsWith("/v1/gateway")) {
    req.url = urlPath + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
    return proxy.web(req, res);
  }

  // 优先使用构建后的dist目录
  let targetPath;
  if (urlPath === "/" || urlPath === "/index.html") {
    const distIndex = path.join(BASE_DIR, "dist", "index.html");
    try {
      await fsp.access(distIndex);
      targetPath = distIndex;
    } catch {
      targetPath = path.join(BASE_DIR, "index.html");
    }
    
    // 处理带 session 参数的请求，注入 session 到页面
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionFromUrl = url.searchParams.get('session');
    if (sessionFromUrl && verifySession(sessionFromUrl)) {
      try {
        let html = await fsp.readFile(targetPath, 'utf8');
        // 在 </head> 前注入 session 脚本
        const sessionScript = `<script>window.__INITIAL_SESSION__ = "${sessionFromUrl}";</script>`;
        html = html.replace('</head>', sessionScript + '</head>');
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      } catch (e) {
        console.error('[Session Inject] Error:', e.message);
      }
    }
  } else if (urlPath.startsWith("/assets/")) {
    targetPath = path.join(BASE_DIR, "dist", urlPath);
    try {
      await fsp.access(targetPath);
    } catch {
      targetPath = resolveSafePath(urlPath);
    }
  } else if (urlPath.startsWith("/css/") || urlPath.startsWith("/images/")) {
    targetPath = path.join(BASE_DIR, "dist", urlPath);
    try {
      await fsp.access(targetPath);
    } catch {
      targetPath = resolveSafePath(urlPath);
    }
  } else if (urlPath.endsWith(".html") || urlPath.endsWith(".htm")) {
    // HTML文件优先从dist目录获取
    targetPath = path.join(BASE_DIR, "dist", urlPath);
    try {
      await fsp.access(targetPath);
    } catch {
      targetPath = resolveSafePath(urlPath);
    }
  } else {
    targetPath = resolveSafePath(urlPath);
  }
  if (!targetPath) return sendText(res, 404, "not found");

  let stat;
  try {
    stat = await fsp.stat(targetPath);
  } catch {
    return sendText(res, 404, "not found");
  }

  if (stat.isDirectory()) {
    const indexPath = path.join(targetPath, "index.html");
    try {
      await fsp.access(indexPath);
      return serveFile(res, indexPath);
    } catch {
      return sendText(res, 403, "forbidden");
    }
  }

  // If it's an upload, we might want to suggest a filename if we can recover it
  let downloadName = null;
  if (urlPath.startsWith("/uploads/")) {
    const base = path.basename(targetPath);
    // Recover original name from: 2026-02-13T09-08-37-333Z-8f7e6d5c-original_name.ext
    const match = base.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}-(.+)$/i);
    if (match) downloadName = match[1];
  }

  // 检查是否需要强制下载（远程访问或带 download=1 参数）
  const urlObj = new URL(req.url || "", `http://${req.headers.host || 'localhost'}`);
  const forceDownload = urlObj.searchParams.has('download') || !isLocal;
  
  return serveFile(res, targetPath, downloadName, forceDownload);
});

server.on("upgrade", (req, socket, head) => {
  const urlPath = (req.url || "/").split("?")[0];
  const remoteAddr = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const isLocal = isLocalRequest(req);
  
  // 从 URL 或 cookie 获取 session token
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const sessionToken = url.searchParams.get("session") || 
                       req.headers["cookie"]?.match(/session=([^;]+)/)?.[1];
  const hasValidSession = verifySession(sessionToken);
  
  console.log(`[WS UPGRADE] Request from ${remoteAddr}: ${urlPath} (local: ${isLocal}, session: ${hasValidSession ? 'valid' : 'invalid'})`);
  
  // 本地访问或已登录用户允许 WebSocket 连接
  if (!isLocal && !hasValidSession) {
    console.warn(`[WS UPGRADE] Unauthorized from ${remoteAddr}`);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // 只允许 /v1/gateway 和 /ws 路径
  if (urlPath.startsWith("/v1/gateway") || urlPath === "/ws") {
    console.log(`[WS UPGRADE] Proxying to Gateway: ${urlPath}`);
    
    // 增加 WebSocket 连接计数
    MetricsCollector.addWsConnection();
    console.log(`[WS] Connection opened. Total: ${MetricsCollector.wsConnections}`);
    
    // Override headers for WebSocket upgrade to satisfy gateway CORS
    req.headers['host'] = `localhost:${GATEWAY_PORT}`;
    req.headers['origin'] = `http://localhost:18788`;
    // 添加代理头，让gateway知道这是可信的本地请求
    req.headers['x-forwarded-for'] = '127.0.0.1';
    req.headers['x-forwarded-proto'] = 'http';
    
    proxy.ws(req, socket, head, { 
      target: `http://127.0.0.1:${GATEWAY_PORT}`,
      localAddress: '127.0.0.1'
    }, (err) => {
      if (err) {
        console.error(`[WS UPGRADE] Proxy error:`, err.message);
        MetricsCollector.removeWsConnection();
        logError('WS_ERROR', `WebSocket proxy error: ${err.message}`, {
          code: err.code,
          url: urlPath
        });
      }
    });
    
    socket.on('close', (hadError) => {
      MetricsCollector.removeWsConnection();
      console.log(`[WS] Connection closed. Total: ${MetricsCollector.wsConnections}, hadError: ${hadError}`);
      logError('WS_DISCONNECT', `WebSocket closed`, { hadError, remoteAddr });
    });
    
    socket.on('error', (err) => {
      console.error(`[WS SOCKET ERROR]`, err.message);
      logError('WS_ERROR', `Socket error: ${err.message}`, { code: err.code });
    });
  } else {
    console.warn(`[WS UPGRADE] Blocked unknown path: ${urlPath}`);
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

// 更新密码的API
function handlePasswordUpdate(req, res) {
  let body = "";
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.password && /^\d{6}$/.test(data.password)) {
        LOGIN_PASSWORD = data.password;
        console.log(`[密码更新] 新密码: ${LOGIN_PASSWORD}`);
        
        // 通过企微Webhook通知用户
        notifyWecom(`🔐 TeamChat 登录密码已更新\n新密码: ${LOGIN_PASSWORD}`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, password: LOGIN_PASSWORD }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "密码必须是6位数字" }));
      }
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "请求解析失败" }));
    }
  });
}

server.listen(PORT, "0.0.0.0", async () => {
  await ensureUploadsDir();
  process.stdout.write(`Team Chat server running on all interfaces: http://0.0.0.0:${PORT}/\n`);
  
  // 启动 Agent Sessions 监控
  initAgentSessionsMonitor();
  
  // 启动邮件同步服务
  initEmailSyncService();
  
  // 启动 Tunnel 自动检测和重启
  startTunnelAutoRecovery();
  
  // 启动时发送密码到企微
  const startupTunnelUrl = getLatestTunnelUrl();
  const startupUrl = startupTunnelUrl ? `${startupTunnelUrl}/` : 'http://127.0.0.1:18788/';
  notifyWecom(`🔐 TeamChat 已启动\n远程访问密码：${LOGIN_PASSWORD}\n链接： ${startupUrl}`);
});

// ===== 进程退出处理：确保保存历史消息 =====
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Received SIGINT, saving history...');
  await saveHistoryImmediate();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[SHUTDOWN] Received SIGTERM, saving history...');
  await saveHistoryImmediate();
  process.exit(0);
});

// 处理未捕获的异常
process.on('uncaughtException', async (err) => {
  console.error('[FATAL ERROR]', err);
  await saveHistoryImmediate();
  process.exit(1);
});

// 处理未捕获的 Promise rejection
process.on('unhandledRejection', async (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  // 不立即退出，但保存历史
  await saveHistoryImmediate();
});
