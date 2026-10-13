const SETTINGS_NEXT_TABS = Object.freeze(['core', 'ai', 'writing', 'extras', 'app']);
const SETTINGS_NEXT_CORE_TABS = Object.freeze(['content', 'publishing', 'hosting']);
const SETTINGS_NEXT_APP_TABS = Object.freeze(['external', 'input', 'general', 'appearance']);

let settingsNextActiveTab = 'core';
let settingsNextActiveCoreTab = 'content';
let settingsNextActiveAppTab = 'external';
let settingsNextMajorFields = {};
let settingsNextAccountOverview = null;
let settingsNextGoogleStatus = null;
let settingsNextNaverStatus = null;
let settingsNextSheetVerification = null;
let settingsNextBound = false;
let settingsNextLoaded = false;
let settingsNextLoading = false;
let settingsNextStatusesLoaded = false;
let settingsNextStatusesLoading = null;
let settingsNextStatusesLoadingForce = false;
let settingsNextForcedStatusRefresh = null;
let settingsNextStatusChecks = { google: false, account: false, naver: false };
let settingsNextStatusErrors = { google: false, account: false, naver: false };
let settingsNextRefreshBusy = false;
let settingsNextGoogleBusy = false;
let settingsNextGoogleFlowId = '';
let settingsNextGoogleFlowAction = '';
let settingsNextAccountOverviewError = false;
const settingsNextDirtyScopes = new Set();
const settingsNextBusyScopes = new Set();
const settingsNextBusyActionByScope = new Map();

function isSettingsNextViewActive() {
  return document.getElementById('view-settings-next')?.classList.contains('active') === true;
}

function hasPendingSettingsNextChanges() {
  return settingsNextDirtyScopes.size > 0;
}

function settingsNextMarkScopeDirty(scope) {
  settingsNextDirtyScopes.add(scope);
}

function settingsNextClearScopeDirty(scope) {
  settingsNextDirtyScopes.delete(scope);
}

function settingsNextSetText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value || '');
}

const settingsNextSetFeedback = setUiSettingsCardFeedback;

function settingsNextScopeFeedbackId(scope) {
  return {
    content: 'settings-next-content-feedback',
    naver: 'settings-next-naver-feedback',
    wordpress: 'settings-next-wordpress-feedback'
  }[scope] || '';
}

function settingsNextSetScopeFeedback(scope, message = '', tone = 'neutral') {
  const id = settingsNextScopeFeedbackId(scope);
  if (id) settingsNextSetFeedback(id, message, tone);
}

function settingsNextSetStatus(id, label, tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = String(label || '');
  element.dataset.state = tone;
}

function settingsNextSetDot(element, tone = 'neutral') {
  if (element) element.dataset.tone = tone;
}

function settingsNextHasValidSheetUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:'
      && url.hostname === 'docs.google.com'
      && /\/spreadsheets\/d\/[a-zA-Z0-9-_]+/i.test(url.pathname);
  } catch (_error) {
    return false;
  }
}

