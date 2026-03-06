const defaultBaseUrl = localStorage.getItem('cursor2api-admin-base-url') || window.location.origin;

const state = {
  baseUrl: defaultBaseUrl,
  endpoints: [],
  requests: [],
  stats: null,
  selectedRequest: null,
  currentView: getInitialView(),
  mode: 'live',
};

const elements = {
  baseUrlInput: document.querySelector('#base-url'),
  saveBaseUrlButton: document.querySelector('#save-base-url'),
  loadDemoButton: document.querySelector('#load-demo'),
  refreshAllButton: document.querySelector('#refresh-all'),
  statusPill: document.querySelector('#status-pill'),
  statsGrid: document.querySelector('#stats-grid'),
  endpointsBody: document.querySelector('#endpoints-body'),
  requestsBody: document.querySelector('#requests-body'),
  detailPanel: document.querySelector('#detail-panel'),
  filterPath: document.querySelector('#filter-path'),
  filterStatus: document.querySelector('#filter-status'),
  statCardTemplate: document.querySelector('#stat-card-template'),
  viewLinks: Array.from(document.querySelectorAll('[data-view-link]')),
  pageSections: Array.from(document.querySelectorAll('[data-view]')),
};

elements.baseUrlInput.value = state.baseUrl;

elements.saveBaseUrlButton.addEventListener('click', () => {
  state.baseUrl = normalizeBaseUrl(elements.baseUrlInput.value);
  localStorage.setItem('cursor2api-admin-base-url', state.baseUrl);
  refresh();
});

elements.loadDemoButton.addEventListener('click', () => {
  state.mode = 'demo';
  hydrateWithDemoData();
  renderAll();
  setStatus('演示模式', 'is-warning');
});

elements.refreshAllButton.addEventListener('click', () => refresh());
elements.filterPath.addEventListener('input', () => renderRequests());
elements.filterStatus.addEventListener('change', () => renderRequests());
elements.viewLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const nextView = link.dataset.viewLink;
    if (!nextView) {
      return;
    }

    setCurrentView(nextView);
  });
});

window.addEventListener('hashchange', () => {
  setCurrentView(getViewFromHash(), { updateHash: false });
});

refresh();
renderView();

async function refresh() {
  state.mode = 'live';
  setStatus('加载中', 'is-loading');

  try {
    const [rootPayload, healthPayload, endpointsPayload, statsPayload, requestsPayload] = await Promise.all([
      fetchJson('/'),
      fetchJson('/health'),
      fetchJson('/admin/api/endpoints', { optional: true }),
      fetchJson('/admin/api/stats', { optional: true }),
      fetchJson('/admin/api/requests', { optional: true }),
    ]);

    state.endpoints = buildEndpoints(endpointsPayload, rootPayload);
    state.stats = buildStats(statsPayload, healthPayload, state.endpoints);
    state.requests = buildRequests(requestsPayload);
    state.selectedRequest = state.requests[0] ?? null;
    renderAll();

    const hasAdminApis = Boolean(endpointsPayload || statsPayload || requestsPayload);
    setStatus(hasAdminApis ? '已连接' : '部分连接', hasAdminApis ? 'is-ok' : 'is-warning');
  } catch (error) {
    hydrateWithDemoData();
    renderAll();
    setStatus('接口未就绪，已回退演示数据', 'is-warning');
    console.error(error);
  }
}

async function fetchJson(path, options = {}) {
  const requestUrl = new URL(path, state.baseUrl).toString();
  const response = await fetch(requestUrl);

  if (!response.ok) {
    if (options.optional && (response.status === 404 || response.status === 405)) {
      return null;
    }

    throw new Error(`请求失败: ${requestUrl} -> ${response.status}`);
  }

  return response.json();
}

function buildEndpoints(endpointsPayload, rootPayload) {
  if (Array.isArray(endpointsPayload?.items)) {
    return endpointsPayload.items;
  }

  const rootEndpoints = rootPayload?.endpoints ?? {};
  return Object.entries(rootEndpoints).map(([name, definition]) => {
    const [method = 'GET', path = '/'] = String(definition).split(' ');
    return {
      name,
      method,
      path,
      source: 'root',
    };
  });
}

