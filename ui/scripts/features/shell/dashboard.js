async function loadDashboard(options = {}) {
  const force = options.force === true;
  if (isDashboardLoading) {
    if (force) dashboardForceRefreshPending = true;
    return;
  }
  if (!force && (Date.now() - lastDashboardLoadTime < 5000)) {
    return; // Throttle: prevent concurrent or overly frequent calls (5s cooldown)
  }
  isDashboardLoading = true;
  void loadRecommendationCenterForDashboard();

  const quietCatch = (e) => {
    if (e.status === 503 || String(e.message).includes('fetch failed')) return null;
    console.warn('[Dashboard Polling]', e.message);
    return null;
  };

  let healthResult, accountResult, summaryResult, autoResult;
  const smartUsageRevisionAtRequest = smartUsageRevision;
  try {
    [healthResult, accountResult, summaryResult, autoResult] = await Promise.allSettled([
      fetchJson('/api/v1/health').catch(quietCatch),
      fetchJson('/api/v1/account/overview?quiet=1').catch(quietCatch),
      fetchJson('/api/v1/dashboard/summary').catch(quietCatch),
      fetchJson('/api/v1/auto/status').catch(quietCatch)
    ]);
    lastDashboardLoadTime = Date.now();
  } finally {
    isDashboardLoading = false;
    if (dashboardForceRefreshPending) {
      dashboardForceRefreshPending = false;
      queueMicrotask(() => void loadDashboard({ force: true }));
    }
  }

  const healthOk = healthResult.status === 'fulfilled' && Boolean(healthResult.value);
  const accountOk = accountResult.status === 'fulfilled' && Boolean(accountResult.value);
  const licenseOk = accountOk;
  const sessionOk = accountOk;
  const summaryOk = summaryResult.status === 'fulfilled';
  const autoOk = autoResult.status === 'fulfilled';

  const health = healthOk ? healthResult.value : null;
  const accountOverview = accountOk ? accountResult.value : null;
  const license = accountOverview ? {
    planCode: accountOverview.subscription?.plan_code,
    planName: accountOverview.subscription?.plan_name,
    remaining: accountOverview.usage?.remaining
  } : null;
  const naverConnection = accountOverview?.connections?.naver || null;
  const wordpressConnection = accountOverview?.connections?.wordpress || null;
  const googleConnection = accountOverview?.connections?.google_sheets || null;
  const session = naverConnection ? {
    valid: naverConnection.status === 'connected',
    reason: naverConnection.reason || '',
    message: naverConnection.message || ''
  } : null;
  const summary = summaryOk ? summaryResult.value : null;
  const auto = autoOk ? autoResult.value : null;

  if (health?.version) syncAppVersionDisplays(health.version);

  const setReadinessItem = (buttonId, labelId, state, label) => {
    const button = document.getElementById(buttonId);
    const labelElement = document.getElementById(labelId);
    if (button) button.dataset.state = state;
    if (labelElement) labelElement.textContent = label;
  };
  const naverStatus = String(naverConnection?.status || '').trim();
  setReadinessItem(
    'dashboard-naver-status',
    'dashboard-naver-status-label',
    sessionOk && session?.valid ? 'ready' : 'action',
    sessionOk && session?.valid
      ? '네이버 로그인 확인됨'
      : (sessionOk && naverStatus === 'unverified'
        ? '네이버 확인 필요'
        : (sessionOk ? '네이버 로그인 필요' : '네이버 확인 불가'))
  );

  const wordpressStatus = String(wordpressConnection?.status || '').trim();
  const wordpressConnected = wordpressStatus === 'connected';
  const wordpressLabel = !accountOk
    ? 'WordPress 확인 불가'
    : wordpressConnected
      ? 'WordPress 연결 확인됨'
      : wordpressStatus === 'failed'
        ? 'WordPress 연결 실패'
        : wordpressStatus === 'unverified'
          ? 'WordPress 확인 필요'
          : 'WordPress 미사용';
  setReadinessItem(
    'dashboard-wordpress-status',
    'dashboard-wordpress-status-label',
    wordpressConnected ? 'ready' : (wordpressStatus === 'failed' ? 'action' : 'neutral'),
    wordpressLabel
  );

  const usageButton = document.getElementById('dashboard-usage-status');
  const usageLabel = document.getElementById('dashboard-usage-status-label');
  const planLabel = document.getElementById('dashboard-plan-status-label');
  if (licenseOk && license) {
    const remaining = Number(license.remaining);
    const remainingLabel = remaining < 0
      ? '기본 발행 무제한'
      : Number.isFinite(remaining) ? `기본 ${Math.max(0, remaining)}회 남음` : '사용량 확인 불가';
    const rawPlanName = String(license.planName || license.planCode || '').trim();
    const compactPlanName = rawPlanName.replace(/\s+plan$/i, '').trim() || rawPlanName;
    if (usageButton) usageButton.dataset.state = remaining === 0 ? 'attention' : 'ready';
    if (usageLabel) usageLabel.textContent = remainingLabel;
    if (planLabel) planLabel.textContent = compactPlanName;
  } else {
    if (usageButton) usageButton.dataset.state = 'attention';
    if (usageLabel) usageLabel.textContent = '사용량 확인 불가';
    if (planLabel) planLabel.textContent = '';
  }

  const googleConfigured = ['configured', 'connected'].includes(String(googleConnection?.status || '').trim());
  const googleStatus = document.getElementById('dashboard-google-status');
  if (googleStatus) googleStatus.hidden = !accountOk || googleConfigured;
  const healthStatus = document.getElementById('dashboard-health-status');
  if (healthStatus) healthStatus.hidden = healthOk && health?.status === 'ok';

  const bindReadinessNavigation = (id, view, tab) => {
    const element = document.getElementById(id);
    if (!element || element._navBound) return;
    element._navBound = true;
    element.addEventListener('click', () => void navigateTo(view, tab));
  };
  bindReadinessNavigation('dashboard-naver-status', 'settings', 'naver-blog');
  bindReadinessNavigation('dashboard-wordpress-status', 'settings', 'naver-blog');
  bindReadinessNavigation('dashboard-usage-status', 'account');
  bindReadinessNavigation('dashboard-google-status', 'settings', 'general');
  bindReadinessNavigation('dashboard-health-status', 'logs');

  if (sessionOk && session && naverStatus !== 'unverified') {
    const sessionStateKey = session.valid
      ? 'valid'
      : `invalid:${String(session.reason || 'unknown').trim().toLowerCase() || 'unknown'}`;
    notifyUiIssueFromStateTransition(
      'naver-session',
      sessionStateKey,
      'NAVER_SESSION_INVALID',
      { code: 'NAVER_SESSION_INVALID', message: session.message || '', reason: session.reason || '' },
      { source: 'dashboard-session-status', reason: session.reason || '' }
    );
  }

  if (accountOverview) {
    renderAccountOverview(accountOverview, { smartUsageRevisionAtRequest });
  }

  // Update Summary Stats
  if (summaryOk && summary) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    setText('stat-blog-weekly', summary.blogWeeklyCount ?? 0);
    setText('stat-shop-weekly', summary.shoppingWeeklyCount ?? 0);
    setText('stat-topic-pending', summary.pendingTopicsCount ?? 0);
    setText('stat-trend-pending', summary.pendingTrendsCount ?? 0);
    setText('stat-trend-recent-date', summary.recentTrendsFetched || '-');
    setText('stat-blog-today', summary.blogTodayCount ?? 0);
    setText('stat-blog-yesterday', summary.blogYesterdayCount ?? 0);
    setText('stat-shop-today', summary.shoppingTodayCount ?? 0);
    setText('stat-shop-yesterday', summary.shoppingYesterdayCount ?? 0);
    setText('stat-blog-today-date', formatYmd(today));
    setText('stat-shop-today-date', formatYmd(today));
    setText('stat-blog-yesterday-date', formatYmd(yesterday));
    setText('stat-shop-yesterday-date', formatYmd(yesterday));
  } else {
    setText('stat-blog-weekly', '-');
    setText('stat-shop-weekly', '-');
    setText('stat-topic-pending', '-');
    setText('stat-trend-pending', '-');
    setText('stat-trend-recent-date', '-');
    setText('stat-blog-today', '-');
    setText('stat-blog-yesterday', '-');
    setText('stat-shop-today', '-');
    setText('stat-shop-yesterday', '-');
    setText('stat-blog-today-date', '-');
    setText('stat-shop-today-date', '-');
    setText('stat-blog-yesterday-date', '-');
    setText('stat-shop-yesterday-date', '-');
  }

  // Auto status cards
  const blogAutoEnabled = Boolean(auto?.blog?.enabled);
  dashboardAutoScheduleState.blog.enabled = blogAutoEnabled;
  dashboardAutoScheduleState.blog.nextRunAt = String(auto?.blog?.nextRunAt || '').trim();
  dashboardAutoScheduleState.blog.status = auto?.blog?.status;
  dashboardAutoScheduleState.blog.startTime = auto?.blog?.settings?.PUBLISH_AUTO_START_TIME;
  dashboardAutoScheduleState.blog.endTime = auto?.blog?.settings?.PUBLISH_AUTO_END_TIME;

  setText('dash-auto-blog-enabled', blogAutoEnabled ? 'ON' : 'OFF');
  renderDashboardAutoSchedule();

  const blogCard = document.getElementById('dash-auto-blog-card');
  const blogStateChip = document.getElementById('dash-auto-blog-enabled');
  if (blogStateChip) {
    blogStateChip.classList.toggle('on', blogAutoEnabled);
    blogStateChip.classList.toggle('off', !blogAutoEnabled);
  }
  if (blogCard) {
    blogCard.classList.toggle('is-on', blogAutoEnabled);
    blogCard.classList.toggle('is-off', !blogAutoEnabled);
  }
  if (blogCard && !blogCard._navBound) {
    blogCard._navBound = true;
    blogCard.addEventListener('click', () => void navigateTo('blog', 'auto'));
  }
  // 📊 compact meta info: 주기, 연속건수, 대상 채널
  function renderAutoMetaRow(prefix, settings, enabledFlag) {
    const metaEl = document.getElementById(`dash-auto-${prefix}-meta`);
    if (!metaEl) return;
    if (!enabledFlag || !settings) {
      metaEl.innerHTML = '';
      return;
    }
    const interval = settings.PUBLISH_AUTO_INTERVAL_MIN ?? '-';
    const batch = settings.PUBLISH_AUTO_BATCH_SIZE ?? '-';
    const channelStr = settings.PUBLISH_AUTO_TARGET_CHANNELS ?? 'naver';
    const channels = String(channelStr).split(',').map(v => v.trim()).filter(Boolean);
    const channelLabel = channels.map(c => c === 'wordpress' ? 'WP' : c === 'naver' ? '네이버' : c).join(' · ');
    metaEl.innerHTML = [
      `<span class="dash-meta-chip">⏱ ${interval}분 주기</span>`,
      `<span class="dash-meta-chip">📄 ${batch}건/회</span>`,
      channelLabel ? `<span class="dash-meta-chip">🎯 ${channelLabel}</span>` : ''
    ].filter(Boolean).join('');
  }

  renderAutoMetaRow('blog', auto?.blog?.settings, blogAutoEnabled);

  // Top header status bar
  setText('top-plan', `플랜: ${license?.planName || license?.planCode || '-'}`);
  setText('top-remaining', `잔여: ${formatRemaining(license?.remaining)}`);
  setText('top-session', `세션: ${sessionOk ? (session.valid ? '유효' : '만료') : '-'}`);

  await Promise.all([
    loadDashboardLogs(),
    loadDashboardExternalContent({ force: false, silent: true })
  ]);
}
