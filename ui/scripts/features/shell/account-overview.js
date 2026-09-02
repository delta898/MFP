let isDashboardLoading = false;
let lastDashboardLoadTime = 0;
let dashboardForceRefreshPending = false;

let isAccountOverviewLoading = false;
let lastAccountOverview = null;

function reconcileAccountSmartUsage(overview, requestRevision = null) {
  if (!overview || requestRevision === null) return overview;
  const incomingItems = Array.isArray(overview?.smart_usage?.items)
    ? overview.smart_usage.items
    : [];
  if (requestRevision >= smartUsageRevision) {
    latestSmartUsageByCapability.clear();
    incomingItems.forEach((item) => {
      const capability = String(item?.capability || '');
      if (capability) latestSmartUsageByCapability.set(capability, { ...item });
    });
    return overview;
  }
  const itemsByCapability = new Map(incomingItems.map((item) => [String(item?.capability || ''), { ...item }]));
  latestSmartUsageByCapability.forEach((latest, capability) => {
    itemsByCapability.set(capability, { ...(itemsByCapability.get(capability) || {}), ...latest });
  });
  return {
    ...overview,
    smart_usage: {
      ...(overview.smart_usage || {}),
      items: [...itemsByCapability.values()]
    }
  };
}

function formatAccountDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function setAccountMetaItem(elementId, label, value) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const formatted = formatAccountDate(value);
  element.textContent = `${label} ${formatted}`;
  element.classList.toggle('hidden', formatted === '-');
}

function setAccountMetaText(elementId, text, visible = true) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = String(text || '').trim();
  element.classList.toggle('hidden', !visible || !element.textContent);
}

function getAccountAction(overview, actionId) {
  const actions = Array.isArray(overview?.actions) ? overview.actions : [];
  return actions.find((item) => String(item?.id || '') === actionId) || null;
}

function renderAccountConnection(elementId, connection) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const status = String(connection?.status || 'unknown');
  const connected = status === 'connected' || status === 'configured';
  element.textContent = connected ? '연결됨' : (status === 'not_configured' ? '미설정' : '로그인 필요');
  element.className = connected ? 'state-ok' : (status === 'not_configured' ? 'state-muted' : 'state-warning');
}

