import { eventBus } from '../../core/events.js';

const SESSION_KEY = 'team_chat_session';
const LANGUAGE_KEY = 'team_chat_language';

const I18N = {
    'zh-CN': {
        settings: '设置',
        setupTitle: '初始化设置',
        setupSubtitle: '配置公开版 TeamChat 的登录、内网穿透、头像、Agent 和通道监控。',
        language: '语言',
        auth: '登录口令',
        authNone: '本地演示模式',
        authPassword: '远程口令模式',
        publicUrl: '公开访问地址',
        tunnel: '内网穿透',
        tunnelProvider: '穿透服务',
        avatarDir: '头像目录',
        agents: 'Agent 通讯录',
        agentPaths: '自动发现路径',
        channels: '通道监控',
        generatedEnv: '生成的 .env 配置',
        save: '保存设置',
        refresh: '刷新发现',
        close: '关闭',
        configured: '已配置',
        needsConfig: '待配置',
        disabled: '未启用',
        ready: '可用',
        agentsFound: '已发现 Agent',
        channelsFound: '监控通道',
        copied: '配置已复制',
        saved: '设置已保存',
        copy: '复制配置',
        openSetup: '打开设置',
        sidebarAgents: '智能体',
        search: '搜索',
        filter: '筛选',
        status: '行动日志',
        metrics: '监控',
        skin: '皮肤',
        latest: '最新',
        inputPlaceholder: '输入消息...（@ 提及 Agent）'
    },
    'en-US': {
        settings: 'Settings',
        setupTitle: 'Setup Wizard',
        setupSubtitle: 'Configure login, tunnel access, avatars, agents, and channel monitoring for TeamChat OSS.',
        language: 'Language',
        auth: 'Login password',
        authNone: 'Local demo mode',
        authPassword: 'Remote password mode',
        publicUrl: 'Public base URL',
        tunnel: 'Tunnel',
        tunnelProvider: 'Tunnel provider',
        avatarDir: 'Avatar directory',
        agents: 'Agent roster',
        agentPaths: 'Discovery paths',
        channels: 'Channel monitoring',
        generatedEnv: 'Generated .env',
        save: 'Save settings',
        refresh: 'Refresh discovery',
        close: 'Close',
        configured: 'Configured',
        needsConfig: 'Needs config',
        disabled: 'Disabled',
        ready: 'Ready',
        agentsFound: 'Agents found',
        channelsFound: 'Channels',
        copied: 'Config copied',
        saved: 'Settings saved',
        copy: 'Copy config',
        openSetup: 'Open settings',
        sidebarAgents: 'Agents',
        search: 'Search',
        filter: 'Filter',
        status: 'Action Log',
        metrics: 'Metrics',
        skin: 'Themes',
        latest: 'Latest',
        inputPlaceholder: 'Type a message... (@ mention an Agent)'
    }
};

function getSessionHeaders() {
    const session = localStorage.getItem(SESSION_KEY) || '';
    return session ? { 'X-Session-Token': session } : {};
}

function getLanguage() {
    return localStorage.getItem(LANGUAGE_KEY) || 'zh-CN';
}

function t(key) {
    const lang = getLanguage();
    return I18N[lang]?.[key] || I18N['zh-CN'][key] || key;
}

class SettingsModule {
    constructor() {
        this.container = null;
        this.visible = false;
        this.payload = null;
    }

    init() {
        this.createContainer();
        this.applyLanguage();
        this.maybeOpenFirstRun();
    }

