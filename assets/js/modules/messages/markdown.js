/**
 * Markdown Parser - Markdown 解析器
 * 支持代码块、链接、图片、粗体、斜体等
 */

import { escapeHtml, sanitizeLink, extractUploadsToken, stripFileEmojiLabel, recoverNameFromToken } from '../../utils/sanitize.js';

function getFileIcon(ext) {
    const iconMap = {
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️',
        'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📊', 'xlsx': '📊', 'ppt': '📙', 'pptx': '📙',
        'txt': '📝', 'md': '📝', 'markdown': '📝', 'rtf': '📄', 'odt': '📄',
        'js': '💻', 'ts': '💻', 'jsx': '💻', 'tsx': '💻', 'py': '🐍', 'java': '☕', 'go': '🔵',
        'html': '🌐', 'css': '🎨', 'json': '📋', 'xml': '📋', 'yaml': '📋', 'yml': '📋',
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵', 'ogg': '🎵',
        'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬', 'webm': '🎬',
        'xmind': '🧠', 'mind': '🧠', 'sketch': '🎨', 'fig': '🎨', 'psd': '🎨', 'ai': '🎨',
        'exe': '⚙️', 'dmg': '🍎', 'app': '📱', 'apk': '📱', 'iso': '💿', 'img': '💿',
        'csv': '📊', 'tsv': '📊', 'log': '📋'
    };
    return iconMap[ext] || '📄';
}

function isLocalAccess() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
}

export function renderMarkdown(md) {
    const src = String(md ?? '');
    const blocks = src.split('```');
    let html = '';

    for (let i = 0; i < blocks.length; i++) {
        const part = blocks[i];
        
        if (i % 2 === 1) {
            const firstNl = part.indexOf('\n');
            let lang = '';
            let code = part;
            if (firstNl !== -1) {
                lang = part.slice(0, firstNl).trim();
                code = part.slice(firstNl + 1);
            }
            html += `<pre class="code-block" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(code)}</code></pre>`;
            continue;
        }

        let p = escapeHtml(part);

        p = p.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, href) => {
            const safe = sanitizeLink(href);
            if (!safe) return m;
            return `<img alt="${escapeHtml(alt)}" src="${escapeHtml(safe)}" loading="lazy" />`;
        });

        p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => {
            const safe = sanitizeLink(href);
            if (!safe) return m;
            const token = extractUploadsToken(safe);
            if (token) return renderFileCard({ label: text, token });
            return `<a href="${escapeHtml(safe)}" target="_blank">${text}</a>`;
        });

        p = p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        p = p.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        p = p.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        p = p.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        p = p.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        p = p.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        p = p.replace(/^- (.+)$/gm, '<li>$1</li>');
        p = p.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        p = p.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        
        p = p.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        
        p = p.replace(/\n/g, '<br>');

        try {
            p = p.replace(/(?<!["'=])(https?:\/\/[^\s<]+)/g, (m) => {
                const safe = sanitizeLink(m);
                if (!safe) return m;
                const token = extractUploadsToken(safe);
                if (token) return renderFileCard({ label: m, token });
                return `<a href="${escapeHtml(safe)}" target="_blank">${escapeHtml(m)}</a>`;
            });
        } catch {}

        html += p;
    }

    return html;
}

