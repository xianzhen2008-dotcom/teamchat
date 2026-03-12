/**
 * 邮件同步服务
 * 功能：
 * 1. 启动时自动同步新邮件到本地
 * 2. 建立索引
 * 3. 每30分钟检查一次是否有新邮件
 * 4. 有新邮件时通过系统消息在 TeamChat 提醒
 * 5. 自动清理 2025-08-01 以前的旧邮件（只保留纯文本）
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 修正路径：邮件存档在 .openclaw 根目录
const BASE_DIR = path.join(__dirname, '..');
const WECOM_MAIL_DIR = '/Users/wusiwei/.openclaw/wecom-mail';
const EMAIL_SYNC_SCRIPT = path.join(WECOM_MAIL_DIR, 'comprehensive_sync.js');
const EMAIL_ARCHIVE_DIR = path.join(BASE_DIR, '../../email_archive');
const CLEANUP_SCRIPT = path.join(WECOM_MAIL_DIR, 'cleanup_old_emails.js');

const EMAIL_SYNC_INTERVAL = 30 * 60 * 1000; // 30 分钟
const CUTOFF_DATE = new Date('2025-08-01T00:00:00.000Z'); // 数据保留截止日期

let emailSyncTimer = null;
let lastSyncTime = 0;
let isSyncing = false;
let lastEmailCount = 0;
let hasCleanedUp = false; // 是否已经执行过清理

/**
 * 初始化邮件同步服务
 */
function initEmailSyncService() {
    console.log('[EmailSync] Starting email sync service...');
    
    // 启动时立即同步一次
    syncEmails().then(() => {
        console.log('[EmailSync] Initial sync completed');
        
        // 启动后延时执行清理（确保同步完成后再清理）
        setTimeout(() => {
            cleanupOldEmails();
        }, 5000);
        
    }).catch(err => {
        console.error('[EmailSync] Initial sync failed:', err.message);
    });
    
    // 设置定时器，每30分钟检查一次
    emailSyncTimer = setInterval(() => {
        console.log('[EmailSync] Running scheduled email sync...');
        syncEmails().catch(err => {
            console.error('[EmailSync] Scheduled sync failed:', err.message);
        });
    }, EMAIL_SYNC_INTERVAL);
    
    console.log('[EmailSync] Email sync service started (interval: 30 minutes)');
    console.log('[EmailSync] Data retention policy: Keep full content after', CUTOFF_DATE.toISOString().split('T')[0]);
}

/**
 * 同步邮件
 * @param {boolean} forceSync - 是否强制同步（忽略完成标记）
 */
async function syncEmails(forceSync = false) {
    if (isSyncing) {
        console.log('[EmailSync] Sync already in progress, skipping...');
        return;
    }
    
    isSyncing = true;
    const startTime = Date.now();
    
    try {
        console.log('[EmailSync] Starting email sync...');
        
        // 检查同步脚本是否存在
        if (!fs.existsSync(EMAIL_SYNC_SCRIPT)) {
            console.error('[EmailSync] Sync script not found:', EMAIL_SYNC_SCRIPT);
            return;
        }
        
        // 执行同步脚本
        await new Promise((resolve, reject) => {
            exec(`node "${EMAIL_SYNC_SCRIPT}"`, {
                cwd: WECOM_MAIL_DIR,
                env: { ...process.env, FORCE_SYNC: forceSync ? '1' : '0' },
                timeout: 300000
            }, (error, stdout, stderr) => {
                // 输出日志
                if (stdout && stdout.trim()) {
                    console.log('[EmailSync]', stdout.trim());
                }
                if (stderr && stderr.trim()) {
                    console.error('[EmailSync]', stderr.trim());
                }
                
                if (error) {
                    console.error('[EmailSync] Sync error:', error.message);
                    reject(error);
                } else {
                    const endTime = Date.now();
                    const duration = ((endTime - startTime) / 1000).toFixed(1);
                    console.log(`[EmailSync] Sync completed in ${duration}s`);
                    resolve();
                }
            });
        });
        
        // 更新最后同步时间
        lastSyncTime = Date.now();
        
        // 检查是否有新邮件
        await checkForNewEmails();
        
    } catch (error) {
        console.error('[EmailSync] Sync failed:', error.message);
    } finally {
        isSyncing = false;
    }
}

