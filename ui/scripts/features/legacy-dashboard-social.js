function bindAccountUpgradeFreeClick() {
  if (accountUpgradeFreeClickBound || typeof document === 'undefined') return;
  accountUpgradeFreeClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-upgrade-free-btn');
    if (!button) return;
    event.preventDefault();
    upgradeAccountToFreePlan().catch((error) => console.warn('[Account Upgrade Free]', error.message));
  });
}

bindAccountUpgradeFreeClick();

let accountEmailClickBound = false;
function bindAccountEmailClick() {
  if (accountEmailClickBound || typeof document === 'undefined') return;
  accountEmailClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-register-email-btn');
    if (!button) return;
    event.preventDefault();
    registerOrChangeAccountEmail().catch((error) => console.warn('[Account Email]', error.message));
  });
}

bindAccountEmailClick();

let accountPlanInfoClickBound = false;
function bindAccountPlanInfoClick() {
  if (accountPlanInfoClickBound || typeof document === 'undefined') return;
  accountPlanInfoClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-plan-info-btn');
    if (!button) return;
    event.preventDefault();
    showAccountPlanInfo().catch((error) => console.warn('[Account Plan Info]', error.message));
  });
}

bindAccountPlanInfoClick();

async function loadDashboard() {
  if (isDashboardLoading || (Date.now() - lastDashboardLoadTime < 5000)) {
    return; // Throttle: prevent concurrent or overly frequent calls (5s cooldown)
  }
  isDashboardLoading = true;

  const quietCatch = (e) => {
    if (e.status === 503 || String(e.message).includes('fetch failed')) return null;
    console.warn('[Dashboard Polling]', e.message);
    return null;
  };

  let healthResult, accountResult, summaryResult, autoResult;
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
  }

  const healthOk = healthResult.status === 'fulfilled';
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
  const session = naverConnection ? {
    valid: naverConnection.status === 'connected',
    reason: naverConnection.reason || '',
    message: naverConnection.message || ''
  } : null;
  const summary = summaryOk ? summaryResult.value : null;
  const auto = autoOk ? autoResult.value : null;

  // Update Badges
  const healthBadge = document.getElementById('badge-health');
  if (healthBadge) {
    if (healthOk && health) {
      healthBadge.textContent = 'Health: OK';
      healthBadge.style.background = '#dcfce7'; healthBadge.style.color = '#166534';

      syncAppVersionDisplays(health.version);
    } else {
      healthBadge.textContent = 'Health: Error';
      healthBadge.style.background = '#fee2e2'; healthBadge.style.color = '#991b1b';
    }
    healthBadge.style.cursor = 'pointer';
    if (!healthBadge._navBound) {
      healthBadge._navBound = true;
      healthBadge.addEventListener('click', () => void navigateTo('settings', 'general'));
    }
  }

  const sessionBadge = document.getElementById('badge-session');
  if (sessionBadge) {
    if (sessionOk && session && session.valid) {
      sessionBadge.textContent = 'Naver: 로그인';
      sessionBadge.style.background = '#dbeafe'; sessionBadge.style.color = '#1e3a8a';
    } else {
      sessionBadge.textContent = 'Naver: 로그인 필요';
      sessionBadge.style.background = '#fef3c7'; sessionBadge.style.color = '#92400e';
    }
    sessionBadge.style.cursor = 'pointer';
    if (!sessionBadge._navBound) {
      sessionBadge._navBound = true;
      sessionBadge.addEventListener('click', () => void navigateTo('settings', 'naver-blog'));
    }
  }
  if (sessionOk && session) {
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

  const licenseBadge = document.getElementById('badge-license');
  if (licenseBadge) {
    if (licenseOk && license) {
      const rawPlanName = String(license.planName || license.planCode || '').trim();
      const compactPlanName = rawPlanName.replace(/\s+plan$/i, '').trim() || rawPlanName || '-';
      licenseBadge.textContent = `Plan: ${compactPlanName} (잔여 ${license.remaining})`;
      licenseBadge.style.background = '#f3e8ff'; licenseBadge.style.color = '#6b21a8';
    } else {
      licenseBadge.textContent = 'Plan: 확인불가';
      licenseBadge.style.background = '#fee2e2'; licenseBadge.style.color = '#991b1b';
    }
    licenseBadge.style.cursor = 'pointer';
    if (!licenseBadge._navBound) {
      licenseBadge._navBound = true;
      licenseBadge.addEventListener('click', () => void navigateTo('account'));
    }
  }

  if (accountOverview) {
    lastAccountOverview = accountOverview;
    renderAccountOverview(accountOverview);
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
  const shopAutoEnabled = Boolean(auto?.shopping?.enabled);
  dashboardAutoScheduleState.blog.enabled = blogAutoEnabled;
  dashboardAutoScheduleState.blog.nextRunAt = String(auto?.blog?.nextRunAt || '').trim();
  dashboardAutoScheduleState.blog.status = auto?.blog?.status;
  dashboardAutoScheduleState.blog.startTime = auto?.blog?.settings?.PUBLISH_AUTO_START_TIME;
  dashboardAutoScheduleState.blog.endTime = auto?.blog?.settings?.PUBLISH_AUTO_END_TIME;

  dashboardAutoScheduleState.shopping.enabled = shopAutoEnabled;
  dashboardAutoScheduleState.shopping.nextRunAt = String(auto?.shopping?.nextRunAt || '').trim();
  dashboardAutoScheduleState.shopping.status = auto?.shopping?.status;
  dashboardAutoScheduleState.shopping.startTime = auto?.shopping?.settings?.SHOPPING_PUBLISH_AUTO_START_TIME;
  dashboardAutoScheduleState.shopping.endTime = auto?.shopping?.settings?.SHOPPING_PUBLISH_AUTO_END_TIME;

  setText('dash-auto-blog-enabled', blogAutoEnabled ? 'ON' : 'OFF');
  setText('dash-auto-shopping-enabled', shopAutoEnabled ? 'ON' : 'OFF');
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
  const shoppingCard = document.getElementById('dash-auto-shopping-card');
  const shoppingStateChip = document.getElementById('dash-auto-shopping-enabled');
  if (shoppingStateChip) {
    shoppingStateChip.classList.toggle('on', shopAutoEnabled);
    shoppingStateChip.classList.toggle('off', !shopAutoEnabled);
  }
  if (shoppingCard) {
    shoppingCard.classList.toggle('is-on', shopAutoEnabled);
    shoppingCard.classList.toggle('is-off', !shopAutoEnabled);
  }
  if (shoppingCard && !shoppingCard._navBound) {
    shoppingCard._navBound = true;
    shoppingCard.addEventListener('click', () => void navigateTo('shopping', 'auto'));
  }

  // 📊 compact meta info: 주기, 연속건수, 대상 채널
  function renderAutoMetaRow(prefix, settings, enabledFlag) {
    const metaEl = document.getElementById(`dash-auto-${prefix}-meta`);
    if (!metaEl) return;
    if (!enabledFlag || !settings) {
      metaEl.innerHTML = '';
      return;
    }
    // 블로그: PUBLISH_AUTO_*, 쇼핑: SHOPPING_PUBLISH_AUTO_*
    const interval = settings.PUBLISH_AUTO_INTERVAL_MIN ?? settings.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN ?? '-';
    const batch = settings.PUBLISH_AUTO_BATCH_SIZE ?? settings.SHOPPING_PUBLISH_AUTO_BATCH_SIZE ?? '-';
    const channelStr = settings.PUBLISH_AUTO_TARGET_CHANNELS ?? settings.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS ?? 'naver';
    const channels = String(channelStr).split(',').map(v => v.trim()).filter(Boolean);
    const channelLabel = channels.map(c => c === 'wordpress' ? 'WP' : c === 'naver' ? '네이버' : c).join(' · ');
    metaEl.innerHTML = [
      `<span class="dash-meta-chip">⏱ ${interval}분 주기</span>`,
      `<span class="dash-meta-chip">📄 ${batch}건/회</span>`,
      channelLabel ? `<span class="dash-meta-chip">🎯 ${channelLabel}</span>` : ''
    ].filter(Boolean).join('');
  }

  renderAutoMetaRow('blog', auto?.blog?.settings, blogAutoEnabled);
  renderAutoMetaRow('shopping', auto?.shopping?.settings, shopAutoEnabled);

  // Top header status bar
  setText('top-plan', `플랜: ${license?.planName || license?.planCode || '-'}`);
  setText('top-remaining', `잔여: ${formatRemaining(license?.remaining)}`);
  setText('top-session', `세션: ${sessionOk ? (session.valid ? '유효' : '만료') : '-'}`);

  await Promise.all([
    loadDashboardLogs(),
    loadDashboardExternalContent({ force: false, silent: true })
  ]);
}

async function loadDashboardLogs() {
  const dashList = document.getElementById('activity-timeline');
  const logsList = document.getElementById('logs-activity-timeline');
  if (!dashList && !logsList) return;

  try {
    const [activityRes, logsRes] = await Promise.all([
      dashList ? fetchJson('/api/v1/dashboard/activities?limit=60') : Promise.resolve(null),
      logsList ? fetchJson('/api/v1/dashboard/logs?limit=200') : Promise.resolve(null)
    ]);
    const activities = Array.isArray(activityRes?.activities) ? activityRes.activities : [];
    const logs = Array.isArray(logsRes?.logs) ? logsRes.logs : [];

    const renderActivities = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(activity => {
        const title = String(activity.title || '').trim() || '활동';
        const detail = String(activity.detail || '').trim();
        const level = String(activity.level || 'info').trim().toLowerCase();
        const icon = level === 'error' ? '❌' : (level === 'warn' ? '⚠️' : '✅');
        const timestamp = String(activity.timestamp || '').trim();
        const timeLabel = formatDashboardActivityTime(timestamp);
        const isDashboard = list.id === 'activity-timeline';
        const timeWidth = isDashboard ? '118px' : '132px';
        const timeFontSize = isDashboard ? '11px' : '12px';
        const timeMarginRight = isDashboard ? '12px' : '16px';

        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';
        li.style.display = 'flex';
        li.style.alignItems = 'baseline';
        li.innerHTML = `
          <span style="color:#94a3b8; font-size:${timeFontSize}; margin-right:${timeMarginRight}; white-space: nowrap; width:${timeWidth}; flex:0 0 ${timeWidth}; font-variant-numeric: tabular-nums; line-height:1.25;">${timeLabel}</span>
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${title.replace(/"/g, '&quot;')}">${icon} ${title}</span>
            ${detail ? `<span style="color:#64748b; font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${detail.replace(/"/g, '&quot;')}">${detail}</span>` : ''}
          </div>
        `;
        list.appendChild(li);
      });
    };

    const renderLogs = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(log => {
        const msg = String(log.message || '').trim();
        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';
        li.style.display = 'flex';
        li.style.alignItems = 'center';

        let icon = 'ℹ️';
        if (log.level === 'error') icon = '❌';
        else if (log.level === 'warn') icon = '⚠️';
        else if (msg.includes('완료') || msg.includes('성공')) icon = '✅';

        const startsWithEmoji = /^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/.test(msg);
        const finalMessage = (startsWithEmoji && (msg.startsWith(icon) || icon === 'ℹ️')) ? msg : `${icon} ${msg}`;

        // 대시보드에서는 말줄임표 처리 (line-break 방지)
        const isDashboard = list.id === 'activity-timeline';
        const msgStyle = isDashboard
          ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;'
          : 'flex: 1; word-break: break-all;';
        const timeWidth = isDashboard ? '118px' : '132px';
        const timeFontSize = isDashboard ? '11px' : '12px';
        const timeMarginRight = isDashboard ? '12px' : '16px';

        li.innerHTML = `
          <span style="color:#94a3b8; font-size:${timeFontSize}; margin-right:${timeMarginRight}; white-space: nowrap; width:${timeWidth}; flex:0 0 ${timeWidth}; font-variant-numeric: tabular-nums;">${formatDashboardActivityTime(log.timestamp)}</span>
          <span style="${msgStyle}" title="${msg.replace(/"/g, '&quot;')}">${finalMessage}</span>
        `;
        list.appendChild(li);
      });
    };

    renderActivities(dashList, activities.slice(0, 60));
    renderLogs(logsList, logs.slice(0, 50));
    syncDashboardBottomColumnHeights();
  } catch (err) {
    if (err.status === 503 || String(err.message).includes('fetch failed')) return;
    const failHtml = '<li class="timeline-empty" style="padding: 12px; color: #ef4444; text-align: center; font-size: 14px;">로그를 불러오는데 실패했습니다.</li>';
    if (dashList) dashList.innerHTML = failHtml;
    if (logsList) logsList.innerHTML = failHtml;
  }
}

async function loadLogFiles() {
  const select = document.getElementById('logs-system-file-select');
  if (!select) return;
  try {
    const data = await fetchJson('/api/v1/logs/files');
    if (!data.files || data.files.length === 0) {
      select.innerHTML = '<option value="">로그 파일이 없습니다.</option>';
      return;
    }
    select.innerHTML = '';
    data.files.forEach(file => {
      const opt = document.createElement('option');
      opt.value = file;
      opt.textContent = file;
      select.appendChild(opt);
    });
    // 최초 파일 자동 로드
    select.value = data.files[0];
    loadSystemLog();
  } catch (err) {
    if (err.status === 503 || String(err.message).includes('fetch failed')) return;
    select.innerHTML = '<option value="">목록을 불러오지 못했습니다.</option>';
  }
}

async function loadSystemLog() {
  const select = document.getElementById('logs-system-file-select');
  const content = document.getElementById('logs-system-content');
  if (!select || !content) return;
  const scrollContainer = content.closest('.terminal-container') || content;

  const fileName = select.value;
  if (!fileName) {
    content.textContent = '로그 파일을 선택해 주세요.';
    systemLogRenderState.fileName = '';
    systemLogRenderState.lastRaw = '';
    return;
  }

  const isFileChanged = systemLogRenderState.fileName !== fileName;
  if (isFileChanged) {
    content.textContent = '로딩 중...';
    systemLogRenderState.fileName = fileName;
    systemLogRenderState.lastRaw = '';
  }

  const isNearBottom = (() => {
    const gap = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    return gap <= 24;
  })();

  try {
    const res = await fetchJson(`/api/v1/logs/read?file=${encodeURIComponent(fileName)}`);
    const rawContent = String(res?.content || '');

    if (!rawContent) {
      content.textContent = '내용이 없습니다.';
      systemLogRenderState.lastRaw = '';
      return;
    }

    const oldRaw = systemLogRenderState.lastRaw || '';
    if (!oldRaw) {
      // 최초 로드
      content.innerHTML = formatSystemLogHtml(rawContent);
      systemLogRenderState.lastRaw = rawContent;
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
      return;
    }

    if (rawContent === oldRaw) {
      // 변경 없음
      return;
    }

    if (rawContent.startsWith(oldRaw)) {
      // 증분 append (꿀렁임 최소화)
      const delta = rawContent.slice(oldRaw.length);
      if (delta) {
        content.insertAdjacentHTML('beforeend', formatSystemLogHtml(delta));
      }
      systemLogRenderState.lastRaw = rawContent;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
      }
      return;
    }

    // 파일 롤링/잘림 등으로 prefix가 깨진 경우 전체 재렌더
    content.innerHTML = formatSystemLogHtml(rawContent);
    systemLogRenderState.lastRaw = rawContent;
    if (isNearBottom || isFileChanged) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  } catch (e) {
    if (e.status === 503 || String(e.message).includes('fetch failed')) {
      content.textContent = '네트워크 연결이 지연되고 있습니다...';
      return;
    }
    content.textContent = '로그를 읽어오지 못했습니다: ' + e.message;
  }
}

function formatSystemLogHtml(rawText) {
  let htmlContent = escapeHtml(rawText);
  htmlContent = htmlContent.replace(/\[ERROR\]/g, '<span style="color:#ef4444; font-weight:bold;">[ERROR]</span>');
  htmlContent = htmlContent.replace(/\[WARN\]/g, '<span style="color:#f59e0b; font-weight:bold;">[WARN]</span>');
  return htmlContent;
}

let clockInterval = null;
const CLOCK_STYLE_STORAGE_KEY = 'blog_genius_clock_style_v1';
const CLOCK_MODE_STORAGE_KEY = 'blog_genius_clock_mode_v1';
const POMODORO_STYLE_STORAGE_KEY = 'blog_genius_pomodoro_style_v1';
const POMODORO_STATE_STORAGE_KEY = 'blog_genius_pomodoro_state_v1';
const POMODORO_SOUND_STORAGE_KEY = 'blog_genius_pomodoro_sound_v1';
const POMODORO_DURATIONS = Object.freeze({ focus: 25 * 60 * 1000, break: 5 * 60 * 1000 });
const QUICK_POSTING_CELEBRATION_MAX_WAIT_MS = 10 * 60 * 1000;
let celebrationCleanupTimer = null;
let pendingQuickPostingCelebrationAt = 0;

function showAppCelebration({ title, message } = {}) {
  document.querySelectorAll('.app-celebration').forEach((item) => item.remove());
  if (celebrationCleanupTimer) clearTimeout(celebrationCleanupTimer);
  const celebration = document.createElement('div');
  celebration.className = 'app-celebration';
  celebration.setAttribute('aria-hidden', 'true');
  const colors = ['#38bdf8', '#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#a855f7'];
  const particleCount = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 64;
  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('i');
    particle.style.setProperty('--confetti-x', `${Math.round(Math.random() * 100)}vw`);
    particle.style.setProperty('--confetti-drift', `${Math.round((Math.random() - 0.5) * 34)}vw`);
    particle.style.setProperty('--confetti-delay', `${(Math.random() * 0.7).toFixed(2)}s`);
    particle.style.setProperty('--confetti-duration', `${(2.1 + Math.random() * 1.2).toFixed(2)}s`);
    particle.style.setProperty('--confetti-rotation', `${Math.round(Math.random() * 720 - 360)}deg`);
    particle.style.setProperty('--confetti-color', colors[index % colors.length]);
    celebration.appendChild(particle);
  }
  const messageBox = document.createElement('div');
  messageBox.className = 'app-celebration-message';
  const titleEl = document.createElement('strong');
  titleEl.textContent = String(title || '완료! 🎉');
  const messageEl = document.createElement('span');
  messageEl.textContent = String(message || '잘 해냈어요.');
  messageBox.append(titleEl, messageEl);
  celebration.appendChild(messageBox);
  document.body.appendChild(celebration);
  celebrationCleanupTimer = setTimeout(() => celebration.remove(), 3600);
}

function showQuickPostingCelebration() {
  showAppCelebration({
    title: '글쓰기 완료! 🎉',
    message: '새 글을 안전하게 저장했어요.'
  });
}

function isQuickPostingCelebrationStatus(postStatus) {
  return postStatus === 'publish' || postStatus === 'draft';
}

function showOrQueueQuickPostingCelebration() {
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    pendingQuickPostingCelebrationAt = 0;
    showQuickPostingCelebration();
    return;
  }
  pendingQuickPostingCelebrationAt = Date.now();
}

function flushPendingQuickPostingCelebration() {
  if (!pendingQuickPostingCelebrationAt) return;
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
  const waitedMs = Date.now() - pendingQuickPostingCelebrationAt;
  pendingQuickPostingCelebrationAt = 0;
  if (waitedMs <= QUICK_POSTING_CELEBRATION_MAX_WAIT_MS) showQuickPostingCelebration();
}

function initClockWidget() {
  const displays = Array.from(document.querySelectorAll('[data-clock-display]'));
  if (!displays.length) return;

  const styleOptions = [
    { value: 'random', label: '랜덤', icon: '✨' },
    { value: 'digital', label: '디지털', icon: '12:34' },
    { value: 'analog', label: '아날로그', icon: '◷' },
    { value: 'flip', label: '플립', icon: '▣' },
    { value: 'heart', label: '하트', icon: '♥' },
    { value: 'split', label: '분할', icon: 'H M S' },
    { value: 'neon', label: '네온', icon: '✦' },
    { value: 'soft', label: '소프트', icon: '●' }
  ];
  const styles = styleOptions.filter((option) => option.value !== 'random').map((option) => option.value);
  const timerStyleOptions = [
    { value: 'tomato', label: '토마토', icon: '🍅' },
    { value: 'ring', label: '포커스 링', icon: '◯' },
    { value: 'flip', label: '플립', icon: '▣' },
    { value: 'soft', label: '소프트', icon: '●' }
  ];
  const timerStyles = timerStyleOptions.map((option) => option.value);
  const randomStyle = () => styles[Math.floor(Math.random() * styles.length)] || 'digital';
  let preferredStyle = 'random';
  let displayMode = 'clock';
  let timerStyle = 'tomato';
  let completionSoundEnabled = true;
  let timerState = {
    phase: 'focus',
    status: 'idle',
    remainingMs: POMODORO_DURATIONS.focus,
    endsAt: null,
    completionId: null
  };
  try {
    const savedStyle = localStorage.getItem(CLOCK_STYLE_STORAGE_KEY);
    if (savedStyle === 'random' || styles.includes(savedStyle)) preferredStyle = savedStyle;
    const savedMode = localStorage.getItem(CLOCK_MODE_STORAGE_KEY);
    if (savedMode === 'clock' || savedMode === 'timer') displayMode = savedMode;
    const savedTimerStyle = localStorage.getItem(POMODORO_STYLE_STORAGE_KEY);
    if (timerStyles.includes(savedTimerStyle)) timerStyle = savedTimerStyle;
    completionSoundEnabled = localStorage.getItem(POMODORO_SOUND_STORAGE_KEY) !== 'off';
    const savedTimerState = JSON.parse(localStorage.getItem(POMODORO_STATE_STORAGE_KEY) || 'null');
    if (savedTimerState && POMODORO_DURATIONS[savedTimerState.phase]) {
      const status = ['idle', 'running', 'paused', 'completed'].includes(savedTimerState.status)
        ? savedTimerState.status
        : 'idle';
      timerState = {
        phase: savedTimerState.phase,
        status,
        remainingMs: Number.isFinite(Number(savedTimerState.remainingMs))
          ? Math.max(0, Number(savedTimerState.remainingMs))
          : POMODORO_DURATIONS[savedTimerState.phase],
        endsAt: status === 'running' && Number.isFinite(Number(savedTimerState.endsAt))
          ? Number(savedTimerState.endsAt)
          : null,
        completionId: typeof savedTimerState.completionId === 'string' ? savedTimerState.completionId : null
      };
    }
  } catch (_) {
    preferredStyle = 'random';
  }
  let currentStyle = preferredStyle === 'random' ? randomStyle() : preferredStyle;
  let previousValue = null;
  let timerCompletionPulseUntil = 0;
  let timerCompletionPhase = null;
  let lastHandledCompletionId = timerState.completionId;
  let completionAudioContext = null;
  const widgetUnits = [];

  function getCompletionAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!completionAudioContext) completionAudioContext = new AudioContextClass();
    if (completionAudioContext.state === 'suspended') {
      completionAudioContext.resume().catch(() => {});
    }
    return completionAudioContext;
  }

  function playCompletionSound(phase) {
    if (!completionSoundEnabled) return;
    try {
      const context = getCompletionAudioContext();
      if (!context) return;
      const scheduleNotes = () => {
        const notes = phase === 'focus'
          ? [{ frequency: 523.25, offset: 0 }, { frequency: 659.25, offset: 0.15 }, { frequency: 783.99, offset: 0.3 }]
          : [{ frequency: 440, offset: 0 }, { frequency: 523.25, offset: 0.2 }];
        const startAt = context.currentTime + 0.03;
        notes.forEach(({ frequency, offset }) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const noteStart = startAt + offset;
          const noteEnd = noteStart + (phase === 'focus' ? 0.38 : 0.45);
          oscillator.type = phase === 'focus' ? 'sine' : 'triangle';
          oscillator.frequency.setValueAtTime(frequency, noteStart);
          gain.gain.setValueAtTime(0.0001, noteStart);
          gain.gain.exponentialRampToValueAtTime(phase === 'focus' ? 0.16 : 0.1, noteStart + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(noteStart);
          oscillator.stop(noteEnd + 0.02);
        });
      };
      if (context.state === 'suspended') context.resume().then(scheduleNotes).catch(() => {});
      else scheduleNotes();
    } catch (_) {
      // 오디오가 지원되지 않거나 차단되어도 시각 완료 효과는 계속 제공합니다.
    }
  }

  function showFocusCelebration() {
    showAppCelebration({
      title: '집중 완료! 🎉',
      message: '잘 해냈어요. 5분 쉬어갈까요?'
    });
  }

  function handleTimerCompletion(phase, completionId) {
    if (!completionId || completionId === lastHandledCompletionId) return;
    lastHandledCompletionId = completionId;
    timerCompletionPhase = phase;
    timerCompletionPulseUntil = Date.now() + (phase === 'focus' ? 3000 : 2400);
    playCompletionSound(phase);
    if (phase === 'focus') showFocusCelebration();
  }

  function persistTimerState() {
    try {
      localStorage.setItem(POMODORO_STATE_STORAGE_KEY, JSON.stringify(timerState));
    } catch (_) {
      // 저장소를 사용할 수 없어도 현재 실행 중 타이머는 유지합니다.
    }
  }

  function getTimerSnapshot(nowMs = Date.now()) {
    let remainingMs = timerState.remainingMs;
    if (timerState.status === 'running') {
      remainingMs = Math.max(0, Number(timerState.endsAt) - nowMs);
      if (remainingMs <= 0) {
        const completionId = `${timerState.phase}:${timerState.endsAt}`;
        timerState = { ...timerState, status: 'completed', remainingMs: 0, endsAt: null, completionId };
        persistTimerState();
        handleTimerCompletion(timerState.phase, completionId);
      }
    }
    const durationMs = POMODORO_DURATIONS[timerState.phase];
    return {
      ...timerState,
      durationMs,
      remainingMs,
      progress: Math.min(1, Math.max(0, 1 - (remainingMs / durationMs)))
    };
  }

  function formatTimerValue(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return { minutes, seconds, text: `${minutes}:${seconds}` };
  }

  function saveDisplayMode(mode) {
    displayMode = mode;
    try { localStorage.setItem(CLOCK_MODE_STORAGE_KEY, mode); } catch (_) { /* noop */ }
  }

  function saveTimerStyle(style) {
    timerStyle = style;
    try { localStorage.setItem(POMODORO_STYLE_STORAGE_KEY, style); } catch (_) { /* noop */ }
  }

  function toggleCompletionSound() {
    completionSoundEnabled = !completionSoundEnabled;
    try {
      localStorage.setItem(POMODORO_SOUND_STORAGE_KEY, completionSoundEnabled ? 'on' : 'off');
    } catch (_) {
      // 저장하지 못해도 현재 실행 중 설정은 유지합니다.
    }
    if (completionSoundEnabled) getCompletionAudioContext();
    refreshStyleMenus();
  }

  function getSeasonMood(now) {
    const month = now.getMonth() + 1;
    const season = month >= 3 && month <= 5
      ? 'spring'
      : month >= 6 && month <= 8
        ? 'summer'
        : month >= 9 && month <= 11
          ? 'autumn'
          : 'winter';
    const seasonLabel = {
      1: '한겨울', 2: '늦겨울', 3: '초봄', 4: '봄', 5: '늦봄', 6: '초여름',
      7: '한여름', 8: '늦여름', 9: '초가을', 10: '가을', 11: '늦가을', 12: '초겨울'
    }[month];
    const hour = now.getHours();
    const message = hour >= 5 && hour < 11
      ? '좋은 아침이에요'
      : hour >= 11 && hour < 14
        ? '잠시 숨을 고르기 좋은 시간이에요'
        : hour >= 14 && hour < 18
          ? '좋은 오후예요'
          : hour >= 18 && hour < 22
            ? '오늘도 수고했어요'
            : '조용한 밤이에요';
    const dateText = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(now);
    return { season, text: `${dateText} · ${seasonLabel}`, message };
  }

  function closeStyleMenus(exceptUnit = null) {
    widgetUnits.forEach(({ unit, button }) => {
      if (unit === exceptUnit) return;
      unit.classList.remove('clock-style-menu-open');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function savePreferredStyle(style) {
    preferredStyle = style;
    try {
      localStorage.setItem(CLOCK_STYLE_STORAGE_KEY, style);
    } catch (_) {
      // 저장소를 사용할 수 없어도 현재 실행 중 선택은 유지합니다.
    }
  }

  function refreshStyleMenus() {
    widgetUnits.forEach(({ menu }) => {
      menu.querySelectorAll('[data-clock-mode]').forEach((item) => {
        const isSelected = item.dataset.clockMode === displayMode;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      const clockStyles = menu.querySelector('[data-clock-style-section]');
      const timerStylesSection = menu.querySelector('[data-timer-style-section]');
      if (clockStyles) clockStyles.hidden = displayMode !== 'clock';
      if (timerStylesSection) timerStylesSection.hidden = displayMode !== 'timer';
      menu.querySelectorAll('[data-clock-style]').forEach((item) => {
        const isSelected = item.dataset.clockStyle === preferredStyle;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-checked', String(isSelected));
      });
      menu.querySelectorAll('[data-timer-style]').forEach((item) => {
        const isSelected = item.dataset.timerStyle === timerStyle;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-checked', String(isSelected));
      });
      const soundToggle = menu.querySelector('[data-pomodoro-sound-toggle]');
      if (soundToggle) {
        soundToggle.classList.toggle('active', completionSoundEnabled);
        soundToggle.setAttribute('aria-pressed', String(completionSoundEnabled));
        const state = soundToggle.querySelector('[data-pomodoro-sound-state]');
        if (state) state.textContent = completionSoundEnabled ? '켜짐' : '꺼짐';
      }
    });
  }

  function refreshTimerControls(snapshot) {
    const phaseLabel = snapshot.phase === 'focus' ? '집중' : '휴식';
    const statusLabel = {
      idle: '동작을 선택하세요',
      running: `${phaseLabel} 중 · ${formatTimerValue(snapshot.remainingMs).text} 남음`,
      paused: `${phaseLabel} 일시정지 · ${formatTimerValue(snapshot.remainingMs).text} 남음`,
      completed: `${phaseLabel} 완료!`
    }[snapshot.status];
    widgetUnits.forEach(({ menu }) => {
      const status = menu.querySelector('[data-pomodoro-status]');
      if (status) status.textContent = statusLabel;
      const isActive = snapshot.status === 'running' || snapshot.status === 'paused';
      menu.querySelectorAll('[data-timer-action="start-focus"], [data-timer-action="start-break"]').forEach((item) => {
        item.disabled = isActive;
      });
      const pauseButton = menu.querySelector('[data-timer-action="toggle-pause"]');
      const stopButton = menu.querySelector('[data-timer-action="stop"]');
      const runningActions = menu.querySelector('.pomodoro-running-actions');
      if (runningActions) runningActions.hidden = !isActive;
      if (pauseButton) {
        pauseButton.hidden = !isActive;
        pauseButton.textContent = snapshot.status === 'paused' ? '▶ 계속' : 'Ⅱ 일시정지';
      }
      if (stopButton) stopButton.hidden = !isActive;
    });
  }

  function selectStyle(style) {
    if (style !== 'random' && !styles.includes(style)) return;
    savePreferredStyle(style);
    currentStyle = style === 'random' ? randomStyle() : style;
    previousValue = null;
    refreshStyleMenus();
    closeStyleMenus();
    displays.forEach((item) => {
      item.classList.remove('clock-display-pulse');
      void item.offsetWidth;
      item.classList.add('clock-display-pulse');
    });
    renderClock();
  }

  function selectDisplayMode(mode) {
    if (mode !== 'clock' && mode !== 'timer') return;
    saveDisplayMode(mode);
    previousValue = null;
    refreshStyleMenus();
    renderClock();
  }

  function selectTimerStyle(style) {
    if (!timerStyles.includes(style)) return;
    saveTimerStyle(style);
    refreshStyleMenus();
    renderClock();
  }

  function startTimer(phase) {
    const durationMs = POMODORO_DURATIONS[phase];
    if (!durationMs) return;
    timerState = {
      phase,
      status: 'running',
      remainingMs: durationMs,
      endsAt: Date.now() + durationMs,
      completionId: null
    };
    timerCompletionPhase = null;
    getCompletionAudioContext();
    persistTimerState();
    renderClock();
  }

  function toggleTimerPause() {
    const snapshot = getTimerSnapshot();
    if (snapshot.status === 'running') {
      timerState = { ...timerState, status: 'paused', remainingMs: snapshot.remainingMs, endsAt: null };
    } else if (snapshot.status === 'paused') {
      timerState = { ...timerState, status: 'running', endsAt: Date.now() + snapshot.remainingMs };
    } else {
      return;
    }
    persistTimerState();
    renderClock();
  }

  function stopTimer() {
    timerState = {
      phase: 'focus',
      status: 'idle',
      remainingMs: POMODORO_DURATIONS.focus,
      endsAt: null,
      completionId: null
    };
    timerCompletionPhase = null;
    persistTimerState();
    renderClock();
  }

  displays.forEach((display) => {
    const unit = document.createElement('div');
    unit.className = 'clock-widget-unit';
    const main = document.createElement('div');
    main.className = 'clock-widget-main';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clock-style-button';
    button.title = '시계 및 타이머 메뉴';
    button.setAttribute('aria-label', '시계 및 타이머 메뉴');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `
      <svg class="clock-menu-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
      </svg>
    `;
    const controlRail = document.createElement('div');
    controlRail.className = 'clock-control-rail';
    const inlineActions = document.createElement('div');
    inlineActions.className = 'pomodoro-inline-actions';
    inlineActions.setAttribute('aria-label', '타이머 제어');
    const meta = document.createElement('div');
    meta.className = 'clock-ambient-meta';
    meta.setAttribute('aria-live', 'polite');
    const menu = document.createElement('div');
    menu.className = 'clock-style-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', '시계와 집중 타이머');
    menu.innerHTML = `
      <div class="clock-mode-switch" aria-label="메인 표시 모드">
        <button type="button" data-clock-mode="clock" aria-pressed="false">시계</button>
        <button type="button" data-clock-mode="timer" aria-pressed="false">타이머</button>
      </div>
      <div class="clock-style-section" data-clock-style-section>
        <span class="clock-menu-section-label">시계 스타일</span>
        <div class="clock-style-grid">
          ${styleOptions.map((option) => `
            <button type="button" class="clock-style-option" role="radio" aria-checked="false" data-clock-style="${option.value}">
              <span class="clock-style-option-icon">${option.icon}</span>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="clock-style-section" data-timer-style-section hidden>
        <span class="clock-menu-section-label">타이머 스타일</span>
        <div class="clock-style-grid">
          ${timerStyleOptions.map((option) => `
            <button type="button" class="clock-style-option" role="radio" aria-checked="false" data-timer-style="${option.value}">
              <span class="clock-style-option-icon">${option.icon}</span>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="pomodoro-menu-control">
        <div class="pomodoro-menu-heading">
          <span class="clock-menu-section-label">집중 타이머</span>
          <span data-pomodoro-status></span>
        </div>
        <div class="pomodoro-preset-actions">
          <button type="button" data-timer-action="start-focus">🍅 25분 집중</button>
          <button type="button" data-timer-action="start-break">☕ 5분 휴식</button>
        </div>
        <div class="pomodoro-running-actions">
          <button type="button" data-timer-action="toggle-pause" hidden>Ⅱ 일시정지</button>
          <button type="button" data-timer-action="stop" hidden>종료</button>
        </div>
        <button type="button" class="pomodoro-sound-toggle" data-pomodoro-sound-toggle aria-pressed="true">
          <span>🔔 완료 알림음</span>
          <span data-pomodoro-sound-state>켜짐</span>
        </button>
      </div>
    `;

    const serverControl = display.closest('.dash-clock-widget')?.querySelector('#server-control');
    if (serverControl) {
      const serverControlLabel = document.createElement('span');
      serverControlLabel.className = 'clock-server-control-label';
      serverControlLabel.textContent = '앱 제어';
      serverControl.classList.add('clock-server-control');
      serverControl.setAttribute('aria-label', '앱 제어');
      serverControl.prepend(serverControlLabel);
      menu.appendChild(serverControl);
    }

    display.parentNode.insertBefore(unit, display);
    unit.appendChild(main);
    main.appendChild(display);
    main.appendChild(controlRail);
    controlRail.appendChild(button);
    controlRail.appendChild(inlineActions);
    main.appendChild(meta);
    unit.appendChild(menu);
    widgetUnits.push({ unit, button, inlineActions, meta, menu });

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !unit.classList.contains('clock-style-menu-open');
      closeStyleMenus();
      unit.classList.toggle('clock-style-menu-open', willOpen);
      button.setAttribute('aria-expanded', String(willOpen));
    });
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      const modeOption = event.target.closest('button[data-clock-mode]');
      const clockOption = event.target.closest('[data-clock-style]');
      const timerOption = event.target.closest('[data-timer-style]');
      const timerAction = event.target.closest('[data-timer-action]');
      const soundToggle = event.target.closest('[data-pomodoro-sound-toggle]');
      if (modeOption) selectDisplayMode(modeOption.dataset.clockMode);
      else if (clockOption) selectStyle(clockOption.dataset.clockStyle);
      else if (timerOption) selectTimerStyle(timerOption.dataset.timerStyle);
      else if (soundToggle) toggleCompletionSound();
      else if (timerAction && !timerAction.disabled) {
        const action = timerAction.dataset.timerAction;
        if (action === 'start-focus') startTimer('focus');
        else if (action === 'start-break') startTimer('break');
        else if (action === 'toggle-pause') toggleTimerPause();
        else if (action === 'stop') stopTimer();
      }
    });
    inlineActions.addEventListener('click', (event) => {
      const timerAction = event.target.closest('[data-timer-inline-action]');
      if (!timerAction) return;
      event.stopPropagation();
      const action = timerAction.dataset.timerInlineAction;
      if (action === 'start') startTimer(timerAction.dataset.timerPhase || timerState.phase);
      else if (action === 'toggle-pause') toggleTimerPause();
      else if (action === 'stop') stopTimer();
    });
  });

  displays.forEach((display) => {
    display.addEventListener('click', (event) => {
      if (displayMode === 'timer') {
        const nextIndex = (timerStyles.indexOf(timerStyle) + 1) % timerStyles.length;
        selectTimerStyle(timerStyles[nextIndex]);
      } else {
        const nextIndex = (styles.indexOf(currentStyle) + 1) % styles.length;
        selectStyle(styles[nextIndex]);
      }
    });
  });

  document.addEventListener('click', () => closeStyleMenus());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStyleMenus();
  });

  function renderTimerFace(snapshot) {
    const value = formatTimerValue(snapshot.remainingMs);
    const phaseLabel = snapshot.phase === 'focus' ? '25분 집중' : '5분 휴식';
    const phaseIcon = snapshot.phase === 'focus' ? '🍅' : '☕';
    const faceLabel = snapshot.status === 'completed' ? `✓ ${phaseLabel} 완료` : `${phaseIcon} ${phaseLabel}`;
    const progressDegrees = Math.round(snapshot.progress * 360);
    const progressPercent = Math.round(snapshot.progress * 100);
    if (timerStyle === 'ring') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-ring" style="--pomodoro-progress:${progressDegrees}deg">
            <div class="pomodoro-ring-center">
              <span class="pomodoro-face-label">${faceLabel}</span>
              <span class="pomodoro-face-time">${value.text}</span>
            </div>
          </div>
        </div>
      `;
    }
    if (timerStyle === 'flip') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-flip">
            <span class="pomodoro-face-label">${faceLabel}</span>
            <div class="pomodoro-flip-values">
              <span>${value.minutes}</span><b>:</b><span>${value.seconds}</span>
            </div>
            <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
          </div>
        </div>
      `;
    }
    if (timerStyle === 'soft') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-soft">
            <span class="pomodoro-soft-orb">${phaseIcon}</span>
            <div>
              <span class="pomodoro-face-label">${faceLabel}</span>
              <span class="pomodoro-face-time">${value.text}</span>
            </div>
            <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
          </div>
        </div>
      `;
    }
    return `
      <div class="pomodoro-face-shell">
        <div class="pomodoro-face pomodoro-face-tomato">
          <span class="pomodoro-tomato-icon">${phaseIcon}</span>
          <div>
            <span class="pomodoro-face-label">${faceLabel}</span>
            <span class="pomodoro-face-time">${value.text}</span>
          </div>
          <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
        </div>
      </div>
    `;
  }

  function renderInlineTimerControls(snapshot) {
    if (snapshot.status === 'running') {
      return `<button type="button" data-timer-inline-action="toggle-pause" title="일시정지" aria-label="일시정지">Ⅱ</button><button type="button" data-timer-inline-action="stop" title="종료" aria-label="타이머 종료">■</button>`;
    }
    if (snapshot.status === 'paused') {
      return `<button type="button" data-timer-inline-action="toggle-pause" title="계속" aria-label="계속">▶</button><button type="button" data-timer-inline-action="stop" title="종료" aria-label="타이머 종료">■</button>`;
    }
    if (snapshot.status === 'completed') {
      const nextPhase = snapshot.phase === 'focus' ? 'break' : 'focus';
      const nextLabel = snapshot.phase === 'focus' ? '5분 휴식 시작' : '25분 집중 시작';
      const nextIcon = snapshot.phase === 'focus' ? '☕' : '🍅';
      return `<button type="button" class="pomodoro-inline-next" data-timer-inline-action="start" data-timer-phase="${nextPhase}" title="${nextLabel}" aria-label="${nextLabel}">${nextIcon}</button>`;
    }
    const startLabel = snapshot.phase === 'focus' ? '25분 집중 시작' : '5분 휴식 시작';
    return `<button type="button" class="pomodoro-inline-start" data-timer-inline-action="start" data-timer-phase="${snapshot.phase}" title="${startLabel}" aria-label="${startLabel}">▶</button>`;
  }

  function renderClock() {
    const style = currentStyle;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const hourChanged = previousValue && previousValue.h !== h;
    const minuteChanged = previousValue && previousValue.m !== m;
    const secondChanged = previousValue && previousValue.s !== s;
    const mood = getSeasonMood(now);
    const timerSnapshot = getTimerSnapshot(now.getTime());
    const timerValue = formatTimerValue(timerSnapshot.remainingMs);
    const timerPhaseLabel = timerSnapshot.phase === 'focus' ? '집중' : '휴식';
    const timerPhaseIcon = timerSnapshot.phase === 'focus' ? '🍅' : '☕';
    displays.forEach((display) => {
      display.title = displayMode === 'timer'
        ? '클릭하여 타이머 스타일 변경'
        : '클릭하여 시계 스타일 변경';
    });

    widgetUnits.forEach(({ unit, button, inlineActions, meta }) => {
      const completionEffectActive = timerCompletionPulseUntil > now.getTime();
      unit.dataset.clockSeason = mood.season;
      unit.dataset.clockDisplayMode = displayMode;
      unit.dataset.pomodoroPhase = timerSnapshot.phase;
      unit.classList.toggle('pomodoro-complete', completionEffectActive && timerCompletionPhase === 'focus');
      unit.classList.toggle('pomodoro-break-complete', completionEffectActive && timerCompletionPhase === 'break');
      button.title = '시계 및 타이머 메뉴';
      button.setAttribute('aria-label', button.title);
      const inlineControlsHtml = displayMode === 'timer' ? renderInlineTimerControls(timerSnapshot) : '';
      if (inlineActions.dataset.controlsHtml !== inlineControlsHtml) {
        inlineActions.dataset.controlsHtml = inlineControlsHtml;
        inlineActions.innerHTML = inlineControlsHtml;
      }
      let metaHtml = '';
      if (displayMode === 'timer') {
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span>현재 시각 ${h}:${m}:${s}</span><span class="clock-ambient-message">${mood.text}</span>`;
      } else {
        const timerStatus = timerSnapshot.status === 'paused'
          ? ' · 일시정지'
          : timerSnapshot.status === 'completed'
            ? ' 완료!'
            : '';
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span>${mood.text}</span><span class="clock-ambient-message">${mood.message}</span><span class="clock-sub-timer ${timerSnapshot.status}">${timerPhaseIcon} ${timerPhaseLabel} ${timerSnapshot.status === 'completed' ? '' : timerValue.text}${timerStatus}</span>`;
      }
      const moodKey = `${displayMode}|${mood.season}|${metaHtml}`;
      if (meta.dataset.clockMoodKey !== moodKey) {
        meta.dataset.clockMoodKey = moodKey;
        meta.innerHTML = metaHtml;
      }
    });
    refreshTimerControls(timerSnapshot);

    if (displayMode === 'timer') {
      const html = renderTimerFace(timerSnapshot);
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'digital') {
      const html = `<div style="font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 2px; color: #0f172a; line-height: 1;">
        ${h}<span style="opacity:0.5;">:</span>${m}<span style="opacity:0.5;">:</span>${s}
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'analog') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;

      let ticksHtml = '';
      for (let i = 0; i < 12; i++) {
        ticksHtml += `<div style="position: absolute; top: 0; left: 50%; width: 2px; height: ${i % 3 === 0 ? '8px' : '4px'}; background: ${i % 3 === 0 ? '#334155' : '#94a3b8'}; transform-origin: center 40px; transform: translateX(-50%) rotate(${i * 30}deg);"></div>`;
      }

      const html = `
        <div style="position: relative; width: 88px; height: 88px; border-radius: 50%; border: 4px solid #334155; box-sizing: border-box; background: #f8fafc; margin-right: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          ${ticksHtml}
          <!-- center dot -->
          <div style="position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background: #0f172a; border-radius: 50%; transform: translate(-50%, -50%); z-index: 10;"></div>
          <!-- Hour Hand -->
          <div style="position: absolute; top: 25%; bottom: 50%; left: 50%; width: 5px; background: #0f172a; transform-origin: bottom center; transform: translateX(-50%) rotate(${hourDeg}deg); border-radius: 3px; z-index: 7;"></div>
          <!-- Min Hand -->
          <div style="position: absolute; top: 12%; bottom: 50%; left: 50%; width: 3px; background: #334155; transform-origin: bottom center; transform: translateX(-50%) rotate(${minDeg}deg); border-radius: 2px; z-index: 8;"></div>
          <!-- Sec Hand -->
          <div style="position: absolute; top: 5%; bottom: 40%; left: 50%; width: 2px; background: #ef4444; transform-origin: 75% 75%; transform: translateX(-50%) rotate(${secDeg}deg); z-index: 9; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'flip') {
      const bStyle = "display:inline-block; background:#1e293b; color:#fff; padding:6px 10px; border-radius:6px; font-size:28px; font-weight:bold; font-family:monospace; margin:0 3px; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1); line-height: 1;";
      const html = `<div style="display:flex; align-items:center;">
        <span style="${bStyle}">${h}</span>
        <span style="font-size:24px; font-weight:bold; color:#334155; margin:0 2px;">:</span>
        <span style="${bStyle}">${m}</span>
        <span style="font-size:24px; font-weight:bold; color:#334155; margin:0 2px;">:</span>
        <span style="${bStyle}">${s}</span>
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'heart') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
      const html = `
        <div style="position:relative; width:112px; height:102px; margin-right:6px;">
          <div style="position:absolute; inset:0; clip-path:polygon(50% 100%, 8% 63%, 8% 26%, 26% 26%, 26% 8%, 40% 8%, 40% 0, 60% 0, 60% 8%, 74% 8%, 74% 26%, 92% 26%, 92% 63%); background:linear-gradient(180deg,#fb923c 0%,#f97316 42%,#f43f5e 100%); border:4px solid rgba(255,255,255,0.72); box-shadow:0 12px 28px rgba(244,63,94,0.24), inset 0 1px 0 rgba(255,255,255,0.4);"></div>
          <div style="position:absolute; inset:10px 12px 14px; clip-path:polygon(50% 100%, 8% 63%, 8% 26%, 26% 26%, 26% 8%, 40% 8%, 40% 0, 60% 0, 60% 8%, 74% 8%, 74% 26%, 92% 26%, 92% 63%); background:linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02));"></div>
          <div style="position:absolute; top:50%; left:50%; width:10px; height:10px; background:#334155; border:2px solid rgba(255,255,255,0.88); border-radius:999px; transform:translate(-50%, -50%); z-index:10; box-shadow:0 2px 4px rgba(15,23,42,0.18);"></div>
          <div style="position:absolute; top:26%; bottom:50%; left:50%; width:5px; background:rgba(255,255,255,0.92); transform-origin:bottom center; transform:translateX(-50%) rotate(${hourDeg}deg); border-radius:999px; z-index:7;"></div>
          <div style="position:absolute; top:16%; bottom:50%; left:50%; width:3px; background:rgba(241,245,249,0.95); transform-origin:bottom center; transform:translateX(-50%) rotate(${minDeg}deg); border-radius:999px; z-index:8;"></div>
          <div style="position:absolute; top:12%; bottom:46%; left:50%; width:2px; background:#ffffff; transform-origin:bottom center; transform:translateX(-50%) rotate(${secDeg}deg); z-index:9; border-radius:999px; opacity:0.92;"></div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'split') {
      const html = `
        <div class="clock-split">
          <div class="clock-split-block${hourChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Hour</span>
            <span class="clock-split-value">${h}</span>
          </div>
          <div class="clock-split-block${minuteChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Min</span>
            <span class="clock-split-value">${m}</span>
          </div>
          <div class="clock-split-block clock-split-block-accent${secondChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Sec</span>
            <span class="clock-split-value">${s}</span>
          </div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'neon') {
      const html = `
        <div style="display:inline-flex; align-items:center; gap:10px; padding:10px 16px; border-radius:18px; background:linear-gradient(135deg,#020617,#111827 55%,#1e1b4b); box-shadow:0 0 0 1px rgba(34,211,238,0.18), 0 12px 28px rgba(15,23,42,0.32);">
          <span style="font-size:30px; font-weight:800; font-family:monospace; letter-spacing:0.12em; color:#67e8f9; text-shadow:0 0 8px rgba(103,232,249,0.55); font-variant-numeric:tabular-nums;">${h}:${m}</span>
          <span style="font-size:16px; font-weight:800; color:#c4b5fd; text-shadow:0 0 8px rgba(196,181,253,0.45); min-width:24px; text-align:center; font-variant-numeric:tabular-nums;">${s}</span>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'soft') {
      const html = `
        <div style="display:inline-flex; align-items:center; gap:12px; padding:10px 16px; border-radius:20px; background:linear-gradient(135deg,#fdf2f8,#eef2ff); border:1px solid rgba(216,180,254,0.55); box-shadow:0 10px 24px rgba(148,163,184,0.14);">
          <span style="display:inline-flex; width:10px; height:10px; border-radius:999px; background:#22c55e; box-shadow:0 0 0 5px rgba(34,197,94,0.12);"></span>
          <div style="display:flex; flex-direction:column; gap:2px; line-height:1;">
            <span style="font-size:28px; font-weight:800; color:#1f2937; font-variant-numeric:tabular-nums;">${h}:${m}:${s}</span>
          </div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    }

    previousValue = { h, m, s };
  }

  if (clockInterval) clearInterval(clockInterval);
  refreshStyleMenus();
  renderClock();
  clockInterval = setInterval(renderClock, 1000);
}


let manualSnsConfig = { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
let manualSnsConfigLoading = false;
let manualSnsOptimizationSnapshot = null;
let manualSnsOptimizationInFlight = false;
let manualSnsLocalImageFile = null;
let manualSnsLocalImagePreviewUrl = '';
const MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY = 'manual_sns_selected_channel_ids_v1';
const DEFAULT_BUFFER_HELP_URL = 'https://m.blog.naver.com/amadejjs/223940980574';

function loadManualSnsSelectedChannelIds() {
  try {
    const raw = localStorage.getItem(MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean));
  } catch (_error) {
    return null;
  }
}

function persistManualSnsSelectedChannels() {
  const selectedIds = Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim())
    .filter(Boolean);
  try {
    localStorage.setItem(MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY, JSON.stringify(selectedIds));
  } catch (_error) {
    // Local Storage가 차단되어도 SNS 발행 자체는 계속 사용할 수 있어야 합니다.
  }
}

function getManualSnsSelectedChannels() {
  const selectedIds = new Set(Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim()));
  return (Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [])
    .filter((channel) => selectedIds.has(String(channel.id || '').trim()));
}

function getManualSnsImageValidation() {
  const localMode = document.getElementById('manual-sns-image-source-local')?.checked === true;
  if (localMode) {
    if (manualSnsConfig.local_media_available !== true) {
      return { valid: false, mode: 'local', hasImage: false, message: '로컬 이미지를 사용하려면 WordPress 연결 설정이 필요합니다.' };
    }
    if (!manualSnsLocalImageFile) return { valid: true, mode: 'local', hasImage: false, file: null, url: '' };
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(String(manualSnsLocalImageFile.type || '').toLowerCase())) {
      return { valid: false, mode: 'local', hasImage: false, message: 'png, jpg, webp, gif 이미지만 사용할 수 있습니다.' };
    }
    if (manualSnsLocalImageFile.size > 10 * 1024 * 1024) {
      return { valid: false, mode: 'local', hasImage: false, message: '이미지 파일은 최대 10MB까지 사용할 수 있습니다.' };
    }
    return { valid: true, mode: 'local', hasImage: true, file: manualSnsLocalImageFile, url: '' };
  }
  const raw = String(document.getElementById('manual-sns-image-url')?.value || '').trim();
  if (!raw) return { valid: true, mode: 'url', hasImage: false, url: '' };
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return { valid: false, mode: 'url', hasImage: false, url: '', message: '공개 HTTPS 이미지 URL을 입력하세요.' };
    }
    return { valid: true, mode: 'url', hasImage: true, url: url.toString() };
  } catch (_error) {
    return { valid: false, mode: 'url', hasImage: false, url: '', message: '이미지 URL 형식을 확인하세요.' };
  }
}

function setManualSnsLocalImageFile(file = null) {
  if (manualSnsLocalImagePreviewUrl) URL.revokeObjectURL(manualSnsLocalImagePreviewUrl);
  manualSnsLocalImageFile = file || null;
  manualSnsLocalImagePreviewUrl = file ? URL.createObjectURL(file) : '';
}

function syncManualSnsImageSourceUi() {
  const localRadio = document.getElementById('manual-sns-image-source-local');
  const localLabel = document.getElementById('manual-sns-image-source-local-label');
  const urlRadio = document.getElementById('manual-sns-image-source-url');
  const urlPanel = document.getElementById('manual-sns-image-url-panel');
  const localPanel = document.getElementById('manual-sns-image-local-panel');
  const localAvailable = manualSnsConfig.local_media_available === true;
  if (localRadio) localRadio.disabled = !localAvailable;
  if (localLabel) {
    localLabel.classList.toggle('is-disabled', !localAvailable);
    localLabel.title = localAvailable ? '' : '설정 > 블로그에서 WordPress 연결 정보를 먼저 저장해 주세요.';
  }
  if (!localAvailable && localRadio?.checked && urlRadio) urlRadio.checked = true;
  const localMode = localRadio?.checked === true;
  if (urlPanel) urlPanel.hidden = localMode;
  if (localPanel) localPanel.hidden = !localMode;
}

function syncManualSnsImagePreview() {
  const inputEl = document.getElementById('manual-sns-image-url');
  const removeBtn = document.getElementById('manual-sns-image-remove-btn');
  const fileRemoveBtn = document.getElementById('manual-sns-image-file-remove-btn');
  const filePickerEl = document.getElementById('manual-sns-image-file-picker');
  const fileNameEl = document.getElementById('manual-sns-image-file-name');
  const fileActionEl = document.getElementById('manual-sns-image-file-action');
  const previewEl = document.getElementById('manual-sns-image-preview');
  const imageEl = document.getElementById('manual-sns-image-preview-img');
  const statusEl = document.getElementById('manual-sns-image-preview-status');
  const raw = String(inputEl?.value || '').trim();
  syncManualSnsImageSourceUi();
  const validation = getManualSnsImageValidation();
  if (removeBtn) removeBtn.hidden = !raw;
  if (fileRemoveBtn) fileRemoveBtn.hidden = !manualSnsLocalImageFile;
  if (filePickerEl) filePickerEl.classList.toggle('has-file', Boolean(manualSnsLocalImageFile));
  if (fileNameEl) fileNameEl.textContent = manualSnsLocalImageFile?.name || '이미지 파일 선택';
  if (fileActionEl) fileActionEl.textContent = manualSnsLocalImageFile ? '변경' : '파일 찾기';
  if (!previewEl || !imageEl || !statusEl) return;

  if (!validation.hasImage || !validation.valid) {
    previewEl.hidden = true;
    imageEl.removeAttribute('src');
    return;
  }
  previewEl.hidden = false;
  if (validation.mode === 'local') {
    imageEl.onload = null;
    imageEl.onerror = null;
    imageEl.src = manualSnsLocalImagePreviewUrl;
    statusEl.textContent = `${validation.file.name} · WordPress를 통해 임시 업로드됩니다.`;
    return;
  }
  statusEl.textContent = '이미지 미리보기를 불러오는 중입니다.';
  imageEl.onerror = () => {
    statusEl.textContent = '미리보기를 불러오지 못했습니다. Buffer에서 접근 가능한 직접 이미지 URL인지 확인하세요.';
  };
  imageEl.onload = () => {
    statusEl.textContent = '이미지 URL 1개가 함께 발행됩니다.';
  };
  imageEl.src = validation.url;
}

function syncManualSnsComposerState() {
  syncManualSnsImageSourceUi();
  const textEl = document.getElementById('manual-sns-text');
  const countEl = document.getElementById('manual-sns-character-count');
  const limitEl = document.getElementById('manual-sns-limit-status');
  const summaryEl = document.getElementById('manual-sns-publish-summary');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const optimizeActionEl = document.getElementById('manual-sns-ai-action');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const text = String(textEl?.value || '').trim();
  const characterCount = Array.from(text).length;
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  let errorMessage = '';

  const exceeded = selectedChannels.find((channel) => characterCount > Number(channel.limit || 0));
  if (exceeded) {
    errorMessage = `${exceeded.name || exceeded.service} 글자 수 제한을 ${characterCount - Number(exceeded.limit || 0)}자 초과했습니다. (${characterCount}/${exceeded.limit}자)`;
  } else if (!image.valid) {
    errorMessage = image.message;
  } else {
    const imageRequired = selectedChannels.find((channel) => channel.image_required === true);
    if (imageRequired && !image.hasImage) {
      errorMessage = `${imageRequired.name || imageRequired.service} 채널은 이미지가 필요합니다.`;
    }
  }

  if (countEl) {
    const selectedLimits = selectedChannels.map((channel) => Number(channel.limit || 0)).filter((limit) => limit > 0);
    const shortestLimit = selectedLimits.length > 0 ? Math.min(...selectedLimits) : 0;
    countEl.textContent = shortestLimit > 0 ? `${characterCount}/${shortestLimit}자` : `${characterCount}자`;
    countEl.classList.toggle('is-over', Boolean(exceeded));
  }
  if (limitEl) {
    limitEl.textContent = errorMessage || (selectedChannels.length > 0 ? '선택한 모든 채널의 글자 수 제한 안에 있습니다.' : '');
    limitEl.classList.toggle('is-error', Boolean(errorMessage));
  }
  if (summaryEl) {
    summaryEl.textContent = selectedChannels.length > 0
      ? `${selectedChannels.length}개 채널에 즉시 발행합니다${image.hasImage ? ' · 이미지 포함' : ''}.`
      : '발행할 채널을 선택하세요.';
  }
  if (publishBtn) {
    publishBtn.textContent = selectedChannels.length > 0 ? `${selectedChannels.length}개 채널에 지금 발행` : '지금 발행';
    publishBtn.disabled = manualSnsOptimizationInFlight || !manualSnsConfig.configured || selectedChannels.length === 0 || !text || Boolean(errorMessage);
  }
  if (optimizeBtn) {
    const aiAvailable = manualSnsConfig.ai?.available === true;
    if (optimizeActionEl) optimizeActionEl.hidden = !aiAvailable;
    optimizeBtn.disabled = manualSnsOptimizationInFlight || selectedChannels.length === 0 || !text;
    optimizeBtn.textContent = manualSnsOptimizationInFlight ? 'AI 최적화 중...' : 'AI 최적화';
  }
  if (undoBtn) {
    undoBtn.hidden = manualSnsOptimizationSnapshot === null;
    undoBtn.disabled = manualSnsOptimizationInFlight;
  }

  document.querySelectorAll('.social-channel-option').forEach((label) => {
    const input = label.querySelector('[data-manual-sns-channel]');
    label.classList.toggle('is-selected', Boolean(input?.checked));
  });
  if (selectAllEl) {
    const enabledInputs = Array.from(document.querySelectorAll('[data-manual-sns-channel]:not(:disabled)'));
    const selectedCount = enabledInputs.filter((input) => input.checked).length;
    selectAllEl.disabled = enabledInputs.length === 0;
    selectAllEl.checked = enabledInputs.length > 0 && selectedCount === enabledInputs.length;
    selectAllEl.indeterminate = selectedCount > 0 && selectedCount < enabledInputs.length;
  }
}

function renderManualSnsChannels() {
  const listEl = document.getElementById('manual-sns-channel-list');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  if (!listEl) return;
  listEl.replaceChildren();

  const channels = Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [];
  if (!manualSnsConfig.configured || channels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'social-channel-empty';
    const messageEl = document.createElement('span');
    messageEl.textContent = 'Buffer 연결 또는 발행 채널 설정이 필요합니다.';
    const linksEl = document.createElement('div');
    linksEl.className = 'buffer-resource-links social-channel-help-links';
    linksEl.setAttribute('aria-label', 'Buffer 관련 링크');
    const helpLinkEl = document.createElement('a');
    helpLinkEl.href = DEFAULT_BUFFER_HELP_URL;
    helpLinkEl.target = '_blank';
    helpLinkEl.rel = 'noopener noreferrer';
    helpLinkEl.textContent = 'Buffer 알아보기';
    const separatorEl = document.createElement('span');
    separatorEl.setAttribute('aria-hidden', 'true');
    separatorEl.textContent = '·';
    const joinLinkEl = document.createElement('a');
    joinLinkEl.href = 'https://join.buffer.com/delta898-gmail-com';
    joinLinkEl.target = '_blank';
    joinLinkEl.rel = 'noopener noreferrer';
    joinLinkEl.textContent = 'Buffer 가입';
    linksEl.append(helpLinkEl, separatorEl, joinLinkEl);
    emptyEl.append(messageEl, linksEl);
    listEl.appendChild(emptyEl);
    if (selectAllEl) selectAllEl.disabled = true;
    syncManualSnsComposerState();
    return;
  }

  if (selectAllEl) selectAllEl.disabled = false;
  const savedChannelIds = loadManualSnsSelectedChannelIds();
  channels.forEach((channel) => {
    const unavailable = !channel.supported || channel.disabled || channel.is_disconnected || channel.is_locked;
    const label = document.createElement('label');
    label.className = `social-channel-option${unavailable ? ' is-disabled' : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = channel.id;
    input.dataset.manualSnsChannel = 'true';
    input.disabled = unavailable;
    input.checked = !unavailable && savedChannelIds?.has(String(channel.id || '').trim()) === true;
    input.addEventListener('change', () => {
      persistManualSnsSelectedChannels();
      syncManualSnsComposerState();
    });
    const copy = document.createElement('span');
    copy.className = 'social-channel-copy';
    const name = document.createElement('strong');
    name.textContent = channel.name || channel.service || 'Buffer 채널';
    const detail = document.createElement('span');
    detail.textContent = unavailable
      ? '현재 수동 발행 미지원'
      : `${channel.service} · 최대 ${Number(channel.limit || 0).toLocaleString('ko-KR')}자${channel.image_required ? ' · 이미지 필수' : ''}`;
    copy.append(name, detail);
    label.append(input, copy);
    listEl.appendChild(label);
  });
  if (savedChannelIds !== null) persistManualSnsSelectedChannels();
  syncManualSnsComposerState();
}

