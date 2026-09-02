let dashboardBetaLoading = false;
let dashboardBetaLastLoadedAt = 0;
let dashboardBetaFollowUpTimer = null;
let dashboardBetaResultStats = null;
let dashboardBetaSelectedPeriod = 'today';

function isDashboardBetaActive() {
  return document.getElementById('view-dashboard-beta')?.classList.contains('active') === true;
}

function formatDashboardBetaDateTime(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function dashboardBetaConnectionState(connection, labels = {}) {
  const status = String(connection?.status || '').trim();
  if (['connected', 'configured'].includes(status)) {
    return { state: 'ready', label: labels.ready || '연결 확인됨' };
  }
  if (status === 'not_configured') {
    return { state: 'muted', label: labels.notConfigured || '미설정' };
  }
  return { state: 'attention', label: labels.attention || '확인 필요' };
}

function createDashboardBetaReadinessButton({ label, state, view, tab }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.dashboardBetaState = state;
  button.dataset.dashboardBetaNav = view;
  if (tab) button.dataset.dashboardBetaTab = tab;

  const dot = document.createElement('span');
  dot.className = 'dashboard-beta-state-dot';
  dot.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.textContent = label;
  button.append(dot, copy);
  return button;
}

function renderDashboardBetaReadiness(overview) {
  const container = document.getElementById('dashboard-beta-readiness-items');
  const error = document.getElementById('dashboard-beta-readiness-error');
  if (!container) return;
  container.innerHTML = '';
  error?.setAttribute('hidden', '');

  const connections = overview?.connections || {};
  const naver = dashboardBetaConnectionState(connections.naver, {
    ready: '네이버 로그인 확인됨', attention: '네이버 로그인 확인 필요', notConfigured: '네이버 미설정'
  });
  const wordpress = dashboardBetaConnectionState(connections.wordpress, {
    ready: 'WordPress 연결 확인됨', attention: 'WordPress 연결 확인 필요', notConfigured: 'WordPress 미사용'
  });
  const remaining = Number(overview?.usage?.remaining);
  const unlimited = overview?.usage?.mode === 'unlimited' || remaining < 0;
  const usageLabel = unlimited
    ? '기본 발행 무제한'
    : Number.isFinite(remaining) ? `기본 ${Math.max(0, remaining)}회 남음` : '이용 횟수 확인 필요';

  container.append(
    createDashboardBetaReadinessButton({ ...naver, view: 'settings', tab: 'naver-blog' }),
    createDashboardBetaReadinessButton({ ...wordpress, view: 'settings', tab: 'naver-blog' }),
    createDashboardBetaReadinessButton({
      label: usageLabel,
      state: Number.isFinite(remaining) || unlimited ? (remaining === 0 ? 'attention' : 'ready') : 'attention',
      view: 'account'
    })
  );
}

function renderDashboardBetaReadinessError() {
  const container = document.getElementById('dashboard-beta-readiness-items');
  const error = document.getElementById('dashboard-beta-readiness-error');
  if (container) container.innerHTML = '';
  if (error) error.hidden = false;
}

function dashboardBetaFlowCopy(flow = {}) {
  const state = String(flow.state || 'idle');
  if (flow.busy || ['selecting', 'running'].includes(state)) {
    return {
      state: 'running', badge: '발행 중',
      subject: flow.subject || '글감을 처리하고 있습니다.',
      message: flow.message || '작성과 발행이 끝날 때까지 잠시 기다려 주세요.'
    };
  }
  if (['failed', 'needs_attention', 'blocked'].includes(state)) {
    return {
      state: 'attention', badge: '확인 필요',
      subject: flow.subject || '확인이 필요한 작업이 있습니다.',
      message: flow.message || '상세 상태를 확인한 뒤 다시 시도해 주세요.'
    };
  }
  if (state === 'completed') {
    return {
      state: 'complete', badge: '처리 완료',
      subject: flow.subject || '최근 글감 처리를 마쳤습니다.',
      message: flow.message || flow.result_status || '다음 발행을 준비할 수 있습니다.'
    };
  }
  return {
    state: 'idle', badge: '대기 중',
    subject: '현재 실행 중인 글이 없습니다.',
    message: '대기열에서 바로 실행하거나 연속 발행을 설정할 수 있습니다.'
  };
}

function renderDashboardBetaOperations(overview) {
  const flowCopy = dashboardBetaFlowCopy(overview?.flow);
  const flowBadge = document.getElementById('dashboard-beta-flow-badge');
  const flowIndicator = document.getElementById('dashboard-beta-flow-indicator');
  if (flowBadge) {
    flowBadge.dataset.state = flowCopy.state;
    flowBadge.textContent = flowCopy.badge;
  }
  if (flowIndicator) flowIndicator.dataset.state = flowCopy.state;
  setText('dashboard-beta-flow-subject', flowCopy.subject);
  setText('dashboard-beta-flow-message', flowCopy.message);

  const automation = overview?.automation || {};
  const nextAt = formatDashboardBetaDateTime(automation.next_processing_at);
  const automationBadge = document.getElementById('dashboard-beta-automation-badge');
  let automationState = 'off';
  let automationLabel = '사용 안 함';
  let nextTime = '연속 발행이 꺼져 있습니다.';
  let nextCopy = '원하는 시간과 간격을 설정하면 대기열의 글을 차례로 처리합니다.';
  if (automation.enabled && !automation.effective_enabled) {
    automationState = 'attention';
    automationLabel = '실행 제한';
    nextTime = '현재 환경에서는 자동 실행되지 않습니다.';
    nextCopy = '설정은 저장되어 있으며 실행 가능 환경에서 다시 시작됩니다.';
  } else if (automation.effective_enabled) {
    automationState = 'on';
    automationLabel = '사용 중';
    nextTime = nextAt || '다음 실행 시간을 계산하고 있습니다.';
    nextCopy = nextAt
      ? `${Number(automation.interval_minutes) || '-'}분 간격으로 대기열을 이어서 처리합니다.`
      : '발행 대기 글감이 생기면 다음 실행 일정을 확인할 수 있습니다.';
  }
  if (automationBadge) {
    automationBadge.dataset.state = automationState;
    automationBadge.textContent = automationLabel;
  }
  setText('dashboard-beta-next-time', nextTime);
  setText('dashboard-beta-next-copy', nextCopy);

  const queue = overview?.queue || {};
  setText('dashboard-beta-ready-count', `${Number(queue.ready_count) || 0}건`);
  setText('dashboard-beta-saved-count', `${Number(queue.saved_count) || 0}건`);
  setText('dashboard-beta-running-count', `${Number(queue.running_count) || 0}건`);
  renderDashboardBetaQueue(queue.next_items);
  const error = document.getElementById('dashboard-beta-operations-error');
  if (error) error.hidden = true;

  if (dashboardBetaFollowUpTimer) clearTimeout(dashboardBetaFollowUpTimer);
  dashboardBetaFollowUpTimer = null;
  if (overview?.flow?.busy === true && isDashboardBetaActive()) {
    dashboardBetaFollowUpTimer = setTimeout(() => {
      if (isDashboardBetaActive()) void loadDashboardBeta({ force: true });
    }, 3000);
  }
}

function renderDashboardBetaQueue(items) {
  const container = document.getElementById('dashboard-beta-queue-list');
  if (!container) return;
  container.innerHTML = '';
  const nextItems = Array.isArray(items) ? items.slice(0, 3) : [];
  if (nextItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-beta-empty';
    empty.textContent = '발행을 기다리는 글감이 없습니다. 새 글감을 준비해 보세요.';
    container.appendChild(empty);
    return;
  }

  const platformLabels = { naver: '네이버', wordpress: 'WordPress' };
  const statusLabels = { publish: '즉시 발행', draft: '임시 저장', schedule: '예약 발행' };
  nextItems.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'dashboard-beta-queue-item';
    const order = document.createElement('span');
    order.className = 'dashboard-beta-queue-order';
    order.textContent = String(index + 1);
    const copy = document.createElement('div');
    copy.className = 'dashboard-beta-queue-copy';
    const subject = document.createElement('strong');
    subject.textContent = String(item?.subject || '제목 없는 글감');
    const meta = document.createElement('span');
    const platforms = (Array.isArray(item?.targets) ? item.targets : [])
      .map(target => platformLabels[target] || target)
      .join(' · ');
    const estimate = formatDashboardBetaDateTime(item?.processing_estimate_at);
    meta.textContent = [platforms || '발행 대상 확인 필요', statusLabels[item?.post_status] || '즉시 발행', estimate || '처리 시각 미정']
      .join(' · ');
    copy.append(subject, meta);
    row.append(order, copy);
    container.appendChild(row);
  });
}

