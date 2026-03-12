// 管理 API 处理函数
const path = require('path');
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || "/Users/wusiwei/.openclaw";

// 重启网关
async function handleRestartGateway(req, res) {
  console.log('[ADMIN] Restarting Gateway...');
  try {
    const { exec } = require('child_process');
    exec('pkill -f "node.*gateway-monitor" && sleep 1 && node ~/.openclaw/workspace/lib/gateway-monitor.js &', (error, stdout, stderr) => {
      if (error) {
        console.error('[ADMIN] Failed to restart gateway:', error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: '重启网关失败', details: error.message }));
      } else {
        console.log('[ADMIN] Gateway restarted successfully');
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: '网关已重启' }));
      }
    });
  } catch (e) {
    console.error('[ADMIN] Error restarting gateway:', e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: '重启网关失败', details: e.message }));
  }
}

// 重启 TeamChat
function handleRestartTeamChat(req, res) {
  console.log('[ADMIN] Restarting TeamChat...');
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, message: 'TeamChat 将在 3 秒后重启' }));
  
  setTimeout(() => {
    const { spawn } = require('child_process');
    const child = spawn('node', [__filename], { detached: true, stdio: 'ignore' });
    child.unref();
    process.exit(0);
  }, 3000);
}

// 重启 Tunnel
async function handleRestartTunnel(req, res) {
  console.log('[ADMIN] Restarting Tunnel...');
  try {
    const { exec } = require('child_process');
    const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/Users/wusiwei/.openclaw';
    const logFile = `${OPENCLAW_HOME}/logs/tunnel_team_chat.log`;
    
    // 停止旧的 tunnel 进程
    const stopCmd = 'pkill -f "cloudflared.*18788"';
    
    // 启动新的 tunnel 进程（使用 nohup 确保后台运行）
    const startCmd = `nohup cloudflared tunnel --url http://127.0.0.1:18788 --logfile "${logFile}" > /dev/null 2>&1 &`;
    
    // 先停止，等待 2 秒，再启动
    exec(`${stopCmd} && sleep 2 && ${startCmd}`, (error, stdout, stderr) => {
      if (error) {
        console.error('[ADMIN] Failed to restart tunnel:', error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: '重启 Tunnel 失败', details: error.message }));
      } else {
        console.log('[ADMIN] Tunnel restart command executed');
        // 等待 3 秒让 tunnel 启动
        setTimeout(() => {
          // 读取最新的 tunnel URL
          const fs = require('fs');
          let tunnelUrl = '正在启动...';
          try {
            if (fs.existsSync(logFile)) {
              const logs = fs.readFileSync(logFile, 'utf8');
              const match = logs.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/g);
              if (match && match.length > 0) {
                tunnelUrl = match[match.length - 1];
              }
            }
          } catch (e) {
            console.error('[ADMIN] Failed to read tunnel URL:', e);
          }
          
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'Tunnel 已重启',
            url: tunnelUrl
          }));
        }, 3000);
      }
    });
  } catch (e) {
    console.error('[ADMIN] Error restarting tunnel:', e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: '重启 Tunnel 失败', details: e.message }));
  }
}

// 清空缓存
async function handleClearCache(req, res) {
  console.log('[ADMIN] Clearing cache...');
  try {
    const fs = require('fs');
    const path = require('path');
    
    const uploadsDir = path.join(OPENCLAW_HOME, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      fs.mkdirSync(uploadsDir);
    }
    
    const tmpDir = path.join(OPENCLAW_HOME, 'tmp');
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir);
    }
    
    console.log('[ADMIN] Cache cleared successfully');
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: '缓存已清空' }));
  } catch (e) {
    console.error('[ADMIN] Error clearing cache:', e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: '清空缓存失败', details: e.message }));
  }
}

module.exports = {
  handleRestartGateway,
  handleRestartTeamChat,
  handleRestartTunnel,
  handleClearCache
};
