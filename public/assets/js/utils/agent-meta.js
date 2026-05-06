const AGENT_CATALOG = {
    main: {
        name: 'Coordinator',
        role: 'Team lead',
        aliases: ['main', 'coordinator', 'lobster', 'agent-main', 'agent_main']
    },
    writer: {
        name: 'Writer',
        role: 'Content and documentation',
        aliases: ['writer', 'agent-writer', 'agent_writer']
    },
    mail: {
        name: 'Mail',
        role: 'Inbox adapter',
        aliases: ['mail', 'agent-mail', 'agent_mail']
    },
    data: {
        name: 'Data',
        role: 'Analytics',
        aliases: ['data', 'agent-data', 'agent_data']
    },
    qa: {
        name: 'QA',
        role: 'Quality assurance',
        aliases: ['qa', 'agent-qa', 'agent_qa']
    },
    pm: {
        name: 'PM',
        role: 'Product planning',
        aliases: ['pm', 'product', 'agent-pm', 'agent_pm']
    },
    dev: {
        name: 'Developer',
        role: 'Implementation',
        aliases: ['dev', 'developer', 'agent-dev', 'agent_dev']
    },
    frontend: {
        name: 'Frontend',
        role: 'UI engineering',
        aliases: ['frontend', 'fe', 'agent-fe', 'agent-frontend', 'agent_fe']
    },
    backend: {
        name: 'Backend',
        role: 'Server engineering',
        aliases: ['backend', 'be', 'agent-be', 'agent-backend', 'agent_be']
    },
    mobile: {
        name: 'Mobile',
        role: 'Mobile app',
        aliases: ['mobile', 'agent-mobile', 'agent_mobile']
    },
    devops: {
        name: 'Ops',
        role: 'Operations',
        aliases: ['devops', 'ops', 'agent-ops', 'agent-devops', 'agent_ops']
    },
    finance: {
        name: 'Finance',
        role: 'Finance assistant',
        aliases: ['finance', 'agent-finance', 'agent_finance']
    }
};

export const AGENT_ORDER = [
    'main',
    'writer',
    'mail',
    'data',
    'qa',
    'pm',
    'dev',
    'frontend',
    'backend',
    'mobile',
    'devops',
    'finance'
];

const aliasToId = new Map();

function normalizeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

for (const [agentId, meta] of Object.entries(AGENT_CATALOG)) {
    aliasToId.set(normalizeKey(agentId), agentId);
    aliasToId.set(normalizeKey(meta.name), agentId);
    for (const alias of meta.aliases) {
        aliasToId.set(normalizeKey(alias), agentId);
    }
}

export function normalizeAgentId(value) {
    if (!value) return null;
    return aliasToId.get(normalizeKey(value)) || null;
}

export function getAgentDisplayName(value, fallback = '') {
    const agentId = normalizeAgentId(value);
    if (agentId && AGENT_CATALOG[agentId]) {
        return AGENT_CATALOG[agentId].name;
    }
    return value || fallback;
}

export function getAgentRole(value, fallback = '') {
    const agentId = normalizeAgentId(value);
    if (agentId && AGENT_CATALOG[agentId]) {
        return AGENT_CATALOG[agentId].role;
    }
    return fallback || '';
}

export function findAgentByName(agents = [], name = '') {
    const normalizedId = normalizeAgentId(name);
    if (!normalizedId) {
        return agents.find((agent) => agent?.name === name) || null;
    }
    return agents.find((agent) => normalizeAgentId(agent?.agentId || agent?.id || agent?.name) === normalizedId) || null;
}

export function normalizeAgentRecord(agent = {}) {
    const originalId = agent.agentId || agent.id || agent.name || '';
    const normalizedId = normalizeAgentId(originalId);
    const normalizedName = getAgentDisplayName(agent.name || originalId, agent.name || originalId);
    return {
        ...agent,
        id: agent.id || normalizedId || agent.id,
        agentId: normalizedId || agent.agentId || agent.id,
        name: normalizedName,
        role: agent.role || getAgentRole(normalizedId || originalId, agent.role || '')
    };
}

export function dedupeAgents(agents = []) {
    const deduped = [];
    const seen = new Map();

    for (const agent of agents) {
        const normalized = normalizeAgentRecord(agent);
        const key = normalized.agentId
            || normalizeAgentId(normalized.name)
            || normalized.id
            || normalized.name;

        if (!key) {
            deduped.push(normalized);
            continue;
        }

        const existingIndex = seen.get(key);
        if (existingIndex === undefined) {
            seen.set(key, deduped.length);
            deduped.push(normalized);
            continue;
        }

        const existing = deduped[existingIndex];
        deduped[existingIndex] = {
            ...existing,
            ...normalized,
            id: existing.id || normalized.id || key,
            agentId: existing.agentId || normalized.agentId || key,
            name: normalized.name || existing.name || key,
            role: existing.role || normalized.role || '',
            img: existing.img || normalized.img || ''
        };
    }

    return deduped;
}

export function compareAgentsByOrder(a = {}, b = {}) {
    const aId = normalizeAgentId(a.agentId || a.id || a.name);
    const bId = normalizeAgentId(b.agentId || b.id || b.name);
    const aIndex = AGENT_ORDER.indexOf(aId);
    const bIndex = AGENT_ORDER.indexOf(bId);

    if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
    }

    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    const aName = getAgentDisplayName(a.name || aId, a.name || aId || '');
    const bName = getAgentDisplayName(b.name || bId, b.name || bId || '');
    return aName.localeCompare(bName, 'zh-Hans-CN');
}

function buildControlProbe(text = '') {
    let normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return '';
    normalized = normalized.replace(/^(?:\[[A-Z][a-z]{2}\s+[^\]]+\]\s*)+/g, '');
    normalized = normalized.replace(/^(?:System:\s*)+/i, '');
    return normalized.trim();
}

