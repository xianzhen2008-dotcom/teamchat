function safeJsonParse(value) {
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueNonEmpty(values = []) {
    return Array.from(new Set(
        values
            .flatMap((value) => {
                if (Array.isArray(value)) return value;
                if (typeof value === 'string' && value.includes(',')) {
                    return value.split(',').map((item) => item.trim());
                }
                return [value];
            })
            .map((value) => typeof value === 'string' ? value.trim() : '')
            .filter(Boolean)
    ));
}

function stringifyContent(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function normalizeToolEntry(tool = {}) {
    if (!isPlainObject(tool)) return null;
    const type = tool.type === 'tool_result' || tool.type === 'toolResult'
        ? 'tool_result'
        : 'tool_use';

    return {
        type,
        name: tool.name || tool.toolName || tool.tool || 'unknown',
        params: tool.params || tool.input || tool.arguments || null,
        result: tool.result ?? tool.content ?? null,
        status: tool.status || (tool.is_error ? 'error' : (type === 'tool_result' ? 'success' : 'running'))
    };
}

function buildActionLogsFromThinking(thinking = '') {
    if (!thinking) return [];
    return [{
        type: 'thinking',
        title: '思考过程',
        content: thinking,
        status: 'info'
    }];
}

function extractInlineThinkingTag(text = '') {
    const source = String(text || '').replace(/\r\n/g, '\n');
    if (!source) {
        return { text: '', thinking: '' };
    }

    const thinkingParts = [];
    let matched = false;
    const textWithoutThinking = source.replace(/<\s*think(?:ing)?\s*>([\s\S]*?)<\/\s*think(?:ing)?\s*>/gi, (_, inner = '') => {
        matched = true;
        const normalized = String(inner || '').trim();
        if (normalized) {
            thinkingParts.push(normalized);
        }
        return '\n';
    });

    if (!matched) {
        const openTagMatch = source.match(/<\s*think(?:ing)?\s*>/i);
        if (openTagMatch) {
            const thinking = source.slice(openTagMatch.index + openTagMatch[0].length).trim();
            const text = source.slice(0, openTagMatch.index).trim();
            return {
                text,
                thinking
            };
        }
    }

    return {
        text: textWithoutThinking.replace(/\n{3,}/g, '\n\n').trim(),
        thinking: thinkingParts.join('\n\n').trim()
    };
}

function unwrapInlineFinalTag(text = '') {
    const source = String(text || '').replace(/\r\n/g, '\n');
    if (!source) return '';

    let matched = false;
    const unwrapped = source.replace(/<\s*final\s*>([\s\S]*?)<\/\s*final\s*>/gi, (_, inner = '') => {
        matched = true;
        return `\n${String(inner || '').trim()}\n`;
    });

    if (matched) {
        return unwrapped.replace(/\n{3,}/g, '\n\n').trim();
    }

    const openTagMatch = source.match(/<\s*final\s*>/i);
    if (!openTagMatch) {
        return source;
    }

    const before = source.slice(0, openTagMatch.index).trim();
    const after = source.slice(openTagMatch.index + openTagMatch[0].length).trim();
    return [before, after].filter(Boolean).join('\n\n').trim();
}

function buildActionLogsFromTools(tools = []) {
    return tools.map((tool) => {
        const normalized = normalizeToolEntry(tool);
        if (!normalized) return null;
        if (normalized.type === 'tool_result') {
            return {
                type: 'tool_result',
                title: `${normalized.name || '工具'} 返回`,
                content: stringifyContent(normalized.result),
                status: normalized.status || 'success'
            };
        }
        return {
            type: 'tool_use',
            title: `调用工具 ${normalized.name || 'unknown'}`,
            content: stringifyContent(normalized.params),
            status: normalized.status || 'running'
        };
    }).filter(Boolean);
}

function mergeActionLogs(...groups) {
    const merged = [];
    const seen = new Set();

    for (const group of groups) {
        for (const item of group || []) {
            if (!item) continue;
            const normalized = {
                type: item.type || 'info',
                title: item.title || '',
                content: stringifyContent(item.content),
                status: item.status || 'info',
                time: item.time || null
            };
            const signature = `${normalized.type}|${normalized.title}|${normalized.content}|${normalized.status}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            merged.push(normalized);
        }
    }

    return merged;
}

function extractBlocksFromContent(content) {
    if (!Array.isArray(content)) {
        return {
            text: '',
            thinking: '',
            tools: [],
            actionLogs: []
        };
    }

    const textParts = [];
    const thinkingParts = [];
    const tools = [];

    for (const block of content) {
        if (!block || typeof block !== 'object') continue;

        if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text);
        }

        if ((block.type === 'thinking' || block.type === 'thought') && (block.thinking || block.thought || block.content)) {
            thinkingParts.push(String(block.thinking || block.thought || block.content));
        }

        if (block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'toolCall') {
            tools.push(normalizeToolEntry(block));
        }

        if (block.type === 'tool_result' || block.type === 'toolResult') {
            tools.push(normalizeToolEntry(block));
        }
    }

    const thinking = thinkingParts.filter(Boolean).join('\n\n');
    const normalizedTools = tools.filter(Boolean);

    return {
        text: textParts.join('\n').trim(),
        thinking,
        tools: normalizedTools,
        actionLogs: mergeActionLogs(
            buildActionLogsFromThinking(thinking),
            buildActionLogsFromTools(normalizedTools)
        )
    };
}

function unwrapStructuredEnvelope(value) {
    const parsed = typeof value === 'string' ? safeJsonParse(value.trim()) : (isPlainObject(value) ? value : null);
    if (!parsed || !isPlainObject(parsed)) return null;

    const payload = isPlainObject(parsed.result) ? parsed.result : parsed;
    return {
        root: parsed,
        payload
    };
}

function extractPayloadText(payloads = []) {
    if (!Array.isArray(payloads)) return '';
    return payloads
        .map((payload) => {
            if (typeof payload === 'string') return payload;
            if (!payload || typeof payload !== 'object') return '';
            if (typeof payload.text === 'string') return payload.text;
            if (typeof payload.content === 'string') return payload.content;
            return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
}

function resolveStructuredSessionIds(envelope) {
    if (!envelope) return [];
    const payload = envelope.payload || {};
    const meta = payload.meta || {};
    const agentMeta = meta.agentMeta || {};
    const promptReport = meta.systemPromptReport || {};

    return uniqueNonEmpty([
        payload.sessionId,
        meta.sessionId,
        agentMeta.sessionId,
        promptReport.sessionId,
        promptReport.sessionKey ? promptReport.sessionKey.split(':').pop() : ''
    ]);
}

function resolveRouteSessionIds(message = {}) {
    return uniqueNonEmpty([
        message.metadata?.routeSessionKey,
        message.metadata?.sourceSessionKey,
        message.deliveryContext?.sessionKey,
        message.context?.sessionKey
    ]);
}

function resolveStructuredRunId(envelope) {
    if (!envelope) return null;
    return envelope.root?.runId || envelope.payload?.runId || null;
}

function resolveStructuredModel(envelope) {
    if (!envelope) return null;
    const payload = envelope.payload || {};
    const meta = payload.meta || {};
    const agentMeta = meta.agentMeta || {};
    const promptReport = meta.systemPromptReport || {};
    return agentMeta.model || promptReport.model || payload.model || null;
}

function resolveStructuredChannel(envelope) {
    if (!envelope) return null;
    const payload = envelope.payload || {};
    const meta = payload.meta || {};
    const agentMeta = meta.agentMeta || {};
    const promptReport = meta.systemPromptReport || {};
    return normalizeKnownChannel(agentMeta.channel || promptReport.channel || meta.channel || payload.channel || null);
}

function normalizeKnownChannel(value) {
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    const aliases = {
        teamchat: 'teamchat',
        webchat: 'teamchat',
        browser: 'teamchat',
        ui: 'teamchat',
        web: 'teamchat',
        tui: 'tui',
        terminal: 'tui',
        cli: 'tui',
        qqbot: 'qqbot',
        qq: 'qqbot',
        qbot: 'qqbot',
        wecom: 'wecom',
        wxwork: 'wecom',
        workwx: 'wecom',
        wework: 'wecom',
        workwechat: 'wecom',
        'wecom-openclaw-plugin': 'wecom',
        weixin: 'weixin',
        wechat: 'weixin',
        wx: 'weixin',
        'openclaw-weixin': 'weixin',
        feishu: 'feishu',
        lark: 'feishu',
        telegram: 'telegram',
        tg: 'telegram',
        whatsapp: 'whatsapp',
        wa: 'whatsapp',
        system: 'system',
        sys: 'system'
    };
    return aliases[raw] || null;
}

function normalizeDisplayModel(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (normalized === 'delivery-mirror' || normalized === 'gateway-injected') {
        return null;
    }
    return normalized;
}

function resolveMessageChannel(message = {}, structuredEnvelope = null) {
    const resolved = normalizeKnownChannel(message.channel)
        || normalizeKnownChannel(message.source)
        || normalizeKnownChannel(message.metadata?.channel)
        || normalizeKnownChannel(message.metadata?.source)
        || normalizeKnownChannel(message.deliveryContext?.channel)
        || normalizeKnownChannel(message.context?.channel)
        || resolveStructuredChannel(structuredEnvelope)
        || null;
    if (!resolved && (typeof message.isUser === 'boolean' || message.sender)) {
        return 'teamchat';
    }
    return resolved;
}

function resolveStructuredThinkingAndTools(envelope) {
    if (!envelope) {
        return { thinking: '', tools: [], actionLogs: [] };
    }

    const payload = envelope.payload || {};
    const contentBlocks = Array.isArray(payload.content)
        ? payload.content
        : (Array.isArray(payload.message?.content) ? payload.message.content : null);

    if (contentBlocks) {
        return extractBlocksFromContent(contentBlocks);
    }

    return { thinking: '', tools: [], actionLogs: [] };
}

function normalizeDisplayText(rawText = '') {
    const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
    if (!raw) {
        return { text: '', hidden: true, kind: 'hidden' };
    }

    if (isInternalSubagentEnvelopeText(raw)) {
        return { text: '', hidden: true, kind: 'hidden' };
    }

    if (/^\[[A-Z][a-z]{2}\s+[^\]]+\]\s*\[Subagent Context\]/i.test(raw)) {
        return { text: '', hidden: true, kind: 'hidden' };
    }

    if (/^\[[A-Z][a-z]{2}\s+[^\]]+\]\s*OpenClaw runtime context \(internal\):/i.test(raw)) {
        return { text: '', hidden: true, kind: 'hidden' };
    }

    let text = raw;
    let kind = 'message';

    const wrapperPayload = extractWrappedConversationText(raw);
    if (wrapperPayload) {
        text = wrapperPayload;
    }

    if (/^System:\s*\[[^\]]+\]\s*/i.test(text)) {
        text = text.replace(/^System:\s*\[[^\]]+\]\s*/i, '');
        kind = 'control';
    }

    if (/^Exec completed\s*\(/i.test(text) || /^System:\s*\[[^\]]+\]\s*Exec completed/i.test(raw)) {
        text = text.replace(/^Exec completed\s*\([^)]*\)\s*::\s*\{[\s\S]*?\}\s*(?:sent to [^\n]+)?\s*/i, '');
        kind = 'control';
    }

    if (/^Exec failed\s*\(/i.test(text) || /^System:\s*\[[^\]]+\]\s*Exec failed/i.test(raw)) {
        text = text.replace(/^Exec failed\s*\([^)]*\)\s*(?:::\s*\{[\s\S]*?\})?\s*/i, '');
        kind = 'control';
    }

    if (/^\[Queued messages while agent was busy\]/i.test(text)) {
        text = text.replace(/^\[Queued messages while agent was busy\]\s*/i, '').trim();
        kind = 'control';
    }

    text = text.replace(/^\[\[reply_to_current\]\]\s*/i, '');

    text = text.replace(/\n*Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '\n');
    text = text.replace(/^\[[A-Z][a-z]{2}\s+[^\]]+\]\s*/i, '');
    text = text.replace(/^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[^\]]+\]\s*/i, '');
    text = text.replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/i, '');
    text = text.replace(/^[ \t]*System:\s*/gm, '');
    text = text.replace(/^---\s*/gm, '');
    text = text.replace(/\n*Read HEARTBEAT\.md if it exists[\s\S]*?Current time:[^\n]*(?:UTC)?\s*$/i, '').trim();
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    text = stripExternalSystemAnnotations(text);

    if (/^Read HEARTBEAT\.md if it exists/i.test(text)) {
        kind = 'control';
    }

    if (
        isControlHeartbeatText(text)
        || /^老板授权我决策[:：]/i.test(text)
        || /^你现在进入小龙虾的深夜主战刷新模式/i.test(text)
        || /^你现在进入小龙虾的总设计师模式/i.test(text)
        || /^默认把角色规则当成已知[，,]?\s*本轮只读[:：]/i.test(text)
    ) {
        kind = 'control';
    }

    if (!text || /^HEARTBEAT_OK$/i.test(text)) {
        return { text: '', hidden: true, kind: 'hidden' };
    }

    return { text, hidden: false, kind };
}

function shouldStripRoutingMention(message = {}) {
    if (!message?.isUser) return false;
    return Boolean(
        message?.metadata?.routeSessionKey
        || message?.metadata?.sourceSessionKey
        || message?.metadata?.routeAgentId
    );
}

function stripRoutingMention(text = '', message = {}) {
    if (!shouldStripRoutingMention(message)) return text;
    return String(text || '').replace(/^@[^\s]+\s+/u, '').trim();
}

function stripExternalSystemAnnotations(text = '') {
    let normalized = String(text || '').replace(/\r\n/g, '\n');
    if (!normalized) return '';

    normalized = normalized.replace(/^\[Replying to:\s*["“][\s\S]*?["”]\]\s*\n+/i, '');
    normalized = normalized.replace(/\n*Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '\n');
    normalized = normalized.replace(/\n*Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '\n');
    normalized = normalized.replace(/\n*Replied message \(untrusted(?:, for context)?\):\s*```json[\s\S]*?```\s*/gi, '\n');
    normalized = normalized.replace(/\n*Conversation info \(untrusted metadata\):\s*\{[\s\S]*?\}\s*(?=\n\n|$)/gi, '\n');
    normalized = normalized.replace(/\n*Sender \(untrusted metadata\):\s*\{[\s\S]*?\}\s*(?=\n\n|$)/gi, '\n');
    normalized = normalized.replace(/\n*Replied message \(untrusted(?:, for context)?\):\s*\{[\s\S]*?\}\s*(?=\n\n|$)/gi, '\n');
    normalized = normalized.replace(/^\[System:\s*The content may include mention tags[^\n]*\n?/gim, '');
    normalized = normalized.replace(/^\[System:\s*If user_id is [^\n]*\n?/gim, '');
    normalized = normalized.replace(/^System:\s*The content may include mention tags[^\n]*\n?/gim, '');
    normalized = normalized.replace(/^System:\s*If user_id is [^\n]*\n?/gim, '');
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    return normalized.trim();
}

function isInternalSubagentEnvelopeText(raw = '') {
    const text = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!text) return false;
    return (
        /\[Subagent Context\]/i.test(text)
        || /\[Subagent Task\]/i.test(text)
        || /Results auto-announce to your requester/i.test(text)
        || (/Retry after the previous model attempt failed or timed out/i.test(text)
            && (/\[Subagent Context\]/i.test(text) || /\[Subagent Task\]/i.test(text)))
    );
}

function isControlHeartbeatText(raw = '') {
    const text = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!text) return false;
    return (
        /^【心跳触发】/i.test(text)
        || /^【心跳协调/i.test(text)
        || /^【主控心跳】/i.test(text)
        || /^【监督心跳】/i.test(text)
        || /系统心跳批次#\d+/i.test(text)
        || /(?:10|十)\s*分钟[^。\n]{0,24}(?:心跳|领航|主控)/i.test(text)
        || /(?:心跳|主控)[^。\n]{0,24}(?:10|十)\s*分钟/i.test(text)
        || /(?:每小时|小时)[^。\n]{0,30}(?:监督|心跳|巡检)/i.test(text)
        || /(?:监督|心跳|巡检)[^。\n]{0,30}(?:每小时|小时)/i.test(text)
        || /上帝视角监督/i.test(text)
        || /走主会话/i.test(text)
        || /你是(?:继续)?主会话工作的?小龙虾/i.test(text)
        || /不是报表机器人/i.test(text)
        || /你是总导演[，,]\s*不是派单脚本/i.test(text)
        || /不要把自己当成独立播报器/i.test(text)
        || /通过 TeamChat 本地接口写回线程状态或 keepalive/i.test(text)
    );
}

function extractWrappedConversationText(raw = '') {
    const source = String(raw || '').replace(/\r\n/g, '\n');
    if (!source.includes('Conversation info (untrusted metadata):')) {
        return '';
    }

    const explicitMatch = source.match(/\[message_id:[^\]]+\]\s*\n[^\n:]{1,80}:\s*([\s\S]+)$/i);
    if (explicitMatch?.[1]?.trim()) {
        return explicitMatch[1].trim();
    }

    let text = source;
    text = text.replace(/\n*Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '\n');
    text = text.replace(/\n*Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '\n');
    text = text.replace(/\n*Replied message \(untrusted(?:, for context)?\):\s*```json[\s\S]*?```\s*/gi, '\n');
    text = text.replace(/^\[message_id:[^\]]+\]\s*/gim, '');
    text = text.replace(/^[^\n:]{1,80}:\s*/m, '');
    text = text.replace(/^System:\s*\[[^\]]+\][^\n]*\n+/i, '');
    text = text.replace(/^(?:\[[^\]]+\]\s*)?unknown error[^\n]*\n+/i, '');
    text = text.replace(/^[ \t]*System:\s*/gm, '');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    text = stripExternalSystemAnnotations(text);

    const parts = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (!parts.length) {
        return '';
    }

    if (parts.length > 1 && /^(?:\[[^\]]+\]\s*)?(?:unknown error|error|exec completed)/i.test(parts[0])) {
        return parts[parts.length - 1];
    }

    const last = parts[parts.length - 1];
    if (/^(ping|继续)$/i.test(last)) {
        return last;
    }

    return text;
}

export function extractMessageMetadata(message = {}) {
    const explicitContentBlocks = extractBlocksFromContent(message.content);
    const rawText = typeof message.text === 'string' ? message.text : '';
    const structuredEnvelope = rawText.trim().startsWith('{') ? unwrapStructuredEnvelope(rawText) : null;
    const structuredText = extractPayloadText(structuredEnvelope?.payload?.payloads || []);
    const structuredBlocks = resolveStructuredThinkingAndTools(structuredEnvelope);
    const metadataThinking = typeof message.metadata?.thinking === 'string' ? message.metadata.thinking : '';
    const metadataTools = Array.isArray(message.metadata?.tools)
        ? message.metadata.tools.map(normalizeToolEntry).filter(Boolean)
        : [];
    const metadataActionLogs = Array.isArray(message.metadata?.actionLogs)
        ? message.metadata.actionLogs
        : [];

    const routeSessionIds = resolveRouteSessionIds(message);
    const explicitSessionIds = uniqueNonEmpty([message.sessionId]);
    const structuredSessionIds = resolveStructuredSessionIds(structuredEnvelope);
    const sessionIds = uniqueNonEmpty([...routeSessionIds, ...explicitSessionIds, ...structuredSessionIds]);

    const model = normalizeDisplayModel(message.model)
        || normalizeDisplayModel(message.modelInfo?.modelId)
        || normalizeDisplayModel(message.metadata?.model)
        || normalizeDisplayModel(message.metadata?.modelId)
        || normalizeDisplayModel(message.metadata?.modelInfo?.modelId)
        || normalizeDisplayModel(resolveStructuredModel(structuredEnvelope))
        || null;

    const channel = resolveMessageChannel(message, structuredEnvelope);

    const rawDisplayText = explicitContentBlocks.text
        || (structuredText && rawText.trim().startsWith('{') ? structuredText : '')
        || rawText
        || '';
    const inlineThinking = extractInlineThinkingTag(rawDisplayText);

    const thinking = (typeof message.thinking === 'string' && message.thinking.trim())
        || metadataThinking
        || explicitContentBlocks.thinking
        || structuredBlocks.thinking
        || inlineThinking.thinking
        || '';

    const tools = [
        ...(Array.isArray(message.tools) ? message.tools.map(normalizeToolEntry).filter(Boolean) : []),
        ...metadataTools,
        ...explicitContentBlocks.tools,
        ...structuredBlocks.tools
    ];

    const actionLogs = mergeActionLogs(
        Array.isArray(message.actionLogs) ? message.actionLogs : [],
        metadataActionLogs,
        explicitContentBlocks.actionLogs,
        structuredBlocks.actionLogs,
        buildActionLogsFromThinking(thinking),
        buildActionLogsFromTools(tools)
    );

    const displaySource = unwrapInlineFinalTag(inlineThinking.thinking ? inlineThinking.text : rawDisplayText);
    const display = normalizeDisplayText(displaySource);
    const finalText = stripRoutingMention(display.text, message);

    return {
        text: finalText,
        sessionIds,
        primarySessionId: sessionIds[0] || null,
        runId: message.runId || resolveStructuredRunId(structuredEnvelope),
        model,
        channel,
        hidden: display.hidden,
        kind: display.kind,
        thinking,
        tools,
        actionLogs,
        structuredEnvelope
    };
}

export function getMessageDisplayText(message = {}) {
    return extractMessageMetadata(message).text || '';
}

export function getMessageSessionIds(message = {}) {
    return extractMessageMetadata(message).sessionIds;
}

export function getPrimarySessionId(message = {}) {
    return extractMessageMetadata(message).primarySessionId;
}

export function messageHasSessionId(message = {}, sessionId = '') {
    if (!sessionId) return false;
    return getMessageSessionIds(message).includes(sessionId);
}

export function getMessageModel(message = {}) {
    return extractMessageMetadata(message).model;
}

export function getMessageActionLogs(message = {}) {
    return extractMessageMetadata(message).actionLogs;
}

export function isMessageHidden(message = {}) {
    return extractMessageMetadata(message).hidden === true;
}

export function isHeartbeatPromptMessage(message = {}) {
    const metadata = message?.metadata || {};
    const kind = metadata.kind || message.kind || message.type || '';
    const meta = extractMessageMetadata(message);
    const text = meta.text || message?.text || '';
    const actionLogText = [
        ...(Array.isArray(message.actionLogs) ? message.actionLogs : []),
        ...(Array.isArray(metadata.actionLogs) ? metadata.actionLogs : []),
        ...(Array.isArray(meta.actionLogs) ? meta.actionLogs : [])
    ].map((item) => `${item?.title || ''}\n${item?.content || ''}`).join('\n');
    const heartbeatSearchText = [
        text,
        message?.text,
        message?.thinking,
        metadata.thinking,
        actionLogText
    ].filter(Boolean).join('\n');

    return isControlHeartbeatText(heartbeatSearchText)
        || metadata.subkind === 'heartbeat'
        || metadata.controlKind === 'heartbeat'
        || /\bHEARTBEAT_OK\b/i.test(String(heartbeatSearchText || ''))
        || /(?:Brief|收件箱|inbox)[\s\S]{0,160}keepalive\s*[=:：]?\s*(?:允许|allowed|是|true|yes)/i.test(String(heartbeatSearchText || ''))
        || /standard\s+keepalive\s+check/i.test(String(heartbeatSearchText || ''))
        || /(?:keepalive|心跳)[\s\S]{0,160}(?:NO_REPLY|NO_REPL|待拍板\s*[=:：]?\s*0|未读\s*[=:：]?\s*0)/i.test(String(heartbeatSearchText || ''))
        || /(?:老板|Brief)[\s\S]{0,80}(?:清净|干净|稳态|平稳运行|等待验证码|09:15|早报流水线)[\s\S]{0,80}(?:NO_REPLY|NO_REPL|keepalive|心跳)/i.test(String(heartbeatSearchText || ''))
        || /(?:QA|轮值|巡检|监督|领航)[\s\S]{0,180}(?:keepalive|pending_acceptance|NO_REPLY|NO_REPL|收件箱|未处理线程|超时线程|需要拍板线程)/i.test(String(heartbeatSearchText || ''))
        || (kind === 'control' && /心跳|巡检|监督|领航|keepalive|NO_REPLY|NO_REPL/i.test(String(heartbeatSearchText || '')));
}

export function getCompactSessionId(sessionId = '') {
    const value = String(sessionId || '').trim();
    if (!value) return '';

    if (/^[a-f0-9]{6,}$/i.test(value)) {
        return value.slice(0, 6).toLowerCase();
    }

    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16).padStart(6, '0').slice(0, 6);
}