function buildStats(statsPayload, healthPayload, endpoints) {
  if (statsPayload) {
    return statsPayload;
  }

  return {
    totalRequests: 0,
    requests24h: 0,
    successRate: 'N/A',
    avgLatencyMs: 'N/A',
    latestError: '尚未接入 /admin/api/stats',
    healthStatus: healthPayload?.status ?? 'unknown',
    version: healthPayload?.version ?? 'unknown',
    endpointCount: endpoints.length,
  };
}

function buildRequests(requestsPayload) {
  if (Array.isArray(requestsPayload?.items)) {
    return requestsPayload.items;
  }

  return [];
}

function hydrateWithDemoData() {
  state.endpoints = [
    { name: 'anthropic_messages', method: 'POST', path: '/v1/messages', source: 'demo' },
    { name: 'openai_chat', method: 'POST', path: '/v1/chat/completions', source: 'demo' },
    { name: 'models', method: 'GET', path: '/v1/models', source: 'demo' },
    { name: 'health', method: 'GET', path: '/health', source: 'demo' },
  ];

  state.stats = {
    totalRequests: 1824,
    requests24h: 264,
    successRate: '98.9%',
    avgLatencyMs: 1284,
    latestError: '上游 429 限流（最近 2 次）',
    healthStatus: 'ok',
    version: '2.0.0',
    endpointCount: state.endpoints.length,
  };

  state.requests = [
    createDemoRequest('req_1001', '/v1/messages', 200, 1498, 'anthropic/claude-sonnet-4.6', 'POST'),
    createDemoRequest('req_1002', '/v1/chat/completions', 200, 921, 'anthropic/claude-sonnet-4.6', 'POST'),
    createDemoRequest('req_1003', '/v1/messages', 429, 322, 'anthropic/claude-sonnet-4.6', 'POST'),
    createDemoRequest('req_1004', '/health', 200, 21, 'n/a', 'GET'),
  ];

  state.selectedRequest = state.requests[0];
}

function createDemoRequest(id, path, status, latencyMs, model, method) {
  return {
    id,
    timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    method,
    path,
    status,
    latencyMs,
    model,
    clientIp: '127.0.0.1',
    stream: path.includes('messages'),
    error: status >= 400 ? 'rate_limited' : '',
  };
}

function renderAll() {
  renderStats();
  renderEndpoints();
  renderRequests();
  renderDetail();
  renderView();
}

function renderStats() {
  const stats = state.stats ?? {};
  const cards = [
    { label: '总请求数', value: stats.totalRequests ?? '-', note: '累计请求量' },
    { label: '24h 请求', value: stats.requests24h ?? '-', note: '最近 24 小时' },
    { label: '成功率', value: stats.successRate ?? '-', note: '2xx / 全部请求' },
    { label: '平均耗时', value: formatLatency(stats.avgLatencyMs), note: '单位 ms' },
    { label: '健康状态', value: stats.healthStatus ?? '-', note: `版本 ${stats.version ?? '-'}` },
    { label: '接口数量', value: stats.endpointCount ?? state.endpoints.length, note: stats.latestError ?? '暂无错误' },
  ];

  elements.statsGrid.innerHTML = '';
  cards.forEach((card) => {
    const fragment = elements.statCardTemplate.content.cloneNode(true);
    fragment.querySelector('.stat-label').textContent = card.label;
    fragment.querySelector('.stat-value').textContent = String(card.value);
    fragment.querySelector('.stat-note').textContent = card.note;
    elements.statsGrid.appendChild(fragment);
  });
}

function renderEndpoints() {
  elements.endpointsBody.innerHTML = state.endpoints.map((endpoint) => `
    <tr>
      <td>${escapeHtml(endpoint.name ?? '-')}</td>
      <td>${escapeHtml(endpoint.method ?? '-')}</td>
      <td><code>${escapeHtml(endpoint.path ?? '-')}</code></td>
      <td>${escapeHtml(endpoint.source ?? 'admin-api')}</td>
    </tr>
  `).join('');
}

