const axios = require('axios');

const TEAMCHAT_URL = 'http://127.0.0.1:18788';
const AUTH_TOKEN = 'ea5e7558c8696733ecde31f495d8c26bb24147eca5bf3c61';
const WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=8603f9a7-daf6-467f-b8e3-beeedafcaf5e';

const LOG_FILE = "/Users/wusiwei/.openclaw/wecom_teamchat_monitor.log";
let lastTimestamp = 0;

function log(msg) {
  const time = new Date().toLocaleString('zh-CN');
  console.log(`[${time}] ${msg}`);
  require('fs').appendFileSync(LOG_FILE, `[${time}] ${msg}\n`);
}

async function sendWecom(content) {
  try {
    await axios.post(WEBHOOK_URL, {
      msgtype: 'text',
      text: { content }
    }, { timeout: 5000 });
  } catch (e) {
    log(`发送失败: ${e.message}`);
  }
}

async function checkNewMessages() {
  try {
    const res = await axios.get(`${TEAMCHAT_URL}/history?token=${AUTH_TOKEN}`, { timeout: 10000 });
    const messages = res.data;
    
    // 获取最近的消息
    const recent = messages.filter(m => m.timestamp > lastTimestamp && !m.isUser);
    
    if (recent.length > 0) {
      for (const msg of recent) {
        const preview = msg.text?.substring(0, 100) || '(无内容)';
        await sendWecom(`🤖 ${msg.sender}: ${preview}${msg.text?.length > 100 ? '...' : ''}`);
        log(`已发送: ${msg.sender}`);
      }
      lastTimestamp = Math.max(...recent.map(m => m.timestamp));
    }
  } catch (e) {
    log(`检查失败: ${e.message}`);
  }
}

async function main() {
  log('TeamChat 监控已启动');
  
  // 初始获取最新消息时间
  try {
    const res = await axios.get(`${TEAMCHAT_URL}/history?token=${AUTH_TOKEN}`, { timeout: 10000 });
    const messages = res.data;
    if (messages.length > 0) {
      lastTimestamp = messages[messages.length - 1].timestamp;
      log(`初始时间戳: ${lastTimestamp}`);
    }
  } catch (e) {
    log(`初始获取失败: ${e.message}`);
  }
  
  // 每 30 秒检查一次
  setInterval(async () => {
    try {
      await checkNewMessages();
    } catch (e) {
      log(`检查失败: ${e.message}`);
    }
  }, 30000);
}

main().catch(e => log(`启动失败: ${e.message}`));