export function renderToolCard(toolName, params, status, result) {
    const statusClass = status === 'running' ? 'running' : (status === 'error' ? 'error' : 'success');
    const statusText = status === 'running' ? '执行中' : (status === 'error' ? '失败' : '完成');
    const icon = status === 'running' ? '🔧' : (status === 'error' ? '❌' : '✅');
    const spinner = status === 'running' ? '<span class="tool-spinner"></span>' : '';
    
    const paramsJson = params ? escapeHtml(typeof params === 'string' ? params : JSON.stringify(params, null, 2)) : '';
    const resultJson = result ? escapeHtml(typeof result === 'string' ? result : JSON.stringify(result, null, 2)) : '';
    
    return `
        <div class="tool-card ${statusClass}">
            <div class="tool-card-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="tool-card-title">
                    <span class="tool-icon">${icon}</span>
                    <span class="tool-name">${escapeHtml(toolName)}</span>
                    ${spinner}
                </div>
                <div class="tool-card-status">
                    <span class="tool-status-badge">${statusText}</span>
                    <span class="tool-expand-icon">▼</span>
                </div>
            </div>
            <div class="tool-card-body">
                ${params ? `
                    <div class="tool-section">
                        <div class="tool-section-label">参数</div>
                        <pre class="tool-code">${paramsJson}</pre>
                    </div>
                ` : ''}
                ${result ? `
                    <div class="tool-section">
                        <div class="tool-section-label">结果</div>
                        <div class="tool-result">${resultJson}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

export function renderThinkingBlock(thinking, isExpanded = false) {
    const truncated = thinking.length > 200 ? thinking.substring(0, 200) + '...' : thinking;
    const needsExpand = thinking.length > 200;
    
    return `
        <div class="thinking-block ${isExpanded ? 'expanded' : ''}">
            <div class="thinking-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="thinking-title">
                    <span class="thinking-icon">💭</span>
                    <span class="thinking-label">思考过程</span>
                    <span class="thinking-duration">~${Math.ceil(thinking.length / 100)}s</span>
                </div>
                <span class="thinking-expand-icon">▼</span>
            </div>
            <div class="thinking-content">
                <div class="thinking-text">${escapeHtml(thinking)}</div>
            </div>
        </div>
    `;
}

export function renderMessageBlocks(content) {
    if (!Array.isArray(content)) {
        return { thinking: null, tools: [], text: '' };
    }
    
    let thinking = null;
    const tools = [];
    let text = '';
    
    for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        
        if (block.type === 'thinking' && typeof block.thinking === 'string') {
            thinking = block.thinking;
        }
        
        if (block.type === 'tool_use') {
            tools.push({
                type: 'tool_use',
                name: block.name || 'unknown',
                params: block.input || {},
                status: 'running'
            });
        }
        
        if (block.type === 'tool_result') {
            tools.push({
                type: 'tool_result',
                result: block.content || '',
                status: block.is_error ? 'error' : 'success'
            });
        }
        
        if (block.type === 'text') {
            text += block.text || '';
        }
    }
    
    return { thinking, tools, text };
}

export function renderFileCard({ label, token }) {
    let decodedToken = '';
    try {
        decodedToken = decodeURIComponent(String(token || ''));
    } catch {
        decodedToken = String(token || '');
    }
    
    const recovered = recoverNameFromToken(decodedToken);
    const labelClean = stripFileEmojiLabel(label);
    const safeLabel = labelClean && labelClean !== '文件' ? labelClean : (recovered || '文件');

    const ext = safeLabel.split('.').pop().toLowerCase();
    const icon = getFileIcon(ext);
    const fileUrl = `/uploads/${token}`;
    const isLocal = isLocalAccess();

    // 本地访问：直接打开，远程访问：触发下载
    const href = isLocal ? fileUrl : `${fileUrl}?download=1`;
    const downloadAttr = isLocal ? '' : `download="${escapeHtml(safeLabel)}"`;

    // 图片类型特殊处理：直接显示图片，无需文字
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
    if (isImage) {
        return `
            <a href="${href}" ${downloadAttr} class="image-preview" ${isLocal ? 'target="_blank"' : ''}>
                <img src="${fileUrl}" alt="${escapeHtml(safeLabel)}" loading="lazy">
            </a>
        `;
    }

    // 普通文件：横向卡片，左侧文字信息，右侧图标
    return `
        <a href="${href}" ${downloadAttr} class="file-card-horizontal" data-ext="${ext}" ${isLocal ? 'target="_blank"' : ''}>
            <div class="file-card-info">
                <div class="file-card-name">${escapeHtml(safeLabel)}</div>
                <div class="file-card-meta">
                    <span class="file-card-ext">${ext.toUpperCase()}</span>
                </div>
            </div>
            <div class="file-card-icon-box">
                <span class="file-card-icon-emoji">${icon}</span>
            </div>
        </a>
    `;
}

export default { renderMarkdown, renderFileCard, renderToolCard };