function renderRequests() {
  const filteredRequests = state.requests.filter((request) => {
    const pathFilter = elements.filterPath.value.trim().toLowerCase();
    const statusFilter = elements.filterStatus.value;
    const matchesPath = !pathFilter || String(request.path).toLowerCase().includes(pathFilter);
    const matchesStatus = !statusFilter || String(request.status).startsWith(statusFilter);
    return matchesPath && matchesStatus;
  });

  if (filteredRequests.length === 0) {
    elements.requestsBody.innerHTML = '<tr><td colspan="6" class="muted">暂无记录，请接入 `/admin/api/requests` 或切换演示数据。</td></tr>';
    return;
  }

  elements.requestsBody.innerHTML = filteredRequests.map((request) => `
    <tr data-request-id="${escapeHtml(request.id)}">
      <td>${escapeHtml(formatDateTime(request.timestamp))}</td>
      <td>${escapeHtml(request.method ?? '-')}</td>
      <td><code>${escapeHtml(request.path ?? '-')}</code></td>
      <td>${renderStatusBadge(request.status)}</td>
      <td>${escapeHtml(formatLatency(request.latencyMs))}</td>
      <td>${escapeHtml(request.model ?? '-')}</td>
    </tr>
  `).join('');

  Array.from(elements.requestsBody.querySelectorAll('tr[data-request-id]')).forEach((row) => {
    row.addEventListener('click', () => {
      const requestId = row.dataset.requestId;
      state.selectedRequest = state.requests.find((request) => request.id === requestId) ?? null;
      renderDetail();
      highlightSelectedRequest();
      setCurrentView('details');
    });
  });

  highlightSelectedRequest();
}

function renderDetail() {
  if (!state.selectedRequest) {
    elements.detailPanel.classList.add('empty');
    elements.detailPanel.textContent = '请选择一条调用记录查看详情。';
    return;
  }

  const request = state.selectedRequest;
  elements.detailPanel.classList.remove('empty');
  elements.detailPanel.innerHTML = `
    <div class="detail-grid">
      ${renderDetailItem('请求 ID', request.id)}
      ${renderDetailItem('时间', formatDateTime(request.timestamp))}
      ${renderDetailItem('方法', request.method)}
      ${renderDetailItem('路径', request.path)}
      ${renderDetailItem('状态码', request.status)}
      ${renderDetailItem('耗时', formatLatency(request.latencyMs))}
      ${renderDetailItem('模型', request.model ?? 'n/a')}
      ${renderDetailItem('客户端 IP', request.clientIp ?? 'n/a')}
      ${renderDetailItem('流式', request.stream ? '是' : '否')}
      ${renderDetailItem('错误摘要', request.error || '无')}
    </div>
    <p class="hint">建议后端最终返回字段：id、timestamp、method、path、status、latencyMs、model、clientIp、stream、error。</p>
  `;
}

function renderDetailItem(label, value) {
  return `
    <div class="detail-item">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <strong>${escapeHtml(String(value ?? '-'))}</strong>
    </div>
  `;
}

function renderStatusBadge(status) {
  const value = Number(status);
  const variant = value >= 500 ? 'error' : value >= 400 ? 'warn' : 'success';
  return `<span class="badge ${variant}">${escapeHtml(String(status))}</span>`;
}

function setStatus(text, className) {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${className}`;
}

function renderView() {
  elements.pageSections.forEach((section) => {
    const isActive = section.dataset.view === state.currentView;
    section.hidden = !isActive;
    section.classList.toggle('is-active', isActive);
  });

  elements.viewLinks.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.viewLink === state.currentView);
  });
}

function setCurrentView(view, options = {}) {
  const nextView = normalizeView(view);
  state.currentView = nextView;
  renderView();

  if (options.updateHash !== false) {
    window.location.hash = nextView;
  }
}

function highlightSelectedRequest() {
  Array.from(elements.requestsBody.querySelectorAll('tr[data-request-id]')).forEach((row) => {
    row.classList.toggle('is-active', row.dataset.requestId === state.selectedRequest?.id);
  });
}

function getInitialView() {
  return getViewFromHash();
}

function getViewFromHash() {
  return normalizeView(window.location.hash.slice(1));
}

function normalizeView(view) {
  return ['overview', 'endpoints', 'requests', 'details'].includes(view) ? view : 'overview';
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/$/, '') || window.location.origin;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return '-';
  }

  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function formatLatency(value) {
  if (value === null || value === undefined || value === 'N/A') {
    return String(value ?? '-');
  }

  return `${value} ms`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
