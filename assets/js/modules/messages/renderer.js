/**
 * Message Renderer - 消息渲染器
 * 渲染用户和 Agent 消息
 */

import { renderMarkdown } from './markdown.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { formatTimeWithDate } from '../../utils/format.js';
import { avatarService } from '../../services/avatar.js';
import { stateManager } from '../../core/state.js';

export function renderMessage(msg) {
    const agents = stateManager.getState('agents') || [];
    const agent = agents.find(a => a.name === msg.sender) || { img: '小龙虾.png', color: '#00d4ff' };
    const avatarUrl = avatarService.getUrl(agent.img);
    const userAvatarUrl = avatarService.getUrl('我.jpg');

    const isUser = msg.isUser;
    const msgClass = isUser ? 'user' : 'agent';
    const timestamp = msg.timestamp || Date.now();
    const msgId = msg.id || timestamp;
    const sessionId = msg.sessionId || msg.runId;

    let contentHtml = '';
    if (msg.image) {
        const isRemote = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const clickHandler = isRemote 
            ? `onclick="window.open('${msg.image}', '_blank')"` 
            : `onclick="window.open('${msg.image}', '_blank')"`;
        contentHtml = `<img src="${msg.image}" alt="图片" loading="lazy" style="max-width: 100%; max-height: 300px; border-radius: 8px; cursor: pointer;" ${clickHandler}>`;
    } else if (msg.file) {
        contentHtml = renderFileCard({ label: msg.file.name, token: extractToken(msg.file.url) });
    } else {
        contentHtml = renderMarkdown(msg.text || '');
    }

    const avatarColor = isUser ? '#3b82f6' : (agent.color || '#00d4ff');
    const isBusy = !isUser && stateManager.getState('agentBusyMap')?.get(agent.agentId);
    
    const status = msg.status || (isUser ? 'sent' : 'received');
    const statusIcon = getStatusIcon(status);
    const statusClass = getStatusClass(status);

    const sessionTagHtml = sessionId ? renderSessionTag(sessionId) : '';

    return `
        <div class="msg ${msgClass}" data-timestamp="${timestamp}" data-msg-id="${msgId}" ${msg.runId ? `data-run-id="${msg.runId}"` : ''} ${sessionId ? `data-session-id="${sessionId}"` : ''}>
            ${!isUser ? `
                <div class="msg-avatar-wrap ${isBusy ? 'busy' : ''}">
                    <div class="msg-avatar msg-agent-avatar" data-agent-id="${agent.agentId || agent.name}" style="background-image: url('${avatarUrl}');" data-sender="${escapeHtml(msg.sender)}"></div>
                </div>
            ` : `
                <div class="msg-avatar-wrap">
                    <div class="msg-avatar user-avatar" style="background-image: url('${userAvatarUrl}'); background-size: cover;"></div>
                </div>
            `}
            <div class="msg-content-wrapper">
                ${!isUser ? `<div class="msg-meta">
                    <span>${escapeHtml(msg.sender)}</span>
                    ${sessionTagHtml}
                    ${(() => {
                        const modelId = msg.model || msg.modelInfo?.modelId;
                        return modelId ? `<span class="msg-model-tag" title="使用的大模型">${modelId}</span>` : '';
                    })()}
                </div>` : ''}
                <div class="msg-content" data-text="${escapeHtml(msg.text || '')}">${contentHtml}</div>
                <div class="msg-footer">
                    <div class="msg-time">${formatTimeWithDate(new Date(timestamp))}</div>
                    <div class="msg-status ${statusClass}" data-status="${status}">${statusIcon} <span class="status-text">${getStatusText(status)}</span></div>
                    <div class="msg-actions">
                        <button class="msg-action-btn" data-action="reply" title="引用">↩️</button>
                        <button class="msg-action-btn" data-action="copy" title="复制">📋</button>
                        ${isUser ? `<button class="msg-action-btn" data-action="recall" title="撤回">↩️</button>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderSessionTag(sessionId) {
    const shortId = sessionId.slice(0, 8);
    return `<span class="session-tag clickable" title="点击回复此会话" data-session-id="${sessionId}" onclick="window.dispatchEvent(new CustomEvent('session:reply', { detail: { sessionId: '${sessionId}' } }))">#sess-${shortId}</span>`;
}

function getStatusIcon(status) {
    const icons = {
        'sending': '⏳',
        'sent': '✓',
        'delivered': '✓✓',
        'read': '✓✓',
        'failed': '✗',
        'processing': '⚙️',
        'queued': '⏸️',
        'received': '✓'
    };
    return icons[status] || '✓';
}

function getStatusClass(status) {
    const classes = {
        'sending': 'status-sending',
        'sent': 'status-sent',
        'delivered': 'status-delivered',
        'read': 'status-read',
        'failed': 'status-failed',
        'processing': 'status-processing',
        'queued': 'status-queued',
        'received': 'status-received'
    };
    return classes[status] || 'status-sent';
}

function getStatusText(status) {
    const texts = {
        'sending': '发送中...',
        'sent': '已发送',
        'delivered': '已送达',
        'read': '已读',
        'failed': '发送失败',
        'processing': '处理中...',
        'queued': '排队中...',
        'received': '已接收'
    };
    return texts[status] || status;
}

function extractToken(url) {
    if (!url || !url.startsWith('/uploads/')) return '';
    return url.slice('/uploads/'.length).split('/')[0] || '';
}

function getFileIcon(ext) {
    const iconMap = {
        // 图片
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️',
        // 文档
        'pdf': '📕',
        'doc': '📘', 'docx': '📘',
        'xls': '📊', 'xlsx': '📊',
        'ppt': '📙', 'pptx': '📙',
        'txt': '📝', 'md': '📝', 'markdown': '📝',
        'rtf': '📄', 'odt': '📄',
        // 代码
        'js': '💻', 'ts': '💻', 'jsx': '💻', 'tsx': '💻',
        'py': '🐍', 'java': '☕', 'go': '🔵',
        'html': '🌐', 'css': '🎨', 'json': '📋',
        'xml': '📋', 'yaml': '📋', 'yml': '📋',
        // 压缩包
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
        // 音频
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵', 'ogg': '🎵',
        // 视频
        'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬', 'webm': '🎬',
        // 思维导图/设计
        'xmind': '🧠', 'mind': '🧠',
        'sketch': '🎨', 'fig': '🎨', 'psd': '🎨', 'ai': '🎨',
        // 其他
        'exe': '⚙️', 'dmg': '🍎', 'app': '📱', 'apk': '📱',
        'iso': '💿', 'img': '💿',
        'csv': '📊', 'tsv': '📊',
        'log': '📋'
    };
    return iconMap[ext] || '📄';
}

function isLocalAccess() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
}

