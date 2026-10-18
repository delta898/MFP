let dashboardLoading = false;
let dashboardLastLoadedAt = 0;
let dashboardFollowUpTimer = null;
let dashboardResultStats = null;
let dashboardSelectedPeriod = 'today';

function isDashboardActive() {
  return document.getElementById('view-dashboard')?.classList.contains('active') === true;
}

function formatDashboardDateTime(value) {
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

function dashboardConnectionState(connection, labels = {}) {
  const status = String(connection?.status || '').trim();
  const reason = String(connection?.message || connection?.reason || '').trim();
  const checkedAt = String(connection?.checked_at || '').trim();
  if (status === 'connected') {
    return { state: 'ready', label: labels.ready || '연결 확인됨', reason, checkedAt };
  }
  if (status === 'not_configured') {
    return { state: 'muted', label: labels.notConfigured || '미설정', reason, checkedAt };
  }
  if (status === 'failed') {
    return { state: 'failed', label: labels.failed || '연결 실패', reason, checkedAt };
  }
  if (status === 'not_connected') {
    return { state: 'attention', label: labels.notConnected || labels.attention || '로그인 필요', reason, checkedAt };
  }
  return { state: 'attention', label: labels.attention || '확인 필요', reason, checkedAt };
}

// Publishing channel registry. A future channel (Blogger, Tistory, …) is one
// entry here plus its backend connection status: id, display name, brand color,
// settings form target, inline SVG icon (currentColor-driven) and status labels.
const DASHBOARD_CHANNELS = Object.freeze([
  {
    id: 'naver',
    name: '네이버 블로그',
    brand: '#03C75A',
    form: 'settings-next-naver-form',
    icon: '<svg class="dashboard-channel-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 4h3.2L16 14.5V4H19v16h-3.2L8 9.5V20H5z"/></svg>',
    labels: {
      ready: '네이버 로그인 확인됨',
      attention: '네이버 로그인 확인 필요',
      notConfigured: '네이버 미설정',
      failed: '네이버 로그인 실패',
      notConnected: '네이버 로그인이 필요합니다',
      loading: '네이버 확인 중'
    }
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    brand: '#21759B',
    form: 'settings-next-wordpress-form',
    icon: '<svg class="dashboard-channel-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7.5 9.5 10 15l2-4.5L14 15l2.5-5.5"/></svg>',
    labels: {
      ready: 'WordPress 연결 확인됨',
      attention: 'WordPress 연결 확인 필요',
      notConfigured: 'WordPress 설정이 없습니다',
      failed: 'WordPress 연결 실패',
      loading: 'WordPress 확인 중'
    }
  },
  {
    id: 'site-hosting',
    name: '웹사이트',
    brand: '',
    nav: 'site-hosting',
    icon: '<svg class="dashboard-channel-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="6.5" r=".6" fill="currentColor"/><circle cx="10" cy="6.5" r=".6" fill="currentColor"/></svg>',
    labels: {
      ready: 'Cloudflare 연결 확인됨',
      attention: 'Cloudflare 연결 필요',
      failed: 'Cloudflare 상태 확인 실패',
      notConnected: 'Cloudflare 연결이 필요합니다',
      loading: 'Cloudflare 확인 중'
    }
  }
]);

function createDashboardChannelButton(channel, state, label, reason = '', checkedAt = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.dashboardState = state;
  button.dataset.dashboardChannel = channel.id;
  if (channel.brand) button.style.setProperty('--channel-brand', channel.brand);
  button.dataset.dashboardNav = channel.nav || 'settings-next';
  if (channel.form) {
    button.dataset.dashboardTab = 'core';
    button.dataset.dashboardLocalTab = channel.localTab || 'publishing';
    button.dataset.dashboardTarget = channel.form;
  }
  const normalizedReason = String(reason || '').trim();
  const normalizedCheckedAt = formatDashboardDateTime(checkedAt);
  const includeDiagnostics = state === 'ready' || state === 'muted';
  const detail = [
    label,
    includeDiagnostics ? normalizedReason : '',
    includeDiagnostics && normalizedCheckedAt ? `마지막 확인 ${normalizedCheckedAt}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  button.setAttribute('aria-label', `${channel.name}, ${detail}`);
  button.dataset.dashboardTooltip = detail;
  button.title = detail;
  const icon = document.createElement('span');
  icon.className = 'dashboard-channel-icon-wrap';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = channel.icon;
  const name = document.createElement('span');
  name.className = 'dashboard-channel-name';
  name.textContent = channel.name;
  const status = document.createElement('span');
  status.className = 'dashboard-channel-status';
  status.dataset.state = state;
  const dot = document.createElement('span');
  dot.className = 'dashboard-state-dot';
  dot.setAttribute('aria-hidden', 'true');
  status.append(dot);
  button.append(icon, name, status);
  return button;
}

function dashboardCanShowSupportTeaser(accountOverview, operationsOverview) {
  if (!accountOverview || !operationsOverview) return false;
  const allowedConnectionStates = new Set(['connected', 'configured', 'not_configured']);
  const connections = accountOverview.connections || {};
  if (![connections.naver, connections.wordpress]
    .every((connection) => allowedConnectionStates.has(String(connection?.status || '').trim()))) return false;
  const flow = operationsOverview.flow || {};
  const state = String(flow.state || 'idle');
  return flow.busy !== true && !['selecting', 'running', 'failed', 'needs_attention', 'blocked'].includes(state);
}

function createDashboardReadinessButton({ label, state, view, tab, localTab, target }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.dashboardState = state;
  button.dataset.dashboardNav = view;
  if (tab) button.dataset.dashboardTab = tab;
  if (localTab) button.dataset.dashboardLocalTab = localTab;
  if (target) button.dataset.dashboardTarget = target;

  const dot = document.createElement('span');
  dot.className = 'dashboard-state-dot';
  dot.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.textContent = label;
  button.append(dot, copy);
  return button;
}

const DASHBOARD_SETUP_STEPS = Object.freeze([
  {
    id: 'ai',
    label: 'AI 글쓰기 모델',
    tab: 'ai',
    targetId: 'settings-next-ai-text-form',
    actionLabel: 'AI 설정하기'
  },
  {
    id: 'google',
    label: 'Google Spreadsheet',
    tab: 'core',
    targetId: 'settings-next-content-form',
    actionLabel: 'Google 연결하기'
  },
  {
    id: 'channel',
    label: '발행 채널',
    tab: 'core',
    targetId: 'settings-next-naver-form',
    localTab: 'publishing',
    actionLabel: '블로그 연결하기'
  }
]);

function renderDashboardOnboarding(setup = {}) {
  const section = document.getElementById('dashboard-onboarding');
  if (!section) return;
  const stepState = {
    ai: setup?.ai?.configured === true,
    google: setup?.google?.configured === true && setup?.google?.transition_required !== true,
    channel: setup?.publishing_channel?.configured === true
  };
  const completedCount = Object.values(stepState).filter(Boolean).length;
  const complete = setup?.ready === true || completedCount === DASHBOARD_SETUP_STEPS.length;
  section.hidden = complete;
  setText('dashboard-onboarding-progress', `${completedCount}/3 준비됨`);

  DASHBOARD_SETUP_STEPS.forEach((step, index) => {
    const element = section.querySelector(`[data-dashboard-setup-step="${step.id}"]`);
    const ready = stepState[step.id];
    if (!element) return;
    const transitionRequired = step.id === 'google' && setup?.google?.transition_required === true;
    // Google is complete for readiness counting, but visually remains a normal numbered card.
    // Only a legacy connection gets the warning treatment.
    element.dataset.state = step.id === 'google'
      ? (transitionRequired ? 'transition' : 'pending')
      : (ready ? 'ready' : 'pending');
    const mark = element.querySelector('.dashboard-onboarding-step-mark');
    if (mark) mark.textContent = step.id === 'google' || !ready ? String(index + 1) : '✓';
    if (step.id === 'google') {
      const badge = element.querySelector('.dashboard-onboarding-step-badge');
      if (badge) badge.hidden = !transitionRequired;
    }
  });

  const nextStep = DASHBOARD_SETUP_STEPS.find((step) => !stepState[step.id]);
  const action = document.getElementById('dashboard-onboarding-action');
  if (!nextStep || !action) return;
  const transitionRequired = nextStep.id === 'google' && setup?.google?.transition_required === true;
  setText('dashboard-onboarding-next-copy', transitionRequired
    ? '기존 Spreadsheet 연결을 전환해 주세요.'
    : (nextStep.id === 'google' ? '사용할 Spreadsheet를 연결해 주세요.' : `${nextStep.label} 설정이 필요합니다.`));
  action.textContent = transitionRequired ? '전환하기' : nextStep.actionLabel;
  action.dataset.settingsTab = nextStep.tab;
  action.dataset.settingsTarget = nextStep.targetId;
  if (nextStep.localTab) action.dataset.settingsLocalTab = nextStep.localTab;
  else delete action.dataset.settingsLocalTab;
}

function renderDashboardReadiness(overview, cloudflareStatus = null, cloudflareFailed = false) {
  const container = document.getElementById('dashboard-readiness-items');
  const error = document.getElementById('dashboard-readiness-error');
  if (!container) return;
  container.innerHTML = '';
  error?.setAttribute('hidden', '');

  const connections = { ...(overview?.connections || {}) };
  if (cloudflareFailed) connections['site-hosting'] = { status: 'failed' };
  else if (cloudflareStatus) {
    connections['site-hosting'] = {
      status: cloudflareStatus.connected && cloudflareStatus.accounts?.length ? 'connected' : 'not_connected',
      message: cloudflareStatus.connected
        ? `접근 가능한 계정 ${cloudflareStatus.accounts.length}개`
        : ''
    };
  }
  const channelButtons = DASHBOARD_CHANNELS.map((channel) => {
    const { state, label, reason, checkedAt } = dashboardConnectionState(connections[channel.id], {
      ready: channel.labels.ready,
      attention: channel.labels.attention,
      notConfigured: channel.labels.notConfigured,
      failed: channel.labels.failed
    });
    const destination = channel.id === 'site-hosting' && state !== 'ready'
      ? { ...channel, nav: 'settings-next', form: 'settings-next-cloudflare-card', localTab: 'hosting' }
      : channel;
    return createDashboardChannelButton(destination, state, label, reason, checkedAt);
  });
  const toOptionalNumber = (value) => (
    value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  );
  const remaining = toOptionalNumber(overview?.usage?.remaining);
  const used = toOptionalNumber(overview?.usage?.used);
  const limit = toOptionalNumber(overview?.usage?.limit);
  const unlimited = overview?.usage?.mode === 'unlimited' || remaining < 0;
  const planName = String(overview?.subscription?.plan_name || overview?.subscription?.plan_code || '플랜')
    .replace(/\s+plan$/i, '')
    .trim() || '플랜';
  const cycleLabel = overview?.usage?.cycle === 'monthly' ? '이번 달 ' : '누적 ';
  let usageLabel = `${planName} · 이용 횟수 확인 필요`;
  if (unlimited && Number.isFinite(used)) {
    usageLabel = `${planName} · ${cycleLabel}${Math.max(0, used)}회 사용 · 무제한`;
  } else if (unlimited) {
    usageLabel = `${planName} · 무제한`;
  } else if (Number.isFinite(used) && Number.isFinite(limit) && Number.isFinite(remaining)) {
    usageLabel = `${planName} · ${cycleLabel}${Math.max(0, used)}/${Math.max(0, limit)}회 사용 · ${Math.max(0, remaining)}회 남음`;
  } else if (Number.isFinite(remaining)) {
    usageLabel = `${planName} · ${Math.max(0, remaining)}회 남음`;
  }

  container.append(
    ...channelButtons,
    createDashboardReadinessButton({
      label: usageLabel,
      state: Number.isFinite(remaining) || unlimited ? (remaining === 0 ? 'attention' : 'ready') : 'attention',
      view: 'account'
    })
  );
}

function renderDashboardReadinessError() {
  const container = document.getElementById('dashboard-readiness-items');
  const error = document.getElementById('dashboard-readiness-error');
  if (container) container.innerHTML = '';
  if (error) error.hidden = false;
}

function dashboardFlowCopy(flow = {}, queue = {}) {
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
  const readyCount = Math.max(0, Number(queue.ready_count) || 0);
  return {
    state: 'idle', badge: '대기 중',
    subject: '현재 실행 중인 글이 없습니다.',
    message: readyCount > 0
      ? `발행 대기 ${readyCount}건이 있습니다. 글감 관리에서 순서와 시간을 확인할 수 있습니다.`
      : '대기열에 글감을 추가하거나 연속 발행을 설정할 수 있습니다.'
  };
}

function renderDashboardOperations(overview) {
  const flowCopy = dashboardFlowCopy(overview?.flow, overview?.queue);
  const flowBadge = document.getElementById('dashboard-flow-badge');
  if (flowBadge) {
    flowBadge.dataset.state = flowCopy.state;
    flowBadge.textContent = flowCopy.badge;
  }
  setText('dashboard-flow-subject', flowCopy.subject);
  setText('dashboard-flow-message', flowCopy.message);

  const automation = overview?.automation || {};
  const nextAt = formatDashboardDateTime(automation.next_processing_at);
  const automationBadge = document.getElementById('dashboard-automation-badge');
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
  setText('dashboard-automation-action', automationState === 'on'
    ? '설정 보기'
    : automationState === 'attention' ? '설정 확인' : '연속 발행 설정');
  setText('dashboard-next-time', nextTime);
  setText('dashboard-next-copy', nextCopy);

  const queue = overview?.queue || {};
  setText('dashboard-ready-count', `${Number(queue.ready_count) || 0}건`);
  setText('dashboard-saved-count', `${Number(queue.saved_count) || 0}건`);
  setText('dashboard-running-count', `${Number(queue.running_count) || 0}건`);
  renderDashboardQueue(queue.next_items);
  const error = document.getElementById('dashboard-operations-error');
  if (error) error.hidden = true;

  if (dashboardFollowUpTimer) clearTimeout(dashboardFollowUpTimer);
  dashboardFollowUpTimer = null;
  if (overview?.flow?.busy === true && isDashboardActive()) {
    dashboardFollowUpTimer = setTimeout(() => {
      if (isDashboardActive()) void loadDashboard({ force: true });
    }, 3000);
  }
}

function renderDashboardQueue(items) {
  const container = document.getElementById('dashboard-queue-list');
  if (!container) return;
  container.innerHTML = '';
  const nextItems = Array.isArray(items) ? items.slice(0, 3) : [];
  if (nextItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty';
    empty.textContent = '발행을 기다리는 글감이 없습니다. 새 글감을 준비해 보세요.';
    container.appendChild(empty);
    return;
  }

  const platformLabels = { naver: '네이버', wordpress: 'WordPress' };
  const statusLabels = { publish: '즉시 발행', draft: '임시 저장', schedule: '예약 발행' };
  nextItems.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'dashboard-queue-item';
    const order = document.createElement('span');
    order.className = 'dashboard-queue-order';
    order.textContent = String(index + 1);
    const copy = document.createElement('div');
    copy.className = 'dashboard-queue-copy';
    const subject = document.createElement('strong');
    subject.textContent = String(item?.subject || '제목 없는 글감');
    const meta = document.createElement('span');
    const platforms = (Array.isArray(item?.targets) ? item.targets : [])
      .map(target => platformLabels[target] || target)
      .join(' · ');
    const estimate = formatDashboardDateTime(item?.processing_estimate_at);
    meta.textContent = [platforms || '발행 대상 확인 필요', statusLabels[item?.post_status] || '즉시 발행', estimate || '처리 시각 미정']
      .join(' · ');
    copy.append(subject, meta);
    row.append(order, copy);
    container.appendChild(row);
  });
}

function renderDashboardOperationsError() {
  const flowBadge = document.getElementById('dashboard-flow-badge');
  if (flowBadge) {
    flowBadge.dataset.state = 'attention';
    flowBadge.textContent = '확인 불가';
  }
  setText('dashboard-flow-subject', '발행 현황을 불러오지 못했습니다.');
  setText('dashboard-flow-message', '새로고침하거나 잠시 후 다시 시도해 주세요.');
  setText('dashboard-ready-count', '-');
  setText('dashboard-saved-count', '-');
  setText('dashboard-running-count', '-');
  renderDashboardQueue([]);
  const error = document.getElementById('dashboard-operations-error');
  if (error) error.hidden = false;
}

function renderDashboardOperationsSetupRequired() {
  const flowBadge = document.getElementById('dashboard-flow-badge');
  if (flowBadge) {
    flowBadge.dataset.state = 'attention';
    flowBadge.textContent = '설정 필요';
  }
  setText('dashboard-flow-subject', 'Google 연결 후 발행 현황을 확인할 수 있습니다.');
  setText('dashboard-flow-message', '위의 사용 준비 안내에서 사용할 Spreadsheet를 연결해 주세요.');
  const automationBadge = document.getElementById('dashboard-automation-badge');
  if (automationBadge) {
    automationBadge.dataset.state = 'attention';
    automationBadge.textContent = '설정 필요';
  }
  setText('dashboard-next-time', 'Google 연결이 필요합니다.');
  setText('dashboard-next-copy', '연결을 마치면 발행 대기와 다음 실행 일정을 확인할 수 있습니다.');
  setText('dashboard-ready-count', '-');
  setText('dashboard-saved-count', '-');
  setText('dashboard-running-count', '-');
  const queue = document.getElementById('dashboard-queue-list');
  if (queue) queue.innerHTML = '';
  const error = document.getElementById('dashboard-operations-error');
  if (error) error.hidden = true;
}

function renderDashboardRecentResults(items, periodKey = 'today') {
  const container = document.getElementById('dashboard-recent-results-list');
  if (!container) return;
  container.innerHTML = '';
  const periodLabels = { today: '오늘', week: '이번 주', month: '최근 30일' };
  const results = Array.isArray(items) ? items.slice(0, 5) : [];
  if (results.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty';
    empty.textContent = `${periodLabels[periodKey] || '선택한 기간'}에 기록된 발행 결과가 없습니다.`;
    container.appendChild(empty);
    return;
  }
  const platformLabels = { naver: '네이버', wordpress: 'WordPress' };
  const statusLabels = { draft: '임시 저장', schedule: '예약 등록', publish: '공개 발행' };
  results.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'dashboard-result-item';
    const copy = document.createElement('div');
    const subject = document.createElement('strong');
    subject.textContent = String(item?.subject || '제목 없는 글');
    const meta = document.createElement('span');
    meta.textContent = [
      platformLabels[item?.platform] || item?.platform || '플랫폼 확인 필요',
      statusLabels[item?.post_status] || '처리 완료',
      formatDashboardDateTime(item?.occurred_at) || '시각 확인 불가'
    ].join(' · ');
    copy.append(subject, meta);
    row.appendChild(copy);
    if (item?.navigation_url) {
      const link = document.createElement('a');
      link.href = item.navigation_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = item.navigation_kind === 'result' ? '글 보기' : '블로그 열기';
      row.appendChild(link);
    }
    container.appendChild(row);
  });
}

function renderDashboardStatsPeriod() {
  const stats = dashboardResultStats;
  const period = stats?.periods?.[dashboardSelectedPeriod];
  document.querySelectorAll('[data-dashboard-period]').forEach((button) => {
    const selected = button.dataset.dashboardPeriod === dashboardSelectedPeriod;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  setText('dashboard-processed-count', stats?.available === false ? '-' : `${Number(period?.processed_count) || 0}건`);
  setText('dashboard-published-count', stats?.available === false ? '-' : `${Number(period?.published_count) || 0}건`);
  renderDashboardRecentResults(stats?.available === false ? [] : period?.recent_results, dashboardSelectedPeriod);
  const trend = document.getElementById('dashboard-trend');
  if (trend) trend.hidden = stats?.available === false;
  const trendTitles = { today: '오늘 시간대별 추이', week: '이번 주 일별 추이', month: '최근 30일 일별 추이' };
  setText('dashboard-trend-title', trendTitles[dashboardSelectedPeriod] || '발행 추이');
  renderDashboardTrend(period?.trend_series, period?.trend_unit, dashboardSelectedPeriod);
}

function dashboardTrendBucketLabel(item, unit, short = false) {
  const bucket = new Date(item?.bucket_start || '');
  if (Number.isNaN(bucket.getTime())) return '';
  if (unit === 'hour') {
    const hour = Number(bucket.toLocaleString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }));
    return short ? (hour % 3 === 0 ? `${hour}시` : '') : `${hour}시`;
  }
  return short
    ? bucket.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).replace('요일', '')
    : bucket.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' });
}

function dashboardTrendAxisLabel(item, unit, periodKey, index, length) {
  if (unit === 'hour') return dashboardTrendBucketLabel(item, unit, true);
  if (periodKey === 'week') return dashboardTrendBucketLabel(item, unit, true);
  if (periodKey === 'month' && (index === 0 || index === length - 1 || (index % 7 === 0 && index < length - 2))) {
    const bucket = new Date(item?.bucket_start || '');
    return Number.isNaN(bucket.getTime())
      ? ''
      : bucket.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', day: 'numeric' });
  }
  return '';
}

function renderDashboardTrend(items, unit = 'day', periodKey = 'month') {
  const container = document.getElementById('dashboard-trend-bars');
  if (!container) return;
  container.innerHTML = '';
  container.dataset.period = periodKey;
  container.dataset.unit = unit;
  const ariaLabels = { today: '오늘 시간대별 발행 활동 추이', week: '이번 주 일별 발행 활동 추이', month: '최근 30일 일별 발행 활동 추이' };
  container.setAttribute('aria-label', ariaLabels[periodKey] || '발행 활동 추이');
  const series = Array.isArray(items) ? items : [];
  container.style.setProperty('--dashboard-trend-columns', String(Math.max(1, series.length)));
  const maxCount = Math.max(1, ...series.map(item => Number(item?.processed_count) || 0));
  series.forEach((item, index) => {
    const group = document.createElement('span');
    group.className = 'dashboard-trend-day';
    const processed = Math.max(0, Number(item?.processed_count) || 0);
    const published = Math.max(0, Number(item?.published_count) || 0);
    group.title = `${dashboardTrendBucketLabel(item, unit)} · 처리 완료 ${processed}건 · 공개 발행 ${published}건`;
    group.setAttribute('aria-label', group.title);
    const processedBar = document.createElement('i');
    processedBar.dataset.series = 'processed';
    processedBar.style.height = `${Math.max(processed > 0 ? 8 : 2, (processed / maxCount) * 100)}%`;
    const publishedBar = document.createElement('i');
    publishedBar.dataset.series = 'published';
    publishedBar.style.height = `${Math.max(published > 0 ? 8 : 2, (published / maxCount) * 100)}%`;
    const bars = document.createElement('span');
    bars.className = 'dashboard-trend-bar-pair';
    bars.append(processedBar, publishedBar);
    const dayLabel = document.createElement('small');
    dayLabel.textContent = dashboardTrendAxisLabel(item, unit, periodKey, index, series.length);
    group.append(bars, dayLabel);
    container.appendChild(group);
  });
}

function renderDashboardResultStats(stats) {
  dashboardResultStats = stats || null;
  renderDashboardStatsPeriod();
  const error = document.getElementById('dashboard-stats-error');
  if (error) {
    error.textContent = stats?.available === false
      ? '발행 기록 기능을 사용할 수 없어 통계를 확인하지 못했습니다.'
      : '발행 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    error.hidden = stats?.available !== false;
  }
}

function renderDashboardResultStatsError() {
  dashboardResultStats = null;
  renderDashboardStatsPeriod();
  const error = document.getElementById('dashboard-stats-error');
  if (error) {
    error.textContent = '발행 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    error.hidden = false;
  }
}

function bindDashboardActions() {
  const view = document.getElementById('view-dashboard');
  if (!view || view.dataset.actionsBound === 'true') return;
  view.dataset.actionsBound = 'true';
  view.addEventListener('click', (event) => {
    const periodButton = event.target.closest('[data-dashboard-period]');
    if (periodButton) {
      const requestedPeriod = periodButton.dataset.dashboardPeriod;
      dashboardSelectedPeriod = ['today', 'week', 'month'].includes(requestedPeriod) ? requestedPeriod : 'today';
      renderDashboardStatsPeriod();
      return;
    }
    const settingsTarget = event.target.closest('[data-settings-tab][data-settings-target]');
    if (settingsTarget) {
      void navigateToSettingsNextTarget(
        settingsTarget.dataset.settingsTab,
        settingsTarget.dataset.settingsTarget,
        settingsTarget.dataset.settingsLocalTab || ''
      );
      return;
    }
    const target = event.target.closest('[data-dashboard-nav]');
    if (!target) return;
    const targetView = target.dataset.dashboardNav;
    const targetTab = target.dataset.dashboardTab || '';
    const targetLocalTab = target.dataset.dashboardLocalTab || '';
    const targetId = target.dataset.dashboardTarget || '';
    if (targetView === 'settings-next' && typeof navigateToSettingsNextTarget === 'function') {
      void navigateToSettingsNextTarget(targetTab || 'core', targetId, targetLocalTab);
      return;
    }
    if (targetTab === 'core' && targetLocalTab && typeof settingsNextActivateCoreTab === 'function') {
      settingsNextActivateCoreTab(targetLocalTab);
    }
    void navigateTo(targetView, targetTab);
  });
  document.getElementById('dashboard-refresh')?.addEventListener('click', () => {
    void loadDashboard({ force: true });
  });
}

async function loadDashboard(options = {}) {
  bindDashboardActions();
  void loadRecommendationCenterForDashboard();
  const force = options.force === true;
  if (dashboardLoading) return;
  if (!force && Date.now() - dashboardLastLoadedAt < 5000) return;
  dashboardLoading = true;
  const refreshButton = document.getElementById('dashboard-refresh');
  refreshButton?.classList.add('is-loading');
  refreshButton?.setAttribute('aria-busy', 'true');
  if (refreshButton) refreshButton.disabled = true;

  let accountOverview = null;
  let operationsOverview = null;
  const configRequest = fetchJson('/api/v1/config/status')
    .then((status) => {
      const setup = status?.setup || null;
      if (setup) renderDashboardOnboarding(setup);
      return setup;
    })
    .catch(() => null);
  const accountRequest = fetchJson('/api/v1/account/overview?quiet=1')
    .then((overview) => {
      accountOverview = overview;
      const naverConnection = overview?.connections?.naver || null;
      const naverStatus = String(naverConnection?.status || '').trim();
      if (naverConnection && naverStatus !== 'unverified') {
        const sessionValid = naverStatus === 'connected';
        const reason = String(naverConnection.reason || '').trim();
        const sessionStateKey = sessionValid
          ? 'valid'
          : `invalid:${reason.toLowerCase() || 'unknown'}`;
        notifyUiIssueFromStateTransition(
          'naver-session',
          sessionStateKey,
          'NAVER_SESSION_INVALID',
          { code: 'NAVER_SESSION_INVALID', message: naverConnection.message || '', reason },
          { source: 'dashboard-session-status', reason }
        );
      }
      return fetchJson('/api/v1/site-hosting/cloudflare/status')
        .then((cloudflareStatus) => renderDashboardReadiness(overview, cloudflareStatus))
        .catch(() => renderDashboardReadiness(overview, null, true));
    })
    .catch(renderDashboardReadinessError);
  const operationsRequest = configRequest.then((setup) => {
    if (setup?.google?.configured === false) {
      renderDashboardOperationsSetupRequired();
      return null;
    }
    return fetchJson('/api/v1/continuous-publishing/dashboard-overview')
      .then((overview) => {
        operationsOverview = overview;
        renderDashboardOperations(overview);
        return overview;
      })
      .catch(renderDashboardOperationsError);
  });
  const statsRequest = fetchJson('/api/v1/continuous-publishing/dashboard-result-stats')
    .then(renderDashboardResultStats)
    .catch(renderDashboardResultStatsError);
  const tipsRequest = initDashboardDynamicContent();
  await Promise.allSettled([configRequest, accountRequest, operationsRequest, statsRequest, tipsRequest]);
  void initDashboardSupportTeaser({
    operationallyEligible: dashboardCanShowSupportTeaser(accountOverview, operationsOverview)
  });
  dashboardLastLoadedAt = Date.now();
  dashboardLoading = false;
  refreshButton?.classList.remove('is-loading');
  refreshButton?.setAttribute('aria-busy', 'false');
  if (refreshButton) refreshButton.disabled = false;
}