function renderAccountOverview(overview, options = {}) {
  overview = reconcileAccountSmartUsage(overview, options.smartUsageRevisionAtRequest ?? null);
  lastAccountOverview = overview;
  const subscription = overview?.subscription || {};
  const usage = overview?.usage || {};
  const device = overview?.device || {};
  const identity = overview?.identity || {};
  const smartUsageItems = Array.isArray(overview?.smart_usage?.items) ? overview.smart_usage.items : [];

  const planName = String(subscription.plan_name || subscription.plan_code || '-').trim() || '-';
  const normalizedPlanCode = String(subscription.plan_code || '').trim().toLowerCase();
  const status = String(subscription.status || 'unavailable').trim();
  const statusLabels = {
    active: '활성',
    quota_exhausted: '사용량 소진',
    unavailable: '확인 필요'
  };
  const statusClass = status === 'active' ? 'active' : (status === 'quota_exhausted' ? 'warning' : 'error');

  setText('account-plan-name', planName);
  const statusEl = document.getElementById('account-plan-status');
  if (statusEl) {
    statusEl.textContent = statusLabels[status] || status;
    statusEl.className = `account-status-badge ${statusClass}`;
  }

  const unlimited = usage.mode === 'unlimited' || Number(usage.limit) < 0 || Number(usage.remaining) < 0;
  const used = Number.isFinite(Number(usage.used)) ? Number(usage.used) : null;
  const limit = Number.isFinite(Number(usage.limit)) ? Number(usage.limit) : null;
  const remaining = Number.isFinite(Number(usage.remaining)) ? Number(usage.remaining) : null;
  const quotaCycle = String(usage.cycle || '').trim().toLowerCase();
  const usageLabel = quotaCycle === 'monthly'
    ? '이번 달 사용량'
    : (quotaCycle === 'none' && normalizedPlanCode === 'test' ? '체험 사용량' : '사용량');
  const planCycleHelpEl = document.getElementById('account-plan-cycle-help');
  if (planCycleHelpEl) {
    const showCycleHelp = quotaCycle === 'monthly';
    planCycleHelpEl.classList.toggle('hidden', !showCycleHelp);
    const cycleHelpText = normalizedPlanCode === 'free'
      ? 'Free Plan은 매월 1일 갱신됩니다.'
      : '월 기본 제공량은 매월 1일 갱신됩니다.';
    planCycleHelpEl.dataset.tooltip = cycleHelpText;
    planCycleHelpEl.setAttribute('aria-label', cycleHelpText);
  }
  setText('account-usage-used-label', usageLabel);
  setText('account-usage-used', unlimited ? '제한 없음' : (used == null || limit == null ? '-' : `${used} / ${limit}회`));
  setText('account-usage-remaining', unlimited ? '무제한' : (remaining == null ? '-' : `${remaining}회`));

  const creditBalance = Number.isFinite(Number(usage.credit_balance)) ? Math.max(0, Number(usage.credit_balance)) : 0;
  const totalAvailable = Number.isFinite(Number(usage.total_available)) ? Number(usage.total_available) : null;
  setText('account-credit-balance', `${creditBalance}회`);
  setText('account-total-available', unlimited ? '무제한' : (totalAvailable == null ? '-' : `${Math.max(0, totalAvailable)}회`));
  const basicAvailableLabel = unlimited ? '무제한' : (remaining == null ? '-' : `${Math.max(0, remaining)}회`);
  const creditAvailableLabel = `${creditBalance}회`;
  setText('account-total-breakdown', unlimited
    ? '현재 플랜에서 발행 횟수 제한 없이 사용할 수 있습니다.'
    : `기본 제공량 ${basicAvailableLabel} + 크레딧 ${creditAvailableLabel}`);
  const creditHelpEl = document.getElementById('account-credit-help');
  if (creditHelpEl) {
    const creditHelpText = quotaCycle === 'monthly'
      ? '기본 제공량 소진 후 충전 크레딧이 사용됩니다.'
      : '충전 크레딧은 현재 플랜 권한 안에서 사용할 수 있는 추가 발행 횟수입니다.';
    creditHelpEl.dataset.tooltip = creditHelpText;
    creditHelpEl.setAttribute('aria-label', creditHelpText);
  }

  setText('account-license-created', `라이선스 생성일: ${formatAccountDate(subscription.created_at)}`);
  if (quotaCycle === 'monthly') {
    setAccountMetaText('account-period-start', '', false);
    setAccountMetaText('account-next-reset', '', false);
  } else {
    setAccountMetaItem('account-period-start', '사용 시작일', usage.current_period_start_at);
    setAccountMetaItem('account-next-reset', '다음 갱신일', usage.resets_at);
  }

  const upgradeFreeAction = getAccountAction(overview, 'upgrade_free');
  const guidanceEl = document.getElementById('account-plan-guidance');
  const guidanceTitleEl = document.getElementById('account-plan-guidance-title');
  const guidanceMessageEl = document.getElementById('account-plan-guidance-message');
  const upgradeFreeBtn = document.getElementById('account-upgrade-free-btn');
  const shouldShowFreeUpgrade = normalizedPlanCode === 'test'
    && status === 'quota_exhausted'
    && upgradeFreeAction?.enabled === true;
  if (guidanceEl) {
    guidanceEl.classList.toggle('hidden', !shouldShowFreeUpgrade);
  }
  if (guidanceTitleEl) {
    guidanceTitleEl.textContent = shouldShowFreeUpgrade ? 'Tester Plan 사용량을 모두 사용했습니다' : '';
  }
  if (guidanceMessageEl) {
    guidanceMessageEl.textContent = shouldShowFreeUpgrade
      ? 'Free Plan은 자동으로 전환되지 않습니다. 이메일 인증 후 월간 무료 발행 횟수로 계속 사용할 수 있습니다.'
      : '';
  }
  if (upgradeFreeBtn) {
    upgradeFreeBtn.textContent = shouldShowFreeUpgrade ? (upgradeFreeAction?.label || 'Free Plan으로 전환') : '';
    upgradeFreeBtn.disabled = !shouldShowFreeUpgrade;
    upgradeFreeBtn.title = upgradeFreeAction?.reason || '';
  }

  const changePlanAction = getAccountAction(overview, 'change_plan') || getAccountAction(overview, 'upgrade');
  const changePlanButton = document.getElementById('account-change-plan-btn');
  if (changePlanButton) {
    changePlanButton.textContent = changePlanAction?.label || '구독 / 플랜 변경';
    changePlanButton.disabled = changePlanAction?.enabled !== true;
    changePlanButton.title = changePlanAction?.reason || '';
  }
  const purchaseCreditsAction = getAccountAction(overview, 'purchase_credits');
  const purchaseCreditsButton = document.getElementById('account-purchase-credits-btn');
  if (purchaseCreditsButton) {
    purchaseCreditsButton.textContent = purchaseCreditsAction?.label || '크레딧 충전';
    purchaseCreditsButton.disabled = purchaseCreditsAction?.enabled !== true || unlimited;
    purchaseCreditsButton.title = unlimited
      ? '무제한 플랜에서는 크레딧 충전이 필요하지 않습니다.'
      : (purchaseCreditsAction?.reason || '');
  }

  setText('account-identity-label', identity.label || '기기 라이선스로 사용 중');
  setText('account-identity-detail', identity.email_verified && (identity.email_masked || identity.email)
    ? `${identity.email_masked || identity.email}\n${identity.purpose || '라이선스 복구와 플랜 관리에 사용됩니다.'}`
    : '로그인 없이 현재 기기에 연결된 라이선스를 사용합니다.');
  const registerAction = getAccountAction(overview, 'register_email');
  const registerButton = document.getElementById('account-register-email-btn');
  if (registerButton) {
    registerButton.textContent = registerAction?.label || '계정 연결 준비 중';
    registerButton.disabled = registerAction?.enabled !== true;
    registerButton.title = registerAction?.reason || '';
  }

  const platformLabels = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
  setText('account-device-platform', `${platformLabels[device.platform] || device.platform || '-'}${device.os_release ? ` ${device.os_release}` : ''}`);
  setText('account-device-arch', device.arch || '-');
  setText('account-device-hw-id', device.hw_id || '-');
  setText('account-device-app-version', device.app_version ? `v${device.app_version}` : '-');

  const featureList = document.getElementById('account-feature-list');
  if (featureList) {
    featureList.innerHTML = '';
    const items = Array.isArray(overview?.capabilities?.items) ? overview.capabilities.items : [];
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '플랜 기능 정보가 없습니다.';
      featureList.appendChild(empty);
    } else {
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'account-state-row';
        const label = document.createElement('span');
        label.textContent = item.label || item.id;
        const value = document.createElement('strong');
        value.textContent = item.enabled ? '사용 가능' : '제한됨';
        value.className = item.enabled ? 'state-ok' : 'state-muted';
        row.append(label, value);
        featureList.appendChild(row);
      });
    }
  }

  const smartUsageList = document.getElementById('account-smart-usage-list');
  if (smartUsageList) {
    smartUsageList.innerHTML = '';
    smartUsageItems.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'account-smart-usage-item';
      const label = document.createElement('span');
      label.textContent = item.label || item.capability || '스마트 기능';
      const value = document.createElement('strong');
      value.textContent = `${Math.max(0, Number(item.remaining) || 0)} / ${Math.max(0, Number(item.limit) || 0)}회 남음`;
      row.append(label, value);
      smartUsageList.append(row);
    });
    if (smartUsageItems.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = '사용량 정보를 불러오는 중입니다.';
      smartUsageList.append(empty);
    }
  }
  refreshSmartUsageHints();

  renderAccountConnection('account-connection-naver', overview?.connections?.naver);
  renderAccountConnection('account-connection-google', overview?.connections?.google_sheets);
  renderAccountConnection('account-connection-wordpress', overview?.connections?.wordpress);
}

function isValidAccountEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim());
}

async function runLicenseEmailVerification({ email, title = '이메일 인증', button = null } = {}) {
  const normalizedEmail = String(email || '').trim();
  if (!isValidAccountEmail(normalizedEmail)) {
    await showUiPopup('유효한 이메일 주소를 입력해 주세요.');
    return null;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '인증 요청 중...';
  }

  const requestResult = await postJson('/api/v1/license/registration/request', {
    email: normalizedEmail
  });
  const code = await showUiPrompt(`${requestResult?.message || '인증 코드가 발송되었습니다.'}\n메일로 받은 6자리 인증 코드를 입력해 주세요.`, {
    title,
    type: 'text',
    placeholder: '123456',
    confirmText: '인증',
    cancelText: '취소'
  });
  if (code == null) {
    await loadAccountOverview({ force: true }).catch(() => {});
    return null;
  }

  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    await showUiPopup('6자리 인증 코드를 입력해 주세요.');
    await loadAccountOverview({ force: true }).catch(() => {});
    return null;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '인증 확인 중...';
  }

  await postJson('/api/v1/license/registration/verify', {
    email: normalizedEmail,
    code: normalizedCode
  });

  return normalizedEmail;
}

async function loadAccountOverview({ force = false } = {}) {
  const loadingEl = document.getElementById('account-overview-loading');
  const errorEl = document.getElementById('account-overview-error');
  const contentEl = document.getElementById('account-overview-content');

  if (isAccountOverviewLoading) return lastAccountOverview;
  if (!force && lastAccountOverview) {
    renderAccountOverview(lastAccountOverview);
    loadingEl?.classList.add('hidden');
    errorEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
    return lastAccountOverview;
  }

  isAccountOverviewLoading = true;
  const smartUsageRevisionAtRequest = smartUsageRevision;
  loadingEl?.classList.remove('hidden');
  errorEl?.classList.add('hidden');
  contentEl?.classList.add('hidden');

  try {
    const overview = await fetchJson(`/api/v1/account/overview?quiet=1${force ? '&force=1' : ''}`);
    renderAccountOverview(overview, { smartUsageRevisionAtRequest });
    loadingEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
    return overview;
  } catch (error) {
    loadingEl?.classList.add('hidden');
    errorEl?.classList.remove('hidden');
    setText('account-overview-error-message', error.message || '잠시 후 다시 시도해 주세요.');
    throw error;
  } finally {
    isAccountOverviewLoading = false;
  }
}

