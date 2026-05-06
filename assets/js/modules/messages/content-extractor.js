/**
 * Content Extractor - 消息内容提取器
 * 
 * 参考 OpenClaw WebUI 的实现，提供：
 * - 统一的消息内容格式处理（支持 string/array/text/thinking）
 * - WeakMap 缓存机制避免重复解析
 * - Thinking 内容提取（支持多种格式）
 * - 内容清洗（移除时间戳、外部内容标记等）
 */

import { extractMessageMetadata } from '../../utils/message-meta.js';

// ==================== 缓存机制 ====================
const contentCache = new WeakMap();
const thinkingCache = new WeakMap();
const metadataCache = new WeakMap();

/**
 * 获取缓存的内容，如果没有则提取并缓存
 * @param {Object} msg - 消息对象
 * @returns {string|null} 提取的内容
 */
export function getCachedContent(msg) {
    if (!msg || typeof msg !== 'object') {
        return extractContent(msg);
    }
    if (contentCache.has(msg)) {
        return contentCache.get(msg);
    }
    const result = extractContent(msg);
    contentCache.set(msg, result);
    return result;
}

/**
 * 获取缓存的 thinking 内容
 * @param {Object} msg - 消息对象
 * @returns {string|null} 提取的 thinking 内容
 */
export function getCachedThinking(msg) {
    if (!msg || typeof msg !== 'object') {
        return extractThinking(msg);
    }
    if (thinkingCache.has(msg)) {
        return thinkingCache.get(msg);
    }
    const result = extractThinking(msg);
    thinkingCache.set(msg, result);
    return result;
}

export function getCachedMetadata(msg) {
    if (!msg || typeof msg !== 'object') {
        return extractMessageMetadata(msg);
    }
    if (metadataCache.has(msg)) {
        return metadataCache.get(msg);
    }
    const result = extractMessageMetadata(msg);
    metadataCache.set(msg, result);
    return result;
}

// ==================== 内容提取 ====================

/**
 * 统一提取消息内容
 * 支持多种格式：string / array / content.text
 * @param {Object|string} msg - 消息对象或直接的内容
 * @returns {string|null} 提取的内容
 */
export function extractContent(msg) {
    if (!msg) return null;
    
    // 如果是字符串，直接返回
    if (typeof msg === 'string') return msg;

    const metadata = extractMessageMetadata(msg);
    if (metadata.text) {
        return cleanContent(metadata.text, msg.role);
    }
    
    // 获取 content 字段（优先）或 text 字段
    const content = msg.content !== undefined ? msg.content : msg.text;
    
    // 字符串类型
    if (typeof content === 'string') {
        return cleanContent(content, msg.role);
    }
    
    // 数组类型（OpenAI 格式）
    if (Array.isArray(content)) {
        const texts = content
            .filter(item => item && item.type === 'text' && typeof item.text === 'string')
            .map(item => item.text);
        
        if (texts.length > 0) {
            return cleanContent(texts.join('\n'), msg.role);
        }
        
        // 尝试提取所有字符串类型的内容
        const allTexts = content
            .filter(item => typeof item === 'string')
            .join('\n');
        if (allTexts) return cleanContent(allTexts, msg.role);
    }
    
    // 回退到 text 字段
    if (typeof msg.text === 'string') {
        return cleanContent(msg.text, msg.role);
    }
    
    return null;
}

/**
 * 提取 thinking 内容
 * 支持多种格式：
 * 1. msg.thinking 字段
 * 2. content array 中的 thinking 类型
 * 3. text 中的 <think> 或 <thinking> 标签
 * @param {Object} msg - 消息对象
 * @returns {string|null} 提取的 thinking 内容
 */
export function extractThinking(msg) {
    if (!msg || typeof msg !== 'object') return null;

    const metadata = extractMessageMetadata(msg);
    if (metadata.thinking) {
        return metadata.thinking.trim();
    }
    
    // 1. 直接 thinking 字段
    if (msg.thinking && typeof msg.thinking === 'string') {
        return msg.thinking.trim();
    }
    
    // 2. content array 中的 thinking 类型
    const content = msg.content;
    if (Array.isArray(content)) {
        const thinkingParts = content
            .filter(item => item && item.type === 'thinking' && typeof item.thinking === 'string')
            .map(item => item.thinking.trim())
            .filter(Boolean);
        
        if (thinkingParts.length > 0) {
            return thinkingParts.join('\n\n');
        }
    }
    
    // 3. 从 text 中提取 <think> 或 <thinking> 标签
    const text = extractContent(msg);
    if (text) {
        const matches = [...text.matchAll(/<\s*think(?:ing)?\s*>([\s\S]*?)<\/\s*think(?:ing)?\s*>/gi)];
        if (matches.length > 0) {
            return matches.map(m => m[1].trim()).filter(Boolean).join('\n\n');
        }
    }
    
    return null;
}