    createContainer() {
        const existing = document.getElementById('settings-panel');
        if (existing) existing.remove();

        this.container = document.createElement('section');
        this.container.id = 'settings-panel';
        this.container.className = 'settings-panel';
        this.container.setAttribute('aria-label', t('settings'));
        this.container.innerHTML = `
            <div class="settings-panel-header">
                <div>
                    <h2 data-i18n="setupTitle">${t('setupTitle')}</h2>
                    <p data-i18n="setupSubtitle">${t('setupSubtitle')}</p>
                </div>
                <button class="settings-close" type="button" data-i18n-title="close" title="${t('close')}">x</button>
            </div>
            <div class="settings-panel-content">
                <div class="settings-grid">
                    <label class="settings-field">
                        <span data-i18n="language">${t('language')}</span>
                        <select id="settings-language">
                            <option value="zh-CN">中文</option>
                            <option value="en-US">English</option>
                        </select>
                    </label>
                    <label class="settings-field">
                        <span data-i18n="auth">${t('auth')}</span>
                        <select id="settings-auth-mode">
                            <option value="none" data-i18n="authNone">${t('authNone')}</option>
                            <option value="password" data-i18n="authPassword">${t('authPassword')}</option>
                        </select>
                    </label>
                    <label class="settings-field">
                        <span data-i18n="publicUrl">${t('publicUrl')}</span>
                        <input id="settings-public-url" type="url" placeholder="https://teamchat.example.com">
                    </label>
                    <label class="settings-field">
                        <span data-i18n="tunnelProvider">${t('tunnelProvider')}</span>
                        <input id="settings-tunnel-provider" type="text" placeholder="cloudflared / frp / ngrok">
                    </label>
                    <label class="settings-field">
                        <span data-i18n="avatarDir">${t('avatarDir')}</span>
                        <input id="settings-avatar-dir" type="text" placeholder="./public/assets/avatars">
                    </label>
                    <label class="settings-field settings-field-wide">
                        <span data-i18n="agentPaths">${t('agentPaths')}</span>
                        <input id="settings-agent-paths" type="text" placeholder="./agents,./config/agents.json">
                    </label>
                </div>
                <div class="settings-status-row">
                    <label class="settings-toggle">
                        <input id="settings-tunnel-enabled" type="checkbox">
                        <span data-i18n="tunnel">${t('tunnel')}</span>
                    </label>
                    <button id="settings-refresh" class="settings-secondary" type="button" data-i18n="refresh">${t('refresh')}</button>
                </div>
                <div class="settings-columns">
                    <div class="settings-card">
                        <h3 data-i18n="agents">${t('agents')}</h3>
                        <div id="settings-agent-list" class="settings-list"></div>
                    </div>
                    <div class="settings-card">
                        <h3 data-i18n="channels">${t('channels')}</h3>
                        <div id="settings-channel-list" class="settings-list"></div>
                    </div>
                </div>
                <div class="settings-env">
                    <div class="settings-env-header">
                        <h3 data-i18n="generatedEnv">${t('generatedEnv')}</h3>
                        <button id="settings-copy-env" class="settings-secondary" type="button" data-i18n="copy">${t('copy')}</button>
                    </div>
                    <pre id="settings-env-preview"></pre>
                </div>
            </div>
            <div class="settings-panel-footer">
                <button id="settings-save" class="settings-primary" type="button" data-i18n="save">${t('save')}</button>
            </div>
        `;
        document.body.appendChild(this.container);
        this.bindEvents();
    }

    bindEvents() {
        this.container.querySelector('.settings-close')?.addEventListener('click', () => this.hide());
        this.container.querySelector('#settings-refresh')?.addEventListener('click', () => this.loadSetup());
        this.container.querySelector('#settings-save')?.addEventListener('click', () => this.saveSetup());
        this.container.querySelector('#settings-copy-env')?.addEventListener('click', () => this.copyEnv());
        this.container.querySelector('#settings-language')?.addEventListener('change', (event) => {
            localStorage.setItem(LANGUAGE_KEY, event.target.value);
            this.applyLanguage();
            this.render();
        });
    }

    async maybeOpenFirstRun() {
        await this.loadSetup();
        if (!localStorage.getItem('team_chat_setup_seen') && !this.payload?.configured) {
            this.show();
            localStorage.setItem('team_chat_setup_seen', '1');
        }
    }

    async loadSetup() {
        try {
            const response = await fetch('/api/setup', { headers: getSessionHeaders() });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.payload = await response.json();
            this.render();
        } catch (error) {
            this.payload = { ok: false, error: error.message, agents: [], channels: [] };
            this.render();
        }
    }

    collectConfig() {
        const channelNames = (this.payload?.channels || [])
            .map((channel) => channel.name)
            .filter(Boolean);
        return {
            language: this.container.querySelector('#settings-language')?.value || getLanguage(),
            authMode: this.container.querySelector('#settings-auth-mode')?.value || 'none',
            publicBaseUrl: this.container.querySelector('#settings-public-url')?.value || '',
            tunnelEnabled: Boolean(this.container.querySelector('#settings-tunnel-enabled')?.checked),
            tunnelProvider: this.container.querySelector('#settings-tunnel-provider')?.value || '',
            avatarDir: this.container.querySelector('#settings-avatar-dir')?.value || '',
            agentDiscoveryPaths: this.container.querySelector('#settings-agent-paths')?.value || '',
            channels: channelNames.length ? channelNames : ['teamchat', 'tui', 'telegram']
        };
    }