async function upgradeAccountToFreePlan() {
  const action = getAccountAction(lastAccountOverview, 'upgrade_free');
  if (action?.enabled !== true) {
    await showUiPopup(action?.reason || '현재 Free Plan으로 전환할 수 없습니다.');
    return;
  }

  const email = await showUiPrompt('Free Plan 전환에 사용할 이메일을 입력해 주세요.\n인증 코드를 보내고, 확인 후 Free Plan으로 전환합니다.', {
    title: 'Free Plan 전환',
    type: 'email',
    placeholder: 'you@example.com',
    confirmText: '인증 코드 받기',
    cancelText: '취소'
  });
  if (email == null) return;
  const normalizedEmail = String(email || '').trim();
  if (!isValidAccountEmail(normalizedEmail)) {
    await showUiPopup('유효한 이메일 주소를 입력해 주세요.');
    return;
  }

  const button = document.getElementById('account-upgrade-free-btn');
  try {
    const verifiedEmail = await runLicenseEmailVerification({
      email: normalizedEmail,
      title: '이메일 인증',
      button
    });
    if (!verifiedEmail) return;

    if (button) {
      button.disabled = true;
      button.textContent = '전환 중...';
    }
    const result = await postJson('/api/v1/license/upgrade', {
      targetPlan: 'free',
      email: verifiedEmail
    });
    await showUiPopup(result?.message || 'Free Plan으로 전환되었습니다.');
    lastAccountOverview = null;
    await loadAccountOverview({ force: true });
    await loadDashboard();
  } catch (error) {
    await showUiPopup(`전환 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
    await loadAccountOverview({ force: true }).catch(() => {});
  }
}

async function registerOrChangeAccountEmail() {
  const action = getAccountAction(lastAccountOverview, 'register_email');
  if (action?.enabled !== true) {
    await showUiPopup(action?.reason || '현재 이메일을 등록할 수 없습니다.');
    return;
  }

  const isChange = action.mode === 'change' || Boolean(lastAccountOverview?.identity?.email_verified);
  const currentEmail = String(lastAccountOverview?.identity?.email_masked || '').trim();
  const email = await showUiPrompt(
    isChange
      ? `새 이메일을 입력해 주세요.\n현재 연결: ${currentEmail || '-'}\n새 이메일 인증 후 라이선스 복구 이메일이 변경됩니다.`
      : '라이선스 복구와 플랜 관리에 사용할 이메일을 입력해 주세요.\n인증 코드를 보내고, 확인 후 현재 라이선스에 연결합니다.',
    {
      title: isChange ? '이메일 변경' : '이메일 등록',
      type: 'email',
      placeholder: 'you@example.com',
      confirmText: '인증 코드 받기',
      cancelText: '취소'
    }
  );
  if (email == null) return;

  const button = document.getElementById('account-register-email-btn');
  try {
    const verifiedEmail = await runLicenseEmailVerification({
      email,
      title: isChange ? '이메일 변경 인증' : '이메일 등록 인증',
      button
    });
    if (!verifiedEmail) return;

    await showUiPopup(isChange ? '이메일이 변경되었습니다.' : '이메일이 등록되었습니다.');
    lastAccountOverview = null;
    await loadAccountOverview({ force: true });
    await loadDashboard();
  } catch (error) {
    await showUiPopup(`이메일 처리 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
    await loadAccountOverview({ force: true }).catch(() => {});
  }
}

function showAccountPlanInfo() {
  return showUiDialog({
    title: '플랜 안내',
    message: [
      '스마트 기능 (매월 1일 갱신)',
      '- 글감 추천 / 키워드 탐색 / AI 제목 추천은 각각 별도 횟수로 관리됩니다.',
      '- 한 번 시작한 추천 안에서는 정해진 재시도를 사용할 수 있습니다.',
      '',
      'Tester',
      '- 스마트 기능 40 / 40 / 40회',
      'Free',
      '- 스마트 기능 20 / 20 / 20회',
      '- 기본 블로그 발행',
      '',
      'Pro',
      '- 스마트 기능 80 / 80 / 80회',
      '- 트렌드, 쇼핑, 연관글 등 고급 기능',
      '',
      'Ultra',
      '- 스마트 기능 200 / 200 / 200회',
      '- 상위 기능',
      '',
      '크레딧',
      '- 현재 플랜 권한 안에서 사용하는 추가 발행 횟수',
      '- 만료 없음',
      '- 환불 불가',
      '',
      '구독은 기능과 월 기본 횟수를 바꾸고, 크레딧은 현재 플랜 안에서 발행 횟수만 늘립니다.'
    ].join('\n'),
    showCancel: false,
    confirmText: '확인'
  });
}

let accountUpgradeFreeClickBound = false;