function looksLikeSystemControlText(text = '') {
    const normalized = buildControlProbe(text);
    if (!normalized) return false;
    if (normalized.includes('Conversation info (untrusted metadata):')) {
        return false;
    }

    const patterns = [
        /^Exec completed\s*\(/i,
        /^Exec failed\s*\(/i,
        /^【心跳触发】/i,
        /^【心跳协调/i,
        /^【主控心跳】/i,
        /^【监督心跳】/i,
        /^\[Queued messages while agent was busy\]/i,
        /系统心跳批次#\d+/i,
        /(?:10|十)\s*分钟[^。\n]{0,24}(?:心跳|领航|主控)/i,
        /(?:心跳|主控)[^。\n]{0,24}(?:10|十)\s*分钟/i,
        /(?:每小时|小时)[^。\n]{0,30}(?:监督|心跳|巡检)/i,
        /(?:监督|心跳|巡检)[^。\n]{0,30}(?:每小时|小时)/i,
        /上帝视角监督/i,
        /走主会话/i,
        /你是(?:继续)?主会话工作的?小龙虾/i,
        /不是报表机器人/i,
        /你是总导演[，,]\s*不是派单脚本/i,
        /不要把自己当成独立播报器/i,
        /通过 TeamChat 本地接口写回线程状态或 keepalive/i,
        /^老板授权我决策[:：]/i,
        /^Conversation info \(untrusted metadata\):/i,
        /^\[[A-Z][a-z]{2}\s+[^\]]+\]\s*\[Subagent Context\]/i,
        /^\[[A-Z][a-z]{2}\s+[^\]]+\]\s*OpenClaw runtime context \(internal\):/i,
        /^Read HEARTBEAT\.md if it exists/i
    ];

    return patterns.some((pattern) => pattern.test(normalized));
}

function hasInternalSenderMetadata(text = '') {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    if (!normalized.includes('Sender (untrusted metadata):')) return false;
    if (/openclaw-tui/i.test(normalized)) return false;
    return /teamchat-server|team-chat-skill|openclaw-cli|\bcli\b/i.test(normalized);
}

export function normalizeMessageAgentFields(message = {}) {
    const nextMessage = { ...message };
    const forceSystemMessage = looksLikeSystemControlText(nextMessage.text);
    const forceAgentMirror = Boolean(
        nextMessage?.metadata?.mirrorSource === 'agent-transcript'
        && hasInternalSenderMetadata(nextMessage.text)
    );

    if (forceSystemMessage) {
        nextMessage.isUser = false;
        nextMessage.isSystem = true;
        nextMessage.type = 'system';
        nextMessage.sender = '系统';
        nextMessage.agentId = null;
    }

    if (typeof nextMessage.isUser !== 'boolean') {
        const role = String(nextMessage.role || nextMessage.message?.role || '').toLowerCase();
        const sender = String(nextMessage.sender || '').trim();
        const senderLower = sender.toLowerCase();
        const inferredAgentId = normalizeAgentId(nextMessage.agentId || nextMessage.sender || '');

        if (nextMessage.isSystem || nextMessage.type === 'system') {
            nextMessage.isUser = false;
        } else if (['user', 'human', 'client'].includes(role)) {
            nextMessage.isUser = true;
        } else if (['assistant', 'system', 'tool', 'bot', 'agent'].includes(role)) {
            nextMessage.isUser = false;
        } else if (['我', '用户', 'user', 'you', 'client'].includes(senderLower)) {
            nextMessage.isUser = true;
        } else if (inferredAgentId) {
            nextMessage.isUser = false;
        } else if (nextMessage.model || nextMessage.modelInfo || nextMessage.runId) {
            nextMessage.isUser = false;
        } else {
            nextMessage.isUser = true;
        }
    }

    if (nextMessage.isUser === false) {
        const sender = String(nextMessage.sender || '').trim();
        const senderLower = sender.toLowerCase();
        const inferredAgentId = normalizeAgentId(nextMessage.agentId || nextMessage.sender || '');
        const isSystemSender = nextMessage.isSystem || nextMessage.type === 'system' || ['系统', 'system'].includes(senderLower);
        const isLikelyUser = ['我', '用户', 'user', 'you', 'client', 'team-chat-skill'].includes(senderLower);
        if (!isSystemSender && !inferredAgentId && isLikelyUser) {
            nextMessage.isUser = true;
        }
    }
    if (forceAgentMirror) {
        nextMessage.isUser = false;
        nextMessage.isSystem = false;
        nextMessage.type = undefined;
        const transcriptAgentId = normalizeAgentId(nextMessage?.metadata?.transcriptAgentId || nextMessage?.metadata?.routeAgentId || '');
        if (transcriptAgentId) {
            nextMessage.agentId = transcriptAgentId;
            nextMessage.sender = getAgentDisplayName(transcriptAgentId);
        }
    }
    if (forceSystemMessage) {
        nextMessage.isUser = false;
        nextMessage.isSystem = true;
        nextMessage.type = 'system';
        nextMessage.sender = '系统';
        nextMessage.agentId = null;
    }
    if (!nextMessage.isUser && nextMessage.sender) {
        nextMessage.sender = getAgentDisplayName(nextMessage.sender, nextMessage.sender);
    }
    if (nextMessage.agentId) {
        nextMessage.agentId = normalizeAgentId(nextMessage.agentId) || nextMessage.agentId;
    }
    if (nextMessage.agentName) {
        nextMessage.agentName = getAgentDisplayName(nextMessage.agentName, nextMessage.agentName);
    }
    return nextMessage;
}