    async saveSetup() {
        const config = this.collectConfig();
        localStorage.setItem(LANGUAGE_KEY, config.language);
        const response = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
            body: JSON.stringify(config)
        });
        this.payload = await response.json();
        this.applyLanguage();
        this.render();
        eventBus.emit('toast:show', { message: t('saved'), type: 'success' });
    }

    render() {
        if (!this.container) return;
        const config = this.payload?.config || {};
        this.container.querySelector('#settings-language').value = getLanguage();
        this.container.querySelector('#settings-auth-mode').value = config.authMode || 'none';
        this.container.querySelector('#settings-public-url').value = config.publicBaseUrl || '';
        this.container.querySelector('#settings-tunnel-enabled').checked = Boolean(config.tunnelEnabled);
        this.container.querySelector('#settings-tunnel-provider').value = config.tunnelProvider || '';
        this.container.querySelector('#settings-avatar-dir').value = config.avatarDir || '';
        this.container.querySelector('#settings-agent-paths').value = config.agentDiscoveryPaths || '';
        this.container.querySelector('#settings-env-preview').textContent = this.payload?.generatedEnv || '';

        const agentList = this.container.querySelector('#settings-agent-list');
        const agents = this.payload?.agents || [];
        agentList.innerHTML = agents.length
            ? agents.map((agent) => `<div class="settings-list-item"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.agentId)} · ${escapeHtml(agent.role || '')}</span></div>`).join('')
            : `<div class="settings-empty">${t('disabled')}</div>`;

        const channelList = this.container.querySelector('#settings-channel-list');
        const channels = this.payload?.channels || [];
        channelList.innerHTML = channels.length
            ? channels.map((channel) => `<div class="settings-list-item"><strong>${escapeHtml(channel.name)}</strong><span>${this.statusText(channel.status)}</span></div>`).join('')
            : `<div class="settings-empty">${t('disabled')}</div>`;
    }

    statusText(status) {
        if (status === 'ready') return t('ready');
        if (status === 'needs_config') return t('needsConfig');
        return t('disabled');
    }

    async copyEnv() {
        const text = this.container.querySelector('#settings-env-preview')?.textContent || '';
        if (!text) return;
        await navigator.clipboard.writeText(text);
        eventBus.emit('toast:show', { message: t('copied'), type: 'success' });
    }

    applyLanguage() {
        const lang = getLanguage();
        document.documentElement.lang = lang;
        this.container?.querySelectorAll('[data-i18n]').forEach((node) => {
            node.textContent = t(node.dataset.i18n);
        });
        this.container?.querySelectorAll('[data-i18n-title]').forEach((node) => {
            node.title = t(node.dataset.i18nTitle);
        });
        const settingsButtons = [
            document.getElementById('settings-toggle'),
            document.getElementById('settings-toggle-2')
        ];
        settingsButtons.forEach((button) => {
            if (button) button.title = t('settings');
        });
        const dropdownLabel = document.querySelector('#settings-toggle-2 span:last-child');
        if (dropdownLabel) dropdownLabel.textContent = t('settings');
        this.applyGlobalLanguage();
    }

    applyGlobalLanguage() {
        const setText = (selector, value) => {
            const node = document.querySelector(selector);
            if (node) node.textContent = value;
        };
        const setTitle = (selector, value) => {
            const node = document.querySelector(selector);
            if (node) node.title = value;
        };
        setText('.sidebar-header h2', `🤖 ${t('sidebarAgents')}`);
        setTitle('#search-toggle', t('search'));
        setTitle('#filter-toggle', t('filter'));
        setTitle('#status-toggle', t('status'));
        setTitle('#metrics-toggle', t('metrics'));
        setTitle('#theme-toggle', t('skin'));
        setText('#search-toggle-2 span:last-child', t('search'));
        setText('#filter-toggle-2 span:last-child', t('filter'));
        setText('#status-toggle-2 span:last-child', t('status'));
        setText('#metrics-toggle-2 span:last-child', t('metrics'));
        setText('#theme-toggle-2 span:last-child', t('skin'));
        const input = document.getElementById('chat-input');
        if (input) input.placeholder = t('inputPlaceholder');
        const latest = document.getElementById('scroll-to-bottom-btn');
        if (latest) latest.textContent = `↓ ${t('latest')}`;
    }

    show() {
        this.visible = true;
        this.container?.classList.add('visible');
        this.loadSetup();
    }

    hide() {
        this.visible = false;
        this.container?.classList.remove('visible');
    }

    toggle() {
        this.visible ? this.hide() : this.show();
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export const settingsModule = new SettingsModule();
export { t };