function renderDashboardBetaOperationsError() {
  const flowBadge = document.getElementById('dashboard-beta-flow-badge');
  const flowIndicator = document.getElementById('dashboard-beta-flow-indicator');
  if (flowBadge) {
    flowBadge.dataset.state = 'attention';
    flowBadge.textContent = '확인 불가';
  }
  if (flowIndicator) flowIndicator.dataset.state = 'attention';
  setText('dashboard-beta-flow-subject', '발행 현황을 불러오지 못했습니다.');
  setText('dashboard-beta-flow-message', '새로고침하거나 잠시 후 다시 시도해 주세요.');
  setText('dashboard-beta-ready-count', '-');
  setText('dashboard-beta-saved-count', '-');
  setText('dashboard-beta-running-count', '-');
  renderDashboardBetaQueue([]);
  const error = document.getElementById('dashboard-beta-operations-error');
  if (error) error.hidden = false;
}

function renderDashboardBetaRecentResults(items) {
  const container = document.getElementById('dashboard-beta-recent-results-list');
  if (!container) return;
  container.innerHTML = '';
  const results = Array.isArray(items) ? items.slice(0, 5) : [];
  if (results.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-beta-empty';
    empty.textContent = '아직 기록된 발행 결과가 없습니다.';
    container.appendChild(empty);
    return;
  }
  const platformLabels = { naver: '네이버', wordpress: 'WordPress' };
  const statusLabels = { draft: '임시 저장', schedule: '예약 등록', publish: '공개 발행' };
  results.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'dashboard-beta-result-item';
    const copy = document.createElement('div');
    const subject = document.createElement('strong');
    subject.textContent = String(item?.subject || '제목 없는 글');
    const meta = document.createElement('span');
    meta.textContent = [
      platformLabels[item?.platform] || item?.platform || '플랫폼 확인 필요',
      statusLabels[item?.post_status] || '처리 완료',
      formatDashboardBetaDateTime(item?.occurred_at) || '시각 확인 불가'
    ].join(' · ');
    copy.append(subject, meta);
    row.appendChild(copy);
    if (item?.result_url) {
      const link = document.createElement('a');
      link.href = item.result_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '결과 보기';
      row.appendChild(link);
    }
    container.appendChild(row);
  });
}