/**
 * 清理旧邮件（数据保留策略）
 * 2025-08-01 以前的邮件只保留纯文本，删除 HTML 和附件信息
 */
async function cleanupOldEmails() {
    if (hasCleanedUp) {
        console.log('[EmailSync] Old emails already cleaned up, skipping...');
        return;
    }
    
    if (!fs.existsSync(CLEANUP_SCRIPT)) {
        console.log('[EmailSync] Cleanup script not found, skipping cleanup');
        return;
    }
    
    console.log('[EmailSync] Starting old email cleanup...');
    console.log('[EmailSync] Cutoff date:', CUTOFF_DATE.toISOString().split('T')[0]);
    console.log('[EmailSync] Policy: Emails before cutoff will have HTML and attachments removed');
    
    try {
        await new Promise((resolve, reject) => {
            exec(`node "${CLEANUP_SCRIPT}"`, {
                cwd: WECOM_MAIL_DIR,
                timeout: 600000 // 10 分钟超时
            }, (error, stdout, stderr) => {
                if (stdout && stdout.trim()) {
                    console.log('[EmailSync Cleanup]', stdout.trim());
                }
                if (stderr && stderr.trim()) {
                    console.error('[EmailSync Cleanup]', stderr.trim());
                }
                
                if (error) {
                    console.error('[EmailSync Cleanup] Error:', error.message);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
        
        hasCleanedUp = true;
        console.log('[EmailSync] Old email cleanup completed');
        
    } catch (error) {
        console.error('[EmailSync] Cleanup failed:', error.message);
    }
}

/**
 * 手动触发清理（可通过 API 调用）
 */
function triggerCleanup() {
    hasCleanedUp = false;
    cleanupOldEmails();
}

/**
 * 检查是否有新邮件（通过文件系统）
 */
async function checkForNewEmails() {
    try {
        if (!fs.existsSync(EMAIL_ARCHIVE_DIR)) {
            console.log('[EmailSync] Archive directory not found, skipping new email check');
            return 0;
        }
        
        // 统计邮件文件数量
        let currentEmailCount = 0;
        
        const countEmails = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    countEmails(fullPath);
                } else if (item.endsWith('.json')) {
                    currentEmailCount++;
                }
            }
        };
        
        countEmails(EMAIL_ARCHIVE_DIR);
        
        const newEmailCount = currentEmailCount - lastEmailCount;
        
        if (newEmailCount > 0) {
            console.log(`[EmailSync] Found ${newEmailCount} new emails (total: ${currentEmailCount})`);
            
            // 发送系统消息到 TeamChat
            sendEmailNotification(newEmailCount);
        } else {
            console.log(`[EmailSync] No new emails found (total: ${currentEmailCount})`);
        }
        
        lastEmailCount = currentEmailCount;
        return newEmailCount;
        
    } catch (error) {
        console.error('[EmailSync] Check new emails failed:', error.message);
        return 0;
    }
}

/**
 * 发送邮件通知到 TeamChat
 */
function sendEmailNotification(count) {
    try {
        // 获取 TeamChat 服务器的广播函数
        const teamChatServer = require('./team_chat_server.cjs');
        
        if (teamChatServer.broadcastSystemMessage) {
            teamChatServer.broadcastSystemMessage({
                id: `email_notification_${Date.now()}`,
                sender: '邮件同步助手',
                text: `📬 您有 ${count} 封新邮件\n\n点击查看：https://exmail.weipaitang.com`,
                isUser: false,
                timestamp: Date.now(),
                type: 'system'
            });
            
            console.log('[EmailSync] Notification sent to TeamChat');
        } else {
            console.warn('[EmailSync] broadcastSystemMessage not available');
        }
        
    } catch (error) {
        console.error('[EmailSync] Send notification failed:', error.message);
    }
}

/**
 * 停止邮件同步服务
 */
function stopEmailSyncService() {
    if (emailSyncTimer) {
        clearInterval(emailSyncTimer);
        emailSyncTimer = null;
        console.log('[EmailSync] Email sync service stopped');
    }
}

/**
 * 获取同步状态
 */
function getSyncStatus() {
    return {
        isRunning: isSyncing,
        lastSyncTime: lastSyncTime,
        interval: EMAIL_SYNC_INTERVAL,
        cutoffDate: CUTOFF_DATE.toISOString(),
        scriptPath: EMAIL_SYNC_SCRIPT,
        archiveDir: EMAIL_ARCHIVE_DIR,
        lastEmailCount: lastEmailCount,
        hasCleanedUp: hasCleanedUp
    };
}

/**
 * 获取腾讯企业邮箱服务器上的邮件数量
 */
async function getServerMailCount() {
    return new Promise((resolve, reject) => {
        const Imap = require('imap');
        
        // 直接读取 .env 文件
        const envPath = path.join(WECOM_MAIL_DIR, '.env');
        let mailUser = process.env.WECOM_MAIL_USER;
        let mailPass = process.env.WECOM_MAIL_PASS;
        
        if (fs.existsSync(envPath)) {
            try {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const lines = envContent.split('\n');
                for (const line of lines) {
                    const [key, ...valueParts] = line.split('=');
                    if (key === 'WECOM_MAIL_USER') {
                        mailUser = valueParts.join('=').trim();
                    } else if (key === 'WECOM_MAIL_PASS') {
                        mailPass = valueParts.join('=').trim();
                    }
                }
            } catch (e) {
                console.error('[EmailSync] Failed to read .env:', e.message);
            }
        }
        
        if (!mailUser || !mailPass) {
            resolve({ total: 0, inbox: 0, sent: 0, error: 'Missing credentials' });
            return;
        }
        
        const imap = new Imap({
            user: mailUser,
            password: mailPass,
            host: 'imap.exmail.qq.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        });
        
        let totalCount = 0;
        let inboxCount = 0;
        let sentCount = 0;
        
        imap.once('ready', () => {
            imap.getBoxes((err, boxes) => {
                if (err) {
                    imap.end();
                    resolve({ total: 0, inbox: 0, sent: 0, error: err.message });
                    return;
                }
                
                const folderList = Object.keys(boxes);
                let processed = 0;
                
                function checkFolder(folderName) {
                    imap.openBox(folderName, true, (err, box) => {
                        if (!err && box) {
                            const count = box.messages?.total || 0;
                            totalCount += count;
                            
                            if (folderName === 'INBOX') {
                                inboxCount = count;
                            } else if (folderName.includes('Sent')) {
                                sentCount = count;
                            }
                        }
                        
                        processed++;
                        
                        if (processed < folderList.length) {
                            checkFolder(folderList[processed]);
                        } else {
                            imap.end();
                            resolve({ total: totalCount, inbox: inboxCount, sent: sentCount });
                        }
                    });
                }
                
                if (folderList.length > 0) {
                    checkFolder(folderList[0]);
                } else {
                    imap.end();
                    resolve({ total: 0, inbox: 0, sent: 0 });
                }
            });
        });
        
        imap.once('error', (err) => {
            resolve({ total: 0, inbox: 0, sent: 0, error: err.message });
        });
        
        imap.once('timeout', () => {
            resolve({ total: 0, inbox: 0, sent: 0, error: 'Connection timeout' });
        });
        
        imap.connect();
    });
}

module.exports = {
    initEmailSyncService,
    stopEmailSyncService,
    syncEmails,
    cleanupOldEmails,
    triggerCleanup,
    getSyncStatus,
    getServerMailCount
};
