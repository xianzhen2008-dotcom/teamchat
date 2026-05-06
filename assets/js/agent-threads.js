import { apiService } from './services/api.js';

const CORE_AGENTS = ['main', 'pm', 'dev', 'qa', 'mail'];
const ALL_AGENTS = ['main', 'pm', 'dev', 'qa', 'mail', 'data', 'writer', 'finance', 'frontend', 'backend', 'devops', 'mobile', 'human'];
const DISPLAY = {
  main: '小龙虾',
  pm: '小皮皮',
  dev: '小玛丽',
  qa: '小测姐',
  mail: '小秘书',
  data: '小算盘',
  writer: '小文文',
  finance: '小财猫',
  frontend: '前小妹',
  backend: '后小妹',
  devops: '运小娘',
  mobile: '小姨妈',
  human: '老板'
};

const state = {
  currentAgent: 'main',
  currentView: 'all',
  currentThreadId: '',
  currentMessageId: '',
  summary: null,
  threads: [],
  thread: null,
  mailbox: null
};

function label(agentId) {
  return DISPLAY[agentId] || agentId;
}

function qs(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badgeClass(thread) {
  if (thread.overdueCount > 0) return 'danger';
  if (thread.needsDecision) return 'warn';
  if (thread.latestState === 'done') return 'ok';
  return '';
}

function formatTime(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function refreshSummary() {
  state.summary = await apiService.getAgentThreadSummary();
  renderSummary();
  renderDecisionQueue();
}

async function refreshThreads() {
  const options = {};
  if (state.currentView === 'dm' || state.currentView === 'group') options.threadType = state.currentView;
  if (state.currentView === 'decision') options.decision = true;
  if (state.currentView === 'overdue') options.overdue = true;
  const response = await apiService.listAgentThreads(state.currentAgent, options);
  state.threads = response.threads || [];
  state.mailbox = await apiService.getAgentMailbox(state.currentAgent);
  if (!state.currentThreadId && state.threads.length) {
    state.currentThreadId = state.threads[0].threadId;
  }
  renderThreadList();
  renderMailboxPanels();
  if (state.currentThreadId) {
    await loadThread(state.currentThreadId);
  } else {
    renderThread();
  }
}

function focusThread(threadId, messageId = '') {
  state.currentThreadId = threadId;
  state.currentMessageId = messageId;
  loadThread(threadId);
}

function renderQueueList(containerId, items, emptyText, formatter) {
  const container = qs(containerId);
  if (!items?.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  container.innerHTML = items.map((item) => formatter(item)).join('');
  container.querySelectorAll('.queue-item[data-thread-id]').forEach((item) => {
    item.addEventListener('click', () => focusThread(item.dataset.threadId, item.dataset.messageId || ''));
  });
}

function renderMailboxPanels() {
  const mailbox = state.mailbox;
  if (!mailbox) {
    renderQueueList('#mailbox-pending', [], '正在加载收件箱…', () => '');
    renderQueueList('#mailbox-done', [], '正在加载最近完成…', () => '');
    return;
  }
  renderQueueList(
    '#mailbox-pending',
    [...(mailbox.pending || []), ...(mailbox.overdue || [])],
    '当前没有待处理或超时线程。',
    (thread) => `
      <article class="queue-item ${thread.threadId === state.currentThreadId ? 'active' : ''}" data-thread-id="${escapeHtml(thread.threadId)}">
        <div>${escapeHtml(thread.title)}</div>
        <small>${escapeHtml(thread.threadType)} ｜ unread=${thread.unreadCount || 0} ｜ overdue=${thread.overdueCount || 0}</small>
      </article>
    `
  );
  renderQueueList(
    '#mailbox-done',
    mailbox.recentDone || [],
    '最近没有已完成线程。',
    (thread) => `
      <article class="queue-item ${thread.threadId === state.currentThreadId ? 'active' : ''}" data-thread-id="${escapeHtml(thread.threadId)}">
        <div>${escapeHtml(thread.title)}</div>
        <small>${escapeHtml(thread.threadType)} ｜ ${escapeHtml(thread.latestState || 'done')}</small>
      </article>
    `
  );
}

function renderDecisionQueue() {
  const queue = state.summary?.decisionQueue || [];
  renderQueueList(
    '#decision-queue',
    queue,
    '当前没有主控待决策线程。',
    (item) => `
      <article class="queue-item ${item.threadId === state.currentThreadId ? 'active' : ''}" data-thread-id="${escapeHtml(item.threadId)}">
        <div>${escapeHtml(item.threadTitle || item.threadId)}</div>
        <small>${escapeHtml(item.relatedTaskId || '无任务ID')} ｜ ${escapeHtml(item.nextOwner ? label(item.nextOwner) : '未指定接棒人')}</small>
        <small>${escapeHtml((item.text || '').slice(0, 140))}</small>
      </article>
    `
  );
}

function recommendNextAction(thread) {
  if (!thread) return '先从左侧选一条线程。';
  if (thread.overdueCount > 0) return '先处理超时项，至少把状态推进到 processing / blocked / done。';
  if (thread.needsDecision) return '这条线程需要小龙虾先拍板，再继续派单。';
  if (thread.unreadCount > 0) return '先确认已读，再明确谁接棒和预计完成时间。';
  if ((thread.latestState || '') === 'blocked') return '补 blocked 原因、介入人和 reviewAt。';
  if ((thread.latestState || '') === 'processing') return '补 eta 和证据引用，避免线程空转。';
  return '这条线程当前比较平稳，可以继续推进下一条主线。';
}

function renderThreadOverview() {
  const node = qs('#thread-overview');
  const thread = state.thread;
  if (!thread) {
    node.innerHTML = '<div class="empty">选中线程后，这里会显示接棒人、SLA 和升级状态。</div>';
    return;
  }
  const latest = thread.messages?.[thread.messages.length - 1] || null;
  const latestStateByParticipant = latest?.stateByParticipant || {};
  const nextOwner = latest?.nextOwner || thread.nextOwner || '';
  const overdueCount = Object.values(latestStateByParticipant).filter((info) => info?.state && ['unread', 'read', 'processing', 'blocked'].includes(info.state) && (info.reviewAt || info.eta || latest?.slaDueAt)).length ? thread.overdueCount || 0 : thread.overdueCount || 0;
  const eta = latestStateByParticipant[nextOwner]?.eta || latestStateByParticipant[nextOwner]?.reviewAt || latest?.slaDueAt || '';
  const lastSender = latest?.sender ? label(latest.sender) : '暂无';
  const cards = [
    {
      title: '当前接棒人',
      value: nextOwner ? label(nextOwner) : '未指定',
      meta: nextOwner ? '这条线程下一步默认由她接。' : '建议尽快指定接棒人。'
    },
    {
      title: '线程状态',
      value: thread.escalationState || 'none',
      meta: thread.needsDecision ? '已进入主控待决策链。' : `latest=${thread.latestState || 'done'}`
    },
    {
      title: 'SLA / 时限',
      value: eta ? formatTime(eta) : '未写',
      meta: overdueCount > 0 ? `当前已有 ${overdueCount} 个超时项。` : '当前没有超时项。'
    },
    {
      title: '建议下一步',
      value: recommendNextAction(thread),
      meta: `最近发言：${lastSender}`
    }
  ];
  node.innerHTML = cards.map((card) => `
    <article class="detail-card">
      <div class="thread-meta">${escapeHtml(card.title)}</div>
      <strong>${escapeHtml(card.value)}</strong>
      <div class="tiny">${escapeHtml(card.meta)}</div>
    </article>
  `).join('');
}

async function loadThread(threadId) {
  state.currentThreadId = threadId;
  state.thread = await apiService.getAgentThread(threadId);
  state.currentMessageId = '';
  renderThreadList();
  renderThread();
}

function renderSummary() {
  const container = qs('#summary-grid');
  const summary = state.summary;
  if (!summary) {
    container.innerHTML = '<div class="summary-card">正在加载…</div>';
    return;
  }
  const activeMailbox = summary.mailboxes?.[state.currentAgent] || {};
  const cards = [
    { title: '当前视角', value: label(state.currentAgent), meta: `未读 ${activeMailbox.unreadCount || 0} / 超时 ${activeMailbox.overdueCount || 0}` },
    { title: '线程总数', value: `${summary.threadCount || 0}`, meta: `DM ${summary.dmCount || 0} / Group ${summary.groupCount || 0}` },
    { title: '主控待决策', value: `${(summary.decisionQueue || []).length}`, meta: '自动升级给小龙虾' },
    { title: '最近心跳', value: activeMailbox.heartbeat?.at ? formatTime(activeMailbox.heartbeat.at) : '暂无', meta: activeMailbox.heartbeat?.note || '还没有 keepalive 记录' }
  ];
  container.innerHTML = cards.map((card) => `
    <article class="summary-card">
      <div class="thread-meta">${escapeHtml(card.title)}</div>
      <div class="metric">${escapeHtml(card.value)}</div>
      <div class="tiny">${escapeHtml(card.meta)}</div>
    </article>
  `).join('');
}

function renderThreadList() {
  const container = qs('#thread-list');
  if (!state.threads.length) {
    container.innerHTML = '<div class="empty">当前筛选下没有线程。</div>';
    return;
  }
  container.innerHTML = state.threads.map((thread) => `
    <article class="thread-item ${thread.threadId === state.currentThreadId ? 'active' : ''}" data-thread-id="${escapeHtml(thread.threadId)}">
      <div class="thread-title">${escapeHtml(thread.title)}</div>
      <div class="thread-meta">${escapeHtml(thread.threadType)} ｜ ${thread.participants.map(label).join(' / ')}</div>
      <div class="thread-meta">${escapeHtml(thread.latestMessagePreview || '暂无消息')}</div>
      <div class="badge-row">
        <span class="badge ${badgeClass(thread)}">${thread.latestState}</span>
        ${thread.unreadCount ? `<span class="badge warn">${thread.unreadCount} unread</span>` : ''}
        ${thread.overdueCount ? `<span class="badge danger">${thread.overdueCount} overdue</span>` : ''}
        ${thread.relatedTaskId ? `<span class="badge">${escapeHtml(thread.relatedTaskId)}</span>` : ''}
      </div>
    </article>
  `).join('');
  container.querySelectorAll('.thread-item').forEach((item) => {
    item.addEventListener('click', () => loadThread(item.dataset.threadId));
  });
}

function renderThread() {
  const thread = state.thread;
  qs('#thread-title').textContent = thread ? thread.title : '选择线程';
  qs('#thread-meta').textContent = thread
    ? `${thread.threadType} ｜ ${thread.participants.map(label).join(' / ')} ｜ 更新于 ${formatTime(thread.updatedAt)}`
    : '左侧选中一个 DM 或 Group 线程后，这里会展示完整上下文。';
  qs('#thread-badges').innerHTML = thread ? `
    <span class="badge">${thread.threadId}</span>
    ${thread.relatedTaskId ? `<span class="badge">${thread.relatedTaskId}</span>` : ''}
    <span class="badge ${thread.escalationState === 'pending_main' ? 'warn' : thread.escalationState === 'resolved' ? 'ok' : ''}">${thread.escalationState || 'none'}</span>
  ` : '';
  renderThreadOverview();

  const messages = qs('#messages');
  if (!thread) {
    messages.innerHTML = '<div class="empty">先从左侧选一条线程，我们再继续。</div>';
    return;
  }
  messages.innerHTML = thread.messages.length ? thread.messages.map((message) => `
    <article class="msg" data-message-id="${escapeHtml(message.messageId)}">
      <div class="thread-header">
        <div>
          <div class="thread-title">${escapeHtml(label(message.sender))}</div>
          <div class="thread-meta">${escapeHtml(message.sourceKind)} ｜ ${escapeHtml(formatTime(message.createdAt))}</div>
        </div>
        <div class="badge-row">
          ${message.requiresDecision ? '<span class="badge warn">需要拍板</span>' : ''}
          ${message.nextOwner ? `<span class="badge">${escapeHtml(label(message.nextOwner))}</span>` : ''}
        </div>
      </div>
      <div class="body">${escapeHtml(message.body)}</div>
      <div class="tiny">messageId: ${escapeHtml(message.messageId)}</div>
      <div class="state-row">
        ${Object.entries(message.stateByParticipant || {}).map(([participant, info]) => `
          <span class="badge ${info.state === 'done' ? 'ok' : info.state === 'blocked' ? 'danger' : info.state === 'unread' ? 'warn' : ''}">
            ${escapeHtml(label(participant))}: ${escapeHtml(info.state || 'unknown')}
          </span>
        `).join('')}
      </div>
    </article>
  `).join('') : '<div class="empty">这条线程还没有消息。</div>';

  messages.querySelectorAll('.msg').forEach((item) => {
    item.addEventListener('click', () => {
      state.currentMessageId = item.dataset.messageId;
      messages.querySelectorAll('.msg').forEach((node) => node.style.outline = '');
      item.style.outline = '1px solid rgba(101,201,255,0.65)';
    });
  });

  const participantSelect = qs('#state-participant');
  participantSelect.innerHTML = thread.participants.map((participant) => `
    <option value="${escapeHtml(participant)}">${escapeHtml(label(participant))}</option>
  `).join('');
}

function setFeedback(text, type = '') {
  const node = qs('#action-feedback');
  node.textContent = text || '';
  node.className = type ? `feedback ${type}` : 'feedback';
}

async function createThread() {
  const participants = qs('#new-participants').value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const payload = {
    title: qs('#new-title').value.trim(),
    threadType: qs('#new-type').value,
    participants,
    relatedTaskId: qs('#new-task').value.trim()
  };
  const response = await apiService.createAgentThread(payload);
  state.currentThreadId = response.thread.threadId;
  setFeedback(`已创建线程：${payload.title || response.thread.threadId}`);
  await refreshSummary();
  await refreshThreads();
}

async function sendMessage() {
  if (!state.currentThreadId) return;
  await apiService.postAgentThreadMessage({
    threadId: state.currentThreadId,
    sender: qs('#sender-select').value,
    body: qs('#message-body').value,
    sourceKind: qs('#source-kind').value,
    relatedTaskId: qs('#message-task').value.trim(),
    nextOwner: qs('#message-next-owner').value.trim()
  });
  qs('#message-body').value = '';
  qs('#message-task').value = '';
  qs('#message-next-owner').value = '';
  setFeedback('消息已写入线程总线。');
  await refreshSummary();
  await loadThread(state.currentThreadId);
}

async function updateState() {
  if (!state.currentThreadId) return;
  const targetMessageId = state.currentMessageId || state.thread?.messages?.[state.thread.messages.length - 1]?.messageId;
  if (!targetMessageId) {
    setFeedback('当前线程还没有消息，暂时没有可更新的状态。', 'warn');
    return;
  }
  const stateValue = qs('#state-value').value;
  const note = qs('#state-note').value.trim();
  const eta = qs('#state-eta').value.trim();
  const evidenceRef = qs('#state-evidence').value.trim();
  await apiService.updateAgentThreadState({
    threadId: state.currentThreadId,
    messageId: targetMessageId,
    participant: qs('#state-participant').value,
    state: stateValue,
    note,
    nextAction: stateValue === 'processing' ? note : '',
    blockedReason: stateValue === 'blocked' ? note : '',
    eta: stateValue === 'processing' ? eta : '',
    reviewAt: stateValue === 'blocked' ? eta : '',
    evidenceRef
  });
  qs('#state-note').value = '';
  qs('#state-eta').value = '';
  qs('#state-evidence').value = '';
  setFeedback(`已把线程状态更新为 ${stateValue}。`);
  await refreshSummary();
  await loadThread(state.currentThreadId);
}

async function sendHeartbeat() {
  try {
    await apiService.heartbeatAgentThread(state.currentAgent, 'heartbeat: checked inbox, no actionable items');
    setFeedback(`已为 ${label(state.currentAgent)} 写入 keepalive。`);
    await refreshSummary();
    await refreshThreads();
  } catch (error) {
    if (error?.data?.code === 'MAIN_KEEPALIVE_BLOCKED_BY_MAILBOX') {
      const details = error.data.details || {};
      setFeedback(
        `小龙虾当前还有待处理线程，不能只写 keepalive。未读 ${details.unreadCount || 0} / 超时 ${details.overdueCount || 0} / 待拍板 ${details.decisionCount || 0}，请先处理线程再回写。`,
        'danger'
      );
      await refreshSummary();
      await refreshThreads();
      return;
    }
    setFeedback(`写 keepalive 失败：${error.message || 'unknown error'}`, 'danger');
  }
}

function wireControls() {
  const agentFilter = qs('#agent-filter');
  agentFilter.innerHTML = CORE_AGENTS.map((agentId) => `
    <option value="${agentId}">${label(agentId)}</option>
  `).join('');
  agentFilter.value = state.currentAgent;
  agentFilter.addEventListener('change', async (event) => {
    state.currentAgent = event.target.value;
    await refreshSummary();
    await refreshThreads();
  });

  qs('#view-filter').addEventListener('change', async (event) => {
    state.currentView = event.target.value;
    await refreshThreads();
  });

  qs('#refresh-btn').addEventListener('click', async () => {
    await refreshSummary();
    await refreshThreads();
  });
  qs('#create-thread-btn').addEventListener('click', createThread);
  qs('#send-message-btn').addEventListener('click', sendMessage);
  qs('#update-state-btn').addEventListener('click', updateState);
  qs('#heartbeat-btn').addEventListener('click', sendHeartbeat);

  const senderSelect = qs('#sender-select');
  senderSelect.innerHTML = ALL_AGENTS.map((agentId) => `
    <option value="${agentId}">${label(agentId)}</option>
  `).join('');
  senderSelect.value = 'human';
}

async function init() {
  wireControls();
  await refreshSummary();
  await refreshThreads();
}

init().catch((error) => {
  console.error('[AgentThreads] init failed:', error);
  qs('#messages').innerHTML = `<div class="empty">加载失败：${escapeHtml(error.message || 'unknown error')}</div>`;
});
