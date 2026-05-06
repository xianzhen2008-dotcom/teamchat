/**
 * Markdown Parser - Markdown 解析器
 * 支持代码块、链接、图片、粗体、斜体等
 */

import { escapeHtml, sanitizeLink, extractUploadsToken, stripFileEmojiLabel, recoverNameFromToken } from '../../utils/sanitize.js';

const TEAMCHAT_ROOT = '';

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

function formatFileSize(bytes) {
    if (bytes === 0 || bytes === undefined || bytes === null) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function getLocalOpenMeta() {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    return {
        appName: isMac ? 'Finder' : '文件资源管理器',
        shortcut: isMac ? 'Cmd+Shift+G' : 'Ctrl+L'
    };
}

function buildLocalOpenAttrs(filePath, appName, shortcut) {
    return `data-file-path="${escapeHtml(filePath || '')}" data-open-app="${escapeHtml(appName)}" data-open-shortcut="${escapeHtml(shortcut)}"`;
}

function renderLocalPathLink(filePath, label, title = '点击定位文件') {
    const { appName, shortcut } = getLocalOpenMeta();
    return `<a href="#" class="file-link" ${buildLocalOpenAttrs(filePath, appName, shortcut)} title="${escapeHtml(title)}">📎 ${escapeHtml(label)}</a>`;
}

function splitTableRow(line) {
    let value = String(line || '').trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
}

function isTableSeparatorLine(line) {
    const cells = splitTableRow(line);
    return cells.length >= 2 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')));
}

function getTableAlignment(cell) {
    const compact = String(cell || '').replace(/\s+/g, '');
    if (compact.startsWith(':') && compact.endsWith(':')) return 'center';
    if (compact.endsWith(':')) return 'right';
    if (compact.startsWith(':')) return 'left';
    return '';
}

function renderTableBlock(lines, protect) {
    if (!Array.isArray(lines) || lines.length < 2) {
        return lines.join('\n');
    }

    const headerCells = splitTableRow(lines[0]);
    const alignments = splitTableRow(lines[1]).map(getTableAlignment);
    const bodyRows = lines.slice(2).filter((line) => line.trim()).map(splitTableRow);
    const columnCount = Math.max(
        headerCells.length,
        alignments.length,
        ...bodyRows.map((row) => row.length)
    );

    const normalizeRow = (row) => Array.from({ length: columnCount }, (_, index) => row[index] || '&nbsp;');
    const normalizedHeader = normalizeRow(headerCells);
    const normalizedBody = bodyRows.map(normalizeRow);

    const renderCell = (tag, content, index) => {
        const align = alignments[index] ? ` style="text-align:${alignments[index]}"` : '';
        return `<${tag}${align}>${content || '&nbsp;'}</${tag}>`;
    };

    const headHtml = `<thead><tr>${normalizedHeader.map((cell, index) => renderCell('th', cell, index)).join('')}</tr></thead>`;
    const bodyHtml = normalizedBody.length
        ? `<tbody>${normalizedBody.map((row) => `<tr>${row.map((cell, index) => renderCell('td', cell, index)).join('')}</tr>`).join('')}</tbody>`
        : '';

    return protect(`<div class="table-scroll"><table class="markdown-table">${headHtml}${bodyHtml}</table></div>`);
}

function replaceMarkdownTables(text, protect) {
    const lines = String(text || '').split('\n');
    const output = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const nextLine = lines[index + 1];
        if (line.includes('|') && nextLine && isTableSeparatorLine(nextLine)) {
            const block = [line, nextLine];
            let cursor = index + 2;
            while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) {
                block.push(lines[cursor]);
                cursor += 1;
            }
            output.push(renderTableBlock(block, protect));
            index = cursor - 1;
            continue;
        }
        output.push(line);
    }

    return output.join('\n');
}

// 存储文件信息映射，用于 renderMarkdown 中获取文件大小
let fileInfoMap = new Map();

export function setFileInfoMap(fileMap) {
    fileInfoMap = fileMap || new Map();
}

