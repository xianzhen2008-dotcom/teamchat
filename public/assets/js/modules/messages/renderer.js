/**
 * Message Renderer - 消息渲染器
 * 渲染用户和 Agent 消息
 */

import { renderMarkdown } from './markdown.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { formatTimeWithDate } from '../../utils/format.js';
import { avatarService } from '../../services/avatar.js';
import { stateManager } from '../../core/state.js';
import { getCachedMetadata } from './content-extractor.js';
import { getCompactSessionId } from '../../utils/message-meta.js';
import { findAgentByName, getAgentDisplayName } from '../../utils/agent-meta.js';

const CHANNEL_LABELS = {
    teamchat: 'TeamChat',
    webchat: 'TeamChat',
    tui: 'TUI',
    qqbot: 'QQBot',
    qq: 'QQBot',
    wecom: 'WeCom',
    weixin: 'Weixin',
    wechat: 'Weixin',
    feishu: 'Feishu',
    lark: 'Feishu',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
    email: 'Mail',
    system: 'System'
};

export function renderMessage(msg) {
    const agents = stateManager.getState('agents') || [];
    const displaySender = getAgentDisplayName(msg.sender, msg.sender);
    const agent = findAgentByName(agents, msg.sender) || { img: '小龙虾.png', color: '#00d4ff' };
    const avatarUrl = avatarService.getUrl(agent.img);
    const userAvatarUrl = avatarService.getUrl('user.svg');
    const metadata = getCachedMetadata(msg);
    if (metadata.hidden) return '';

    const isSystem = Boolean(msg.isSystem || msg.type === 'system' || metadata.kind === 'control');
    const isUser = !isSystem && msg.isUser;
    const msgClass = isSystem ? 'system' : (isUser ? 'user' : 'agent');
    const timestamp = msg.timestamp || Date.now();
    const msgId = msg.id || timestamp;
    const sessionIds = metadata.sessionIds || [];
    const primarySessionId = metadata.primarySessionId || null;
    const messageRunId = metadata.runId || msg.runId || null;

    let contentHtml = '';
    let actionLogHtml = '';
    
    if (msg.image) {
        const clickHandler = `onclick="window.open('${msg.image}', '_blank')"`;
        contentHtml = `<span class="msg-image-box" ${clickHandler}><img src="${msg.image}" alt="图片" loading="lazy"></span>`;
    } else if (msg.file) {
        contentHtml = renderFileCard({ label: msg.file.name, token: extractToken(msg.file.url), size: msg.file.size });
    } else if (isSystem) {
        contentHtml = renderSystemNotice(metadata.text || '');
    } else {
        actionLogHtml = renderActionLogCard(metadata.actionLogs || []);
        contentHtml = renderMarkdown(metadata.text || '');
    }

    const avatarColor = isUser ? '#3b82f6' : (agent.color || '#00d4ff');
    const isBusy = !isUser && !isSystem && stateManager.getState('agentBusyMap')?.get(agent.agentId);
    
    const status = msg.status || (isUser ? 'sent' : 'received');
    const statusIcon = getStatusIcon(status);
    const statusClass = getStatusClass(status);

    const sessionTagHtml = renderSessionTags(sessionIds);
    const channelTagHtml = renderChannelTag(metadata.channel);
    const modelTagHtml = renderModelTag(metadata.model || msg.model || msg.modelInfo?.modelId || msg.metadata?.modelInfo?.modelId);
    const targetAgentName = !isUser && !isSystem
        ? String(msg.metadata?.targetAgentName || '').trim()
        : '';
    const senderLabel = isSystem
        ? '系统'
        : (isUser ? '我' : (targetAgentName && targetAgentName !== displaySender ? `${displaySender} @ ${targetAgentName}` : displaySender));
    const headerMetaClass = isUser ? 'msg-meta msg-meta-user' : 'msg-meta';
    const identityClass = isSystem ? 'msg-identity system' : (isUser ? 'msg-identity user' : 'msg-identity agent');
    const avatarId = isSystem ? 'system' : (agent.agentId || agent.name || displaySender);
    const avatarImg = isSystem ? '' : (isUser ? userAvatarUrl : avatarUrl);
    const avatarData = [
        `data-agent-id="${escapeHtml(avatarId)}"`,
        primarySessionId ? `data-session-id="${escapeHtml(primarySessionId)}"` : '',
        metadata.channel ? `data-channel="${escapeHtml(metadata.channel)}"` : '',
        (msg.source || msg.metadata?.source || metadata.channel)
            ? `data-source="${escapeHtml(msg.source || msg.metadata?.source || metadata.channel)}"`
            : '',
        (!isUser && !isSystem) ? `data-sender="${escapeHtml(displaySender)}"` : ''
    ].filter(Boolean).join(' ');
    const avatarStyle = avatarImg ? `style="background-image: url('${avatarImg}'); background-size: cover;"` : '';
    const avatarInner = isSystem ? '<span class="msg-avatar-glyph">⌘</span>' : '';

    return `
        <div class="msg ${msgClass}" data-timestamp="${timestamp}" data-msg-id="${msgId}" data-msg-kind="${escapeHtml(metadata.kind || 'message')}" ${messageRunId ? `data-run-id="${messageRunId}"` : ''} ${primarySessionId ? `data-session-id="${primarySessionId}"` : ''} ${sessionIds.length ? `data-session-ids="${escapeHtml(sessionIds.join(','))}"` : ''} ${metadata.channel ? `data-channel="${escapeHtml(metadata.channel)}"` : ''}>
            <div class="msg-content-wrapper">
                <div class="msg-header">
                    <div class="${identityClass}">
                        <div class="msg-avatar-wrap ${isBusy ? 'busy' : ''}">
                            <div class="msg-avatar ${isUser ? 'user-avatar' : (isSystem ? 'msg-system-avatar' : 'msg-agent-avatar')}" ${avatarData} ${avatarStyle}>${avatarInner}</div>
                        </div>
                        <div class="${headerMetaClass}">
                            <span class="msg-sender">${escapeHtml(senderLabel)}</span>
                            <span class="msg-tags-wrapper">
                                ${sessionTagHtml}
                                ${channelTagHtml}
                                ${modelTagHtml}
                            </span>
                        </div>
                    </div>
                </div>
                ${actionLogHtml}
                <div class="msg-content" data-text="${escapeHtml(metadata.text || '')}">${contentHtml}</div>
                <div class="msg-footer">
                    <div class="msg-time">${formatTimeWithDate(new Date(timestamp))}</div>
                    <div class="msg-status ${statusClass}" data-status="${status}">${statusIcon} <span class="status-text">${getStatusText(status)}</span></div>
                    <div class="msg-actions">
                        <button class="msg-action-btn" data-action="reply" title="引用">💬</button>
                        <button class="msg-action-btn" data-action="copy" title="复制">📋</button>
                        ${isUser ? `<button class="msg-action-btn" data-action="recall" title="撤回">🗑️</button>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderSystemNotice(text = '') {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return '';

    const lines = normalized
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const rawTitle = lines.shift() || normalized;
    const title = stripMarkdownDecorations(rawTitle);
    const body = lines.join('\n').trim();

    return `
        <div class="system-note">
            <div class="system-note-title">${escapeHtml(title || '系统通知')}</div>
            ${body ? `<div class="system-note-body">${renderMarkdown(body)}</div>` : ''}
        </div>
    `;
}

function stripMarkdownDecorations(value = '') {
    return String(value || '')
        .replace(/^#{1,6}\s*/g, '')
        .replace(/^\*+\s*/g, '')
        .replace(/\s*\*+$/g, '')
        .replace(/^[-*]\s*/g, '')
        .trim();
}

function renderModelTag(model) {
    if (!model) return '';
    return `<span class="msg-model-tag" title="模型: ${escapeHtml(model)}">${escapeHtml(model)}</span>`;
}

function renderSessionTags(sessionIds = []) {
    const uniqueIds = Array.from(new Set((sessionIds || []).map((sessionId) => String(sessionId || '').trim()).filter(Boolean)));
    if (!uniqueIds.length) return '';
    return uniqueIds.slice(0, 1).map((sessionId) => {
        const shortId = getCompactSessionId(sessionId);
        return `<span class="session-tag clickable" title="点击回复此会话 #${escapeHtml(shortId)}" data-session-id="${escapeHtml(sessionId)}">#${escapeHtml(shortId)}</span>`;
    }).join('');
}

function renderChannelTag(channel) {
    const normalized = normalizeKnownChannel(channel);
    if (!normalized) return '';
    const label = getChannelLabel(normalized);
    return `<span class="msg-channel-tag" title="通道: ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

function getChannelLabel(channel) {
    const normalized = String(channel || '').toLowerCase();
    return CHANNEL_LABELS[normalized] || channel;
}

function normalizeKnownChannel(channel) {
    const normalized = String(channel || '').trim().toLowerCase();
    if (!normalized) return null;
    return CHANNEL_LABELS[normalized] ? normalized : null;
}

function getDefaultActionLogExpanded() {
    try {
        return localStorage.getItem('team_chat_action_log_expanded_default') === 'true';
    } catch {
        return false;
    }
}

function renderActionLogCard(actionLogs = []) {
    if (!Array.isArray(actionLogs) || actionLogs.length === 0) return '';

    const expandedClass = getDefaultActionLogExpanded() ? ' expanded' : '';
    const latestLog = actionLogs[actionLogs.length - 1] || null;
    const latestMeta = getActionLogMeta(latestLog);
    const latestPreview = latestLog
        ? String(latestLog.content || latestLog.title || latestMeta.label || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140)
        : '';
    const content = actionLogs.map((log) => {
        const meta = getActionLogMeta(log);

        return `
            <div class="action-log-item">
                <span class="action-log-icon">${meta.icon}</span>
                <div class="action-log-item-main">
                    <div class="action-log-name">${escapeHtml(log.title || '行动记录')}</div>
                    ${log.content ? `<div class="action-log-result">${escapeHtml(String(log.content).slice(0, 500))}</div>` : ''}
                </div>
                <span class="action-log-status ${escapeHtml(log.status || 'info')}">${escapeHtml(meta.statusText)}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="action-log-card${expandedClass}">
            <div class="action-log-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="action-log-header-main">
                    <div class="action-log-title">
                        <span class="action-log-icon">📋</span>
                        <span class="action-log-label">行动日志</span>
                        <span class="action-log-count">${actionLogs.length} 个步骤</span>
                    </div>
                    ${latestLog ? `
                        <div class="action-log-preview">
                            <span class="action-log-preview-status ${escapeHtml(latestLog.status || 'info')}">${escapeHtml(latestMeta.statusText)}</span>
                            <span class="action-log-preview-text">${escapeHtml(latestPreview || latestMeta.label)}</span>
                        </div>
                    ` : ''}
                </div>
                <span class="action-log-expand-icon">▼</span>
            </div>
            <div class="action-log-content">${content}</div>
        </div>
    `;
}

function getActionLogMeta(log = {}) {
    const icon = log.type === 'thinking'
        ? '💭'
        : (log.type === 'tool_result' ? '✅' : (log.type === 'tool_use' ? '🔧' : '📌'));
    const statusText = log.status === 'running'
        ? '进行中'
        : (log.status === 'error' ? '失败' : (log.status === 'success' ? '完成' : '记录'));
    const label = log.title || '行动记录';
    return { icon, statusText, label };
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
    // 返回 uploads/ 之后的完整路径，不只是第一部分
    return url.slice('/uploads/'.length) || '';
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

function buildLocalOpenAttrs(filePath, appName = 'Finder', shortcut = 'Cmd+Shift+G') {
    return `data-file-path="${escapeHtml(filePath || '')}" data-open-app="${escapeHtml(appName)}" data-open-shortcut="${escapeHtml(shortcut)}"`;
}

function formatFileSize(bytes) {
    if (bytes === 0 || bytes === undefined) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function renderFileCard({ label, token, size }) {
    let decodedToken = '';
    try {
        decodedToken = decodeURIComponent(String(token || ''));
    } catch {
        decodedToken = String(token || '');
    }
    
    // 处理 label，移除可能的 📁 前缀
    let safeLabel = label ? String(label).replace(/^📁\s*/g, '').trim() : '文件';
    if (!safeLabel || safeLabel === '文件') {
        // 尝试从 token 恢复文件名
        const match = decodedToken.match(/^[\d\-TZ]+-[0-9a-f]{8}-(.+)$/);
        if (match) {
            safeLabel = match[1];
        }
    }
    
    const ext = safeLabel.split('.').pop().toLowerCase();
    const icon = getFileIcon(ext);
    const isLocal = isLocalAccess();
    
    const fileUrl = `/uploads/${token}`;
    const localFilePath = decodedToken ? `/uploads/${decodedToken}` : '';

    const fileSize = formatFileSize(size);

    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
    if (isImage) {
        if (isLocal) {
            return `
                <span class="msg-image-box" data-ext="${ext}" ${buildLocalOpenAttrs(localFilePath)}>
                    <img src="${fileUrl}" alt="${escapeHtml(safeLabel)}" loading="lazy">
                </span>
            `;
        }
        return `
            <a href="${fileUrl}?download=1" download="${escapeHtml(safeLabel)}" class="msg-image-box">
                <img src="${fileUrl}" alt="${escapeHtml(safeLabel)}" loading="lazy">
            </a>
        `;
    }

    if (isLocal) {
        return `
            <span class="file-card-horizontal" data-ext="${ext}" ${buildLocalOpenAttrs(localFilePath)} style="cursor: pointer;">
                <div class="file-card-info">
                    <div class="file-card-name">${escapeHtml(safeLabel)}</div>
                    <div class="file-card-meta">
                        <span class="file-card-ext">${ext.toUpperCase()}</span>
                        ${fileSize ? `<span class="file-card-size">${fileSize}</span>` : ''}
                    </div>
                </div>
                <div class="file-card-icon-box">
                    <span class="file-card-icon-emoji">${icon}</span>
                </div>
            </span>
        `;
    }

    return `
        <a href="${fileUrl}?download=1" download="${escapeHtml(safeLabel)}" class="file-card-horizontal" data-ext="${ext}">
            <div class="file-card-info">
                <div class="file-card-name">${escapeHtml(safeLabel)}</div>
                <div class="file-card-meta">
                    <span class="file-card-ext">${ext.toUpperCase()}</span>
                    ${fileSize ? `<span class="file-card-size">${fileSize}</span>` : ''}
                </div>
            </div>
            <div class="file-card-icon-box">
                <span class="file-card-icon-emoji">${icon}</span>
            </div>
        </a>
    `;
}

export function renderMessages(messages, container) {
    if (!container) {
        console.warn('[Renderer] No container provided');
        return;
    }

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    messages.forEach((msg) => {
        tempDiv.innerHTML = renderMessage(msg);
        const el = tempDiv.firstElementChild;
        if (el) {
            fragment.appendChild(el.cloneNode(true));
        }
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

export default { renderMessage, renderMessages };