function settingsNextActivateTab(tabName) {
  const target = SETTINGS_NEXT_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'core';
  settingsNextActiveTab = target;
  document.querySelectorAll('[data-settings-next-tab]').forEach((button) => {
    const active = button.dataset.settingsNextTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.settings-next-panel').forEach((panel) => {
    const active = panel.id === `settings-next-panel-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function settingsNextActivateCoreTab(tabName) {
  const target = SETTINGS_NEXT_CORE_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'content';
  settingsNextActiveCoreTab = target;
  document.querySelectorAll('[data-settings-next-core-tab]').forEach((button) => {
    const active = button.dataset.settingsNextCoreTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.settings-next-core-panel').forEach((panel) => {
    const active = panel.id === `settings-next-core-panel-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  document.querySelectorAll('[data-settings-next-core-action]').forEach((action) => {
    action.hidden = action.dataset.settingsNextCoreAction !== target;
  });
  if (target === 'hosting' && typeof settingsNextSiteHostingRefresh === 'function') {
    void settingsNextSiteHostingRefresh();
  }
}

function settingsNextActivateAppTab(tabName) {
  const target = SETTINGS_NEXT_APP_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'external';
  settingsNextActiveAppTab = target;
  document.querySelectorAll('[data-settings-next-app-tab]').forEach((button) => {
    const active = button.dataset.settingsNextAppTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.settings-next-app-panel').forEach((panel) => {
    const active = panel.id === `settings-next-app-panel-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function settingsNextScopeValues(scope) {
  if (scope === 'content') {
    return {
      GOOGLE_SHEET_URL: String(document.getElementById('settings-next-google-sheet-url')?.value || '').trim(),
      GOOGLE_SHEET_TITLE: String(document.getElementById('settings-next-google-sheet-title')?.value || '').trim(),
      GOOGLE_SHEET_AUTHORIZED_FILE_ID: String(document.getElementById('settings-next-google-sheet-authorized-id')?.value || '').trim()
    };
  }
  if (scope === 'naver') {
    return { NAVER_ID: String(document.getElementById('settings-next-naver-id')?.value || '').trim() };
  }
  if (scope === 'wordpress') {
    const enteredPassword = String(document.getElementById('settings-next-wordpress-app-password')?.value || '');
    return {
      WORDPRESS_URL: String(document.getElementById('settings-next-wordpress-url')?.value || '').trim(),
      WORDPRESS_USER_ID: String(document.getElementById('settings-next-wordpress-user-id')?.value || '').trim(),
      WORDPRESS_APP_PASSWORD: enteredPassword
    };
  }
  return {};
}

function settingsNextSavedScopeValues(scope) {
  if (scope === 'content') return {
    GOOGLE_SHEET_URL: String(settingsNextMajorFields.GOOGLE_SHEET_URL || '').trim(),
    GOOGLE_SHEET_TITLE: String(settingsNextMajorFields.GOOGLE_SHEET_TITLE || '').trim(),
    GOOGLE_SHEET_AUTHORIZED_FILE_ID: String(settingsNextMajorFields.GOOGLE_SHEET_AUTHORIZED_FILE_ID || '').trim()
  };
  if (scope === 'naver') return { NAVER_ID: String(settingsNextMajorFields.NAVER_ID || '').trim() };
  if (scope === 'wordpress') {
    return {
      WORDPRESS_URL: String(settingsNextMajorFields.WORDPRESS_URL || '').trim(),
      WORDPRESS_USER_ID: String(settingsNextMajorFields.WORDPRESS_USER_ID || '').trim(),
      WORDPRESS_APP_PASSWORD: ''
    };
  }
  return {};
}

function settingsNextSyncScopeDirty(scope) {
  const dirty = JSON.stringify(settingsNextScopeValues(scope)) !== JSON.stringify(settingsNextSavedScopeValues(scope));
  if (dirty) settingsNextDirtyScopes.add(scope);
  else settingsNextDirtyScopes.delete(scope);
  if (dirty) settingsNextSetScopeFeedback(scope, '');
  settingsNextUpdateSaveUi(scope);
}

function settingsNextUpdateSaveUi(scope) {
  const dirty = settingsNextDirtyScopes.has(scope);
  const busy = settingsNextBusyScopes.has(scope);
  const busyAction = settingsNextBusyActionByScope.get(scope) || '';
  if (scope === 'content') {
    const openButton = document.getElementById('settings-next-open-google-sheet');
    const createButton = document.getElementById('settings-next-google-sheet-create');
    const pickerButton = document.getElementById('settings-next-google-sheet-pick');
    const sheetUrl = String(document.getElementById('settings-next-google-sheet-url')?.value || '').trim();
    const sheetId = settingsNextExtractSheetId(sheetUrl);
    const authorizedId = String(document.getElementById('settings-next-google-sheet-authorized-id')?.value || '').trim();
    const transitionNeeded = Boolean(sheetId && authorizedId !== sheetId);
    if (openButton) openButton.disabled = busy;
    if (createButton) {
      const canCancel = settingsNextGoogleBusy && settingsNextGoogleFlowId && settingsNextGoogleFlowAction === 'create-sheet';
      createButton.disabled = busy || (settingsNextGoogleBusy && !canCancel);
      createButton.textContent = canCancel ? '인증 취소' : '새 파일 생성';
      createButton.classList.toggle('primary', !transitionNeeded);
      createButton.classList.toggle('secondary', transitionNeeded);
    }
    if (pickerButton) {
      const canCancel = settingsNextGoogleBusy && settingsNextGoogleFlowId && settingsNextGoogleFlowAction === 'pick-sheet';
      pickerButton.disabled = busy || (settingsNextGoogleBusy && !canCancel);
      pickerButton.textContent = canCancel ? '인증 취소' : (transitionNeeded ? '전환' : '기존 파일 선택');
      pickerButton.classList.toggle('primary', transitionNeeded);
      pickerButton.classList.toggle('secondary', !transitionNeeded);
    }
  }
  if (scope === 'naver') {
    const button = document.getElementById('settings-next-naver-login');
    const logoutButton = document.getElementById('settings-next-naver-logout');
    const hasId = Boolean(settingsNextScopeValues('naver').NAVER_ID);
    const loggedIn = settingsNextNaverStatus?.valid === true;
    if (button) {
      button.hidden = loggedIn && !dirty;
      button.disabled = !hasId || busy;
      button.textContent = busy && busyAction === 'login' ? '로그인 중...' : '로그인';
    }
    if (logoutButton) {
      logoutButton.disabled = busy;
      logoutButton.textContent = busy && busyAction === 'logout' ? '로그아웃 중...' : '로그아웃';
    }
  }
  if (scope === 'wordpress') {
    const button = document.getElementById('settings-next-wordpress-save');
    const values = settingsNextScopeValues('wordpress');
    const passwordConfigured = settingsNextMajorFields.WORDPRESS_APP_PASSWORD_CONFIGURED === true;
    const complete = Boolean(values.WORDPRESS_URL && values.WORDPRESS_USER_ID && (values.WORDPRESS_APP_PASSWORD || passwordConfigured));
    if (button) {
      button.disabled = !complete || busy;
      button.textContent = busy ? '연결 확인 중...' : '연결 확인';
    }
  }
}

function settingsNextSyncRefreshAvailability() {
  const busy = settingsNextRefreshBusy || settingsNextGoogleBusy || settingsNextBusyScopes.size > 0;
  document.querySelectorAll('[data-settings-next-refresh]').forEach((button) => {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(settingsNextRefreshBusy));
  });
}

function settingsNextSetRefreshBusy(busy) {
  settingsNextRefreshBusy = busy;
  settingsNextSyncRefreshAvailability();
}

function settingsNextSetGoogleBusy(busy) {
  settingsNextGoogleBusy = busy;
  if (!busy) {
    settingsNextGoogleFlowId = '';
    settingsNextGoogleFlowAction = '';
  }
  settingsNextUpdateSaveUi('content');
  settingsNextSyncRefreshAvailability();
}

function settingsNextSetScopeBusy(scope, busy, action = '') {
  if (busy) {
    settingsNextBusyScopes.add(scope);
    settingsNextBusyActionByScope.set(scope, action);
  } else {
    settingsNextBusyScopes.delete(scope);
    settingsNextBusyActionByScope.delete(scope);
  }
  const form = document.getElementById(`settings-next-${scope}-form`);
  if (form) form.setAttribute('aria-busy', busy ? 'true' : 'false');
  ['content', 'naver', 'wordpress'].forEach(settingsNextUpdateSaveUi);
  settingsNextSyncRefreshAvailability();
}

function settingsNextApplyMajorFields(data = {}) {
  settingsNextMajorFields = { ...(data?.fields || data || {}) };
  if (!settingsNextDirtyScopes.has('content')) {
    const input = document.getElementById('settings-next-google-sheet-url');
    const titleInput = document.getElementById('settings-next-google-sheet-title');
    const authorizedId = document.getElementById('settings-next-google-sheet-authorized-id');
    if (input) input.value = String(settingsNextMajorFields.GOOGLE_SHEET_URL || '');
    if (titleInput) titleInput.value = String(settingsNextMajorFields.GOOGLE_SHEET_TITLE || '');
    if (authorizedId) authorizedId.value = String(settingsNextMajorFields.GOOGLE_SHEET_AUTHORIZED_FILE_ID || '');
    settingsNextRenderSheetSelection();
  }
  if (!settingsNextDirtyScopes.has('naver')) {
    const input = document.getElementById('settings-next-naver-id');
    if (input) input.value = String(settingsNextMajorFields.NAVER_ID || '');
  }
  if (!settingsNextDirtyScopes.has('wordpress')) {
    const url = document.getElementById('settings-next-wordpress-url');
    const user = document.getElementById('settings-next-wordpress-user-id');
    const password = document.getElementById('settings-next-wordpress-app-password');
    if (url) url.value = String(settingsNextMajorFields.WORDPRESS_URL || '');
    if (user) user.value = String(settingsNextMajorFields.WORDPRESS_USER_ID || '');
    if (password) {
      password.value = '';
      password.placeholder = settingsNextMajorFields.WORDPRESS_APP_PASSWORD_CONFIGURED ? '등록된 비밀번호 유지' : '애플리케이션 비밀번호';
    }
    settingsNextSetText(
      'settings-next-wordpress-password-hint',
      settingsNextMajorFields.WORDPRESS_APP_PASSWORD_CONFIGURED
        ? '비밀번호 등록됨 · 변경할 때만 새 비밀번호를 입력하세요.'
        : '등록된 값은 표시하지 않습니다. 새 비밀번호를 입력하세요.'
    );
  }
  ['content', 'naver', 'wordpress'].forEach(settingsNextSyncScopeDirty);
  settingsNextRenderReadiness();
}

function settingsNextRenderSheetSelection() {
  const url = String(document.getElementById('settings-next-google-sheet-url')?.value || '').trim();
  const title = String(document.getElementById('settings-next-google-sheet-title')?.value || '').trim();
  const sheetId = settingsNextExtractSheetId(url);
  const authorizedId = String(document.getElementById('settings-next-google-sheet-authorized-id')?.value || '').trim();
  const migrationNeeded = Boolean(sheetId && authorizedId !== sheetId);
  const name = document.getElementById('settings-next-google-sheet-name');
  if (name) {
    name.textContent = title || (url ? '기존 방식으로 연결된 Spreadsheet' : '연결된 파일 없음');
    name.dataset.empty = url ? 'false' : 'true';
  }
  const openButton = document.getElementById('settings-next-open-google-sheet');
  if (openButton) {
    openButton.hidden = !url;
    openButton.textContent = migrationNeeded ? '기존 파일 열기 ↗' : '열기 ↗';
  }
  const migration = document.getElementById('settings-next-google-sheet-migration');
  if (migration) {
    migration.hidden = !migrationNeeded;
    migration.textContent = migrationNeeded
      ? '기존 연결을 전환해 주세요. 기존 Spreadsheet를 다시 선택해도 파일 내용은 바뀌지 않습니다.'
      : '';
  }
  const detail = document.getElementById('settings-next-google-sheet-detail');
  if (detail) {
    detail.hidden = migrationNeeded;
    detail.textContent = '새 파일은 내 Drive의 BlogGenius 폴더에 오늘 날짜 이름으로 생성됩니다.';
  }
  settingsNextUpdateSaveUi('content');
}

function settingsNextConnectionState(connection) {
  const state = String(connection?.status || '').trim().toLowerCase();
  return {
    connected: state === 'connected',
    configured: state === 'configured',
    warning: state === 'failed' || state === 'unverified' || state === 'reauth_required'
  };
}

function settingsNextRenderReadiness() {
  const sheet = settingsNextConnectionState(settingsNextAccountOverview?.connections?.google_sheets);
  const sheetUrl = String(settingsNextMajorFields.GOOGLE_SHEET_URL || '').trim();
  const sheetId = settingsNextExtractSheetId(sheetUrl);
  const authorizedId = String(settingsNextMajorFields.GOOGLE_SHEET_AUTHORIZED_FILE_ID || '').trim();
  const migrationNeeded = Boolean(sheetId && authorizedId !== sheetId);
  const hasSheetUrl = Boolean(sheetUrl);
  const localVerification = settingsNextSheetVerification?.spreadsheetId === sheetId ? settingsNextSheetVerification : null;
  const sheetAccessible = localVerification?.success === true || (!localVerification && sheet.connected);
  const sheetFailed = localVerification?.success === false;
  const sheetReadiness = document.getElementById('settings-next-sheet-readiness');
  const sheetDot = sheetReadiness?.closest('.ui-settings-readiness-card')?.querySelector('.settings-next-status-dot');
  settingsNextSetText(
    'settings-next-sheet-readiness',
    settingsNextStatusChecks.account ? '확인 중…'
      : settingsNextStatusErrors.account ? '확인 실패 · 이전 상태 유지'
      : migrationNeeded ? '기존 연결 전환 필요'
      : settingsNextAccountOverviewError && !settingsNextAccountOverview
      ? '연결 상태 확인 실패'
      : (sheetAccessible ? '연결됨' : (sheetFailed ? '연결 확인 실패' : (hasSheetUrl ? '연결 확인 필요' : '연결 필요')))
  );
  settingsNextSetDot(
    sheetDot,
    settingsNextStatusChecks.account ? 'neutral'
      : settingsNextStatusErrors.account ? 'warning'
      : migrationNeeded ? 'warning'
      : settingsNextAccountOverviewError && !settingsNextAccountOverview
      ? 'danger'
      : (sheetAccessible ? 'success' : (sheetFailed ? 'danger' : (hasSheetUrl ? 'warning' : 'danger')))
  );
  const contentStatusLabel = settingsNextStatusChecks.account
    ? '확인 중…'
    : settingsNextStatusErrors.account
      ? '확인 실패 · 이전 상태 유지'
      : migrationNeeded
        ? '전환 필요'
        : sheetAccessible
          ? '연결됨'
          : sheetFailed ? '연결 확인 실패' : (hasSheetUrl ? '연결 확인 필요' : '연결 필요');
  const contentStatusTone = settingsNextStatusChecks.account
    ? 'neutral'
    : settingsNextStatusErrors.account
      ? 'warning'
      : migrationNeeded ? 'warning' : (sheetAccessible ? 'success' : (sheetFailed ? 'danger' : (hasSheetUrl ? 'warning' : 'neutral')));
  settingsNextSetStatus('settings-next-content-status', contentStatusLabel, contentStatusTone);
  const wordpress = settingsNextConnectionState(settingsNextAccountOverview?.connections?.wordpress);
  const wordpressConfigured = Boolean(settingsNextMajorFields.WORDPRESS_URL
    && settingsNextMajorFields.WORDPRESS_USER_ID
    && settingsNextMajorFields.WORDPRESS_APP_PASSWORD_CONFIGURED);
  const naverReason = String(settingsNextNaverStatus?.reason || '').trim().toLowerCase();
  const naverValid = settingsNextNaverStatus?.valid === true;
  const naverReadinessTone = naverValid ? 'success' : (naverReason === 'expired' ? 'warning' : 'danger');
  settingsNextSetText(
    'settings-next-naver-readiness',
    settingsNextStatusChecks.naver ? '확인 중…' : (settingsNextStatusErrors.naver ? '확인 실패 · 이전 상태 유지' : naverValid
      ? '로그인됨'
      : (naverReason === 'check_failed'
        ? '상태 확인 실패'
        : (naverReason === 'expired' ? '다시 로그인 필요' : (settingsNextMajorFields.NAVER_ID ? '로그인 필요' : '아이디 필요'))))
  );
  settingsNextSetDot(document.getElementById('settings-next-naver-readiness-dot'), settingsNextStatusChecks.naver ? 'neutral' : (settingsNextStatusErrors.naver ? 'warning' : naverReadinessTone));

  const wordpressStatusUnavailable = settingsNextAccountOverviewError && !settingsNextAccountOverview;
  settingsNextSetText(
    'settings-next-wordpress-readiness',
    settingsNextStatusChecks.account ? '확인 중…' : settingsNextStatusErrors.account ? '확인 실패 · 이전 상태 유지' : wordpressStatusUnavailable
      ? '상태 확인 실패'
      : (wordpress.connected ? '연결됨' : (wordpressConfigured ? '연결 확인 필요' : '설정 필요'))
  );
  settingsNextSetDot(
    document.getElementById('settings-next-wordpress-readiness-dot'),
    settingsNextStatusChecks.account ? 'neutral' : (settingsNextStatusErrors.account ? 'warning' : (wordpressStatusUnavailable ? 'danger' : (wordpress.connected ? 'success' : (wordpressConfigured ? 'warning' : 'danger'))))
  );

  settingsNextSetStatus(
    'settings-next-wordpress-status',
    settingsNextStatusChecks.account ? '확인 중…' : (settingsNextStatusErrors.account ? '확인 실패 · 이전 상태 유지' : (wordpress.connected ? '연결됨' : (wordpressConfigured ? '확인 필요' : '미설정'))),
    settingsNextStatusChecks.account ? 'neutral' : (settingsNextStatusErrors.account ? 'warning' : (wordpress.connected ? 'success' : (wordpressConfigured ? 'warning' : 'neutral')))
  );
}

function settingsNextRenderGoogleStatus(data = {}) {
  settingsNextGoogleStatus = data;
  settingsNextRenderReadiness();
}

function settingsNextExtractSheetId(value = '') {
  return String(value || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i)?.[1] || '';
}

function settingsNextRenderNaverStatus(data = {}) {
  settingsNextNaverStatus = data;
  const valid = data?.valid === true;
  const reason = String(data?.reason || '').trim();
  settingsNextSetStatus(
    'settings-next-naver-status',
    settingsNextStatusChecks.naver ? '확인 중…' : (settingsNextStatusErrors.naver ? '확인 실패 · 이전 상태 유지' : (valid ? '로그인됨' : (reason === 'expired' ? '로그인 만료' : (reason === 'check_failed' ? '확인 실패' : '로그아웃됨')))),
    settingsNextStatusChecks.naver ? 'neutral' : (settingsNextStatusErrors.naver ? 'warning' : (valid ? 'success' : (reason === 'expired' || reason === 'check_failed' ? 'warning' : 'neutral')))
  );
  settingsNextSetText(
    'settings-next-naver-detail',
    valid ? '네이버 로그인 세션이 정상입니다.' : (data?.message || (reason === 'expired' ? '세션이 만료되었습니다. 다시 로그인해 주세요.' : '로그인 정보가 없습니다.'))
  );
  const logout = document.getElementById('settings-next-naver-logout');
  const login = document.getElementById('settings-next-naver-login');
  if (logout) logout.hidden = !valid;
  if (login) login.hidden = valid && !settingsNextDirtyScopes.has('naver');
  settingsNextRenderReadiness();
}

async function settingsNextLoadStatuses({ force = false } = {}) {
  if (settingsNextStatusesLoading) {
    if (force && !settingsNextStatusesLoadingForce) {
      if (!settingsNextForcedStatusRefresh) {
        settingsNextForcedStatusRefresh = settingsNextStatusesLoading
          .then(() => settingsNextLoadStatuses({ force: true }))
          .finally(() => { settingsNextForcedStatusRefresh = null; });
      }
      return settingsNextForcedStatusRefresh;
    }
    return settingsNextStatusesLoading;
  }
  if (settingsNextStatusesLoaded && !force) return;
  settingsNextStatusChecks = { google: true, account: true, naver: true };
  settingsNextStatusErrors = { google: false, account: false, naver: false };
  settingsNextStatusesLoadingForce = force;
  settingsNextRenderReadiness();
  settingsNextSetStatus('settings-next-naver-status', '확인 중…', 'neutral');
  const failures = [];
  const settleStatus = async (key, label, request, onSuccess, onFailure) => {
    try {
      onSuccess(await request);
    } catch (_error) {
      failures.push(label);
      settingsNextStatusErrors[key] = true;
      onFailure();
    } finally {
      settingsNextStatusChecks[key] = false;
      settingsNextRenderReadiness();
    }
  };
  settingsNextStatusesLoading = Promise.all([
    settleStatus('google', 'Google 계정', fetchJson('/api/v1/google-oauth/status'),
      settingsNextRenderGoogleStatus,
      () => { if (!settingsNextGoogleStatus) settingsNextRenderGoogleStatus({ state: 'error', message: 'Google 연결 상태를 확인하지 못했습니다.' }); }),
    settleStatus('account', 'Spreadsheet와 발행 채널', fetchJson(`/api/v1/account/overview?quiet=1${force ? '&force=1' : ''}`),
      (overview) => { settingsNextAccountOverviewError = false; settingsNextAccountOverview = overview; },
      () => { settingsNextAccountOverviewError = true; }),
    settleStatus('naver', '네이버 로그인', fetchJson(`/api/v1/session/naver${force ? '?force=1' : ''}`),
      settingsNextRenderNaverStatus,
      () => { if (!settingsNextNaverStatus) settingsNextRenderNaverStatus({ valid: false, reason: 'check_failed', message: '네이버 로그인 상태를 확인하지 못했습니다.' }); })
  ]).then(() => {
    settingsNextStatusesLoaded = true;
    settingsNextSetFeedback(
      'settings-next-load-feedback',
      failures.length > 0 ? `${failures.join(', ')} 상태를 확인하지 못했습니다. 마지막으로 확인한 정보는 유지했습니다.` : '',
      failures.length > 0 ? 'danger' : 'neutral'
    );
    settingsNextRenderReadiness();
  }).finally(() => {
    settingsNextStatusesLoading = null;
    settingsNextStatusesLoadingForce = false;
  });
  return settingsNextStatusesLoading;
}

async function loadSettingsNext() {
  if (settingsNextLoading || settingsNextLoaded) return;
  settingsNextLoading = true;
  void settingsNextLoadStatuses();
  void settingsNextLoadWritingDefaults();
  void loadSettingsNextOptionalServices();
  try {
    const results = await Promise.allSettled([
      fetchJson('/api/v1/settings/core-connections').then(settingsNextApplyMajorFields),
      fetchJson('/api/v1/settings/ai-roles').then(loadSettingsNextAi)
    ]);
    settingsNextLoaded = results.every((result) => result.status === 'fulfilled');
    if (!settingsNextLoaded) {
      const failed = results.find((result) => result.status === 'rejected')?.reason;
      settingsNextSetFeedback('settings-next-load-feedback', failed?.message || '저장된 설정을 불러오지 못했습니다. 다시 시도해 주세요.', 'danger');
    }
  } finally {
    settingsNextLoading = false;
  }
}

function settingsNextValidateScope(scope, values) {
  if (scope === 'content') {
    if (!values.GOOGLE_SHEET_URL) return 'Spreadsheet 주소를 입력해 주세요.';
    if (!settingsNextHasValidSheetUrl(values.GOOGLE_SHEET_URL)) {
      return 'Google Spreadsheet의 HTTPS 주소를 입력해 주세요.';
    }
  }
  if (scope === 'naver' && !values.NAVER_ID) return '네이버 아이디를 입력해 주세요.';
  if (scope === 'wordpress') {
    if (!values.WORDPRESS_URL || !values.WORDPRESS_USER_ID
      || (!values.WORDPRESS_APP_PASSWORD && !settingsNextMajorFields.WORDPRESS_APP_PASSWORD_CONFIGURED)) {
      return '사이트 주소, 사용자 ID와 애플리케이션 비밀번호를 모두 입력해 주세요.';
    }
    try {
      const url = new URL(values.WORDPRESS_URL);
      if (!['http:', 'https:'].includes(url.protocol)) return '워드프레스 사이트 주소를 확인해 주세요.';
    } catch (_error) {
      return '올바른 워드프레스 사이트 주소를 입력해 주세요.';
    }
  }
  return '';
}

async function settingsNextSaveScope(scope) {
  if (settingsNextBusyScopes.has(scope)) return false;
  const values = settingsNextScopeValues(scope);
  const validationMessage = settingsNextValidateScope(scope, values);
  if (validationMessage) {
    settingsNextSetScopeFeedback(scope, validationMessage, 'danger');
    return false;
  }
  settingsNextSetScopeBusy(scope, true, 'apply');
  settingsNextSetScopeFeedback(scope, '');
  try {
    const data = await postJson('/api/v1/settings/core-connections', { scope, values });
    settingsNextClearScopeDirty(scope);
    settingsNextMajorFields = { ...(data?.fields || {}) };
    settingsNextApplyMajorFields(data);
    uiSheetsReady = false;
    return true;
  } catch (error) {
    settingsNextSetScopeFeedback(scope, error.message || '변경사항을 반영하지 못했습니다.', 'danger');
    return false;
  } finally {
    settingsNextSetScopeBusy(scope, false);
  }
}

async function settingsNextSubmitNaver(event) {
  event.preventDefault();
  if (settingsNextBusyScopes.has('naver')) return;
  const hadChanges = settingsNextDirtyScopes.has('naver');
  if (hadChanges && !await settingsNextSaveScope('naver')) return;
  settingsNextSetScopeBusy('naver', true, 'login');
  settingsNextSetScopeFeedback('naver', '');
  try {
    await postJson('/api/v1/session/naver-login/start', {});
    const result = await pollNaverLoginStatus();
    if (String(result?.status || '').trim().toLowerCase() !== 'success') {
      throw new Error(result?.error || result?.message || '로그인 완료를 확인하지 못했습니다.');
    }
    const status = await fetchJson('/api/v1/session/naver?force=1');
    settingsNextRenderNaverStatus(status);
    settingsNextSetScopeFeedback('naver', '');
    void settingsNextLoadStatuses({ force: true });
  } catch (error) {
    const prefix = hadChanges ? '아이디는 반영되었습니다. ' : '';
    settingsNextSetScopeFeedback('naver', `${prefix}${error.message || '로그인하지 못했습니다.'}`, 'danger');
    void settingsNextLoadStatuses({ force: true });
  } finally {
    settingsNextSetScopeBusy('naver', false);
  }
}

async function settingsNextLogoutNaver() {
  if (settingsNextBusyScopes.has('naver')) return;
  const confirmed = await showUiConfirm('이 기기의 네이버 로그인 정보를 지우고 로그아웃할까요?', {
    title: '네이버 로그아웃',
    confirmText: '로그아웃',
    cancelText: '취소'
  });
  if (!confirmed) return;
  settingsNextSetScopeBusy('naver', true, 'logout');
  settingsNextSetScopeFeedback('naver', '');
  try {
    await postJson('/api/v1/session/naver-login/logout', {});
    settingsNextRenderNaverStatus({ valid: false, reason: 'logged_out', message: '로그인 정보가 없습니다.' });
    settingsNextSetScopeFeedback('naver', '');
    void settingsNextLoadStatuses({ force: true });
  } catch (error) {
    settingsNextSetScopeFeedback('naver', error.message || '로그아웃하지 못했습니다.', 'danger');
  } finally {
    settingsNextSetScopeBusy('naver', false);
  }
}

async function settingsNextSubmitWordpress(event) {
  event.preventDefault();
  if (settingsNextBusyScopes.has('wordpress')) return;
  const values = settingsNextScopeValues('wordpress');
  const hadChanges = settingsNextDirtyScopes.has('wordpress');
  if (hadChanges && !await settingsNextSaveScope('wordpress')) return;
  settingsNextSetScopeBusy('wordpress', true, 'verify');
  settingsNextSetScopeFeedback('wordpress', '');
  try {
    const result = await postJson('/api/v1/session/wordpress-verify', {
      wordpressUrl: values.WORDPRESS_URL,
      wordpressUserId: values.WORDPRESS_USER_ID,
      wordpressAppPassword: values.WORDPRESS_APP_PASSWORD
    });
    if (!result?.success) throw new Error(result?.message || '워드프레스 연결을 확인하지 못했습니다.');
    settingsNextSetFeedback('settings-next-wordpress-feedback', '');
    settingsNextSetStatus('settings-next-wordpress-status', '연결됨', 'success');
    void settingsNextLoadStatuses({ force: true });
  } catch (error) {
    const prefix = hadChanges ? '입력값은 반영되었습니다. ' : '';
    settingsNextSetFeedback('settings-next-wordpress-feedback', `${prefix}${error.message || '워드프레스 연결을 확인하지 못했습니다.'}`, 'danger');
    settingsNextSetStatus('settings-next-wordpress-status', '확인 실패', 'danger');
  } finally {
    settingsNextSetScopeBusy('wordpress', false);
  }
}

async function confirmDiscardUnsavedSettingsNext() {
  if (!hasPendingSettingsNextChanges()) return true;
  const changed = settingsNextDirtyLabels();
  const choice = await showUiThreeWayChoice(`아직 반영하지 않은 변경사항이 있습니다: ${changed}\n이 화면을 떠나면 변경사항이 사라집니다.`, {
    title: '설정 변경사항',
    saveText: '저장 후 이동',
    discardText: '변경사항 버리고 이동',
    stayText: '계속 편집'
  });
  if (choice === 'stay') return false;
  if (choice === 'save') {
    const saved = await saveAllDirtySettingsNext();
    if (!saved) return false;
  } else {
    const discarded = discardAllDirtySettingsNextChanges();
    if (!discarded) return false;
  }
  return true;
}

function initSettingsNext() {
  if (!settingsNextBound) {
    document.querySelectorAll('[data-settings-next-tab]').forEach((button) => {
      button.addEventListener('click', () => settingsNextActivateTab(button.dataset.settingsNextTab));
      button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, {
        selector: '[data-settings-next-tab]',
        dataKey: 'settingsNextTab',
        activate: settingsNextActivateTab
      }));
    });
    document.querySelectorAll('[data-settings-next-core-tab]').forEach((button) => {
      button.addEventListener('click', () => settingsNextActivateCoreTab(button.dataset.settingsNextCoreTab));
      button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, {
        selector: '[data-settings-next-core-tab]',
        dataKey: 'settingsNextCoreTab',
        activate: settingsNextActivateCoreTab
      }));
    });
    document.querySelectorAll('[data-settings-next-app-tab]').forEach((button) => {
      button.addEventListener('click', () => settingsNextActivateAppTab(button.dataset.settingsNextAppTab));
      button.addEventListener('keydown', (event) => void handleUiTabNavigationKeydown(event, {
        selector: '[data-settings-next-app-tab]',
        dataKey: 'settingsNextAppTab',
        activate: settingsNextActivateAppTab
      }));
    });
    document.querySelectorAll('[data-settings-next-legacy-tab]').forEach((button) => {
      button.addEventListener('click', () => void navigateTo('settings', button.dataset.settingsNextLegacyTab));
    });
    document.querySelectorAll('[data-settings-next-refresh]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!settingsNextRefreshBusy) {
          settingsNextSetRefreshBusy(true);
          const refresh = button.dataset.settingsNextRefresh === 'hosting'
            ? settingsNextSiteHostingRefresh()
            : settingsNextLoadStatuses({ force: true });
          void refresh.finally(() => settingsNextSetRefreshBusy(false));
        }
      });
    });
    initUiSettingsCardPattern();
    initSettingsNextAi();
    initSettingsNextWriting();
    initSettingsNextOptionalServices();
    initSettingsNextExternalConnections();
    initSettingsNextSiteHosting();
    initSettingsNextAppEnvironment();
    const scopedInputs = {
      content: ['settings-next-google-sheet-url'],
      naver: ['settings-next-naver-id'],
      wordpress: ['settings-next-wordpress-url', 'settings-next-wordpress-user-id', 'settings-next-wordpress-app-password']
    };
    Object.entries(scopedInputs).forEach(([scope, ids]) => {
      ids.forEach((id) => document.getElementById(id)?.addEventListener('input', () => {
        if (scope === 'content') settingsNextSheetVerification = null;
        settingsNextSyncScopeDirty(scope);
      }));
    });
    document.getElementById('settings-next-google-sheet-create')?.addEventListener('click', () => {
      if (settingsNextGoogleFlowAction === 'create-sheet' && settingsNextGoogleFlowId) void settingsNextCancelGoogleFlow();
      else void settingsNextCreateSpreadsheet();
    });
    document.getElementById('settings-next-google-sheet-pick')?.addEventListener('click', () => {
      if (settingsNextGoogleFlowAction === 'pick-sheet' && settingsNextGoogleFlowId) void settingsNextCancelGoogleFlow();
      else void settingsNextPickSpreadsheet();
    });
    document.getElementById('settings-next-naver-form')?.addEventListener('submit', settingsNextSubmitNaver);
    document.getElementById('settings-next-wordpress-form')?.addEventListener('submit', settingsNextSubmitWordpress);
    document.getElementById('settings-next-naver-logout')?.addEventListener('click', () => void settingsNextLogoutNaver());
    initOpaqueSettingsSecretToggles(document.getElementById('view-settings-next'));
    document.getElementById('settings-next-open-google-sheet')?.addEventListener('click', () => {
      const raw = document.getElementById('settings-next-google-sheet-url')?.value || '';
      if (raw) window.open(buildGoogleSheetOpenUrl(raw), '_blank', 'noopener,noreferrer');
    });
    settingsNextBound = true;
  }
  settingsNextActivateTab(settingsNextActiveTab);
  settingsNextActivateCoreTab(settingsNextActiveCoreTab);
  settingsNextActivateAppTab(settingsNextActiveAppTab);
  void loadSettingsNextExternalConnections();
  loadSettingsNextAppEnvironment();
}