function formatFileSize(bytes) {
    if (bytes === 0 || bytes === undefined) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function renderFileCard({ label, token, size }) {
    const ext = label.split('.').pop().toLowerCase();
    const icon = getFileIcon(ext);
    const fileUrl = `/uploads/${token}`;
    const isLocal = isLocalAccess();

    // 本地访问：直接打开（使用 file:// 协议或本地路径）
    // 远程访问：触发下载
    const href = isLocal ? fileUrl : `${fileUrl}?download=1`;
    const downloadAttr = isLocal ? '' : `download="${escapeHtml(label)}"`;
    const fileSize = formatFileSize(size);

    // 图片类型特殊处理：直接显示图片，无需文字
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
    if (isImage) {
        return `
            <a href="${href}" ${downloadAttr} class="image-preview" ${isLocal ? 'target="_blank"' : ''}>
                <img src="${fileUrl}" alt="${escapeHtml(label)}" loading="lazy">
            </a>
        `;
    }

    // 普通文件：横向卡片，左侧文字信息，右侧图标
    return `
        <a href="${href}" ${downloadAttr} class="file-card-horizontal" data-ext="${ext}" ${isLocal ? 'target="_blank"' : ''}>
            <div class="file-card-info">
                <div class="file-card-name">${escapeHtml(label)}</div>
                <div class="file-card-meta">
                    <span class="file-card-size">${fileSize}</span>
                    <span class="file-card-ext">${ext.toUpperCase()}</span>
                </div>
            </div>
            <div class="file-card-icon-box">
                <span class="file-card-icon-emoji">${icon}</span>
            </div>
        </a>
    `;
}

export function renderMessages(messages, container) {
    if (!container) return;

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    messages.forEach(msg => {
        tempDiv.innerHTML = renderMessage(msg);
        fragment.appendChild(tempDiv.firstElementChild.cloneNode(true));
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

export default { renderMessage, renderMessages };