function renderDashboardBetaStatsPeriod() {
  const stats = dashboardBetaResultStats;
  const period = stats?.periods?.[dashboardBetaSelectedPeriod];
  document.querySelectorAll('[data-dashboard-beta-period]').forEach((button) => {
    const selected = button.dataset.dashboardBetaPeriod === dashboardBetaSelectedPeriod;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  setText('dashboard-beta-processed-count', stats?.available === false ? '-' : `${Number(period?.processed_count) || 0}건`);
  setText('dashboard-beta-published-count', stats?.available === false ? '-' : `${Number(period?.published_count) || 0}건`);
}

function renderDashboardBetaResultStats(stats) {
  dashboardBetaResultStats = stats || null;
  renderDashboardBetaStatsPeriod();
  renderDashboardBetaRecentResults(stats?.available === false ? [] : stats?.recent_results);
  const error = document.getElementById('dashboard-beta-stats-error');
  if (error) {
    error.textContent = stats?.available === false
      ? '발행 기록 기능을 사용할 수 없어 통계를 확인하지 못했습니다.'
      : '발행 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    error.hidden = stats?.available !== false;
  }
}

function renderDashboardBetaResultStatsError() {
  dashboardBetaResultStats = null;
  setText('dashboard-beta-processed-count', '-');
  setText('dashboard-beta-published-count', '-');
  renderDashboardBetaRecentResults([]);
  const error = document.getElementById('dashboard-beta-stats-error');
  if (error) {
    error.textContent = '발행 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    error.hidden = false;
  }
}

function bindDashboardBetaActions() {
  const view = document.getElementById('view-dashboard-beta');
  if (!view || view.dataset.actionsBound === 'true') return;
  view.dataset.actionsBound = 'true';
  view.addEventListener('click', (event) => {
    const periodButton = event.target.closest('[data-dashboard-beta-period]');
    if (periodButton) {
      dashboardBetaSelectedPeriod = periodButton.dataset.dashboardBetaPeriod === 'week' ? 'week' : 'today';
      renderDashboardBetaStatsPeriod();
      return;
    }
    const target = event.target.closest('[data-dashboard-beta-nav]');
    if (!target) return;
    void navigateTo(target.dataset.dashboardBetaNav, target.dataset.dashboardBetaTab || '');
  });
  document.getElementById('dashboard-beta-refresh')?.addEventListener('click', () => {
    void loadDashboardBeta({ force: true });
  });
}

async function loadDashboardBeta(options = {}) {
  bindDashboardBetaActions();
  const force = options.force === true;
  if (dashboardBetaLoading) return;
  if (!force && Date.now() - dashboardBetaLastLoadedAt < 5000) return;
  dashboardBetaLoading = true;
  const refreshButton = document.getElementById('dashboard-beta-refresh');
  refreshButton?.classList.add('is-loading');

  const accountRequest = fetchJson('/api/v1/account/overview?quiet=1')
    .then(renderDashboardBetaReadiness)
    .catch(renderDashboardBetaReadinessError);
  const operationsRequest = fetchJson('/api/v1/continuous-publishing/dashboard-overview')
    .then(renderDashboardBetaOperations)
    .catch(renderDashboardBetaOperationsError);
  const statsRequest = fetchJson('/api/v1/continuous-publishing/dashboard-result-stats')
    .then(renderDashboardBetaResultStats)
    .catch(renderDashboardBetaResultStatsError);
  await Promise.allSettled([accountRequest, operationsRequest, statsRequest]);
  dashboardBetaLastLoadedAt = Date.now();
  dashboardBetaLoading = false;
  refreshButton?.classList.remove('is-loading');
}