export function renderMarkdown(md, fileMap) {
    // 如果传入了 fileMap，使用它；否则使用全局的 fileInfoMap
    const currentFileMap = fileMap || fileInfoMap;

    const src = String(md ?? '');
    
    // 调试：检查是否包含 py 文件路径
    if (src.includes('.py')) {
        console.log('[Markdown] Input contains .py:', src.substring(0, 500));
    }
    
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
        
        // 使用占位符保护已处理的链接，防止被后续正则重复处理
        const protectedBlocks = [];
        const protect = (content) => {
            const id = protectedBlocks.length;
            protectedBlocks.push(content);
            return `___PROTECTED_${id}___`;
        };

        // 处理反引号包裹的文件路径（行内代码中的文件）
        // 匹配: `filename.py`, `/path/to/file.py`, `~/project/file.md`
        p = p.replace(/`([^`]+\.[a-zA-Z0-9\u4e00-\u9fa5_-]{1,20})`/gu, (match, filePath) => {
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            const extMatch = fileName.match(/\.([a-zA-Z0-9\u4e00-\u9fa5_-]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : '';
            const commonExts = ['doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json', 'xml', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'mov', 'zip', 'rar', '7z', 'tar', 'gz', 'js', 'ts', 'py', 'java', 'go', 'html', 'css', 'sql', 'log', 'yml', 'yaml'];
            if (ext && commonExts.includes(ext)) {
                // Open-source build never expands local machine paths.
                let fullPath = filePath;
                if (!filePath.startsWith('/') && !filePath.startsWith('~/')) {
                    fullPath = filePath;
                }
                return protect(`<code class="file-code">${renderLocalPathLink(fullPath, fileName, 'Copy file path')}</code>`);
            }
            return match;
        });

        p = p.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, href) => {
            const safe = sanitizeLink(href);
            if (!safe) return m;
            // 使用新的 msg-image-box 类，避免 CSS 冲突
            return protect(`<span class="msg-image-box"><img alt="${escapeHtml(alt)}" src="${escapeHtml(safe)}" loading="lazy" /></span>`);
        });

        p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => {
            const safe = sanitizeLink(href);
            if (!safe) return m;
            const token = extractUploadsToken(safe);
            if (token) {
                const fileInfo = currentFileMap.get(token);
                return protect(renderFileCard({ label: text, token, size: fileInfo?.size }));
            }
            return protect(`<a href="${escapeHtml(safe)}" target="_blank">${text}</a>`);
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

        p = p.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        p = replaceMarkdownTables(p, protect);

        p = p.replace(/\n/g, '<br>');

        try {
            // 处理 http/https 链接 - 但跳过已保护的链接中的 URL
            p = p.replace(/(?<!["'=])(https?:\/\/[^\s<]+)(?!.*?___PROTECTED_)/g, (m) => {
                // 检查是否已经在保护块中
                if (m.includes('___PROTECTED_')) return m;
                const safe = sanitizeLink(m);
                if (!safe) return m;
                const token = extractUploadsToken(safe);
                if (token) {
                    const fileInfo = currentFileMap.get(token);
                    return protect(renderFileCard({ label: m, token, size: fileInfo?.size }));
                }
                return protect(`<a href="${escapeHtml(safe)}" target="_blank">${escapeHtml(m)}</a>`);
            });
        } catch {}

        try {
            // 处理 /uploads/ 本地文件路径 - 纯文本路径用链接，不是卡片
            p = p.replace(/(?<!["'=])(\/uploads\/[^\s<]+)/g, (m) => {
                // 跳过已保护的块
                if (m.includes('___PROTECTED_')) return m;
                const token = extractUploadsToken(m);
                if (token) {
                    const isLocal = isLocalAccess();
                    const fileInfo = currentFileMap.get(token);
                    const fileName = fileInfo?.name || token.split('/').pop() || m;
                    return protect(`<a href="/uploads/${token}?download=1" download class="file-link">📎 ${escapeHtml(fileName)}</a>`);
                }
                return protect(`<a href="${escapeHtml(m)}" target="_blank">${escapeHtml(m)}</a>`);
            });
        } catch {}

        try {
            // 处理任意本地文件路径 (Unix/Mac/Windows) - 纯文本路径用链接，不是卡片
            // 匹配: /home/xxx, ~/.xxx, C:\\xxx, \\\\server\\xxx, ./xxx, ../xxx
            // 支持中文、数字、下划线、连字符等
            // 简化正则：匹配以 / 或 ~ 开头的路径，包含文件名和扩展名
            // 首先处理包含 ~/ 的错误拼接路径（如 /Users/.../~/...）
            p = p.replace(/(\/[^\s<>"']*\/~\/[^\s<>"']+)/gu, (m) => {
                if (m.includes('___PROTECTED_')) return m;
                const tildeIndex = m.indexOf('~/');
                if (tildeIndex !== -1) {
                    const afterTilde = m.slice(tildeIndex + 1);
                    const fullPath = afterTilde;
                    const fileName = fullPath.split(/[\\/]/).pop() || fullPath;
                    const extMatch = fileName.match(/\.([a-zA-Z0-9\u4e00-\u9fa5_-]+)$/);
                    const ext = extMatch ? extMatch[1].toLowerCase() : '';
                    const commonExts = ['doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json', 'xml', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'mov', 'zip', 'rar', '7z', 'tar', 'gz', 'js', 'ts', 'py', 'java', 'go', 'html', 'css', 'sql', 'log', 'yml', 'yaml'];
                    if (ext && commonExts.includes(ext)) {
                        const isMac = navigator.platform.toLowerCase().includes('mac');
                        const shortcut = isMac ? 'Cmd+Shift+G' : 'Ctrl+L';
                        const appName = isMac ? 'Finder' : '文件资源管理器';
                        const clickHandler = `window.handleFileLinkClick && window.handleFileLinkClick('${escapeHtml(fullPath)}', '${appName}', '${shortcut}')`;
                        return protect(`<a href="#" onclick="${clickHandler}; return false;" class="file-link" title="点击复制路径，然后在${appName}中按 ${shortcut} 粘贴打开">📎 ${escapeHtml(fileName)}</a>`);
                    }
                }
                return m;
            });

            // 处理项目内相对路径（例如 assets/js/main.js、brain/daily.html）
            p = p.replace(/(?<=[\s>]|^)((?:\.\.?\/)?(?:[\w.\-\u4e00-\u9fa5]+\/)+[\w.\-\u4e00-\u9fa5]+\.[a-zA-Z0-9\u4e00-\u9fa5_-]{1,20})(?=[\s<]|$)/gu, (m) => {
                if (m.includes('___PROTECTED_') || /^https?:\/\//i.test(m) || m.startsWith('/')) return m;
                const fileName = m.split(/[\\/]/).pop() || m;
                return protect(renderLocalPathLink(m, fileName, `Copy ${m}`));
            });
            
            // 处理以 / 开头的绝对路径
            p = p.replace(/(\/[^\s<>"']+\.[a-zA-Z0-9\u4e00-\u9fa5_-]{1,20})/gu, (m) => {
                if (m.includes('___PROTECTED_')) return m;
                if (m.includes('/~/')) return m;
                const fileName = m.split(/[\\/]/).pop() || m;
                const extMatch = fileName.match(/\.([a-zA-Z0-9\u4e00-\u9fa5_-]+)$/);
                const ext = extMatch ? extMatch[1].toLowerCase() : '';
                const commonExts = ['doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json', 'xml', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'mov', 'zip', 'rar', '7z', 'tar', 'gz', 'js', 'ts', 'py', 'java', 'go', 'html', 'css', 'sql', 'log', 'yml', 'yaml'];
                if (ext && commonExts.includes(ext)) {
                    return protect(renderLocalPathLink(m, fileName, `点击定位 ${fileName}`));
                }
                return m;
            });
        } catch {}

        try {
            // 处理独立的文件名（带扩展名，看起来像文件）- 纯文本用链接，不是卡片
            p = p.replace(/(?<=[\s>]|^)([\w\-_.]+\.[a-zA-Z0-9]{1,10})(?=[\s<]|$)/g, (m) => {
                // 跳过已保护的块
                if (m.includes('___PROTECTED_')) return m;
                const ext = m.split('.').pop()?.toLowerCase() || '';
                const commonExts = ['doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json', 'xml', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'mov', 'zip', 'rar', '7z', 'tar', 'gz', 'js', 'ts', 'py', 'java', 'go', 'html', 'css', 'sql', 'log', 'yml', 'yaml'];
                if (ext && commonExts.includes(ext)) {
                    // 纯文本中的文件名用文本链接，不是卡片
                    return protect(`<a href="#" onclick="event.preventDefault(); window.eventBus && window.eventBus.emit('toast:show', { message: '请使用文件上传功能发送文件', type: 'info' });" class="file-link">📎 ${escapeHtml(m)}</a>`);
                }
                return m;
            });
        } catch {}
        
        // 恢复保护的块
        protectedBlocks.forEach((content, id) => {
            p = p.replace(`___PROTECTED_${id}___`, content);
        });

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

export function renderFileCard({ label, token, size }) {
    console.log("FILE_CARD_LAYOUT_V3", { label, token, size });

    let decodedToken = '';
    try {
        decodedToken = decodeURIComponent(String(token || ''));
    } catch {
        decodedToken = String(token || '');
    }

    const recovered = recoverNameFromToken(decodedToken);
    const labelClean = stripFileEmojiLabel(label);

    // 判断 label 是否是有效的文件名（不是链接、不是"文件"等）
    const isValidLabel = labelClean &&
                         labelClean !== '文件' &&
                         !labelClean.startsWith('http') &&
                         !labelClean.startsWith('/') &&
                         labelClean.includes('.');

    // 优先使用有效的 label，否则使用从 token 恢复的文件名
    const safeLabel = isValidLabel ? labelClean : (recovered || labelClean || '文件');

    const ext = safeLabel.split('.').pop().toLowerCase();
    const icon = getFileIcon(ext);

    // 检测是否在本地访问（127.0.0.1 或 localhost）
    const isLocal = isLocalAccess();
    console.log("[Markdown] isLocal:", isLocal, "hostname:", window.location.hostname);

    // 构建文件 URL
    const fileUrl = token ? `/uploads/${token}` : '';
    const localFilePath = decodedToken ? `/uploads/${decodedToken}` : '';
    const fileSize = formatFileSize(size);

    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
    
    // 本地环境：使用 span + 点击复制本地文件路径
    // 远程环境：使用 a 标签下载
    if (isLocal) {
        if (isImage) {
            return `
                <span class="msg-image-box" data-ext="${ext}" ${buildLocalOpenAttrs(localFilePath, 'Finder', 'Cmd+Shift+G')}>
                    <img src="${fileUrl}" alt="${escapeHtml(safeLabel)}" loading="lazy" onerror="this.style.display='none'">
                </span>
            `;
        }

        return `
            <span class="file-card-horizontal" data-ext="${ext}" ${buildLocalOpenAttrs(localFilePath, 'Finder', 'Cmd+Shift+G')} style="cursor: pointer;" title="点击定位本地文件: ${escapeHtml(safeLabel)}">
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
    
    // 远程环境
    if (isImage) {
        return `
            <a href="${fileUrl}?download=1" download="${escapeHtml(safeLabel)}" class="msg-image-box">
                <img src="${fileUrl}" alt="${escapeHtml(safeLabel)}" loading="lazy" onerror="this.style.display='none'">
            </a>
        `;
    }

    return `
        <a href="${fileUrl}?download=1" download="${escapeHtml(safeLabel)}" class="file-card-horizontal" data-ext="${ext}" title="${escapeHtml(safeLabel)}">
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

export default { renderMarkdown, renderFileCard, renderToolCard };