async function loadManualSnsComposer({ force = false } = {}) {
  if (manualSnsConfigLoading) return;
  if (!force && Array.isArray(manualSnsConfig.channels) && manualSnsConfig.channels.length > 0) {
    renderManualSnsChannels();
    return;
  }
  const listEl = document.getElementById('manual-sns-channel-list');
  if (listEl) {
    listEl.replaceChildren();
    const loadingEl = document.createElement('p');
    loadingEl.className = 'muted';
    loadingEl.textContent = 'Buffer 채널을 불러오는 중입니다.';
    listEl.appendChild(loadingEl);
  }
  manualSnsConfigLoading = true;
  try {
    const data = await fetchJson('/api/v1/social/manual/config');
    manualSnsConfig = {
      configured: data?.configured === true,
      local_media_available: data?.local_media_available === true,
      channels: Array.isArray(data?.channels) ? data.channels : [],
      ai: data?.ai && typeof data.ai === 'object'
        ? { available: data.ai.available === true, model_name: String(data.ai.model_name || '') }
        : { available: false, model_name: '' }
    };
    renderManualSnsChannels();
  } catch (error) {
    manualSnsConfig = { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
    renderManualSnsChannels();
  } finally {
    manualSnsConfigLoading = false;
  }
}

function renderManualSnsAiStatus(message = '', isError = false) {
  const statusEl = document.getElementById('manual-sns-ai-status');
  if (!statusEl) return;
  statusEl.textContent = String(message || '');
  statusEl.classList.toggle('is-error', isError);
}

async function optimizeManualSnsText() {
  const textEl = document.getElementById('manual-sns-text');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  if (!textEl || !optimizeBtn || optimizeBtn.disabled || manualSnsOptimizationInFlight) return;

  const originalValue = String(textEl.value || '');
  const selectedChannels = getManualSnsSelectedChannels();
  manualSnsOptimizationInFlight = true;
  renderManualSnsAiStatus('Chat Model이 글과 해시태그를 다듬고 있습니다.');
  syncManualSnsComposerState();
  try {
    const data = await postJson('/api/v1/social/manual/optimize', {
      channelIds: selectedChannels.map((channel) => channel.id),
      text: originalValue.trim()
    });
    const optimizedText = String(data?.optimized_text || '').trim();
    if (!optimizedText) throw new Error('AI 최적화 결과가 비어 있습니다.');
    if (String(textEl.value || '') !== originalValue) {
      throw new Error('최적화 중 내용이 변경되어 결과를 반영하지 않았습니다. 다시 실행해 주세요.');
    }

    manualSnsOptimizationSnapshot = originalValue;
    textEl.value = optimizedText;
    textEl.dispatchEvent(new Event('input', { bubbles: true }));
    renderManualSnsAiStatus(data?.within_limit === true
      ? 'AI 최적화를 완료했습니다. 내용을 확인하고 필요하면 직접 수정하세요.'
      : 'AI 최적화를 완료했지만 선택한 채널의 글자 수 제한을 넘었습니다. 내용을 줄여 주세요.',
    data?.within_limit !== true);
    textEl.focus();
  } catch (error) {
    renderManualSnsAiStatus(`AI 최적화 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`, true);
  } finally {
    manualSnsOptimizationInFlight = false;
    syncManualSnsComposerState();
  }
}

function undoManualSnsOptimization() {
  const textEl = document.getElementById('manual-sns-text');
  if (!textEl || manualSnsOptimizationSnapshot === null || manualSnsOptimizationInFlight) return;
  textEl.value = manualSnsOptimizationSnapshot;
  manualSnsOptimizationSnapshot = null;
  textEl.dispatchEvent(new Event('input', { bubbles: true }));
  renderManualSnsAiStatus('AI 최적화 전 내용으로 되돌렸습니다.');
  textEl.focus();
}

function renderManualSnsPublishResult(data = {}) {
  const resultEl = document.getElementById('manual-sns-publish-result');
  if (!resultEl) return;
  resultEl.replaceChildren();
  resultEl.classList.add('is-visible');
  const heading = document.createElement('strong');
  heading.textContent = data.success
    ? `발행 완료 · ${Number(data.success_count || 0)}개 채널 성공`
    : `일부 발행 실패 · 성공 ${Number(data.success_count || 0)}개 / 실패 ${Number(data.failure_count || 0)}개`;
  resultEl.appendChild(heading);
  (Array.isArray(data.results) ? data.results : []).forEach((result) => {
    const row = document.createElement('div');
    row.className = `social-result-row ${result.success ? 'is-success' : 'is-error'}`;
    row.textContent = result.success
      ? `✅ ${result.channel_name || result.service} ${result.status === 'sent' ? '발행 성공' : '발행 요청 성공'}`
      : `❌ ${result.channel_name || result.service} 실패${result.message ? ` · ${result.message}` : ''}`;
    resultEl.appendChild(row);
  });
  if (data.media_cleanup?.retained === true) {
    const cleanupRow = document.createElement('div');
    cleanupRow.className = 'social-result-row is-error';
    cleanupRow.textContent = '⚠️ 발행 상태를 확인하지 못해 임시 이미지가 WordPress 미디어에 남아 있습니다.';
    resultEl.appendChild(cleanupRow);
  }
}

function readManualSnsFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function publishManualSns() {
  syncManualSnsComposerState();
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  if (!publishBtn || publishBtn.disabled) return;
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  const confirmed = await showUiDialog({
    title: 'SNS 즉시 발행',
    message: `${selectedChannels.map((channel) => channel.name || channel.service).join(', ')}에 지금 발행할까요?`,
    showCancel: true,
    confirmText: '지금 발행',
    cancelText: '취소'
  });
  if (!confirmed) return;

  const resultEl = document.getElementById('manual-sns-publish-result');
  publishBtn.disabled = true;
  publishBtn.textContent = '발행 중...';
  if (resultEl) {
    resultEl.classList.add('is-visible');
    resultEl.textContent = image.mode === 'local'
      ? 'WordPress에 이미지를 임시 업로드하고 Buffer로 발행하고 있습니다.'
      : 'Buffer로 즉시 발행하고 있습니다.';
  }
  try {
    const localImage = image.mode === 'local' && image.file
      ? {
          fileName: image.file.name,
          mimeType: image.file.type,
          base64Data: await readManualSnsFileAsDataUrl(image.file)
        }
      : null;
    const data = await postJson('/api/v1/social/manual/publish', {
      channelIds: selectedChannels.map((channel) => channel.id),
      text,
      imageUrl: image.url,
      localImage
    });
    renderManualSnsPublishResult(data);
  } catch (error) {
    if (resultEl) {
      resultEl.classList.add('is-visible');
      resultEl.textContent = `❌ 발행 실패: ${error.message}`;
    }
  } finally {
    syncManualSnsComposerState();
  }
}

function initManualSnsComposer() {
  const textEl = document.getElementById('manual-sns-text');
  const imageUrlEl = document.getElementById('manual-sns-image-url');
  const imageRemoveBtn = document.getElementById('manual-sns-image-remove-btn');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const imageFileRemoveBtn = document.getElementById('manual-sns-image-file-remove-btn');
  const imageSourceUrlEl = document.getElementById('manual-sns-image-source-url');
  const imageSourceLocalEl = document.getElementById('manual-sns-image-source-local');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  textEl?.addEventListener('input', syncManualSnsComposerState);
  imageUrlEl?.addEventListener('input', () => {
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageRemoveBtn?.addEventListener('click', () => {
    if (imageUrlEl) imageUrlEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
    imageUrlEl?.focus();
  });
  imageFileEl?.addEventListener('change', () => {
    setManualSnsLocalImageFile(imageFileEl.files?.[0] || null);
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageFileRemoveBtn?.addEventListener('click', () => {
    setManualSnsLocalImageFile(null);
    if (imageFileEl) imageFileEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
    imageFileEl?.focus();
  });
  [imageSourceUrlEl, imageSourceLocalEl].forEach((radio) => {
    radio?.addEventListener('change', () => {
      syncManualSnsImagePreview();
      syncManualSnsComposerState();
    });
  });
  selectAllEl?.addEventListener('change', () => {
    const enabledInputs = Array.from(document.querySelectorAll('[data-manual-sns-channel]:not(:disabled)'));
    const shouldSelect = selectAllEl.checked;
    enabledInputs.forEach((input) => { input.checked = shouldSelect; });
    persistManualSnsSelectedChannels();
    syncManualSnsComposerState();
  });
  publishBtn?.addEventListener('click', () => void publishManualSns());
  optimizeBtn?.addEventListener('click', () => void optimizeManualSnsText());
  undoBtn?.addEventListener('click', undoManualSnsOptimization);
  syncManualSnsImageSourceUi();
  syncManualSnsComposerState();
}

