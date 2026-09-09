const SETTINGS_NEXT_TABS = Object.freeze(['core', 'ai', 'writing', 'extras', 'app']);
const SETTINGS_NEXT_CORE_TABS = Object.freeze(['content', 'publishing']);
const SETTINGS_NEXT_APP_TABS = Object.freeze(['external', 'general']);

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
let settingsNextRefreshBusy = false;
let settingsNextGoogleBusy = false;
let settingsNextGoogleBusyAction = '';
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
  element.dataset.tone = tone;
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
    return { GOOGLE_SHEET_URL: String(document.getElementById('settings-next-google-sheet-url')?.value || '').trim() };
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
  if (scope === 'content') return { GOOGLE_SHEET_URL: String(settingsNextMajorFields.GOOGLE_SHEET_URL || '').trim() };
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
    const button = document.getElementById('settings-next-content-save');
    const openButton = document.getElementById('settings-next-open-google-sheet');
    const hasValidUrl = settingsNextHasValidSheetUrl(settingsNextScopeValues('content').GOOGLE_SHEET_URL);
    const googleConnected = String(settingsNextGoogleStatus?.state || '').trim().toLowerCase() === 'connected';
    if (button) {
      button.disabled = !hasValidUrl || busy || (!googleConnected && !dirty);
      button.textContent = busy
        ? (googleConnected ? '접근 확인 중...' : '주소 적용 중...')
        : (googleConnected ? '접근 확인' : '주소 적용');
    }
    if (openButton) openButton.disabled = !hasValidUrl || busy;
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
    button.setAttribute('aria-busy', settingsNextRefreshBusy ? 'true' : 'false');
    button.textContent = settingsNextRefreshBusy ? '새로고침 중...' : '새로고침';
  });
}

function settingsNextSetRefreshBusy(busy) {
  settingsNextRefreshBusy = busy;
  settingsNextSyncRefreshAvailability();
}

