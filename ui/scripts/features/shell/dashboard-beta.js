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

function dashboardBetaCanShowSupportTeaser(accountOverview, operationsOverview) {
  if (!accountOverview || !operationsOverview) return false;
  const allowedConnectionStates = new Set(['connected', 'configured', 'not_configured']);
  const connections = accountOverview.connections || {};
  if (![connections.naver, connections.wordpress]
    .every((connection) => allowedConnectionStates.has(String(connection?.status || '').trim()))) return false;
  const flow = operationsOverview.flow || {};
  const state = String(flow.state || 'idle');
  return flow.busy !== true && !['selecting', 'running', 'failed', 'needs_attention', 'blocked'].includes(state);
}

function createDashboardBetaReadinessButton({ label, state, view, tab, localTab, target }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.dashboardBetaState = state;
  button.dataset.dashboardBetaNav = view;
  if (tab) button.dataset.dashboardBetaTab = tab;
  if (localTab) button.dataset.dashboardBetaLocalTab = localTab;
  if (target) button.dataset.dashboardBetaTarget = target;

  const dot = document.createElement('span');
  dot.className = 'dashboard-beta-state-dot';
  dot.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.textContent = label;
  button.append(dot, copy);
  return button;
}

const DASHBOARD_BETA_SETUP_STEPS = Object.freeze([
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

function renderDashboardBetaOnboarding(setup = {}) {
  const section = document.getElementById('dashboard-beta-onboarding');
  if (!section) return;
  const stepState = {
    ai: setup?.ai?.configured === true,
    google: setup?.google?.configured === true,
    channel: setup?.publishing_channel?.configured === true
  };
  const completedCount = Object.values(stepState).filter(Boolean).length;
  const complete = setup?.ready === true || completedCount === DASHBOARD_BETA_SETUP_STEPS.length;
  section.hidden = complete;
  setText('dashboard-beta-onboarding-progress', `${completedCount}/3 준비됨`);

  DASHBOARD_BETA_SETUP_STEPS.forEach((step, index) => {
    const element = section.querySelector(`[data-dashboard-beta-setup-step="${step.id}"]`);
    const ready = stepState[step.id];
    if (!element) return;
    element.dataset.state = ready ? 'ready' : 'pending';
    const mark = element.querySelector('.dashboard-beta-onboarding-step-mark');
    if (mark) mark.textContent = ready ? '✓' : String(index + 1);
  });

  const nextStep = DASHBOARD_BETA_SETUP_STEPS.find((step) => !stepState[step.id]);
  const action = document.getElementById('dashboard-beta-onboarding-action');
  if (!nextStep || !action) return;
  setText('dashboard-beta-onboarding-next-copy', `${nextStep.label} 설정이 필요합니다.`);
  action.textContent = nextStep.actionLabel;
  action.dataset.settingsTab = nextStep.tab;
  action.dataset.settingsTarget = nextStep.targetId;
  if (nextStep.localTab) action.dataset.settingsLocalTab = nextStep.localTab;
  else delete action.dataset.settingsLocalTab;
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
    createDashboardBetaReadinessButton({ ...naver, view: 'settings-next', tab: 'core', localTab: 'publishing', target: 'settings-next-naver-form' }),
    createDashboardBetaReadinessButton({ ...wordpress, view: 'settings-next', tab: 'core', localTab: 'publishing', target: 'settings-next-wordpress-form' }),
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

function dashboardBetaFlowCopy(flow = {}, queue = {}) {
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

function renderDashboardBetaOperations(overview) {
  const flowCopy = dashboardBetaFlowCopy(overview?.flow, overview?.queue);
  const flowBadge = document.getElementById('dashboard-beta-flow-badge');
  if (flowBadge) {
    flowBadge.dataset.state = flowCopy.state;
    flowBadge.textContent = flowCopy.badge;
  }
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
  setText('dashboard-beta-automation-action', automationState === 'on'
    ? '설정 보기'
    : automationState === 'attention' ? '설정 확인' : '연속 발행 설정');
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
  if (flowBadge) {
    flowBadge.dataset.state = 'attention';
    flowBadge.textContent = '확인 불가';
  }
  setText('dashboard-beta-flow-subject', '발행 현황을 불러오지 못했습니다.');
  setText('dashboard-beta-flow-message', '새로고침하거나 잠시 후 다시 시도해 주세요.');
  setText('dashboard-beta-ready-count', '-');
  setText('dashboard-beta-saved-count', '-');
  setText('dashboard-beta-running-count', '-');
  renderDashboardBetaQueue([]);
  const error = document.getElementById('dashboard-beta-operations-error');
  if (error) error.hidden = false;
}

function renderDashboardBetaOperationsSetupRequired() {
  const flowBadge = document.getElementById('dashboard-beta-flow-badge');
  if (flowBadge) {
    flowBadge.dataset.state = 'attention';
    flowBadge.textContent = '설정 필요';
  }
  setText('dashboard-beta-flow-subject', 'Google 연결 후 발행 현황을 확인할 수 있습니다.');
  setText('dashboard-beta-flow-message', '위의 사용 준비 안내에서 Google 계정과 Spreadsheet를 연결해 주세요.');
  const automationBadge = document.getElementById('dashboard-beta-automation-badge');
  if (automationBadge) {
    automationBadge.dataset.state = 'attention';
    automationBadge.textContent = '설정 필요';
  }
  setText('dashboard-beta-next-time', 'Google 연결이 필요합니다.');
  setText('dashboard-beta-next-copy', '연결을 마치면 발행 대기와 다음 실행 일정을 확인할 수 있습니다.');
  setText('dashboard-beta-ready-count', '-');
  setText('dashboard-beta-saved-count', '-');
  setText('dashboard-beta-running-count', '-');
  const queue = document.getElementById('dashboard-beta-queue-list');
  if (queue) queue.innerHTML = '';
  const error = document.getElementById('dashboard-beta-operations-error');
  if (error) error.hidden = true;
}

function renderDashboardBetaRecentResults(items, periodKey = 'today') {
  const container = document.getElementById('dashboard-beta-recent-results-list');
  if (!container) return;
  container.innerHTML = '';
  const periodLabels = { today: '오늘', week: '이번 주', month: '최근 30일' };
  const results = Array.isArray(items) ? items.slice(0, 5) : [];
  if (results.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-beta-empty';
    empty.textContent = `${periodLabels[periodKey] || '선택한 기간'}에 기록된 발행 결과가 없습니다.`;
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
  renderDashboardBetaRecentResults(stats?.available === false ? [] : period?.recent_results, dashboardBetaSelectedPeriod);
  const trend = document.getElementById('dashboard-beta-trend');
  if (trend) trend.hidden = stats?.available === false;
  const trendTitles = { today: '오늘 시간대별 추이', week: '이번 주 일별 추이', month: '최근 30일 일별 추이' };
  setText('dashboard-beta-trend-title', trendTitles[dashboardBetaSelectedPeriod] || '발행 추이');
  renderDashboardBetaTrend(period?.trend_series, period?.trend_unit, dashboardBetaSelectedPeriod);
}

function dashboardBetaTrendBucketLabel(item, unit, short = false) {
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

function dashboardBetaTrendAxisLabel(item, unit, periodKey, index, length) {
  if (unit === 'hour') return dashboardBetaTrendBucketLabel(item, unit, true);
  if (periodKey === 'week') return dashboardBetaTrendBucketLabel(item, unit, true);
  if (periodKey === 'month' && (index === 0 || index === length - 1 || (index % 7 === 0 && index < length - 2))) {
    const bucket = new Date(item?.bucket_start || '');
    return Number.isNaN(bucket.getTime())
      ? ''
      : bucket.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', day: 'numeric' });
  }
  return '';
}

function renderDashboardBetaTrend(items, unit = 'day', periodKey = 'month') {
  const container = document.getElementById('dashboard-beta-trend-bars');
  if (!container) return;
  container.innerHTML = '';
  container.dataset.period = periodKey;
  container.dataset.unit = unit;
  const ariaLabels = { today: '오늘 시간대별 발행 활동 추이', week: '이번 주 일별 발행 활동 추이', month: '최근 30일 일별 발행 활동 추이' };
  container.setAttribute('aria-label', ariaLabels[periodKey] || '발행 활동 추이');
  const series = Array.isArray(items) ? items : [];
  container.style.setProperty('--dashboard-beta-trend-columns', String(Math.max(1, series.length)));
  const maxCount = Math.max(1, ...series.map(item => Number(item?.processed_count) || 0));
  series.forEach((item, index) => {
    const group = document.createElement('span');
    group.className = 'dashboard-beta-trend-day';
    const processed = Math.max(0, Number(item?.processed_count) || 0);
    const published = Math.max(0, Number(item?.published_count) || 0);
    group.title = `${dashboardBetaTrendBucketLabel(item, unit)} · 처리 완료 ${processed}건 · 공개 발행 ${published}건`;
    group.setAttribute('aria-label', group.title);
    const processedBar = document.createElement('i');
    processedBar.dataset.series = 'processed';
    processedBar.style.height = `${Math.max(processed > 0 ? 8 : 2, (processed / maxCount) * 100)}%`;
    const publishedBar = document.createElement('i');
    publishedBar.dataset.series = 'published';
    publishedBar.style.height = `${Math.max(published > 0 ? 8 : 2, (published / maxCount) * 100)}%`;
    const bars = document.createElement('span');
    bars.className = 'dashboard-beta-trend-bar-pair';
    bars.append(processedBar, publishedBar);
    const dayLabel = document.createElement('small');
    dayLabel.textContent = dashboardBetaTrendAxisLabel(item, unit, periodKey, index, series.length);
    group.append(bars, dayLabel);
    container.appendChild(group);
  });
}

function renderDashboardBetaResultStats(stats) {
  dashboardBetaResultStats = stats || null;
  renderDashboardBetaStatsPeriod();
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
  renderDashboardBetaStatsPeriod();
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
      const requestedPeriod = periodButton.dataset.dashboardBetaPeriod;
      dashboardBetaSelectedPeriod = ['today', 'week', 'month'].includes(requestedPeriod) ? requestedPeriod : 'today';
      renderDashboardBetaStatsPeriod();
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
    const target = event.target.closest('[data-dashboard-beta-nav]');
    if (!target) return;
    const betaNav = target.dataset.dashboardBetaNav;
    const betaTab = target.dataset.dashboardBetaTab || '';
    const betaLocalTab = target.dataset.dashboardBetaLocalTab || '';
    const betaTarget = target.dataset.dashboardBetaTarget || '';
    if (betaNav === 'settings-next' && typeof navigateToSettingsNextTarget === 'function') {
      void navigateToSettingsNextTarget(betaTab || 'core', betaTarget, betaLocalTab);
      return;
    }
    if (betaTab === 'core' && betaLocalTab && typeof settingsNextActivateCoreTab === 'function') {
      settingsNextActivateCoreTab(betaLocalTab);
    }
    void navigateTo(betaNav, betaTab);
  });
  document.getElementById('dashboard-beta-refresh')?.addEventListener('click', () => {
    void loadDashboardBeta({ force: true });
  });
}

async function loadDashboardBeta(options = {}) {
  bindDashboardBetaActions();
  void loadRecommendationCenterForDashboard();
  const force = options.force === true;
  if (dashboardBetaLoading) return;
  if (!force && Date.now() - dashboardBetaLastLoadedAt < 5000) return;
  dashboardBetaLoading = true;
  const refreshButton = document.getElementById('dashboard-beta-refresh');
  refreshButton?.classList.add('is-loading');

  let accountOverview = null;
  let operationsOverview = null;
  const configRequest = fetchJson('/api/v1/config/status')
    .then((status) => {
      const setup = status?.setup || null;
      if (setup) renderDashboardBetaOnboarding(setup);
      return setup;
    })
    .catch(() => null);
  const accountRequest = fetchJson('/api/v1/account/overview?quiet=1')
    .then((overview) => {
      accountOverview = overview;
      renderDashboardBetaReadiness(overview);
    })
    .catch(renderDashboardBetaReadinessError);
  const operationsRequest = configRequest.then((setup) => {
    if (setup?.google?.configured === false) {
      renderDashboardBetaOperationsSetupRequired();
      return null;
    }
    return fetchJson('/api/v1/continuous-publishing/dashboard-overview')
      .then((overview) => {
        operationsOverview = overview;
        renderDashboardBetaOperations(overview);
        return overview;
      })
      .catch(renderDashboardBetaOperationsError);
  });
  const statsRequest = fetchJson('/api/v1/continuous-publishing/dashboard-result-stats')
    .then(renderDashboardBetaResultStats)
    .catch(renderDashboardBetaResultStatsError);
  const tipsRequest = initDashboardBetaDynamicContent();
  await Promise.allSettled([configRequest, accountRequest, operationsRequest, statsRequest, tipsRequest]);
  void initDashboardBetaSupportTeaser({
    operationallyEligible: dashboardBetaCanShowSupportTeaser(accountOverview, operationsOverview)
  });
  dashboardBetaLastLoadedAt = Date.now();
  dashboardBetaLoading = false;
  refreshButton?.classList.remove('is-loading');
}