// ==================== 内容清洗 ====================

/**
 * 根据角色清洗内容
 * @param {string} content - 原始内容
 * @param {string} role - 消息角色 (user/assistant/tool)
 * @returns {string} 清洗后的内容
 */
function cleanContent(content, role) {
    if (!content || typeof content !== 'string') return content;
    
    const roleLower = (role || '').toLowerCase();
    
    // 用户消息：移除时间戳前缀，清洗外部内容
    if (roleLower === 'user') {
        return cleanExternalContent(removeTimestampPrefix(content));
    }
    
    // Assistant 消息：保留原样（可能包含代码块等）
    if (roleLower === 'assistant') {
        return content;
    }
    
    // 其他角色：只移除时间戳前缀
    return removeTimestampPrefix(content);
}

/**
 * 移除时间戳前缀，如 "[2024-01-01 12:00] " 或 "[2024-01-01T12:00Z] "
 * @param {string} content - 原始内容
 * @returns {string} 处理后的内容
 */
function removeTimestampPrefix(content) {
    if (!content) return content;
    
    // 匹配 [2024-01-01 12:00] 或 [2024-01-01T12:00Z] 格式
    const timestampPattern = /^\[\d{4}-\d{2}-\d{2}(?:T|\s+)\d{2}:\d{2}(?::\d{2})?(?:Z)?\]\s*/;
    const match = content.match(timestampPattern);
    
    if (match) {
        return content.slice(match[0].length);
    }
    
    return content;
}

/**
 * 清洗外部内容标记
 * 移除 <<<EXTERNAL_UNTRUSTED_CONTENT 等标记和相关的 JSON 代码块
 * @param {string} content - 原始内容
 * @returns {string} 清洗后的内容
 */
function cleanExternalContent(content) {
    if (!content) return content;
    
    // 检查是否包含外部内容标记
    const hasExternalMarker = /<<<EXTERNAL_UNTRUSTED_CONTENT|UNTRUSTED channel metadata|Source:\s+/.test(content);
    if (!hasExternalMarker) {
        return content;
    }
    
    const lines = content.split('\n');
    const result = [];
    let inCodeBlock = false;
    let codeBlockLang = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检测外部内容边界（在第一行或特定位置）
        if (!inCodeBlock && i === 0 && /<<<EXTERNAL_UNTRUSTED_CONTENT|UNTRUSTED channel metadata/.test(line)) {
            break;
        }
        
        // 检测代码块开始
        if (!inCodeBlock && line.trim().startsWith('```')) {
            const lang = line.trim().slice(3).trim();
            // 如果是 json 代码块且包含外部内容标记，跳过整个代码块
            if (lang === 'json' && i > 0 && /<<<EXTERNAL_UNTRUSTED_CONTENT|UNTRUSTED channel metadata/.test(lines[i - 1] || '')) {
                inCodeBlock = true;
                codeBlockLang = 'json';
                continue;
            }
            result.push(line);
            inCodeBlock = true;
            codeBlockLang = lang;
            continue;
        }
        
        // 代码块结束
        if (inCodeBlock && line.trim() === '```') {
            if (codeBlockLang !== 'json') {
                result.push(line);
            }
            inCodeBlock = false;
            codeBlockLang = null;
            continue;
        }
        
        // 在代码块内
        if (inCodeBlock) {
            if (codeBlockLang === 'json') {
                // 跳过 JSON 代码块内容
                continue;
            }
            result.push(line);
            continue;
        }
        
        // 普通行
        result.push(line);
    }
    
    return result.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * 检查内容是否包含外部内容标记
 * @param {string} content - 内容
 * @returns {boolean} 是否包含外部内容标记
 */
export function hasExternalContent(content) {
    if (!content || typeof content !== 'string') return false;
    return /<<<EXTERNAL_UNTRUSTED_CONTENT|UNTRUSTED channel metadata|Source:\s+/.test(content);
}

/**
 * 清除缓存（用于调试或内存管理）
 */
export function clearCaches() {
    // WeakMap 会自动垃圾回收，此方法主要用于调试
    console.log('[ContentExtractor] Caches will be cleared by garbage collector');
}