function settingsNextSetGoogleBusy(busy, action = '') {
  settingsNextGoogleBusy = busy;
  settingsNextGoogleBusyAction = busy ? action : '';
  const section = document.getElementById('settings-next-google-section');
  if (section) section.setAttribute('aria-busy', busy ? 'true' : 'false');
  const labels = {
    'settings-next-google-connect': ['connect', 'Google 계정 연결', '연결 중...'],
    'settings-next-google-test': ['test', '연결 확인', '연결 확인 중...'],
    'settings-next-google-disconnect': ['disconnect', '연결 해제', '연결 해제 중...']
  };
  Object.entries(labels).forEach(([id, [buttonAction, idleLabel, busyLabel]]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy && settingsNextGoogleBusyAction === buttonAction ? busyLabel : idleLabel;
  });
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
    if (input) input.value = String(settingsNextMajorFields.GOOGLE_SHEET_URL || '');
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

function settingsNextConnectionState(connection) {
  const state = String(connection?.status || '').trim().toLowerCase();
  return {
    connected: state === 'connected',
    configured: state === 'configured',
    warning: state === 'failed' || state === 'unverified' || state === 'reauth_required'
  };
}

function settingsNextRenderReadiness() {
  const googleState = String(settingsNextGoogleStatus?.state || '').trim().toLowerCase();
  const googleConnected = googleState === 'connected';
  const googleReadiness = document.getElementById('settings-next-google-readiness');
  const googleDot = googleReadiness?.closest('.ui-settings-readiness-card')?.querySelector('.settings-next-status-dot');
  settingsNextSetText(
    'settings-next-google-readiness',
    googleState === 'error'
      ? '상태 확인 실패'
      : (googleConnected ? '연결됨' : '연결 필요')
  );
  settingsNextSetDot(
    googleDot,
    googleState === 'error'
      ? 'danger'
      : (googleConnected ? 'success' : (googleState === 'reauth_required' ? 'warning' : 'danger'))
  );

  const sheet = settingsNextConnectionState(settingsNextAccountOverview?.connections?.google_sheets);
  const sheetUrl = String(settingsNextMajorFields.GOOGLE_SHEET_URL || '').trim();
  const hasSheetUrl = Boolean(sheetUrl);
  const localVerification = settingsNextSheetVerification?.url === sheetUrl ? settingsNextSheetVerification : null;
  const sheetAccessible = localVerification?.success === true || (!localVerification && sheet.connected);
  const sheetFailed = localVerification?.success === false;
  const sheetReadiness = document.getElementById('settings-next-sheet-readiness');
  const sheetDot = sheetReadiness?.closest('.ui-settings-readiness-card')?.querySelector('.settings-next-status-dot');
  settingsNextSetText(
    'settings-next-sheet-readiness',
    settingsNextAccountOverviewError && !settingsNextAccountOverview
      ? '상태 확인 실패'
      : (sheetAccessible ? '접근 가능' : (sheetFailed ? '접근 확인 실패' : (hasSheetUrl ? '접근 확인 필요' : '주소 필요')))
  );
  settingsNextSetDot(
    sheetDot,
    settingsNextAccountOverviewError && !settingsNextAccountOverview
      ? 'danger'
      : (sheetAccessible ? 'success' : (sheetFailed ? 'danger' : (hasSheetUrl ? 'warning' : 'danger')))
  );
  settingsNextSetStatus(
    'settings-next-content-status',
    sheetAccessible ? '접근 가능' : (sheetFailed ? '확인 실패' : (hasSheetUrl ? '확인 필요' : '주소 필요')),
    sheetAccessible ? 'success' : (sheetFailed ? 'danger' : (hasSheetUrl ? 'warning' : 'neutral'))
  );

  const wordpress = settingsNextConnectionState(settingsNextAccountOverview?.connections?.wordpress);
  const wordpressConfigured = Boolean(settingsNextMajorFields.WORDPRESS_URL
    && settingsNextMajorFields.WORDPRESS_USER_ID
    && settingsNextMajorFields.WORDPRESS_APP_PASSWORD_CONFIGURED);
  const naverReason = String(settingsNextNaverStatus?.reason || '').trim().toLowerCase();
  const naverValid = settingsNextNaverStatus?.valid === true;
  const naverReadinessTone = naverValid ? 'success' : (naverReason === 'expired' ? 'warning' : 'danger');
  settingsNextSetText(
    'settings-next-naver-readiness',
    naverValid
      ? '로그인됨'
      : (naverReason === 'check_failed'
        ? '상태 확인 실패'
        : (naverReason === 'expired' ? '다시 로그인 필요' : (settingsNextMajorFields.NAVER_ID ? '로그인 필요' : '아이디 필요')))
  );
  settingsNextSetDot(document.getElementById('settings-next-naver-readiness-dot'), naverReadinessTone);

  const wordpressStatusUnavailable = settingsNextAccountOverviewError && !settingsNextAccountOverview;
  settingsNextSetText(
    'settings-next-wordpress-readiness',
    wordpressStatusUnavailable
      ? '상태 확인 실패'
      : (wordpress.connected ? '연결됨' : (wordpressConfigured ? '연결 확인 필요' : '설정 필요'))
  );
  settingsNextSetDot(
    document.getElementById('settings-next-wordpress-readiness-dot'),
    wordpressStatusUnavailable ? 'danger' : (wordpress.connected ? 'success' : (wordpressConfigured ? 'warning' : 'danger'))
  );

  settingsNextSetStatus(
    'settings-next-wordpress-status',
    wordpress.connected ? '연결됨' : (wordpressConfigured ? '확인 필요' : '미설정'),
    wordpress.connected ? 'success' : (wordpressConfigured ? 'warning' : 'neutral')
  );
}

function settingsNextRenderGoogleStatus(data = {}) {
  settingsNextGoogleStatus = data;
  const state = String(data?.state || '').trim().toLowerCase();
  const connected = state === 'connected';
  const email = String(data?.connectedEmail || data?.email || '').trim();
  settingsNextSetStatus(
    'settings-next-google-status',
    connected ? '연결됨' : (state === 'reauth_required' ? '다시 로그인 필요' : (state === 'error' ? '확인 실패' : '미연결')),
    connected ? 'success' : (state === 'reauth_required' ? 'warning' : (state === 'error' ? 'danger' : 'neutral'))
  );
  settingsNextSetText(
    'settings-next-google-detail',
    connected ? `연결 계정: ${email || '확인됨'}` : (data?.message || 'Google 계정을 연결하면 현재 계정 권한으로 Spreadsheet에 접근합니다.')
  );
  const connect = document.getElementById('settings-next-google-connect');
  const test = document.getElementById('settings-next-google-test');
  const disconnect = document.getElementById('settings-next-google-disconnect');
  if (connect) connect.hidden = connected;
  if (test) test.hidden = !connected;
  if (disconnect) disconnect.hidden = !connected;
  settingsNextRenderReadiness();
}

function settingsNextRenderNaverStatus(data = {}) {
  settingsNextNaverStatus = data;
  const valid = data?.valid === true;
  const reason = String(data?.reason || '').trim();
  settingsNextSetStatus(
    'settings-next-naver-status',
    valid ? '로그인됨' : (reason === 'expired' ? '로그인 만료' : (reason === 'check_failed' ? '확인 실패' : '로그아웃됨')),
    valid ? 'success' : (reason === 'expired' || reason === 'check_failed' ? 'warning' : 'neutral')
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
  const results = await Promise.allSettled([
    fetchJson('/api/v1/google-oauth/status'),
    fetchJson(`/api/v1/account/overview?quiet=1${force ? '&force=1' : ''}`),
    fetchJson(`/api/v1/session/naver${force ? '?force=1' : ''}`)
  ]);
  const failures = [];
  if (results[0].status === 'fulfilled') {
    settingsNextRenderGoogleStatus(results[0].value);
  } else {
    failures.push('Google 계정');
    if (!settingsNextGoogleStatus) settingsNextRenderGoogleStatus({ state: 'error', message: 'Google 연결 상태를 확인하지 못했습니다.' });
  }
  if (results[1].status === 'fulfilled') {
    settingsNextAccountOverviewError = false;
    settingsNextAccountOverview = results[1].value;
  } else {
    settingsNextAccountOverviewError = true;
    failures.push('Spreadsheet와 발행 채널');
  }
  if (results[2].status === 'fulfilled') {
    settingsNextRenderNaverStatus(results[2].value);
  } else {
    failures.push('네이버 로그인');
    if (!settingsNextNaverStatus) settingsNextRenderNaverStatus({ valid: false, reason: 'check_failed', message: '네이버 로그인 상태를 확인하지 못했습니다.' });
  }
  settingsNextSetFeedback(
    'settings-next-load-feedback',
    failures.length > 0 ? `${failures.join(', ')} 상태를 확인하지 못했습니다. 마지막으로 확인한 정보는 유지했습니다.` : '',
    failures.length > 0 ? 'danger' : 'neutral'
  );
  settingsNextRenderReadiness();
}

async function loadSettingsNext({ force = false } = {}) {
  if (settingsNextLoading || (settingsNextLoaded && !force)) return;
  settingsNextLoading = true;
  settingsNextSetRefreshBusy(true);
  document.getElementById('view-settings-next')?.setAttribute('aria-busy', 'true');
  try {
    const [core, ai] = await Promise.all([
      fetchJson('/api/v1/settings/core-connections'),
      fetchJson('/api/v1/settings/ai-roles'),
      settingsNextLoadStatuses({ force }),
      settingsNextLoadWritingDefaults(),
      loadSettingsNextOptionalServices()
    ]);
    settingsNextApplyMajorFields(core);
    loadSettingsNextAi(ai);
    settingsNextLoaded = true;
  } catch (error) {
    settingsNextSetFeedback('settings-next-load-feedback', error.message || '기본 연결 설정을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.', 'danger');
  } finally {
    settingsNextLoading = false;
    settingsNextSetRefreshBusy(false);
    document.getElementById('view-settings-next')?.removeAttribute('aria-busy');
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
    lastDashboardLoadTime = 0;
    return true;
  } catch (error) {
    settingsNextSetScopeFeedback(scope, error.message || '변경사항을 반영하지 못했습니다.', 'danger');
    return false;
  } finally {
    settingsNextSetScopeBusy(scope, false);
  }
}

async function settingsNextTestGoogle({ feedbackId = 'settings-next-google-feedback', ownerScope = '' } = {}) {
  if (settingsNextGoogleBusy) return false;
  settingsNextSetGoogleBusy(true, 'test');
  if (ownerScope) settingsNextSetScopeBusy(ownerScope, true, 'verify');
  settingsNextSetFeedback(feedbackId, '');
  try {
    const result = await postJson('/api/v1/google-oauth/test', {});
    settingsNextSetFeedback(feedbackId, '');
    void settingsNextLoadStatuses({ force: true });
    return result;
  } catch (error) {
    settingsNextSetFeedback(feedbackId, error.message || '연결을 확인하지 못했습니다.', 'danger');
    void settingsNextLoadStatuses({ force: true });
    return null;
  } finally {
    if (ownerScope) settingsNextSetScopeBusy(ownerScope, false);
    settingsNextSetGoogleBusy(false);
  }
}

async function settingsNextStartGoogleOauth() {
  if (settingsNextGoogleBusy) return;
  settingsNextSetGoogleBusy(true, 'connect');
  settingsNextSetFeedback('settings-next-google-feedback', '브라우저에서 Google 로그인을 진행해 주세요.');
  try {
    const data = await postJson('/api/v1/google-oauth/start', {});
    if (!data?.authUrl) throw new Error('Google 인증 URL을 만들지 못했습니다.');
    const popup = window.open(data.authUrl, 'google-oauth-login', 'width=620,height=760');
    if (!popup) throw new Error('브라우저 팝업을 열지 못했습니다. 팝업 차단을 확인해 주세요.');
    let connected = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const status = await fetchJson('/api/v1/google-oauth/status').catch(() => null);
      if (String(status?.state || '').trim().toLowerCase() === 'connected') {
        connected = status;
        break;
      }
    }
    if (!connected) throw new Error('로그인 완료를 확인하지 못했습니다. 새로고침으로 다시 확인해 주세요.');
    settingsNextRenderGoogleStatus(connected);
    settingsNextSetFeedback('settings-next-google-feedback', '');
    void settingsNextLoadStatuses({ force: true });
  } catch (error) {
    settingsNextSetFeedback('settings-next-google-feedback', error.message || 'Google 계정을 연결하지 못했습니다.', 'danger');
  } finally {
    settingsNextSetGoogleBusy(false);
  }
}

async function settingsNextDisconnectGoogle() {
  if (settingsNextGoogleBusy) return;
  const confirmed = await showUiConfirm('Google 계정 연결을 해제할까요? 연결을 해제하면 Spreadsheet를 사용하는 기능이 중단됩니다.', {
    title: 'Google 계정 연결 해제',
    confirmText: '연결 해제',
    cancelText: '취소'
  });
  if (!confirmed) return;
  settingsNextSetGoogleBusy(true, 'disconnect');
  settingsNextSetFeedback('settings-next-google-feedback', '');
  try {
    await postJson('/api/v1/google-oauth/disconnect', {});
    settingsNextSetFeedback('settings-next-google-feedback', '');
    settingsNextRenderGoogleStatus({ state: 'disconnected', message: 'Google 계정이 연결되어 있지 않습니다.' });
    void settingsNextLoadStatuses({ force: true });
  } catch (error) {
    settingsNextSetFeedback('settings-next-google-feedback', error.message || '연결을 해제하지 못했습니다.', 'danger');
  } finally {
    settingsNextSetGoogleBusy(false);
  }
}

async function settingsNextSubmitContent(event) {
  event.preventDefault();
  if (settingsNextDirtyScopes.has('content') && !await settingsNextSaveScope('content')) return;
  if (String(settingsNextGoogleStatus?.state || '').trim().toLowerCase() === 'connected') {
    const result = await settingsNextTestGoogle({ feedbackId: 'settings-next-content-feedback', ownerScope: 'content' });
    const url = String(settingsNextMajorFields.GOOGLE_SHEET_URL || '').trim();
    settingsNextSheetVerification = {
      url,
      success: Boolean(result?.ok && result?.spreadsheetId),
      title: String(result?.spreadsheetTitle || '')
    };
    settingsNextRenderReadiness();
  } else {
    settingsNextSetScopeFeedback('content', 'Google 계정을 연결하면 Spreadsheet 접근을 확인할 수 있습니다.', 'warning');
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
  const labels = {
    content: '콘텐츠 공간',
    naver: '네이버 블로그',
    wordpress: '워드프레스',
    'ai-text': '글쓰기 모델',
    'ai-image': '이미지 모델',
    'ai-chat': '보조 대화 모델',
    writing: '글쓰기 기본값',
    'optional-buffer': 'Buffer',
    'optional-telegram': 'Telegram',
    'optional-slack': 'Slack',
    'optional-bitly': 'Bitly'
  };
  const changed = [...settingsNextDirtyScopes].map((scope) => labels[scope] || scope).join(', ');
  const discard = await showUiConfirm(`아직 반영하지 않은 변경사항이 있습니다: ${changed}\n이 화면을 떠나면 변경사항이 사라집니다.`, {
    title: '설정 Beta 변경사항',
    confirmText: '변경사항 버리고 이동',
    cancelText: '계속 편집'
  });
  if (!discard) return false;
  settingsNextDirtyScopes.clear();
  await loadSettingsNext({ force: true });
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
        if (!settingsNextLoading) void loadSettingsNext({ force: true });
      });
    });
    initUiSettingsCardPattern();
    initSettingsNextAi();
    initSettingsNextWriting();
    initSettingsNextOptionalServices();
    initSettingsNextExternalConnections();
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
    document.getElementById('settings-next-content-form')?.addEventListener('submit', settingsNextSubmitContent);
    document.getElementById('settings-next-naver-form')?.addEventListener('submit', settingsNextSubmitNaver);
    document.getElementById('settings-next-wordpress-form')?.addEventListener('submit', settingsNextSubmitWordpress);
    document.getElementById('settings-next-google-connect')?.addEventListener('click', () => void settingsNextStartGoogleOauth());
    document.getElementById('settings-next-google-test')?.addEventListener('click', () => void settingsNextTestGoogle());
    document.getElementById('settings-next-google-disconnect')?.addEventListener('click', () => void settingsNextDisconnectGoogle());
    document.getElementById('settings-next-naver-logout')?.addEventListener('click', () => void settingsNextLogoutNaver());
    initOpaqueSettingsSecretToggles(document.getElementById('view-settings-next'));
    document.getElementById('settings-next-open-google-sheet')?.addEventListener('click', () => {
      const raw = document.getElementById('settings-next-google-sheet-url')?.value || '';
      window.open(buildGoogleSheetOpenUrl(raw), '_blank', 'noopener,noreferrer');
    });
    settingsNextBound = true;
  }
  settingsNextActivateTab(settingsNextActiveTab);
  settingsNextActivateCoreTab(settingsNextActiveCoreTab);
  settingsNextActivateAppTab(settingsNextActiveAppTab);
  void loadSettingsNextExternalConnections();
}
