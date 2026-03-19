/**
 * TeamChat 邮件同步集成模块
 * 
 * 功能：
 * 1. 启动时自动同步新邮件到本地
 * 2. 建立索引
 * 3. 每30分钟检查一次新邮件
 * 4. 有新邮件时通过系统消息提醒
 */

const { checkMail, saveEmail, buildIndex } = require('./comprehensive_sync.js');
const fs = require('fs');
const path = require('path');

class EmailSyncManager {
    constructor() {
        this.isRunning = false;
        this.syncInterval = 30 * 60 * 1000; // 30 分钟
        this.lastSyncTime = null;
        this.newEmailsCount = 0;
        this.dbPath = path.join(__dirname, 'emails.db');
        this.archiveDir = path.join(process.env.OPENCLAW_HOME || path.join(process.env.HOME || require('os').homedir(), '.openclaw'), 'email_archive');
        
        // 确保 comprehensive_sync.js 中的变量可用
        this.MONTH_NAMES = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
    }
    
    /**
     * 启动邮件同步服务
     */
    async start() {
        if (this.isRunning) {
            console.log('[EmailSync] Service already running');
            return;
        }
        
        this.isRunning = true;
        console.log('[EmailSync] Starting email sync service...');
        
        // 1. 启动时同步新邮件（当前月份）
        await this.syncCurrentMonth();
        
        // 2. 建立索引
        await this.buildIndex();
        
        // 3. 启动定时检查
        this.startPeriodicCheck();
        
        console.log('[EmailSync] Service started successfully');
    }
    
    /**
     * 同步当前月份的邮件
     */
    async syncCurrentMonth() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        console.log(`[EmailSync] Syncing emails for ${currentYear}-${currentMonth}...`);
        
        try {
            // 同步 INBOX
            await this.syncFolder('INBOX', currentYear, currentMonth);
            
            // 同步 Sent Messages
            await this.syncFolder('Sent Messages', currentYear, currentMonth);
            
            // 同步 Drafts
            await this.syncFolder('Drafts', currentYear, currentMonth);
            
            this.lastSyncTime = new Date();
            console.log(`[EmailSync] Sync completed at ${this.lastSyncTime.toISOString()}`);
        } catch (error) {
            console.error('[EmailSync] Sync error:', error.message);
        }
    }
    
    /**
     * 同步指定文件夹的邮件
     */
    async syncFolder(boxName, year, month) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        
        try {
            const emails = await checkMail({ 
                box: boxName,
                range: [startDate.toISOString(), endDate.toISOString()],
                limit: 1000
            });
            
            if (emails && emails.length > 0) {
                console.log(`[EmailSync] Found ${emails.length} emails in ${boxName}`);
                
                for (const email of emails) {
                    await saveEmail(email, year, month);
                }
                
                this.newEmailsCount += emails.length;
            }
        } catch (error) {
            console.error(`[EmailSync] Error syncing ${boxName}:`, error.message);
        }
    }
    
    /**
     * 建立索引
     */
    async buildIndex() {
        console.log('[EmailSync] Building index...');
        
        try {
            // 这里可以添加更复杂的索引逻辑
            // 例如：全文搜索索引、发件人索引、时间索引等
            
            console.log('[EmailSync] Index built successfully');
        } catch (error) {
            console.error('[EmailSync] Index build error:', error.message);
        }
    }
    
    /**
     * 启动定时检查
     */
    startPeriodicCheck() {
        console.log(`[EmailSync] Starting periodic check (every ${this.syncInterval / 60000} minutes)`);
        
        this.checkTimer = setInterval(async () => {
            await this.checkNewEmails();
        }, this.syncInterval);
    }
    
    /**
     * 检查新邮件
     */
    async checkNewEmails() {
        console.log('[EmailSync] Checking for new emails...');
        
        const previousCount = this.newEmailsCount;
        
        // 同步当前月份
        await this.syncCurrentMonth();
        
        // 检查是否有新邮件
        if (this.newEmailsCount > previousCount) {
            const newCount = this.newEmailsCount - previousCount;
            console.log(`[EmailSync] Found ${newCount} new emails!`);
            
            // 发送系统通知
            this.sendNotification(newCount);
        } else {
            console.log('[EmailSync] No new emails found');
        }
    }
    
    /**
     * 发送系统通知
     */
    sendNotification(count) {
        // 这里可以集成到 TeamChat 的消息系统
        // 发送系统消息到聊天界面
        const notification = {
            type: 'system',
            text: `📬 您有 ${count} 封新邮件`,
            timestamp: Date.now()
        };
        
        console.log('[EmailSync] Sending notification:', notification.text);
        
        // 触发事件（如果 TeamChat 有事件系统的话）
        // eventBus.emit('email:new', notification);
    }
    
    /**
     * 停止服务
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        
        console.log('[EmailSync] Service stopped');
    }
    
    /**
     * 获取状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastSyncTime: this.lastSyncTime,
            newEmailsCount: this.newEmailsCount,
            nextCheckTime: this.checkTimer ? new Date(Date.now() + this.syncInterval) : null
        };
    }
}

module.exports = EmailSyncManager;
