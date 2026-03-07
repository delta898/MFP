// ─── 첫 실행 안내 배너 ───────────────────────────────────────────
const SETUP_BANNER_DISMISS_KEY = 'bloggenius_setup_banner_dismissed_v1';

async function checkSetupBanner() {
  if (localStorage.getItem(SETUP_BANNER_DISMISS_KEY) === 'true') return;
  try {
    const status = await fetchJson('/api/v1/config/status');
    const banner = document.getElementById('setup-guide-banner');
    if (!banner) return;
    if (status && status.isEssentialSet === false) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
      localStorage.removeItem(SETUP_BANNER_DISMISS_KEY);
    }
  } catch (e) {
    console.warn('Setup banner check failed:', e.message);
  }
}

function goToSettings() {
  const settingsBtn = document.querySelector('[data-view="settings"]');
  if (settingsBtn) settingsBtn.click();
}

function dismissSetupBanner() {
  const banner = document.getElementById('setup-guide-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem(SETUP_BANNER_DISMISS_KEY, 'true');
}
// ─────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok || !body.success) {
      console.error(`❌ API Fetch Error (${url}):`, body);
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = body?.error?.code || '';
      throw err;
    }
    return body.data;
  } catch (e) {
    console.error(`❌ Network or Parse Error (${url}):`, e);
    throw e;
  }
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.error?.code || '';
    throw err;
  }
  return body.data;
}

function formatRemaining(value) {
  if (typeof value === 'number' && value < 0) return '무제한';
  if (typeof value === 'number') return `${value}회`;
  return '-';
}

/**
 * 설정 화면의 상태 메시지 UI를 공통된 스타일로 업데이트합니다.
 * @param {string} selector - 대상 엘리먼트 선택자 (id 또는 class)
 * @param {string} message - 표시할 메시지
 * @param {'info'|'success'|'error'} type - 메시지 타입 (색상 결정)
 */
function updateSettingsStatus(selector, message, type = 'info') {
  const els = document.querySelectorAll(selector);
  if (els.length === 0) return;

  const colors = {
    info: '',
    success: '#10b981', // green
    error: '#ef4444'    // red
  };

  els.forEach(el => {
    el.textContent = message;
    el.style.color = colors[type] || '';
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setPre(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

function parsePositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function formatNextRunText(nextRunAt) {
  const raw = String(nextRunAt || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return '곧 실행';
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}시간 ${m}분 후`;
}

function formatDateTimeAbsolute(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${pad(d.getMinutes())}분`;
}

function parseBoolLike(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y' || raw === 'on';
}

let wpCategoryCache = null; // 워드프레스 카테고리 캐시 공통
let wpCategoryFetchPromise = null; // 중복 요청 방지용 프로미스
let blogTopicsCache = []; // [Restored] 블로그 목록 데이터 캐시
let blogTopicsWriteLockUntil = 0; // [Restored] 블로그 목록 재렌더링 방지 락
let blogTrendsCache = [];
let blogShoppingCache = [];
const blogSelectedRowIndices = new Set();
const blogTrendsSelectedRowIndices = new Set();
const blogShoppingSelectedRowIndices = new Set();
let blogLastBatchResult = null;
const blogRecentBatchRows = new Map();
let blogInlineEditState = null;
let shoppingInlineEditState = null;

// [Restored] 워드프레스 카테고리 드롭다운 채우기 헬퍼
function populateFilterWpCategoryDropdown(selectId, categories) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const firstOption = select.options.length > 0 ? select.options[0] : null;
  select.innerHTML = '';

  if (firstOption && firstOption.value === '') {
    select.appendChild(firstOption);
  } else {
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '워드프레스 카테고리 (전체)';
    select.appendChild(defaultOpt);
  }

  if (Array.isArray(categories)) {
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name || cat.id; // 보통 검색 필터는 name을 사용
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  }
}
let blogActiveTab = 'quick';
let shoppingActiveTab = 'quick';
let settingsActiveTab = 'general';
let blogTrendsCollectInFlight = false;
let blogAutoManualRunInFlight = false;
let shoppingAutoManualRunInFlight = false;
const SETTINGS_SHOPPING_SLOT_ORDER = ['ftc', 'cta1', 'cta2', 'cta3'];
const SETTINGS_SHOPPING_SLOT_META = {
  ftc: { key: 'FTC_DISCLOSURE_IMAGE_URL', label: '공정위 이미지', required: true },
  cta1: { key: 'SHOPPING_CTA_IMAGE_URL1', label: '구매 독려 이미지 1', required: true },
  cta2: { key: 'SHOPPING_CTA_IMAGE_URL2', label: '구매 독려 이미지 2', required: false },
  cta3: { key: 'SHOPPING_CTA_IMAGE_URL3', label: '구매 독려 이미지 3', required: false }
};
let settingsShoppingImageSlots = {};
let settingsShoppingImageDefaults = {};
const settingsShoppingImageFileState = {};
const settingsShoppingImageObjectUrls = {};
const blogPageState = {
  trends: { limit: 50, offset: 0, total: 0 },
  topics: { limit: 50, offset: 0, total: 0 },
  shopping: { limit: 50, offset: 0, total: 0 }
};
const tableSortState = {
  trends: { key: 'rowNumber', direction: 'desc' },
  topics: { key: 'rowNumber', direction: 'desc' },
  shopping: { key: 'rowNumber', direction: 'desc' }
};
let settingsAdvancedLoadedOnce = false;
let uiConfigReady = true;
let uiNaverReady = true;
let uiWpReady = true;
let uiConfigPopupShown = false;
let uiConfigStatusMessage = '';
let uiSheetsReady = false;
let uiSheetsPreflightInFlight = null;
let dashboardPollingPauseCount = 0;
const dashboardAutoScheduleState = {
  blog: { enabled: false, nextRunAt: '', status: '', startTime: '', endTime: '' },
  shopping: { enabled: false, nextRunAt: '', status: '', startTime: '', endTime: '' }
};
let settingsMajorAutoSaveTimer = null;
let settingsMajorSaveInFlight = false;
let settingsMajorSaveQueued = false;
let settingsMajorQueuedMode = null;
let settingsMajorApplyingForm = false;
let settingsMajorLastSavedSignature = '';
let settingsMajorHasPendingBasicChanges = false;
const SETTINGS_MAJOR_AUTOSAVE_DELAY_MS = 700;
let settingsAdvancedRevision = '';
let settingsAdvancedStale = false;
let dashboardExternalContentLastLoadedAt = 0;
const DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS = 5 * 60 * 1000;
const SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT = "나 보기가 역겨워 가실 때에는\n말없이 고이 보내 드리우리다\n영변에 약산 진달래꽃\n아름 따다 가실 길에 뿌리우리다";

let uiUpdateInfo = null;
const systemLogRenderState = {
  fileName: '',
  lastRaw: ''
};

async function checkUpdate(isManual = false) {
  try {
    if (isManual) showUiPopup('최신 버전을 확인하고 있습니다...');

    const info = await fetchJson('/api/v1/system/update/check');
    if (info && info.hasUpdate) {
      uiUpdateInfo = info;
      const banner = document.getElementById('update-banner');
      const bannerText = document.getElementById('update-banner-text');
      if (banner && bannerText) {
        bannerText.textContent = `새로운 버전(v${info.latestVersion})이 출시되었습니다!`;
        banner.classList.remove('hidden');
      }
      if (isManual) showUiPopup(`새로운 버전 v${info.latestVersion}을 찾았습니다!\n상단 알림 배너의 '지금 업데이트'를 눌러 진행하세요.`);
    } else {
      if (isManual) showUiPopup('현재 최신 버전을 사용 중입니다.');
    }
  } catch (e) {
    console.warn('업데이트 체크 실패:', e);
    if (isManual) showUiPopup(`업데이트 확인 실패: ${e.message}`);
  }
}

async function applyUpdate() {
  if (!uiUpdateInfo) return;

  const confirmed = await showUiConfirm(`BlogGenius v${uiUpdateInfo.latestVersion} 업데이트를 시작할까요?\n\n업데이트 완료 후 앱이 자동으로 재시작되거나 수동으로 재시작해야 할 수 있습니다.`);
  if (!confirmed) return;

  const banner = document.getElementById('update-banner');
  const bannerText = document.getElementById('update-banner-text');
  const updateNowBtn = document.getElementById('update-now-btn');

  try {
    if (updateNowBtn) updateNowBtn.disabled = true;
    if (bannerText) bannerText.textContent = '업데이트 다운로드 및 적용 중... (잠시만 기다려주세요)';

    await postJson('/api/v1/system/update/apply');

    if (bannerText) bannerText.textContent = '업데이트가 완료되었습니다. 1초 후 재시작합니다.';

    await postJson('/api/v1/system/update/restart');

    setTimeout(() => {
      showUiPopup('앱이 재시작되었습니다. 페이지를 새로고침해 주세요.');
      location.reload();
    }, 3000);

  } catch (e) {
    if (updateNowBtn) updateNowBtn.disabled = false;
    if (bannerText) bannerText.textContent = '업데이트 중 오류가 발생했습니다.';
    showUiPopup(`업데이트 실패: ${e.message}`);
  }
}
const SETTINGS_TYPING_PREVIEW_DELAY = {
  QUICK: 8,
  FAST: 20,
  NORMAL: 38,
  HUMAN: 55
};
const SETTINGS_TYPING_PREVIEW_REPEAT_COUNT = 3;
let settingsTypingPreviewTimer = null;
let settingsTypingPreviewRunId = 0;
let blogAutoCategoryCatalog = [];
let blogAutoCategorySelected = new Set();
let blogAutoCategoryCatalogMeta = {
  runtimeCount: 0,
  trendCount: 0,
  updatedAt: ''
};
let shoppingAutoPlanMaxPosts = null;
let shoppingAutoPlanName = '현재';
let uiDialogResolver = null;

// ─── Logging & Progress Utilities ──────────────────────────────────
const QUICK_PROGRESS_POLL_MS = 1500;
const QUICK_PROGRESS_MAX_LINES = 26;

const buildDashboardLogKey = (log) => `${String(log?.timestamp || '').trim()}__${String(log?.level || '').trim()}__${String(log?.message || '').trim()}`;

const fetchDashboardLogsSafe = async (limit = 160) => {
  try {
    const res = await fetchJson(`/api/v1/dashboard/logs?limit=${Math.max(20, Math.min(200, Number(limit) || 160))}`);
    return Array.isArray(res?.logs) ? res.logs : [];
  } catch (_e) {
    return [];
  }
};

const formatDashboardProgressLine = (log) => {
  const ts = String(log?.timestamp || '').trim();
  const level = String(log?.level || 'info').trim().toUpperCase();
  const message = String(log?.message || '').trim();
  if (!message) return '';
  if (ts) return `[${ts}] [${level}] ${message}`;
  return `[${level}] ${message}`;
};

const appendProgressLine = (targetEl, lines, line) => {
  if (!targetEl) return;
  const text = String(line || '').trim();
  if (!text) return;
  lines.push(text);
  if (lines.length > QUICK_PROGRESS_MAX_LINES) {
    lines.splice(0, lines.length - QUICK_PROGRESS_MAX_LINES);
  }
  targetEl.textContent = lines.join('\n');
  // Auto-scroll to bottom
  targetEl.scrollTop = targetEl.scrollHeight;
};

const runWithLiveProgress = async ({ targetEl, requestLabel, requestFn, onTick }) => {
  if (!targetEl || typeof requestFn !== 'function') return null;

  const progressLines = [];
  const seenLogKeys = new Set();
  const push = (line) => appendProgressLine(targetEl, progressLines, line);

  const seedLogs = await fetchDashboardLogsSafe(160);
  seedLogs.forEach((log) => {
    seenLogKeys.add(buildDashboardLogKey(log));
  });

  const flushNewLogs = async () => {
    const currentLogs = await fetchDashboardLogsSafe(160);
    if (typeof onTick === 'function') {
      try { await onTick(); } catch (e) { }
    }
    if (!Array.isArray(currentLogs) || currentLogs.length === 0) return;
    const ordered = currentLogs.slice().reverse();
    for (const log of ordered) {
      const key = buildDashboardLogKey(log);
      if (seenLogKeys.has(key)) continue;
      seenLogKeys.add(key);
      push(formatDashboardProgressLine(log));
    }
  };

  push(`[요청] ${requestLabel}`);
  push('[진행] 서버 처리 시작...');

  let timer = null;
  try {
    // 🚀 시작하자마자 첫 번째 폴링 즉시 실행
    flushNewLogs().catch(e => console.warn('Initial flush failed:', e));

    timer = setInterval(async () => {
      void flushNewLogs();
    }, QUICK_PROGRESS_POLL_MS);

    const data = await requestFn();
    await flushNewLogs();
    push('[완료] 요청 처리 완료');
    if (data && typeof data === 'object') {
      const statusText = String(data.status || '').trim();
      const modeText = String(data.mode || '').trim();
      const rowNumber = Number(data.rowNumber);
      if (statusText) push(`[상태] ${statusText}`);
      if (modeText) push(`[모드] ${modeText}`);
      if (Number.isFinite(rowNumber) && rowNumber > 0) push(`[Row] ${rowNumber}`);
    }
    return data;
  } catch (e) {
    await flushNewLogs();
    push(`[오류] ${String(e?.message || '요청 처리 중 오류')}`);
    throw e;
  } finally {
    if (timer) clearInterval(timer);
  }
};
// ─────────────────────────────────────────────────────────────────


function pauseDashboardPolling() {
  dashboardPollingPauseCount += 1;
}

function resumeDashboardPolling() {
  dashboardPollingPauseCount = Math.max(0, dashboardPollingPauseCount - 1);
}

function isDashboardPollingPaused() {
  return dashboardPollingPauseCount > 0;
}

function closeUiDialog(result = false) {
  const backdrop = document.getElementById('ui-dialog-backdrop');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  if (backdrop) {
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  if (confirmBtn) confirmBtn.textContent = '확인';
  if (cancelBtn) {
    cancelBtn.textContent = '취소';
    cancelBtn.classList.add('hidden');
  }
  if (uiDialogResolver) {
    const resolver = uiDialogResolver;
    uiDialogResolver = null;
    resolver(Boolean(result));
  }
}

function showUiDialog(options = {}) {
  const title = String(options?.title || '알림').trim() || '알림';
  const message = String(options?.message || '').trim();
  const showCancel = options?.showCancel === true;
  const confirmText = String(options?.confirmText || '확인').trim() || '확인';
  const cancelText = String(options?.cancelText || '취소').trim() || '취소';

  const backdrop = document.getElementById('ui-dialog-backdrop');
  const titleEl = document.getElementById('ui-dialog-title');
  const messageEl = document.getElementById('ui-dialog-message');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  if (!backdrop || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
    if (showCancel) {
      return Promise.resolve(window.confirm(message));
    }
    window.alert(message);
    return Promise.resolve(true);
  }

  if (uiDialogResolver) {
    closeUiDialog(false);
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  cancelBtn.classList.toggle('hidden', !showCancel);

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    uiDialogResolver = resolve;
  });
}

function showUiPopup(message) {
  const text = String(message || '').trim();
  if (!text) return;
  void showUiDialog({
    title: '알림',
    message: text,
    showCancel: false
  });
}

function showUiConfirm(message, options = {}) {
  return showUiDialog({
    title: String(options?.title || '확인'),
    message: String(message || ''),
    showCancel: true,
    confirmText: String(options?.confirmText || '확인'),
    cancelText: String(options?.cancelText || '취소')
  });
}

async function loadConfigStatus() {
  try {
    const status = await fetchJson('/api/v1/config/status');
    console.log('[Config Status] Received:', status);
    uiConfigReady = status?.ready === true;
    uiNaverReady = status?.isNaverSet === true;
    uiWpReady = status?.isWpSet === true;
    uiConfigStatusMessage = String(status?.message || '').trim();

    // 플랫폼 UI 상태 동기화 (네이버 & 워드프레스)
    syncPlatformUiState('naver', uiNaverReady);
    syncPlatformUiState('wordpress', uiWpReady);

    // 앱 버전 즉시 표시
    const versionBadge = document.getElementById('badge-version');
    if (versionBadge) {
      const v = status?.version || '0.0.0';
      versionBadge.textContent = `v${v}`;
      console.log('[UI] Version badge updated to:', v);
    }

    if (!uiConfigReady && !uiConfigPopupShown) {
      uiConfigPopupShown = true;
      const popupText = [
        '설정 파일이 준비되지 않았습니다.',
        '',
        '설정 메뉴에서 주요 항목을 입력 후 저장하세요.',
        '',
        uiConfigStatusMessage || '- config/config.json 또는 config/config.json.sample 확인 필요'
      ].join('\n');
      showUiPopup(popupText);
    }
    return status;
  } catch (e) {
    uiConfigReady = false;
    uiNaverReady = false;
    uiWpReady = false;
    uiConfigStatusMessage = String(e.message || '');
    syncPlatformUiState('naver', false);
    syncPlatformUiState('wordpress', false);
    if (!uiConfigPopupShown) {
      uiConfigPopupShown = true;
      showUiPopup(`설정 상태 확인 중 오류가 발생했습니다.\n${uiConfigStatusMessage}`);
    }
    return null;
  }
}

function syncPlatformUiState(platform, isReady) {
  const targetIds = {
    naver: [
      'quick-target-naver',
      'blog-batch-target-naver',
      'shopping-quick-target-naver',
      'shopping-batch-target-naver',
      'blog-publish-auto-target-naver',
      'shopping-publish-auto-target-naver'
    ],
    wordpress: [
      'quick-target-wordpress',
      'blog-batch-target-wordpress',
      'shopping-quick-target-wordpress',
      'shopping-batch-target-wordpress',
      'blog-publish-auto-target-wordpress',
      'shopping-publish-auto-target-wordpress'
    ]
  };

  const ids = targetIds[platform] || [];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    // 비활성화 처리
    el.disabled = !isReady;

    // 설정 미비 시 체크 해제
    if (!isReady) el.checked = false;

    // 안내 아이콘 (Emoji) 제어
    const container = el.closest('label') || el.parentElement;
    if (!container) return;

    let hint = container.querySelector('.platform-setup-hint');
    if (!isReady) {
      if (!hint) {
        hint = document.createElement('span');
        hint.className = 'platform-setup-hint';
        hint.style.cursor = 'pointer';
        hint.style.marginLeft = '-3px';
        hint.style.fontSize = '12px';
        hint.innerHTML = '❗';
        hint.title = `${platform === 'naver' ? '네이버' : '워드프레스'} 설정이 필요합니다. 클릭하여 [설정 > 블로그] 탭으로 이동합니다.`;

        // 클릭 시 설정 -> 블로그 탭으로 이동
        hint.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof navigateTo === 'function') {
            navigateTo('settings', 'naver-blog');
          }
        };

        container.appendChild(hint);
      }
    } else {
      if (hint) hint.remove();
    }
  });
}

// Legacy function removed (integrated into syncPlatformUiState)
function syncWordPressUiState() { }

function guardUiConfigReady(featureLabel = '이 기능') {
  if (uiConfigReady) return true;
  showUiPopup([
    `${featureLabel}을(를) 실행하려면 설정이 필요합니다.`,
    '상단 메뉴의 [설정]에서 주요 항목 저장 후 다시 시도하세요.',
    '',
    uiConfigStatusMessage || ''
  ].join('\n'));
  return false;
}

async function ensureSheetsPreflightUi(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;

  if (!uiConfigReady) return false;
  if (!force && uiSheetsReady) return true;

  if (uiSheetsPreflightInFlight && !force) {
    try {
      await uiSheetsPreflightInFlight;
      return true;
    } catch (_e) {
      return false;
    }
  }

  const query = force ? '?force=true' : '';
  uiSheetsPreflightInFlight = fetchJson(`/api/v1/sheets/ensure${query}`)
    .then(() => {
      uiSheetsReady = true;
      return true;
    })
    .catch((e) => {
      uiSheetsReady = false;
      if (!silent) {
        showUiPopup([
          '필수 시트 준비에 실패했습니다.',
          '설정의 GOOGLE_SHEET_URL과 서비스 계정 공유 상태를 확인해 주세요.',
          '',
          String(e?.message || 'unknown')
        ].join('\n'));
      }
      throw e;
    })
    .finally(() => {
      uiSheetsPreflightInFlight = null;
    });

  try {
    await uiSheetsPreflightInFlight;
    return true;
  } catch (_e) {
    return false;
  }
}

function findTrendByRowIndex(rowIndex) {
  return (blogTrendsCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function getPageInfo(type) {
  return blogPageState[type] || { limit: 50, offset: 0, total: 0 };
}

function setPageInfo(type, patch = {}) {
  const current = getPageInfo(type);
  blogPageState[type] = {
    ...current,
    ...patch
  };
}

function getPageSummary(total, limit, offset) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeLimit = Math.max(1, Number(limit || 50));
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const currentPage = Math.min(pageCount, Math.floor(Math.max(0, Number(offset || 0)) / safeLimit) + 1);
  return { pageCount, currentPage };
}

function renderTrendsPagination() {
  const infoEl = document.getElementById('blog-trends-page-info');
  const prevBtn = document.getElementById('blog-trends-page-prev');
  const nextBtn = document.getElementById('blog-trends-page-next');
  const pageInfo = getPageInfo('trends');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function renderTopicsPagination() {
  const infoEl = document.getElementById('blog-topics-page-info');
  const prevBtn = document.getElementById('blog-topics-page-prev');
  const nextBtn = document.getElementById('blog-topics-page-next');
  const pageInfo = getPageInfo('topics');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function renderShoppingPagination() {
  const infoEl = document.getElementById('shopping-page-info');
  const prevBtn = document.getElementById('shopping-page-prev');
  const nextBtn = document.getElementById('shopping-page-next');
  const pageInfo = getPageInfo('shopping');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function updateTrendsSelectionUi() {
  const countEl = document.getElementById('blog-trends-selected-count');
  if (countEl) countEl.textContent = `${blogTrendsSelectedRowIndices.size}건 선택`;
}

function clearTrendsSelections() {
  blogTrendsSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.trend-row-selector'));
  selectors.forEach(el => { el.checked = false; });
  updateTrendsSelectionUi();
}

function findShoppingByRowIndex(rowIndex) {
  return (blogShoppingCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function updateShoppingSelectionUi() {
  const countEl = document.getElementById('shopping-selected-count');
  if (countEl) countEl.textContent = `${blogShoppingSelectedRowIndices.size}건 선택`;
}

function clearShoppingSelections() {
  blogShoppingSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.shopping-row-selector'));
  selectors.forEach(el => { el.checked = false; });
  updateShoppingSelectionUi();
}

function getSortState(tableName) {
  const target = String(tableName || '').trim();
  if (!tableSortState[target]) {
    tableSortState[target] = { key: 'rowNumber', direction: 'desc' };
  }
  return tableSortState[target];
}

function updateSortableHeadersUi() {
  const headers = Array.from(document.querySelectorAll('.data-table th.sortable'));
  headers.forEach((th) => {
    const tableName = String(th.dataset.sortTable || '').trim();
    const key = String(th.dataset.sortKey || '').trim();
    const state = getSortState(tableName);
    const isActive = state.key === key;
    th.classList.toggle('active-sort', isActive);
    th.setAttribute('data-sort-dir', isActive ? state.direction : '');
    th.setAttribute('aria-sort', isActive ? (state.direction === 'desc' ? 'descending' : 'ascending') : 'none');
    th.setAttribute('role', 'button');
    th.setAttribute('tabindex', '0');
  });
}

function toggleTableSort(tableName, key) {
  const state = getSortState(tableName);
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;

  if (state.key === normalizedKey) {
    state.direction = state.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.key = normalizedKey;
    state.direction = 'asc';
  }
  updateSortableHeadersUi();

  if (tableName === 'trends') {
    setPageInfo('trends', { offset: 0 });
    loadBlogTrends();
    return;
  }
  if (tableName === 'topics') {
    setPageInfo('topics', { offset: 0 });
    loadBlogTopics();
    return;
  }
  if (tableName === 'shopping') {
    setPageInfo('shopping', { offset: 0 });
    loadBlogShopping();
  }
}

function resetTableSort(tableName) {
  const state = getSortState(tableName);
  state.key = 'rowNumber';
  state.direction = 'desc';
  updateSortableHeadersUi();
}

function renderBlogTrendsTable(items) {
  const tbody = document.getElementById('blog-trends-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateTrendsSelectionUi();
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const checked = blogTrendsSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    return `
      <tr data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="trend-row-selector" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td>${escapeHtml(item.date || '-')}</td>
        <td>${escapeHtml(item.category || '-')}</td>
        <td>${escapeHtml(item.keyword || '-')}</td>
        <td>${escapeHtml(item.variation || '-')}</td>
        <td>${escapeHtml(item.status || '-')}</td>
      </tr>
    `;
  }).join('');
  const trendsSelectAll = document.getElementById('blog-trends-table-select-all');
  if (trendsSelectAll) trendsSelectAll.checked = false;
  updateTrendsSelectionUi();
  updateSortableHeadersUi();
}

async function loadBlogTrends(options = {}) {
  if (!guardUiConfigReady('Trends 조회')) return;
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-trends-result');
  const pageInfo = getPageInfo('trends');
  const q = (document.getElementById('blog-trends-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  const sortState = getSortState('trends');
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
  params.set('sortBy', String(sortState.key || 'rowNumber'));
  params.set('sortDir', String(sortState.direction || 'desc'));
  if (resultBox && !silent) resultBox.textContent = 'Trends 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/trends/items?${params.toString()}`);
    blogTrendsCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('trends', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogTrendsTable(blogTrendsCache);
    renderTrendsPagination();
    if (resultBox && !silent) resultBox.textContent = `조회 완료: ${data.total ?? blogTrendsCache.length}건`;
  } catch (e) {
    blogTrendsCache = [];
    renderBlogTrendsTable([]);
    renderTrendsPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getKstDateParts(baseDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(baseDate);

  const year = Number(parts.find(p => p.type === 'year')?.value || 0);
  const month = Number(parts.find(p => p.type === 'month')?.value || 0);
  const day = Number(parts.find(p => p.type === 'day')?.value || 0);
  return { year, month, day };
}

function isValidYmd(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year
    && d.getUTCMonth() + 1 === month
    && d.getUTCDate() === day;
}

function shiftKstDays(days) {
  const { year, month, day } = getKstDateParts(new Date());
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function resolveTrendCollectDateYmd(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) return shiftKstDays(-1);

  const lower = input.toLowerCase();
  if (lower === 'yesterday' || input === '어제') return shiftKstDays(-1);

  const relativeMatch = lower.match(/^-(\d{1,3})d$/);
  if (relativeMatch) {
    const days = Number(relativeMatch[1]);
    if (!Number.isInteger(days) || days < 1) {
      throw new Error('상대 날짜는 -1d, -2d 형식으로 입력하세요.');
    }
    return shiftKstDays(-days);
  }

  const compactMatch = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const year = Number(compactMatch[1]);
    const month = Number(compactMatch[2]);
    const day = Number(compactMatch[3]);
    if (!isValidYmd(year, month, day)) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const dashedMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashedMatch) {
    const year = Number(dashedMatch[1]);
    const month = Number(dashedMatch[2]);
    const day = Number(dashedMatch[3]);
    if (!isValidYmd(year, month, day)) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  throw new Error('날짜 형식이 올바르지 않습니다. (예: 2026-02-18, 20260218, yesterday, -1d)');
}

async function checkTrendDateAlreadyCollected(targetDateYmd) {
  const limit = 200;
  let offset = 0;
  let guard = 0;

  while (guard < 20) {
    const params = new URLSearchParams({
      q: targetDateYmd,
      limit: String(limit),
      offset: String(offset)
    });
    const data = await fetchJson(`/api/v1/trends/items?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    const exists = items.some(item => String(item?.date || '').trim() === targetDateYmd);
    if (exists) return true;

    const total = Number(data?.total || 0);
    if (items.length <= 0 || offset + items.length >= total) {
      return false;
    }
    offset += items.length;
    guard += 1;
  }
  return false;
}

async function runBlogTrendsCollect() {
  if (!guardUiConfigReady('트렌드 수집')) return;
  if (blogTrendsCollectInFlight) return;
  const resultBox = document.getElementById('blog-trends-result');
  const rawDateInput = String(document.getElementById('blog-trends-date')?.value || '').trim();
  let targetDateYmd = '';
  try {
    targetDateYmd = resolveTrendCollectDateYmd(rawDateInput);
    if (!targetDateYmd) throw new Error('날짜 해석에 실패했습니다.');
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
    return;
  }

  let alreadyCollected = false;
  try {
    alreadyCollected = await checkTrendDateAlreadyCollected(targetDateYmd);
  } catch (e) {
    // 중복 확인 실패는 수집 자체를 막지 않는다.
    console.warn('트렌드 날짜 중복 확인 실패:', e);
  }
  const confirmLines = [`${targetDateYmd} 기준으로 트렌드 수집을 진행하시겠습니까?`];
  if (alreadyCollected) {
    confirmLines.push('');
    confirmLines.push('이미 수집된 날짜가 확인되었습니다. 계속 진행하면 중복 데이터가 추가될 수 있습니다.');
  }
  const confirmMessage = confirmLines.join('\n');

  const shouldProceed = await showUiConfirm(confirmMessage, {
    title: '트렌드 수집 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed !== true) {
    return;
  }

  blogTrendsCollectInFlight = true;
  if (resultBox) resultBox.textContent = `트렌드 수집 중... (기준일: ${targetDateYmd})`;
  try {
    const selectedCategories = Array.from(blogAutoCategorySelected.values())
      .map(v => String(v || '').trim())
      .filter(Boolean);
    const headless = Boolean(document.getElementById('blog-trends-headless')?.checked);
    const payload = {
      date: targetDateYmd,
      headless,
      ...(selectedCategories.length > 0 ? { categories: selectedCategories } : {})
    };
    const data = await postJson('/api/v1/trends/collect', payload);
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    setPageInfo('trends', { offset: 0 });
    await Promise.all([
      loadDashboard(),
      loadBlogTrends({ silent: true }),
      loadBlogAutoCategoryCatalog({ force: true, silent: true })
    ]);
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  } finally {
    blogTrendsCollectInFlight = false;
  }
}

async function runTrendsToTopics() {
  if (!guardUiConfigReady('Trends → Topics')) return;
  const resultBox = document.getElementById('blog-trends-result');
  const rowIndices = Array.from(blogTrendsSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    if (resultBox) resultBox.textContent = '먼저 Topics에 보낼 Trends 행을 1개 이상 선택하세요.';
    return;
  }

  if (resultBox) resultBox.textContent = `Trends → Topics 처리 중... (${rowIndices.length}건)`;
  try {
    const data = await postJson('/api/v1/trends/to-topics', { rowIndices });
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    await Promise.all([loadBlogTrends({ silent: true }), loadBlogTopics({ silent: true })]);
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

function activateBlogTab(tabName, options = {}) {
  console.log("=== activateBlogTab CALLED ===", tabName);
  const allowed = ['quick', 'trends', 'topics', 'collect', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  blogActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.blog-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.blogTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `blog-tab-${target}`));

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'trends') {
    loadBlogTrends();
    return;
  }
  if (target === 'topics') {
    console.log("activateBlogTab: calling loadBlogTopics()");
    loadBlogTopics();
    console.log("activateBlogTab: loading categories");
    fetchWpCategories().then(() => {
      populateFilterWpCategoryDropdown('blog-status-filter-wp-category', globalWpCategoryCache || wpCategoryCache);
      console.log("activateBlogTab: categories populated");
    }).catch(e => console.error("WP Category Load Error:", e));
    return;
  }
  if (target === 'collect') {
    loadBlogCollectSettings();
    return;
  }
  if (target === 'auto') {
    loadBlogAutoSettings();
    return;
  }
}

function activateShoppingTab(tabName, options = {}) {
  const allowed = ['quick', 'batch', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  shoppingActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.shopping-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.shoppingTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `shopping-tab-${target}`));

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'batch') {
    loadBlogShopping();
    return;
  }
  if (target === 'auto') {
    loadShoppingAutoSettings();
  }
}

function activateSettingsTab(tabName, options = {}) {
  const allowed = ['general', 'naver-blog', 'shopping-connect', 'notification', 'advanced'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'general';
  settingsActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('.settings-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `settings-tab-${target}`));

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'advanced') {
    if (!settingsAdvancedLoadedOnce) {
      // 최초 진입: 무조건 불러오기
      loadSettingsAdvanced();
      settingsAdvancedLoadedOnce = true;
    } else if (settingsAdvancedStale) {
      const editorEl = document.getElementById('settings-advanced-content');
      const isEdited = editorEl && editorEl.dataset.editedSinceLoad === 'true';
      if (isEdited) {
        // 편집 중이면 배너 표시
        showSettingsAdvancedStaleBanner(true);
      } else {
        // 편집하지 않았으면 자동 새로고침
        loadSettingsAdvanced();
        showSettingsAdvancedStaleBanner(false);
      }
    } else {
      showSettingsAdvancedStaleBanner(false);
    }
  }
}

function showSettingsAdvancedStaleBanner(visible) {
  const bannerEl = document.getElementById('settings-advanced-stale-banner');
  if (!bannerEl) return;
  bannerEl.style.display = visible ? 'flex' : 'none';
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCommaListText(input) {
  return String(input || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .join(', ');
}

function renderDashboardAutoSchedule() {
  const blog = dashboardAutoScheduleState.blog;
  const shopping = dashboardAutoScheduleState.shopping;

  const setAutoScheduleUI = (prefix, data) => {
    const dateEl = document.getElementById(`dash-auto-${prefix}-next-date`);
    const relEl = document.getElementById(`dash-auto-${prefix}-next-relative`);

    const isWithinTimeRange = (timeStr, start, end) => {
      if (!start || !end) return true;
      if (!timeStr || timeStr === '-') return true;
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return true;
      const mins = date.getHours() * 60 + date.getMinutes();
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (sMin <= eMin) return mins >= sMin && mins <= eMin;
      return mins >= sMin || mins <= eMin;
    };

    if (!data.enabled || !data.nextRunAt || data.nextRunAt === '-') {
      if (dateEl) dateEl.textContent = '-';
      if (relEl) relEl.textContent = '';
    } else {
      const isAllowed = isWithinTimeRange(data.nextRunAt, data.startTime, data.endTime);
      if (data.status === 'waiting_time_window' || !isAllowed) {
        if (dateEl) dateEl.textContent = `허용 대기중 (${data.startTime || '00:00'}~${data.endTime || '23:59'})`;
        if (relEl) relEl.textContent = '';
      } else {
        if (dateEl) dateEl.textContent = formatDateTimeAbsolute(data.nextRunAt);
        if (relEl) relEl.textContent = formatNextRunText(data.nextRunAt);
      }
    }
  };

  setAutoScheduleUI('blog', blog);
  setAutoScheduleUI('shopping', shopping);
}

function formatDashboardFeedDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function truncateText(value, maxLen = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}

function renderDashboardFeedList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = Array.isArray(source?.items) ? source.items : [];
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 140));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-feed-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '';
    const metaHtml = published ? `<div class="dash-feed-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-feed-summary">${summary}</div>` : '';
    return `
      <a class="dash-feed-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-feed-body">
          <div class="dash-feed-title">${title}</div>
          ${metaHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
}

function renderDashboardShortsList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 2);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 96));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-shorts-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '<div class="dash-shorts-thumb dash-shorts-thumb-empty">▶</div>';
    const publishedHtml = published ? `<div class="dash-shorts-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-shorts-summary">${summary}</div>` : '';
    return `
      <a class="dash-shorts-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-shorts-body">
          <div class="dash-shorts-title">${title}</div>
          ${publishedHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
}

async function loadDashboardExternalContent(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  const now = Date.now();
  if (!force && dashboardExternalContentLastLoadedAt > 0) {
    const elapsed = now - dashboardExternalContentLastLoadedAt;
    if (elapsed < DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS) return;
  }

  try {
    const data = await fetchJson('/api/v1/dashboard/external-content?limit=4');
    const sourceMap = {};
    for (const source of (data?.sources || [])) {
      sourceMap[String(source?.key || '').trim()] = source;
    }
    renderDashboardFeedList('dash-feed-list-naver', sourceMap.naver || {});
    renderDashboardFeedList('dash-feed-list-wordpress', sourceMap.wordpress || {});
    renderDashboardFeedList('dash-feed-list-noworry', sourceMap.noworry || {});
    renderDashboardShortsList('dash-feed-list-youtube-playlist', sourceMap.youtubePlaylist || {});

    const setHomeLink = (id, source) => {
      const el = document.getElementById(id);
      if (!el) return;
      const next = String(source?.homeUrl || '').trim();
      if (next) el.href = next;
    };
    setHomeLink('dash-feed-home-naver', sourceMap.naver || {});
    setHomeLink('dash-feed-home-wordpress', sourceMap.wordpress || {});
    setHomeLink('dash-feed-home-noworry', sourceMap.noworry || {});
    setHomeLink('dash-feed-home-youtube-playlist', sourceMap.youtubePlaylist || {});

    dashboardExternalContentLastLoadedAt = Date.now();
  } catch (e) {
    const errMsg = String(e?.message || '콘텐츠를 불러오지 못했습니다.');
    if (!silent) {
      console.warn('[Dashboard External Content]', errMsg);
    }
    const fallback = { error: errMsg };
    renderDashboardFeedList('dash-feed-list-naver', fallback);
    renderDashboardFeedList('dash-feed-list-wordpress', fallback);
    renderDashboardFeedList('dash-feed-list-noworry', fallback);
    renderDashboardShortsList('dash-feed-list-youtube-playlist', fallback);
  }
}

async function loadDashboard() {
  const quietCatch = (e) => {
    if (e.status === 503 || String(e.message).includes('fetch failed')) return null;
    console.warn('[Dashboard Polling]', e.message);
    return null;
  };

  const [healthResult, licenseResult, sessionResult, summaryResult, autoResult] = await Promise.allSettled([
    fetchJson('/api/v1/health').catch(quietCatch),
    fetchJson('/api/v1/license/status?quiet=1').catch(quietCatch),
    fetchJson('/api/v1/session/naver').catch(quietCatch),
    fetchJson('/api/v1/dashboard/summary').catch(quietCatch),
    fetchJson('/api/v1/auto/status').catch(quietCatch)
  ]);

  const healthOk = healthResult.status === 'fulfilled';
  const licenseOk = licenseResult.status === 'fulfilled';
  const sessionOk = sessionResult.status === 'fulfilled';
  const summaryOk = summaryResult.status === 'fulfilled';
  const autoOk = autoResult.status === 'fulfilled';

  const health = healthOk ? healthResult.value : null;
  const license = licenseOk ? licenseResult.value : null;
  const session = sessionOk ? sessionResult.value : null;
  const summary = summaryOk ? summaryResult.value : null;
  const auto = autoOk ? autoResult.value : null;

  // Update Badges
  const healthBadge = document.getElementById('badge-health');
  if (healthBadge) {
    if (healthOk && health) {
      healthBadge.textContent = 'Health: OK';
      healthBadge.style.background = '#dcfce7'; healthBadge.style.color = '#166534';

      const versionBadge = document.getElementById('badge-version');
      if (versionBadge && health.version) {
        versionBadge.textContent = `v${health.version}`;
      }
      const settingsVersionDisplay = document.getElementById('settings-current-version-display');
      if (settingsVersionDisplay && health.version) {
        settingsVersionDisplay.textContent = `v${health.version}`;
      }
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
    licenseBadge.style.cursor = 'default';
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
    const res = await fetchJson('/api/v1/dashboard/logs?limit=200');
    const logs = Array.isArray(res?.logs) ? res.logs : [];

    const renderLogs = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(log => {
        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';

        let icon = 'ℹ️';
        if (log.level === 'error') icon = '❌';
        else if (log.level === 'warn') icon = '⚠️';
        else if (log.message.includes('완료') || log.message.includes('성공')) icon = '✅';

        // 🆕 만약 메시지 자체가 이모지로 시작하면 중복 방지
        const msg = String(log.message || '').trim();
        const startsWithEmoji = /^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/.test(msg);
        const finalMessage = (startsWithEmoji && (msg.startsWith(icon) || icon === 'ℹ️')) ? msg : `${icon} ${msg}`;

        li.innerHTML = `<span style="color:#94a3b8; font-size:12px; margin-right:8px;">${log.timestamp.split(' ')[1]}</span> ${finalMessage}`;
        list.appendChild(li);
      });
    };

    renderLogs(dashList, logs.slice(0, 5));   // 대시보드: 4~5건 표시
    renderLogs(logsList, logs.slice(0, 50));  // 로그/이력: 더 넉넉히 표시
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
function initClockWidget() {
  const displays = Array.from(document.querySelectorAll('[data-clock-display]'));
  if (!displays.length) return;

  const styles = ['digital', 'analog', 'flip'];
  let currentStyle = localStorage.getItem('bloggenius_clock_style') || 'digital';
  if (!styles.includes(currentStyle)) currentStyle = 'digital';

  displays.forEach((display) => {
    display.addEventListener('click', () => {
      const nextIndex = (styles.indexOf(currentStyle) + 1) % styles.length;
      currentStyle = styles[nextIndex];
      localStorage.setItem('bloggenius_clock_style', currentStyle);
      renderClock();
    });
  });

  function renderClock() {
    const style = currentStyle;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');

    if (style === 'digital') {
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
    }
  }

  if (clockInterval) clearInterval(clockInterval);
  renderClock();
  clockInterval = setInterval(renderClock, 1000);
}


async function navigateTo(viewName, subTab) {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  const views = Array.from(document.querySelectorAll('.view'));
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
  views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  if (viewName === 'dashboard') {
    loadDashboard();
    return;
  }
  if (viewName === 'logs') {
    const activeTab = document.querySelector('.logs-tab-btn.active');
    if (activeTab && activeTab.getAttribute('data-logs-tab') === 'system') {
      loadLogFiles();
    } else {
      loadDashboardLogs();
    }
    return;
  }
  if (viewName === 'blog') {
    const ready = await ensureSheetsPreflightUi();
    if (!ready) return;
    if (subTab) {
      blogActiveTab = String(subTab).trim() || blogActiveTab;
    }
    activateBlogTab(blogActiveTab, { forceReload: true });
    return;
  }
  if (viewName === 'shopping') {
    const ready = await ensureSheetsPreflightUi();
    if (!ready) return;
    if (subTab) {
      shoppingActiveTab = String(subTab).trim() || shoppingActiveTab;
    }
    activateShoppingTab(shoppingActiveTab, { forceReload: true });
    return;
  }
  if (viewName === 'settings') {
    const tab = subTab || settingsActiveTab;
    loadSettingsMajor();
    activateSettingsTab(tab, { forceReload: true });
    return;
  }
}

function bindNavigation() {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      void navigateTo(btn.dataset.view);
    });
  });
}

function getSelectedBlogRowIndices() {
  return Array.from(blogSelectedRowIndices.values()).filter(v => Number.isInteger(v));
}

function getRecentBatchMeta(rowIndex) {
  return blogRecentBatchRows.get(rowIndex) || null;
}

function markRecentBatchRows(results) {
  for (const rowResult of (Array.isArray(results) ? results : [])) {
    const rowIndex = Number(rowResult?.rowIndex);
    if (!Number.isInteger(rowIndex)) continue;
    blogRecentBatchRows.set(rowIndex, {
      success: rowResult?.success === true
    });
  }
}

function clearPreviousBatchVisualState() {
  blogRecentBatchRows.clear();
  blogLastBatchResult = null;
  renderBlogLastBatchResult(null);
}

function clearBlogSelections() {
  blogSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.row-selector'));
  selectors.forEach(el => {
    el.checked = false;
  });
  updateBlogSelectionUi();
}

function updateBlogSelectionUi() {
  const count = blogSelectedRowIndices.size;
  const countText = document.getElementById('blog-selected-count');
  if (countText) countText.textContent = `${count}건 선택`;
}

function renderBlogTable(items) {
  const tbody = document.getElementById('blog-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14">조회 결과가 없습니다.</td></tr>';
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const subject = escapeHtml(item.subject || '');
    const instruction = escapeHtml(item.content_guide?.additional_instructions || '');
    const referenceUrl = escapeHtml((item.content_guide?.reference_urls || []).join(', '));
    const runtimeLog = escapeHtml(item.runtimeLog || '');
    const keywords = (Array.isArray(item.keywords) ? item.keywords : [])
      .join(', ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const category = escapeHtml(item.category || '');
    const postStatus = escapeHtml(item.postStatus || 'publish');
    const scheduleDate = escapeHtml(item.scheduleDate || '');
    const status = escapeHtml(item.status || '');
    const imageGeneration = Boolean(item.image_gen);
    const externalReference = Boolean(item.external_reference);
    const recentMeta = getRecentBatchMeta(item.rowIndex);
    const runningClass = runtimeLog ? 'running-row' : '';
    const recentClass = recentMeta ? (recentMeta.success ? 'recent-batch-success' : 'recent-batch-fail') : '';
    const subjectBadge = recentMeta
      ? `<span class="recent-badge ${recentMeta.success ? 'success' : 'fail'}">${recentMeta.success ? '방금 성공' : '방금 실패'}</span>`
      : '';
    const checked = blogSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    const imageChecked = imageGeneration ? 'checked' : '';
    const externalChecked = externalReference ? 'checked' : '';
    return `
      <tr class="${[runningClass, recentClass].filter(Boolean).join(' ')}" data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="row-selector" name="blog-row" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td class="editable-cell" data-field="category">${category || '-'}</td>
        <td class="editable-cell" data-field="postStatus">${postStatus}</td>
        <td class="editable-cell" data-field="scheduleDate">${scheduleDate || '-'}</td>
        <td class="editable-cell" data-field="subject">${subject || '-'}${subjectBadge}</td>
        <td class="editable-cell" data-field="keywords">${keywords || '-'}</td>
        <td class="editable-cell" data-field="instruction">${instruction || '-'}</td>
        <td class="editable-cell" data-field="referenceUrl">${referenceUrl || '-'}</td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="imageGeneration" data-row-index="${item.rowIndex}" ${imageChecked}></td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="externalReference" data-row-index="${item.rowIndex}" ${externalChecked}></td>
        <td class="runtime-log-cell">${runtimeLog}</td>
        <td class="editable-cell" data-field="status">${status || '-'}</td>
      </tr>
    `;
  }).join('');
  const blogSelectAll = document.getElementById('blog-table-select-all');
  if (blogSelectAll) blogSelectAll.checked = false;
  updateBlogSelectionUi();
  updateSortableHeadersUi();
}

function getEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'category') return String(item.category || '');
  if (field === 'postStatus') return String(item.postStatus || 'publish');
  if (field === 'scheduleDate') return String(item.scheduleDate || '');
  if (field === 'subject') return String(item.subject || '');
  if (field === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  if (field === 'instruction') return String(item.content_guide?.additional_instructions || '');
  if (field === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
  if (field === 'status') return String(item.status || '');
  return '';
}

function isRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelBlogInlineEdit() {
  if (!blogInlineEditState) return;
  const { cell, originalHtml } = blogInlineEditState;
  if (cell) {
    cell.innerHTML = originalHtml;
  }
  blogInlineEditState = null;
}

async function commitBlogInlineEdit() {
  if (!blogInlineEditState) return;

  const resultBox = document.getElementById('blog-action-result');
  const {
    rowIndex,
    field,
    editorEl,
    cell,
    originalHtml
  } = blogInlineEditState;

  const rawValue = String(editorEl?.value ?? '');
  let normalizedValue = rawValue;
  if (field === 'keywords' || field === 'referenceUrl') {
    normalizedValue = normalizeCommaListText(rawValue);
  } else if (field === 'scheduleDate') {
    // datetime-local(YYYY-MM-DDTHH:mm) -> YYYY-MM-DD HH:mm:ss
    normalizedValue = rawValue.replace('T', ' ');
    if (normalizedValue.length === 16) normalizedValue += ':00';
    normalizedValue = normalizedValue.trim();
  } else {
    normalizedValue = rawValue.trim();
  }

  const item = findTopicByRowIndex(rowIndex);
  if (!item) {
    blogInlineEditState = null;
    await loadBlogTopics({ silent: true });
    return;
  }
  const beforeValue = getEditableFieldValue(item, field);
  if (normalizedValue === beforeValue) {
    cell.innerHTML = originalHtml;
    blogInlineEditState = null;
    return;
  }

  const patch = {};
  patch[field] = normalizedValue;

  try {
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 중...`;
    await saveBlogRowPatch(rowIndex, patch, { silent: true });
    blogInlineEditState = null;
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 완료`;
  } catch (e) {
    cell.innerHTML = originalHtml;
    blogInlineEditState = null;
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function startBlogInlineEdit(cell) {
  if (!cell) return;
  const row = cell.closest('tr[data-row-index]');
  if (!row) return;
  const rowIndex = Number(row.dataset.rowIndex);
  const field = String(cell.dataset.field || '');
  if (!Number.isInteger(rowIndex)) return;
  const allowed = ['subject', 'keywords', 'instruction', 'referenceUrl', 'status', 'category', 'postStatus', 'scheduleDate'];
  if (!allowed.includes(field)) return;

  const item = findTopicByRowIndex(rowIndex);
  if (!item) return;
  if (isRuntimeRunning(item)) {
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  if (blogInlineEditState) {
    if (blogInlineEditState.cell === cell) return;
    await cancelBlogInlineEdit();
  }

  const originalHtml = cell.innerHTML;
  const initialValue = getEditableFieldValue(item, field);
  const multiline = field === 'instruction' || field === 'referenceUrl';
  const useSelect = ['status', 'postStatus', 'category'].includes(field);
  const isDateTime = field === 'scheduleDate';

  let editorEl;
  if (useSelect) {
    editorEl = document.createElement('select');
    editorEl.className = 'inline-editor';

    let options = [];
    if (field === 'status') {
      options = ['', '대기', '발행 준비 완료', '발행 중', '발행 완료', '실패'];
    } else if (field === 'postStatus') {
      options = ['publish', 'draft', 'schedule'];
    } else if (field === 'category') {
      // 카테고리는 동적으로 채워짐
      options = [''];
      if (wpCategoryCache) {
        options = ['', ...wpCategoryCache.map(c => c.name)];
      } else {
        // 백그라운드에서 가져오고, 완료되면 셀을 다시 클릭하라는 힌트나 자동 갱신 고려
        fetchWpCategories().then(() => {
          if (blogInlineEditState && blogInlineEditState.cell === cell && blogInlineEditState.field === 'category') {
            // 이미 에디터가 열려있다면 옵션만 교체
            const currentVal = editorEl.value;
            editorEl.innerHTML = '';
            const newOpts = ['', ...wpCategoryCache.map(c => c.name)];
            if (currentVal && !newOpts.includes(currentVal)) newOpts.push(currentVal);
            newOpts.forEach(optVal => {
              const opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = optVal || '(기본)';
              if (optVal === currentVal) opt.selected = true;
              editorEl.appendChild(opt);
            });
          }
        });
      }
      if (initialValue && !options.includes(initialValue)) {
        options.push(initialValue);
      }
    }

    for (const optionValue of options) {
      const opt = document.createElement('option');
      opt.value = optionValue;
      opt.textContent = optionValue || (field === 'category' ? '(기본)' : '(비움)');
      if (optionValue === initialValue) opt.selected = true;
      editorEl.appendChild(opt);
    }
  } else {
    editorEl = document.createElement(multiline ? 'textarea' : 'input');
    if (isDateTime) {
      editorEl.type = 'datetime-local';
    } else if (!multiline) {
      editorEl.type = 'text';
    }
    editorEl.className = `inline-editor ${multiline ? 'multiline' : ''} ${isDateTime ? 'datetime' : ''}`.trim();

    // scheduleDate 포맷 변환 (YYYY-MM-DD HH:mm:ss -> YYYY-MM-DDTHH:mm)
    let val = initialValue;
    if (isDateTime && val) {
      val = val.replace(' ', 'T').substring(0, 16);
    }
    editorEl.value = val;
  }

  cell.innerHTML = '';
  cell.appendChild(editorEl);
  editorEl.focus();
  if (!useSelect) editorEl.select?.();

  blogInlineEditState = {
    rowIndex,
    field,
    cell,
    editorEl,
    originalHtml,
    committing: false
  };

  editorEl.addEventListener('keydown', async (e) => {
    if (!blogInlineEditState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      await cancelBlogInlineEdit();
      return;
    }
    if (e.key === 'Enter') {
      if (!useSelect && multiline && !(e.ctrlKey || e.metaKey)) {
        return;
      }
      e.preventDefault();
      blogInlineEditState.committing = true;
      await commitBlogInlineEdit();
    }
  });

  editorEl.addEventListener('blur', async () => {
    if (!blogInlineEditState) return;
    if (blogInlineEditState.committing) return;
    blogInlineEditState.committing = true;
    await commitBlogInlineEdit();
  });
}

function renderBlogLastBatchResult(data) {
  const box = document.getElementById('blog-last-batch');
  if (!box) return;

  if (!data || !Array.isArray(data.results)) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const total = Number(data.requestedCount || data.results.length || 0);
  const success = Number(data.successCount || 0);
  const fail = Number(data.failCount || 0);
  const lines = data.results.slice(0, 12).map((rowResult) => {
    const rowNo = Number.isInteger(Number(rowResult.rowIndex)) ? Number(rowResult.rowIndex) + 2 : '-';
    const label = rowResult.success ? '성공' : '실패';
    const message = rowResult.success
      ? (rowResult?.data?.status || '완료')
      : (rowResult?.message || rowResult?.code || '실패');
    return `<li>Row ${rowNo}: ${label} - ${escapeHtml(message)}</li>`;
  }).join('');
  const nowText = new Date().toLocaleString();

  box.innerHTML = `
    <div class="title">이번 실행 결과 (${nowText})</div>
    <div>요청 ${total}건 / 성공 ${success}건 / 실패 ${fail}건</div>
    <ul>${lines || '<li>결과 없음</li>'}</ul>
  `;
  box.classList.remove('hidden');
}

function findTopicByRowIndex(rowIndex) {
  return (blogTopicsCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function buildBlogUpdatePayload(baseItem, patch = {}) {
  const safeItem = baseItem || {};
  return {
    rowIndex: safeItem.rowIndex,
    subject: String((patch.subject !== undefined ? patch.subject : safeItem.subject) || '').trim(),
    keywords: (patch.keywords !== undefined ? patch.keywords : (Array.isArray(safeItem.keywords) ? safeItem.keywords.join(', ') : '')).toString().trim(),
    instruction: String((patch.instruction !== undefined ? patch.instruction : safeItem.content_guide?.additional_instructions) || '').trim(),
    referenceUrl: (patch.referenceUrl !== undefined ? patch.referenceUrl : (Array.isArray(safeItem.content_guide?.reference_urls) ? safeItem.content_guide.reference_urls.join(', ') : '')).toString().trim(),
    status: String((patch.status !== undefined ? patch.status : safeItem.status) || '').trim(),
    category: String((patch.category !== undefined ? patch.category : safeItem.category) || '').trim(),
    postStatus: String((patch.postStatus !== undefined ? patch.postStatus : safeItem.postStatus) || '').trim(),
    scheduleDate: String((patch.scheduleDate !== undefined ? patch.scheduleDate : safeItem.scheduleDate) || '').trim(),
    imageGeneration: (patch.imageGeneration !== undefined ? patch.imageGeneration : Boolean(safeItem.image_gen)) === true,
    externalReference: (patch.externalReference !== undefined ? patch.externalReference : Boolean(safeItem.external_reference)) === true
  };
}

/**
 * 워드프레스 카테고리 목록을 서버에서 가져옵니다. (캐시 및 중복 요청 방지 포함)
 */
async function fetchWpCategories(options = {}) {
  const force = Boolean(options.force);
  if (!force && wpCategoryCache) return wpCategoryCache;
  if (wpCategoryFetchPromise) return wpCategoryFetchPromise;

  wpCategoryFetchPromise = (async () => {
    try {
      const data = await fetchJson('/api/v1/wordpress/categories');
      if (Array.isArray(data)) {
        wpCategoryCache = data;
        // 카테고리를 사용하는 UI들 갱신 요청 (이벤트 방식 대신 간단히 캐시 채우기)
        return data;
      }
      return null;
    } catch (e) {
      console.warn('WordPress categories fetch failed:', e);
      return null;
    } finally {
      wpCategoryFetchPromise = null;
    }
  })();

  return wpCategoryFetchPromise;
}

/**
 * 워드프레스 카테고리 캐시를 강제로 비웁니다. (설정 변경 시 등)
 */
function invalidateWpCategoryCache() {
  wpCategoryCache = null;
  wpCategoryFetchPromise = null;
}

async function fetchWpCategoriesSilently() {
  await fetchWpCategories();
}

async function saveBlogRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-action-result');
  const item = findTopicByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  // 1. 캐시를 즉시 업데이트 (race condition 방지)
  if (patch.imageGeneration !== undefined) item.image_gen = Boolean(patch.imageGeneration);
  if (patch.externalReference !== undefined) item.external_reference = Boolean(patch.externalReference);
  if (patch.subject !== undefined) item.subject = patch.subject;
  if (patch.keywords !== undefined) item.keywords = typeof patch.keywords === 'string'
    ? patch.keywords.split(',').map(k => k.trim()).filter(Boolean)
    : patch.keywords;
  if (patch.instruction !== undefined) {
    if (!item.content_guide) item.content_guide = {};
    item.content_guide.additional_instructions = patch.instruction;
  }
  if (patch.referenceUrl !== undefined) {
    if (!item.content_guide) item.content_guide = {};
    item.content_guide.reference_urls = typeof patch.referenceUrl === 'string'
      ? patch.referenceUrl.split(',').map(u => u.trim()).filter(Boolean)
      : patch.referenceUrl;
  }
  if (patch.status !== undefined) item.status = patch.status;

  // 2. 즉시 재렌더링 (낙관적 업데이트)
  renderBlogTable(blogTopicsCache);

  const payload = buildBlogUpdatePayload(item, patch);
  if (!payload.subject) throw new Error('Subject는 비워둘 수 없습니다.');
  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;

  const data = await postJson('/api/v1/blog/topic/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);

  // 3. write-lock: Google Sheets 전파 시간(~5s) 동안 loadBlogTopics가 재렌더링하지 않도록 막음
  blogTopicsWriteLockUntil = Date.now() + 6000;
  setTimeout(() => loadBlogTopics({ silent: true }), 6500);
}


async function loadBlogTopics(options = {}) {
  console.log("=== loadBlogTopics START ===", options);
  try {
    if (!guardUiConfigReady('블로그 목록 조회')) {
      console.log("loadBlogTopics: guardUiConfigReady returned false");
      return;
    }

    const silent = Boolean(options.silent);
    const skipRender = Boolean(options.skipRender);
    const pageInfo = getPageInfo('topics');
    const status = (document.getElementById('blog-status-filter')?.value || '').trim();
    const q = (document.getElementById('blog-q-filter')?.value || '').trim();
    const params = new URLSearchParams();
    const sortState = getSortState('topics');

    if (status) params.set('status', status);
    if (q) params.set('q', q);
    params.set('limit', String(pageInfo.limit));
    params.set('offset', String(pageInfo.offset));
    params.set('sortBy', String(sortState.key || 'rowNumber'));
    params.set('sortDir', String(sortState.direction || 'desc'));

    const resultBox = document.getElementById('blog-action-result');
    if (resultBox && !silent) resultBox.textContent = '블로그 목록 조회 중...';

    const writeLocked = Date.now() < blogTopicsWriteLockUntil;
    console.log("loadBlogTopics: fetching...", `/api/v1/blog/topics?${params.toString()}`);

    const data = await fetchJson(`/api/v1/blog/topics?${params.toString()}`);
    console.log("loadBlogTopics: fetch complete", data);

    const freshItems = Array.isArray(data?.items) ? data.items : [];
    if (!writeLocked && !skipRender) {
      blogTopicsCache = freshItems;
      setPageInfo('topics', {
        total: Number(data.total || 0),
        limit: Number(data.limit || pageInfo.limit || 50),
        offset: Number(data.offset || 0)
      });
      renderBlogTable(blogTopicsCache);
      renderTopicsPagination();
    } else {
      blogTopicsCache = freshItems;
    }
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogTopicsCache.length}건`;
    }
  } catch (e) {
    console.error("=== FATAL ERROR in loadBlogTopics ===", e);
    const writeLocked = Date.now() < blogTopicsWriteLockUntil;
    const skipRender = Boolean(options.skipRender);
    if (!writeLocked && !skipRender) {
      blogTopicsCache = [];
      renderBlogTable([]);
      renderTopicsPagination();
    }
    const silent = Boolean(options.silent);
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

function renderBlogShoppingTable(items) {
  const tbody = document.getElementById('shopping-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateShoppingSelectionUi();
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const checked = blogShoppingSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    const product = escapeHtml(item.product || '');
    const shortUrl = escapeHtml(item.shortUrl || '');
    const runtimeLog = escapeHtml(item.runtimeLog || ''); // use runtimeLog field from API
    const status = escapeHtml(item.status || '');
    const publishedAt = escapeHtml(item.publishedAt || '');
    const category = escapeHtml(item.category || '');
    const postStatus = escapeHtml(item.postStatus || 'publish');
    const scheduleDate = escapeHtml(item.scheduleDate || '');
    const runningClass = runtimeLog ? 'running-row' : '';
    return `
      <tr class="${runningClass}" data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="shopping-row-selector" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td class="editable-cell" data-field="category">${category || '-'}</td>
        <td class="editable-cell" data-field="postStatus">${postStatus || '-'}</td>
        <td class="editable-cell" data-field="scheduleDate">${scheduleDate || '-'}</td>
        <td class="editable-cell" data-field="product">${product || '-'}</td>
        <td class="editable-cell" data-field="shortUrl">${shortUrl || '-'}</td>
        <td class="runtime-log-cell">${runtimeLog || ''}</td>
        <td class="editable-cell" data-field="status">${status || '-'}</td>
        <td>${publishedAt || '-'}</td>
      </tr>
    `;
  }).join('');
  const shoppingSelectAll = document.getElementById('shopping-table-select-all');
  if (shoppingSelectAll) shoppingSelectAll.checked = false;
  updateShoppingSelectionUi();
  updateSortableHeadersUi();
}

async function loadBlogShopping(options = {}) {
  if (!guardUiConfigReady('쇼핑 목록 조회')) return;
  const silent = Boolean(options.silent);
  const pageInfo = getPageInfo('shopping');
  const status = (document.getElementById('shopping-status-filter')?.value || '').trim();
  const q = (document.getElementById('shopping-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  const sortState = getSortState('shopping');
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
  params.set('sortBy', String(sortState.key || 'rowNumber'));
  params.set('sortDir', String(sortState.direction || 'desc'));

  const resultBox = document.getElementById('shopping-batch-result');
  if (resultBox && !silent) resultBox.textContent = '쇼핑 목록 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/shopping/items?${params.toString()}`);
    blogShoppingCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('shopping', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogShoppingTable(blogShoppingCache);
    renderShoppingPagination();
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogShoppingCache.length}건`;
    }
  } catch (e) {
    blogShoppingCache = [];
    renderBlogShoppingTable([]);
    renderShoppingPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function runShoppingBatchAction() {
  if (!guardUiConfigReady('선택 글감 발행')) return;
  const resultBox = document.getElementById('shopping-action-result');
  if (!resultBox) return;

  const rowIndices = Array.from(blogShoppingSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];
  clearShoppingSelections();
  pauseDashboardPolling();

  const headless = Boolean(document.getElementById('shopping-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('shopping-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('shopping-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `쇼핑 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogShopping({ silent: true });
        const data = await postJson('/api/v1/shopping/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return data;
      },
      onTick: () => loadBlogShopping({ silent: true })
    });
    await Promise.all([loadDashboard(), loadBlogShopping()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

function getShoppingEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'product') return String(item.product || '');
  if (field === 'shortUrl') return String(item.shortUrl || '');
  if (field === 'status') return String(item.status || '');
  if (field === 'category') return String(item.category || '');
  if (field === 'postStatus') return String(item.postStatus || 'publish');
  if (field === 'scheduleDate') return String(item.scheduleDate || '');
  return '';
}

function isShoppingRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelShoppingInlineEdit() {
  if (!shoppingInlineEditState) return;
  const { cell, originalHtml } = shoppingInlineEditState;
  if (cell) cell.innerHTML = originalHtml;
  shoppingInlineEditState = null;
}

async function saveShoppingRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('shopping-batch-result');
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  const payload = {
    rowIndex,
    product: patch.product !== undefined ? String(patch.product || '').trim() : item.product,
    shortUrl: patch.shortUrl !== undefined ? String(patch.shortUrl || '').trim() : item.shortUrl,
    status: patch.status !== undefined ? String(patch.status || '').trim() : item.status,
    category: patch.category !== undefined ? String(patch.category || '').trim() : item.category,
    postStatus: patch.postStatus !== undefined ? String(patch.postStatus || '').trim() : item.postStatus,
    scheduleDate: patch.scheduleDate !== undefined ? String(patch.scheduleDate || '').trim() : item.scheduleDate
  };

  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;
  const data = await postJson('/api/v1/shopping/row/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
  await loadBlogShopping({ silent: true });
}

async function commitShoppingInlineEdit() {
  if (!shoppingInlineEditState) return;

  const resultBox = document.getElementById('shopping-batch-result');
  const {
    rowIndex,
    field,
    editorEl,
    cell,
    originalHtml
  } = shoppingInlineEditState;

  let normalizedValue = String(editorEl?.value ?? '').trim();
  if (field === 'scheduleDate' && normalizedValue) {
    normalizedValue = normalizedValue.replace('T', ' ');
    if (normalizedValue.length === 16) normalizedValue += ':00';
  }
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) {
    shoppingInlineEditState = null;
    await loadBlogShopping({ silent: true });
    return;
  }

  const beforeValue = getShoppingEditableFieldValue(item, field);
  if (normalizedValue === beforeValue) {
    cell.innerHTML = originalHtml;
    shoppingInlineEditState = null;
    return;
  }

  const patch = {};
  patch[field] = normalizedValue;

  try {
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 중...`;
    await saveShoppingRowPatch(rowIndex, patch, { silent: true });
    shoppingInlineEditState = null;
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 완료`;
  } catch (e) {
    cell.innerHTML = originalHtml;
    shoppingInlineEditState = null;
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function startShoppingInlineEdit(cell) {
  if (!cell) return;
  const row = cell.closest('tr[data-row-index]');
  if (!row) return;
  const rowIndex = Number(row.dataset.rowIndex);
  const field = String(cell.dataset.field || '');
  if (!Number.isInteger(rowIndex)) return;
  if (!['product', 'shortUrl', 'status', 'category', 'postStatus', 'scheduleDate'].includes(field)) return;

  const item = findShoppingByRowIndex(rowIndex);
  if (!item) return;
  if (isShoppingRuntimeRunning(item)) {
    const resultBox = document.getElementById('shopping-batch-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  if (shoppingInlineEditState) {
    if (shoppingInlineEditState.cell === cell) return;
    await cancelShoppingInlineEdit();
  }

  const originalHtml = cell.innerHTML;
  const initialValue = getShoppingEditableFieldValue(item, field);
  const multiline = false; // 쇼핑 테이블은 아직 멀티라인 필드 없음
  const useSelect = ['status', 'postStatus', 'category'].includes(field);
  const isDateTime = field === 'scheduleDate';
  let editorEl;

  if (useSelect) {
    editorEl = document.createElement('select');
    editorEl.className = 'inline-editor';
    let options = [];
    if (field === 'status') {
      options = ['', '준비', '발행 준비 완료', '발행 중', '발행 완료', '실패'];
    } else if (field === 'postStatus') {
      options = ['publish', 'draft', 'schedule'];
    } else if (field === 'category') {
      options = [''];
      if (wpCategoryCache) {
        options = ['', ...wpCategoryCache.map(c => c.name)];
      } else {
        fetchWpCategories().then(() => {
          if (shoppingInlineEditState && shoppingInlineEditState.cell === cell && shoppingInlineEditState.field === 'category') {
            const currentVal = editorEl.value;
            editorEl.innerHTML = '';
            const newOpts = ['', ...wpCategoryCache.map(c => c.name)];
            if (currentVal && !newOpts.includes(currentVal)) newOpts.push(currentVal);
            newOpts.forEach(optVal => {
              const opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = optVal || '(기본)';
              if (optVal === currentVal) opt.selected = true;
              editorEl.appendChild(opt);
            });
          }
        });
      }
      if (initialValue && !options.includes(initialValue)) {
        options.push(initialValue);
      }
    }

    for (const optionValue of options) {
      const opt = document.createElement('option');
      opt.value = optionValue;
      opt.textContent = optionValue || (field === 'category' ? '(기본)' : '(비움)');
      if (optionValue === initialValue) opt.selected = true;
      editorEl.appendChild(opt);
    }
  } else {
    editorEl = document.createElement('input');
    if (isDateTime) {
      editorEl.type = 'datetime-local';
    } else {
      editorEl.type = 'text';
    }
    editorEl.className = `inline-editor ${isDateTime ? 'datetime' : ''}`.trim();

    // scheduleDate 포맷 변환 (YYYY-MM-DD HH:mm:ss -> YYYY-MM-DDTHH:mm)
    let val = initialValue;
    if (isDateTime && val) {
      val = val.replace(' ', 'T').substring(0, 16);
    }
    editorEl.value = val;
  }

  cell.innerHTML = '';
  cell.appendChild(editorEl);
  editorEl.focus();
  if (!useSelect) editorEl.select?.();

  shoppingInlineEditState = {
    rowIndex,
    field,
    cell,
    editorEl,
    originalHtml,
    committing: false
  };

  editorEl.addEventListener('keydown', async (e) => {
    if (!shoppingInlineEditState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      await cancelShoppingInlineEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      shoppingInlineEditState.committing = true;
      await commitShoppingInlineEdit();
    }
  });

  editorEl.addEventListener('blur', async () => {
    if (!shoppingInlineEditState) return;
    if (shoppingInlineEditState.committing) return;
    shoppingInlineEditState.committing = true;
    await commitShoppingInlineEdit();
  });
}

async function runBlogBatchAction() {
  if (!guardUiConfigReady('선택 글감 발행')) return;
  const resultBox = document.getElementById('blog-action-result');
  if (!resultBox) return;

  const rowIndices = getSelectedBlogRowIndices();
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];
  clearBlogSelections();
  clearPreviousBatchVisualState();
  pauseDashboardPolling();

  const headless = Boolean(document.getElementById('blog-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('blog-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('blog-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    const data = await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `블로그 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogTopics({ silent: true });
        const res = await postJson('/api/v1/blog/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return res;
      },
      onTick: () => loadBlogTopics({ silent: true })
    });
    blogLastBatchResult = data;
    markRecentBatchRows(data?.results || []);
    renderBlogLastBatchResult(blogLastBatchResult);
    await Promise.all([loadDashboard(), loadBlogTopics()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

function applySettingsMajorToForm(data) {
  const fields = data?.fields || {};
  const listenHostEl = document.getElementById('settings-listen-host');
  const listenPortEl = document.getElementById('settings-listen-port');
  const naverIdEl = document.getElementById('settings-naver-id');
  const wordpressUrlEl = document.getElementById('settings-wordpress-url');
  const wordpressUserIdEl = document.getElementById('settings-wordpress-user-id');
  const wordpressAppPasswordEl = document.getElementById('settings-wordpress-app-password');
  const geminiKeyEl = document.getElementById('settings-gemini-api-key');
  const sheetUrlEl = document.getElementById('settings-google-sheet-url');

  const typingEl = document.getElementById('settings-typing-speed');
  const blogCollectTrendsEnabledEl = document.getElementById('blog-collect-trends-enabled');
  const blogCollectTrendsTimeEl = document.getElementById('blog-collect-trends-time');
  const blogCollectTrendsFilterNewEl = document.getElementById('blog-collect-trends-filter-new');
  const blogCollectTrendsFilterDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const blogCollectTrendsFilterNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const blogCollectTrendsFilterTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const blogCollectTrendsFilterMinEl = document.getElementById('blog-collect-trends-filter-min');
  const blogCollectTrendsFilterTopEl = document.getElementById('blog-collect-trends-filter-top');
  const blogCollectTrendsReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');

  const blogPublishAutoEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const blogPublishAutoBatchEl = document.getElementById('blog-publish-auto-batch');
  const blogPublishAutoIntervalEl = document.getElementById('blog-publish-auto-interval');
  const blogPublishAutoHeadlessEl = document.getElementById('blog-publish-auto-headless');
  const shoppingPublishAutoEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const shoppingPublishAutoBatchEl = document.getElementById('shopping-publish-auto-batch');
  const shoppingPublishAutoIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const shoppingPublishAutoHeadlessEl = document.getElementById('shopping-publish-auto-headless');
  const shoppingPublishAutoNotifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  const blogPublishAutoNotifyEnabledEl = document.getElementById('blog-publish-auto-notify-enabled');

  const telegramEnabledEl = document.getElementById('settings-notify-telegram-enabled');
  const telegramBotTokenEl = document.getElementById('settings-notify-telegram-bot-token');
  const telegramChatIdEl = document.getElementById('settings-notify-telegram-chat-id');
  const bitlyTokenEl = document.getElementById('settings-notify-bitly-token');

  settingsMajorApplyingForm = true;
  if (listenHostEl) listenHostEl.value = String(fields.LISTEN_HOST || '127.0.0.1');
  if (listenPortEl) listenPortEl.value = String(fields.LISTEN_PORT || 4577);
  if (naverIdEl) naverIdEl.value = String(fields.NAVER_ID || '');
  if (wordpressUrlEl) wordpressUrlEl.value = String(fields.WORDPRESS_URL || '');
  if (wordpressUserIdEl) wordpressUserIdEl.value = String(fields.WORDPRESS_USER_ID || '');
  if (wordpressAppPasswordEl) wordpressAppPasswordEl.value = String(fields.WORDPRESS_APP_PASSWORD || '');
  if (geminiKeyEl) geminiKeyEl.value = String(fields.GEMINI_API_KEY || '');
  if (sheetUrlEl) sheetUrlEl.value = String(fields.GOOGLE_SHEET_URL || '');

  const imageOptimizationEl = document.getElementById('settings-image-optimization');
  if (imageOptimizationEl) imageOptimizationEl.checked = Boolean(fields.IMAGE_OPTIMIZATION_ENABLED ?? true);

  // 개 개별 섹션의 Headless 설정을 우선하며, Global 설정은 이제 레거시 호환용으로만 유지됩니다.
  // ['blog-publish-auto-headless', 'shopping-publish-auto-headless'].forEach(...) 블록은 삭제하고 아래에서 개별 처리합니다.

  if (typingEl) typingEl.value = String(fields.TYPING_SPEED || 'NORMAL');
  if (blogCollectTrendsEnabledEl) blogCollectTrendsEnabledEl.checked = Boolean(fields.COLLECT_TRENDS_ENABLED);
  setSelectedBlogAutoCategories(fields.COLLECT_TRENDS_CATEGORIES || '');
  renderBlogAutoCategoryUi();
  if (blogCollectTrendsTimeEl) blogCollectTrendsTimeEl.value = String(fields.COLLECT_TRENDS_TIME || '07:30');
  if (blogCollectTrendsFilterNewEl) blogCollectTrendsFilterNewEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW);
  if (blogCollectTrendsFilterDashEl) blogCollectTrendsFilterDashEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH);
  if (blogCollectTrendsFilterNumberEnabledEl) blogCollectTrendsFilterNumberEnabledEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER);
  if (blogCollectTrendsFilterTypeEl) blogCollectTrendsFilterTypeEl.value = String(fields.COLLECT_TRENDS_FILTER_TYPE || 'min');
  if (blogCollectTrendsFilterMinEl) {
    const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
    blogCollectTrendsFilterMinEl.value = val === '' ? '' : String(val);
  }
  if (blogCollectTrendsFilterTopEl) {
    const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
    blogCollectTrendsFilterTopEl.value = val === '' ? '' : String(val);
  }
  if (blogCollectTrendsReuseGapEl) blogCollectTrendsReuseGapEl.value = String(fields.COLLECT_TRENDS_REUSE_GAP_DAYS || 15);

  if (blogPublishAutoEnabledEl) blogPublishAutoEnabledEl.checked = Boolean(fields.PUBLISH_AUTO_ENABLED);
  if (blogPublishAutoBatchEl) blogPublishAutoBatchEl.value = String(fields.PUBLISH_AUTO_BATCH_SIZE || 1);
  if (blogPublishAutoIntervalEl) blogPublishAutoIntervalEl.value = String(fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
  if (blogPublishAutoHeadlessEl) blogPublishAutoHeadlessEl.checked = Boolean(fields.PUBLISH_AUTO_HEADLESS ?? true);
  if (blogPublishAutoNotifyEnabledEl) blogPublishAutoNotifyEnabledEl.checked = Boolean(fields.PUBLISH_AUTO_NOTIFY_ENABLED);

  const blogStartTimeEl = document.getElementById('blog-publish-auto-start-time');
  const blogEndTimeEl = document.getElementById('blog-publish-auto-end-time');
  if (blogStartTimeEl) blogStartTimeEl.value = String(fields.PUBLISH_AUTO_START_TIME || '00:00');
  if (blogEndTimeEl) blogEndTimeEl.value = String(fields.PUBLISH_AUTO_END_TIME || '23:59');

  const targetChannels = Array.isArray(fields.PUBLISH_AUTO_TARGET_CHANNELS)
    ? fields.PUBLISH_AUTO_TARGET_CHANNELS
    : String(fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
  // 자동 발행 전용 타겟 체크박스만 갱신 (수동/일괄 UI는 전역 설정에 영향받지 않도록 skip)
  ['blog-publish-auto-target-naver', 'blog-publish-auto-target-wordpress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const target = el.getAttribute('data-publish-target');
      el.checked = targetChannels.includes(target);
    }
  });

  if (shoppingPublishAutoEnabledEl) shoppingPublishAutoEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_ENABLED);

  const shoppingStartTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const shoppingEndTimeEl = document.getElementById('shopping-publish-auto-end-time');
  if (shoppingStartTimeEl) shoppingStartTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
  if (shoppingEndTimeEl) shoppingEndTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
  if (shoppingPublishAutoBatchEl) shoppingPublishAutoBatchEl.value = String(fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
  if (shoppingPublishAutoIntervalEl) shoppingPublishAutoIntervalEl.value = String(fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);

  const shoppingTargetChannels = Array.isArray(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
    ? fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
    : String(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
  // 쇼핑 자동 발행 전용 타겟 체크박스만 갱신
  ['shopping-publish-auto-target-naver', 'shopping-publish-auto-target-wordpress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const target = el.getAttribute('data-shopping-publish-target');
      el.checked = shoppingTargetChannels.includes(target);
    }
  });

  if (shoppingPublishAutoHeadlessEl) shoppingPublishAutoHeadlessEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
  if (shoppingPublishAutoNotifyEnabledEl) shoppingPublishAutoNotifyEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

  if (telegramEnabledEl) telegramEnabledEl.checked = Boolean(fields.NOTIFY_TELEGRAM_ENABLED);
  if (telegramBotTokenEl) telegramBotTokenEl.value = String(fields.NOTIFY_TELEGRAM_BOT_TOKEN || '');
  if (telegramChatIdEl) telegramChatIdEl.value = String(fields.NOTIFY_TELEGRAM_CHAT_ID || '');
  if (bitlyTokenEl) bitlyTokenEl.value = String(fields.NOTIFY_BITLY_TOKEN || '');
  syncBlogAutoVariationTypeUi();
  if (blogCollectTrendsReuseGapEl) {
    const rawReuseGap = fields.COLLECT_TRENDS_REUSE_GAP_DAYS || fields.BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS;
    const normalizedReuseGap = normalizeBlogAutoKeywordReuseGapValue(rawReuseGap, 15);
    blogCollectTrendsReuseGapEl.value = String(normalizedReuseGap);
  }
  applyShoppingAutoDailyPostsLimitUi();
  syncBlogAutoVariationNumberUi();

  // 이미지 슬롯을 applyingForm 플래그 해제 전에 먼저 채웁니다.
  // 그래야 플래그 해제 직후 auto-save가 트리거되더라도
  // ensureRequiredSettingsShoppingImages()가 올바른 데이터를 볼 수 있습니다.
  settingsShoppingImageDefaults = { ...(data?.shoppingImageDefaults || {}) };
  settingsShoppingImageSlots = { ...(data?.shoppingImageSlots || {}) };
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    clearStagedSettingsShoppingImage(slot);
  });
  renderSettingsShoppingImageSlots();

  settingsMajorApplyingForm = false;
  playSettingsTypingPreview();

  settingsMajorLastSavedSignature = buildSettingsMajorBasicSignature();
  settingsMajorHasPendingBasicChanges = false;
}

function getSettingsMajorBasicValuesFromDom() {
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');

  const variationMin = normalizeBlogAutoVariationNumberValue(variationMinEl?.value, 50);
  const variationTopN = normalizeBlogAutoVariationNumberValue(variationTopEl?.value, 5);
  const keywordReuseGap = normalizeBlogAutoKeywordReuseGapValue(keywordReuseGapEl?.value, 15);

  return {
    // General & Blog
    LISTEN_HOST: (document.getElementById('settings-listen-host')?.value || '127.0.0.1').trim(),
    LISTEN_PORT: parseInt((document.getElementById('settings-listen-port')?.value || '4577').trim(), 10) || 4577,
    NAVER_ID: (document.getElementById('settings-naver-id')?.value || '').trim(),
    WORDPRESS_URL: (document.getElementById('settings-wordpress-url')?.value || '').trim(),
    WORDPRESS_USER_ID: (document.getElementById('settings-wordpress-user-id')?.value || '').trim(),
    WORDPRESS_APP_PASSWORD: (document.getElementById('settings-wordpress-app-password')?.value || '').trim(),
    GEMINI_API_KEY: (document.getElementById('settings-gemini-api-key')?.value || '').trim(),
    GOOGLE_SHEET_URL: (document.getElementById('settings-google-sheet-url')?.value || '').trim(),

    IMAGE_OPTIMIZATION_ENABLED: Boolean(document.getElementById('settings-image-optimization')?.checked),

    TYPING_SPEED: (document.getElementById('settings-typing-speed')?.value || 'NORMAL').trim().toUpperCase(),

    // Trend Collection
    COLLECT_TRENDS_ENABLED: Boolean(document.getElementById('blog-collect-trends-enabled')?.checked),
    COLLECT_TRENDS_CATEGORIES: serializeSelectedBlogAutoCategories(),
    COLLECT_TRENDS_WP_CATEGORY: localStorage.getItem('blog_collect_trends_wp_category_value') || '',
    COLLECT_TRENDS_TIME: (document.getElementById('blog-collect-trends-time')?.value || '07:30').trim(),
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: Boolean(document.getElementById('blog-collect-trends-filter-new')?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: Boolean(document.getElementById('blog-collect-trends-filter-dash')?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: Boolean(document.getElementById('blog-collect-trends-filter-number-enabled')?.checked),
    COLLECT_TRENDS_FILTER_TYPE: (document.getElementById('blog-collect-trends-filter-type')?.value || 'min').trim(),
    COLLECT_TRENDS_FILTER_MIN_INCR: variationMin,
    COLLECT_TRENDS_FILTER_TOP_N: variationTopN,
    COLLECT_TRENDS_REUSE_GAP_DAYS: keywordReuseGap,

    // RSS Collection
    COLLECT_RSS_ENABLED: Boolean(document.getElementById('blog-collect-rss-enabled')?.checked),
    COLLECT_RSS_CONFIGS: JSON.stringify(typeof currentRssConfigs !== 'undefined' ? currentRssConfigs : []),

    // Auto Publishing
    PUBLISH_AUTO_ENABLED: Boolean(document.getElementById('blog-publish-auto-enabled')?.checked),
    PUBLISH_AUTO_INTERVAL_MIN: parseInt(document.getElementById('blog-publish-auto-interval')?.value || '60', 10),
    PUBLISH_AUTO_BATCH_SIZE: parseInt(document.getElementById('blog-publish-auto-batch')?.value || '1', 10),
    PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')),
    PUBLISH_AUTO_HEADLESS: Boolean(document.getElementById('blog-publish-auto-headless')?.checked),
    PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(document.getElementById('blog-publish-auto-notify-enabled')?.checked),
    PUBLISH_AUTO_START_TIME: (document.getElementById('blog-publish-auto-start-time')?.value || '00:00').trim(),
    PUBLISH_AUTO_END_TIME: (document.getElementById('blog-publish-auto-end-time')?.value || '23:59').trim(),

    // Shopping Auto Refined
    SHOPPING_PUBLISH_AUTO_ENABLED: Boolean(document.getElementById('shopping-publish-auto-enabled')?.checked),
    SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseInt(document.getElementById('shopping-publish-auto-interval')?.value || '60', 10),
    SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseInt(document.getElementById('shopping-publish-auto-batch')?.value || '1', 10),
    SHOPPING_PUBLISH_AUTO_START_TIME: (document.getElementById('shopping-publish-auto-start-time')?.value || '00:00').trim(),
    SHOPPING_PUBLISH_AUTO_END_TIME: (document.getElementById('shopping-publish-auto-end-time')?.value || '23:59').trim(),
    SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')),
    SHOPPING_PUBLISH_AUTO_HEADLESS: Boolean(document.getElementById('shopping-publish-auto-headless')?.checked),
    SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(document.getElementById('shopping-publish-auto-notify-enabled')?.checked),

    // Notification (Telegram)
    NOTIFY_TELEGRAM_ENABLED: Boolean(document.getElementById('settings-notify-telegram-enabled')?.checked),
    NOTIFY_TELEGRAM_BOT_TOKEN: (document.getElementById('settings-notify-telegram-bot-token')?.value || '').trim(),
    NOTIFY_TELEGRAM_CHAT_ID: (document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim(),
    NOTIFY_BITLY_TOKEN: (document.getElementById('settings-notify-bitly-token')?.value || '').trim(),
  };
}

function checkPublishPrerequisites(targets) {
  if (!targets || targets.length === 0) {
    return { ok: false, message: '발행 대상을 1개 이상 선택해 주세요.' };
  }
  const settings = getSettingsMajorBasicValuesFromDom();
  if (targets.includes('naver')) {
    if (!settings.NAVER_ID) {
      return { ok: false, message: '네이버 블로그 설정(NAVER_ID)이 필요합니다. 설정 탭에서 확인해 주세요.' };
    }
  }
  if (targets.includes('wordpress')) {
    if (!settings.WORDPRESS_URL || !settings.WORDPRESS_USER_ID || !settings.WORDPRESS_APP_PASSWORD) {
      return { ok: false, message: '워드프레스 설정(URL, App ID, Password)이 필요합니다. 설정 탭에서 확인해 주세요.' };
    }
  }
  return { ok: true };
}

function buildSettingsMajorBasicSignature() {
  return JSON.stringify(getSettingsMajorBasicValuesFromDom());
}

function markSettingsMajorPendingChanges(pending = true) {
  settingsMajorHasPendingBasicChanges = Boolean(pending);
}

function setSettingsMajorResultText(message) {
  const resultEls = document.querySelectorAll('.settings-major-result');
  resultEls.forEach(el => el.textContent = String(message || ''));
}

function markSettingsAdvancedAsStale() {
  if (!settingsAdvancedLoadedOnce) return;
  settingsAdvancedStale = true;
  // 현재 Advanced 탭이 활성화 된 경우에는 배너로 즉시 알림
  if (settingsActiveTab === 'advanced') {
    showSettingsAdvancedStaleBanner(true);
  }
}

function stopSettingsTypingPreview() {
  if (settingsTypingPreviewTimer) {
    clearTimeout(settingsTypingPreviewTimer);
    settingsTypingPreviewTimer = null;
  }
}

function setSettingsTypingPreviewMeta(message) {
  const metaEl = document.getElementById('settings-typing-preview-meta');
  if (!metaEl) return;
  metaEl.textContent = String(message || '');
}

function getSettingsTypingPreviewDelay(speedKey) {
  const key = String(speedKey || '').trim().toUpperCase();
  const base = SETTINGS_TYPING_PREVIEW_DELAY[key] || SETTINGS_TYPING_PREVIEW_DELAY.NORMAL;
  const jitter = Math.floor(base * 0.35);
  const offset = Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  return Math.max(1, base + offset);
}

function getSettingsTypingPreviewSourceText() {
  const inputEl = document.getElementById('settings-typing-preview-input');
  const raw = String(inputEl?.value || '').trim();
  if (raw) return raw;
  const placeholder = String(inputEl?.placeholder || '').trim();
  if (placeholder) return placeholder;
  return SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
}

function playSettingsTypingPreview() {
  const targetEl = document.getElementById('settings-typing-preview-text');
  const speedEl = document.getElementById('settings-typing-speed');
  const sampleText = getSettingsTypingPreviewSourceText();
  if (!targetEl || !speedEl) return;
  if (!sampleText) {
    targetEl.textContent = '미리보기 문구를 입력해 주세요.';
    setSettingsTypingPreviewMeta('자동 재생: 대기');
    stopSettingsTypingPreview();
    return;
  }

  stopSettingsTypingPreview();
  const runId = ++settingsTypingPreviewRunId;
  const speedKey = String(speedEl.value || 'NORMAL').trim().toUpperCase();
  let cursor = 0;
  let repeatIndex = 1;
  targetEl.textContent = '';
  setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);

  const tick = () => {
    if (runId !== settingsTypingPreviewRunId) return;
    if (cursor >= sampleText.length) {
      targetEl.textContent = sampleText;
      if (repeatIndex >= SETTINGS_TYPING_PREVIEW_REPEAT_COUNT) {
        setSettingsTypingPreviewMeta(`자동 재생 완료: ${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}회`);
        stopSettingsTypingPreview();
        return;
      }
      repeatIndex += 1;
      cursor = 0;
      setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);
      settingsTypingPreviewTimer = setTimeout(tick, 420);
      return;
    }
    cursor += 1;
    targetEl.textContent = `${sampleText.slice(0, cursor)}▌`;
    settingsTypingPreviewTimer = setTimeout(tick, getSettingsTypingPreviewDelay(speedKey));
  };

  settingsTypingPreviewTimer = setTimeout(tick, 120);
}

function scheduleSettingsMajorAutoSave({ immediate = false } = {}) {
  if (settingsMajorApplyingForm) return;
  const currentSignature = buildSettingsMajorBasicSignature();
  const isDirty = currentSignature !== settingsMajorLastSavedSignature;
  markSettingsMajorPendingChanges(isDirty);
  if (!isDirty) return;
  console.log('scheduleSettingsMajorAutoSave: dirty', isDirty);

  if (settingsMajorAutoSaveTimer) {
    clearTimeout(settingsMajorAutoSaveTimer);
    settingsMajorAutoSaveTimer = null;
  }

  // 🔄 즉각적인 피드백 제공
  setSettingsMajorResultText('대기 중... (0.7초 후 자동 저장)');

  if (immediate) {
    void saveSettingsMajor({ mode: 'auto' });
    return;
  }

  settingsMajorAutoSaveTimer = setTimeout(() => {
    settingsMajorAutoSaveTimer = null;
    void saveSettingsMajor({ mode: 'auto' });
  }, SETTINGS_MAJOR_AUTOSAVE_DELAY_MS);
}

async function loadSettingsMajor() {
  const refreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');

  refreshBtns.forEach(btn => btn.disabled = true);
  updateSettingsStatus('.settings-major-result', '불러오는 중...', 'info');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    applySettingsMajorToForm(data);
    updateSettingsStatus('.settings-major-result', `불러오기 완료: ${data.configPath || '-'}`, 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
  } finally {
    refreshBtns.forEach(btn => btn.disabled = false);
  }
}

function buildSettingsMajorPayload() {
  const imageSources = {};
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    const domValue = (document.getElementById(`settings-image-source-${slot}`)?.value || '').trim();
    // DOM input이 비어있을 수 있음 (쇼핑 설정 탭이 활성화되지 않으면 renderSettingsShoppingImageSlot이 값을 채우지 않음)
    // 그 경우 메모리에 있는 슬롯 데이터를 사용하여 기존 값이 유실되지 않도록 함
    const memoryValue = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    imageSources[meta.key] = domValue || memoryValue;
  });

  const basic = getSettingsMajorBasicValuesFromDom();

  return {
    ...basic,
    ...imageSources
  };
}

function revokeSettingsShoppingObjectUrl(slot) {
  const current = settingsShoppingImageObjectUrls[slot];
  if (current) {
    URL.revokeObjectURL(current);
    delete settingsShoppingImageObjectUrls[slot];
  }
}

function buildSettingsShoppingPreviewUrl(slot, source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const query = new URLSearchParams({
    slot,
    source: value,
    _t: String(Date.now())
  });
  return `/api/v1/settings/shopping-image/preview?${query.toString()}`;
}

function clearStagedSettingsShoppingImage(slot) {
  delete settingsShoppingImageFileState[slot];
  revokeSettingsShoppingObjectUrl(slot);
  const fileInput = document.getElementById(`settings-image-file-${slot}`);
  if (fileInput) fileInput.value = '';
}

function renderSettingsShoppingImageSlot(slot) {
  const slotData = settingsShoppingImageSlots[slot] || {};
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  const previewWrap = document.getElementById(`settings-image-preview-wrap-${slot}`);
  const previewImg = document.getElementById(`settings-image-preview-${slot}`);
  const metaEl = document.getElementById(`settings-image-meta-${slot}`);
  if (!sourceInput || !previewWrap || !previewImg || !metaEl) return;

  let source = String(sourceInput.value || '').trim();
  if (!source) source = String(slotData.source || '').trim();
  sourceInput.value = source;

  const stagedFile = settingsShoppingImageFileState[slot];
  if (stagedFile) {
    revokeSettingsShoppingObjectUrl(slot);
    const objectUrl = URL.createObjectURL(stagedFile);
    settingsShoppingImageObjectUrls[slot] = objectUrl;
    previewImg.src = objectUrl;
    previewWrap.classList.add('has-image');
    metaEl.textContent = `선택됨(저장 시 반영): ${stagedFile.name}`;
    return;
  }

  revokeSettingsShoppingObjectUrl(slot);
  const previewUrl = buildSettingsShoppingPreviewUrl(slot, source);
  if (previewUrl) {
    const modeText = /^https?:\/\//i.test(source) ? '원격 URL' : '로컬 파일';
    metaEl.textContent = `현재 이미지: ${modeText}`;
    previewImg.onload = () => {
      previewWrap.classList.add('has-image');
    };
    previewImg.onerror = () => {
      previewWrap.classList.remove('has-image');
      metaEl.textContent = '현재 이미지: 미리보기를 불러오지 못했습니다.';
    };
    previewWrap.classList.remove('has-image');
    previewImg.src = previewUrl;
  } else {
    previewImg.onload = null;
    previewImg.onerror = null;
    previewImg.removeAttribute('src');
    previewWrap.classList.remove('has-image');
    metaEl.textContent = '현재 이미지: 설정 없음';
  }
}

function renderSettingsShoppingImageSlots() {
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    const source = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    if (sourceInput) sourceInput.value = source;
    renderSettingsShoppingImageSlot(slot);
  });
}

function restoreSettingsShoppingDefault(slot) {
  const meta = SETTINGS_SHOPPING_SLOT_META[slot];
  if (!meta) return;
  clearStagedSettingsShoppingImage(slot);
  const source = String(settingsShoppingImageDefaults?.[meta.key] || '').trim();
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = source;
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = source;
  renderSettingsShoppingImageSlot(slot);
}

function clearSettingsShoppingOptional(slot) {
  clearStagedSettingsShoppingImage(slot);
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = '';
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = '';
  renderSettingsShoppingImageSlot(slot);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('파일이 선택되지 않았습니다.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadShoppingImageFromSettings(slot, file) {
  if (!file) throw new Error('업로드할 이미지 파일을 먼저 선택해 주세요.');
  const dataUrl = await readFileAsDataUrl(file);
  return postJson('/api/v1/settings/shopping-image', {
    slot,
    fileName: file.name,
    mimeType: file.type || '',
    base64Data: dataUrl
  });
}

async function uploadPendingSettingsShoppingImages(resultEls) {
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const file = settingsShoppingImageFileState[slot];
    if (!file) continue;
    const label = SETTINGS_SHOPPING_SLOT_META[slot]?.label || slot;
    if (resultEls) resultEls.forEach(el => el.textContent = `이미지 업로드 중... (${label}: ${file.name})`);
    const data = await uploadShoppingImageFromSettings(slot, file);
    const sourceValue = String(data?.value || '').trim();
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    if (sourceInput) sourceInput.value = sourceValue;
    if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
    settingsShoppingImageSlots[slot].source = sourceValue;
    clearStagedSettingsShoppingImage(slot);
  }
}

function ensureRequiredSettingsShoppingImages() {
  // 슬롯 데이터가 아직 로드되지 않은 경우 검증을 건너뜁니다
  if (!settingsShoppingImageSlots || Object.keys(settingsShoppingImageSlots).length === 0) return;
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    if (!meta?.required) continue;
    // DOM input 대신 메모리 상태로 검사 (렌더링 여부와 무관하게 항상 정확함)
    const slotSource = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    const hasStagedFile = !!settingsShoppingImageFileState?.[slot];
    if (!slotSource && !hasStagedFile) {
      throw new Error(`${meta.label}는 필수입니다. 이미지를 선택하거나 기본 이미지로 복원해 주세요.`);
    }
  }
}

async function saveSettingsMajor({ mode = 'manual' } = {}) {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');

  if (settingsMajorAutoSaveTimer) {
    clearTimeout(settingsMajorAutoSaveTimer);
    settingsMajorAutoSaveTimer = null;
  }

  if (settingsMajorSaveInFlight) {
    settingsMajorSaveQueued = true;
    settingsMajorQueuedMode = settingsMajorQueuedMode === 'manual' || mode === 'manual' ? 'manual' : 'auto';
    return;
  }

  settingsMajorSaveInFlight = true;
  let nextMode = mode;
  console.log(`[Auto-save] Save starting (mode: ${mode})`);

  if (mode === 'manual') {
    saveBtns.forEach(btn => btn.disabled = true);
    updateSettingsStatus('.settings-major-result', '저장 중...', 'info');
  }

  while (nextMode) {
    const currentMode = nextMode;
    nextMode = null;
    try {
      updateSettingsStatus('.settings-major-result', currentMode === 'auto' ? '자동 저장 중...' : '주요 설정 저장 중...', 'info');

      await uploadPendingSettingsShoppingImages(resultEls);
      ensureRequiredSettingsShoppingImages();

      const payload = buildSettingsMajorPayload();
      const data = await postJson('/api/v1/settings/major', payload);

      console.log('[Auto-save] Save successful');
      applySettingsMajorToForm(data);
      uiSheetsReady = false;
      invalidateWpCategoryCache(); // WordPress 설정 변경 가능성이 있으므로 캐시 초기화
      settingsMajorLastSavedSignature = buildSettingsMajorBasicSignature();
      markSettingsMajorPendingChanges(false);
      markSettingsAdvancedAsStale();

      const nowText = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      if (currentMode === 'auto') {
        if (data.restarting) {
          updateSettingsStatus('.settings-major-result', `자동 저장 완료 (${nowText})\n주소/포트 변경으로 인해 서버를 재시작 중입니다... 새 주소로 이동합니다.`, 'success');
          setTimeout(() => {
            window.location.href = `http://${data.newHost === '0.0.0.0' ? '127.0.0.1' : data.newHost}:${data.newPort}`;
          }, 1500);
          return;
        }
        updateSettingsStatus('.settings-major-result', `자동 저장 완료 (${nowText})`, 'success');
      } else {
        if (data.restarting) {
          updateSettingsStatus('.settings-major-result', `${data.message || '주요 설정 저장 완료'}\n주소/포트 변경으로 인해 서버를 재시작 중입니다... 새 주소로 이동합니다.`, 'success');
          setTimeout(() => {
            window.location.href = `http://${data.newHost === '0.0.0.0' ? '127.0.0.1' : data.newHost}:${data.newPort}`;
          }, 1500);
          return;
        }
        updateSettingsStatus('.settings-major-result', `${data.message || '주요 설정 저장 완료'}\n${data.configPath || '-'}`, 'success');
      }
      await Promise.all([loadConfigStatus(), loadDashboard()]);
      if (uiConfigReady) {
        await ensureSheetsPreflightUi({ force: true, silent: true });
      }
    } catch (e) {
      console.error('[Auto-save] Save failed:', e);
      const staleHint = e.code === 'SETTINGS_CONFLICT'
        ? '\n원문이 최신이 아닙니다. [원문 다시 불러오기] 후 변경사항을 다시 적용해 주세요.'
        : '';
      const message = currentMode === 'auto'
        ? `자동 저장 실패: ${e.message}`
        : `오류: ${e.message}${staleHint}`;
      updateSettingsStatus('.settings-major-result', message, 'error');
    }

    if (settingsMajorSaveQueued) {
      nextMode = settingsMajorQueuedMode === 'manual' ? 'manual' : 'auto';
      settingsMajorSaveQueued = false;
      settingsMajorQueuedMode = null;
    }
  }

  settingsMajorSaveInFlight = false;
  if (mode === 'manual') {
    saveBtns.forEach(btn => btn.disabled = false);
  }
}

function buildGoogleSheetOpenUrl(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return 'https://docs.google.com/spreadsheets';

  const lower = raw.toLowerCase();
  const hasPlaceholderHint =
    lower.includes('여기에') ||
    lower.includes('구글시트') ||
    lower.includes('your_') ||
    lower.includes('<') ||
    lower.includes('...');
  if (hasPlaceholderHint) return 'https://docs.google.com/spreadsheets';

  const extractId = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
    try {
      const u = new URL(text);
      const byPath = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (byPath?.[1]) return byPath[1];
      const byQuery = u.searchParams.get('id');
      if (byQuery && /^[a-zA-Z0-9-_]{20,}$/.test(byQuery)) return byQuery;
    } catch (_e) { }
    return '';
  };

  const id = extractId(raw);
  if (id) return `https://docs.google.com/spreadsheets/d/${id}`;
  if (/^https?:\/\//i.test(raw) && !/^https?:\/\/docs\.google\.com\/spreadsheets/i.test(raw)) return raw;
  return 'https://docs.google.com/spreadsheets';
}

async function loadSettingsAdvanced() {
  const resultEls = document.querySelectorAll('.settings-advanced-result');
  const editorEl = document.getElementById('settings-advanced-content');
  updateSettingsStatus('.settings-advanced-result', '고급 설정 불러오는 중...', 'info');
  try {
    const data = await fetchJson('/api/v1/settings/advanced');
    if (editorEl) {
      editorEl.value = String(data.content || '');
      editorEl.dataset.editedSinceLoad = 'false'; // 불러온 후 편집 여부 초기화
    }
    settingsAdvancedRevision = String(data.revision || '');
    settingsAdvancedStale = false;
    showSettingsAdvancedStaleBanner(false);
    updateSettingsStatus('.settings-advanced-result', `불러오기 완료: ${data.configPath || '-'}`, 'success');
  } catch (e) {
    updateSettingsStatus('.settings-advanced-result', `오류: ${e.message}`, 'error');
  }
}

async function saveSettingsAdvanced() {
  const resultEls = document.querySelectorAll('.settings-advanced-result');
  const editorEl = document.getElementById('settings-advanced-content');
  const content = String(editorEl?.value || '');
  updateSettingsStatus('.settings-advanced-result', '고급 설정 저장 중...', 'info');
  try {
    const data = await postJson('/api/v1/settings/advanced', {
      content,
      revision: settingsAdvancedRevision
    });
    settingsAdvancedRevision = String(data.revision || settingsAdvancedRevision || '');
    settingsAdvancedStale = false;
    const restartText = data.requiresRestart ? '\n변경 적용을 위해 재시작을 권장합니다.' : '';
    updateSettingsStatus('.settings-advanced-result', `${data.message || '고급 설정 저장 완료'}\n${data.configPath || '-'}${restartText}`, 'success');

    await Promise.all([loadSettingsMajor(), loadConfigStatus(), loadDashboard()]);
    if (uiConfigReady) {
      uiSheetsReady = false;
      await ensureSheetsPreflightUi({ force: true, silent: true });
    }
  } catch (e) {
    const staleHint = e.code === 'SETTINGS_CONFLICT'
      ? '\n원문이 최신이 아닙니다. [원문 다시 불러오기] 후 변경사항을 다시 적용해 주세요.'
      : '';
    updateSettingsStatus('.settings-advanced-result', `오류: ${e.message}${staleHint}`, 'error');
  }
}

function openGoogleSheetFromUi() {
  const resultEls = document.querySelectorAll('.settings-major-result');
  const inputValue = (document.getElementById('settings-google-sheet-url')?.value || '').trim();
  const openUrl = buildGoogleSheetOpenUrl(inputValue);
  window.open(openUrl, '_blank', 'noopener,noreferrer');
  resultEls.forEach(el => {
    if (/^https?:\/\/docs\.google\.com\/spreadsheets\/d\//i.test(openUrl)) {
      el.textContent = `스프레드시트를 새 탭에서 열었습니다.\n${openUrl}`;
    } else {
      el.textContent = [
        '스프레드시트 목록 페이지를 열었습니다.',
        '문서를 생성/선택 후 URL을 GOOGLE_SHEET_URL에 입력하세요.',
        'service_account.json의 이메일을 편집자로 공유해야 합니다.',
        openUrl
      ].join('\n');
    }
  });
}

async function loadGoogleAuthStatus() {
  const statusById = document.getElementById('settings-google-auth-status');
  const statusByClass = Array.from(document.querySelectorAll('.settings-google-auth-status'));
  const statusEls = statusById
    ? [statusById, ...statusByClass.filter(el => el !== statusById)]
    : statusByClass;
  if (statusEls.length === 0) return;

  const detailsById = document.getElementById('settings-google-auth-details');
  const detailsByClass = Array.from(document.querySelectorAll('.settings-google-auth-details'));
  const detailEls = detailsById
    ? [detailsById, ...detailsByClass.filter(el => el !== detailsById)]
    : detailsByClass;

  statusEls.forEach(el => {
    el.textContent = '상태 확인 중...';
    el.className = 'status-badge';
  });
  detailEls.forEach(el => {
    el.textContent = '상세 정보 확인 중...';
  });

  try {
    const data = await fetchJson('/api/v1/settings/google-auth/status');
    const detailText = data?.configured
      ? [
        `등록 상태: 등록 완료`,
        `계정 이메일: ${data.clientEmail || '-'}`,
        `프로젝트 ID: ${data.projectId || '-'}`,
        `파일 경로: ${data.path || '-'}`
      ].join('\n')
      : [
        '등록 상태: 미등록',
        `기본 경로: ${data?.path || '-'}`,
        data?.message ? `안내: ${data.message}` : ''
      ].filter(Boolean).join('\n');

    statusEls.forEach(el => {
      if (data.configured) {
        el.textContent = '등록 완료';
        el.className = 'status-badge success';
      } else {
        el.textContent = '등록 필요';
        el.className = 'status-badge error';
      }
    });
    detailEls.forEach(el => {
      el.textContent = detailText;
    });
  } catch (e) {
    statusEls.forEach(el => {
      el.textContent = '상태 확인 실패';
      el.className = 'status-badge error';
    });
    detailEls.forEach(el => {
      el.textContent = `상세 정보 조회 실패\n오류: ${String(e?.message || 'unknown')}`;
    });
  }
}

async function saveGoogleAuthJson(content) {
  const resultEls = document.querySelectorAll('.settings-google-auth-result');
  resultEls.forEach(el => el.textContent = '저장 중...');

  try {
    const data = await postJson('/api/v1/settings/google-auth', { content });
    updateSettingsStatus('.settings-google-auth-result', `저장 완료!\n계정: ${data.clientEmail}\n경로: ${data.savedPath}`, 'success');
    await loadGoogleAuthStatus();
    // 시트가 새 계정으로 정상 동작하는지 테스트하기 위해 preflight 다시 실행 권장
    uiSheetsReady = false;
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

function handleGoogleAuthFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    document.getElementById('settings-google-auth-text').value = content;
    await saveGoogleAuthJson(content);
    // 리셋하여 같은 파일 다시 선택 가능하도록 함
    event.target.value = '';
  };
  reader.readAsText(file);
}

function handleGoogleAuthTextSave() {
  const content = document.getElementById('settings-google-auth-text')?.value || '';
  if (!content.trim()) {
    updateSettingsStatus('.settings-google-auth-result', '내용을 입력해주세요.', 'error');
    return;
  }
  saveGoogleAuthJson(content);
}

async function startNaverLoginFromUi() {
  updateSettingsStatus('.settings-major-result', '로그인 시작 요청 중...', 'info');
  try {
    await postJson('/api/v1/session/naver-login/start', {});
    updateSettingsStatus('.settings-major-result', '네이버 로그인 시작 요청이 접수되었습니다. 브라우저에서 로그인 후 상태를 확인하세요.', 'success');
  } catch (e) {
    resultEls.forEach(el => {
      el.textContent = `오류: ${e.message}`;
      el.style.color = '#ef4444';
    });
  }
}

async function verifyWordPressAuthFromUi() {
  const resultEl = document.getElementById('settings-wordpress-verify-result');
  const btn = document.getElementById('settings-wordpress-verify-btn');
  if (!resultEl) return;

  updateSettingsStatus('#settings-wordpress-verify-result', '연동 확인 중... (먼저 설정을 저장합니다)', 'info');
  if (btn) btn.disabled = true;

  try {
    // 설정을 먼저 저장하여 백엔드가 최신 값을 사용하도록 함
    await saveSettingsMajor({ mode: 'manual' });

    updateSettingsStatus('#settings-wordpress-verify-result', '연동 확인 중...', 'info');
    const res = await postJson('/api/v1/session/wordpress-verify', {});
    if (res.success) {
      updateSettingsStatus('#settings-wordpress-verify-result', '✅ ' + res.message, 'success');
      invalidateWpCategoryCache(); // 인증 성공 시 카테고리 정보 갱신을 위해 캐시 초기화
      fetchWpCategories(); // 백그라운드에서 즉시 갱신 시작
    } else {
      updateSettingsStatus('#settings-wordpress-verify-result', '❌ ' + res.message, 'error');
    }
  } catch (e) {
    updateSettingsStatus('#settings-wordpress-verify-result', `❌ 오류: ${e.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}



function setBlogAutoResultText(message) {
  const resultEl = document.getElementById('blog-publish-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-result');
  if (resultEl) resultEl.textContent = String(message || '').replace(/\\n/g, '\n');
}

let currentRssConfigs = [];
window.addRssConfig = function () {
  currentRssConfigs.push({ enabled: true, url: '', interval: 60, includeKeywords: '', excludeKeywords: '' });
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.removeRssConfig = function (index) {
  currentRssConfigs.splice(index, 1);
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.updateRssConfig = function (index, key, value) {
  if (currentRssConfigs[index]) {
    currentRssConfigs[index][key] = value;
    scheduleSettingsMajorAutoSave(); // Debounced save
  }
};
window.toggleAllRssConfigs = function (checked) {
  currentRssConfigs.forEach(rss => { rss.enabled = checked; });
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.openRssTest = function (index) {
  const url = currentRssConfigs[index]?.url;
  if (url) window.open(url, '_blank');
};
function buildWpCategorySelectHtml(selectedValue, index) {
  if (!wpCategoryCache) return `<select onchange="updateRssConfig(${index}, 'wpCategory', this.value)" style="width: 100%; min-height: 32px; box-sizing: border-box;"><option value="">불러오는 중...</option></select>`;
  let opts = `<option value="">미지정</option>`;
  wpCategoryCache.forEach(c => {
    const sel = (c.name === selectedValue) ? 'selected' : '';
    opts += `<option value="${c.name}" ${sel}>${c.name} (${c.count})</option>`;
  });
  return `<select onchange="updateRssConfig(${index}, 'wpCategory', this.value)" style="width: 100%; min-height: 32px; box-sizing: border-box;">${opts}</select>`;
}

function renderBlogCollectRssUi(configs = []) {
  currentRssConfigs = Array.isArray(configs) ? configs : [];
  const tbody = document.getElementById('blog-collect-rss-tbody');
  if (!tbody) return;

  // Attempt to load WP categories asynchronously if needed
  if (!wpCategoryCache && !window._wpCatFetchTriggeredForRss) {
    window._wpCatFetchTriggeredForRss = true;
    fetchWpCategories().finally(() => {
      if (!wpCategoryCache) wpCategoryCache = []; // Default to empty array to prevent refetch loops
      renderBlogCollectRssUi(currentRssConfigs);
    });
  }

  tbody.innerHTML = '';

  // 헤더 체크박스 상태 동기화
  const toggleAllEl = document.getElementById('blog-collect-rss-toggle-all');
  if (toggleAllEl) {
    toggleAllEl.checked = currentRssConfigs.length > 0 && currentRssConfigs.every(rss => rss.enabled);
  }

  if (currentRssConfigs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--text-muted);">등록된 RSS 피드가 없습니다.</td></tr>';
    return;
  }
  currentRssConfigs.forEach((rss, index) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    tr.innerHTML = `
      <td style="padding: 10px; text-align: center;">
        <input type="checkbox" onchange="updateRssConfig(${index}, 'enabled', this.checked); renderBlogCollectRssUi(currentRssConfigs);" ${rss.enabled ? 'checked' : ''}>
      </td>
      <td style="padding: 10px;">
        <input type="url" placeholder="RSS URL" value="${rss.url || ''}" onchange="updateRssConfig(${index}, 'url', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px;">
        ${buildWpCategorySelectHtml(rss.wpCategory, index)}
      </td>
      <td style="padding: 10px; text-align: center;">
        <input type="number" min="1" step="1" value="${rss.interval || 60}" onchange="updateRssConfig(${index}, 'interval', parseInt(this.value, 10))" style="width: 60px; min-height: 32px; text-align: center;">
      </td>
      <td style="padding: 10px;">
        <input type="text" placeholder="포함(쉼표 구분)" value="${Array.isArray(rss.includeKeywords) ? rss.includeKeywords.join(', ') : (rss.includeKeywords || '')}" onchange="updateRssConfig(${index}, 'includeKeywords', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px;">
        <input type="text" placeholder="제외(쉼표 구분)" value="${Array.isArray(rss.excludeKeywords) ? rss.excludeKeywords.join(', ') : (rss.excludeKeywords || '')}" onchange="updateRssConfig(${index}, 'excludeKeywords', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px; text-align: center; white-space: nowrap;">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button type="button" class="secondary compact" onclick="openRssTest(${index})">테스트</button>
          <button type="button" class="secondary compact" onclick="removeRssConfig(${index})">삭제</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function normalizeCategoryToken(input) {
  return String(input || '').trim();
}

function parseCategoryTokens(input) {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map(normalizeCategoryToken).filter(Boolean)));
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(/[\n,]/)
      .map(normalizeCategoryToken)
      .filter(Boolean)
  ));
}

function serializeSelectedBlogAutoCategories() {
  return Array.from(blogAutoCategorySelected.values()).join(', ');
}

function getBlogAutoSettingsFromUi() {
  const modeEl = document.getElementById('blog-collect-trends-enabled');
  const variationNewEl = document.getElementById('blog-collect-trends-filter-new');
  const variationDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const variationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const variationTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');
  const trendsTimeEl = document.getElementById('blog-collect-trends-time');

  const variationMinRaw = String(variationMinEl?.value ?? '').trim();
  if (variationMinRaw && !/^-?\d+$/.test(variationMinRaw)) throw new Error('증감 숫자 기준은 정수만 입력할 수 있습니다.');
  const variationMin = normalizeBlogAutoVariationNumberValue(variationMinRaw, 50);

  const variationTopRaw = String(variationTopEl?.value ?? '').trim();
  if (variationTopRaw && !/^-?\d+$/.test(variationTopRaw)) throw new Error('상위 랭킹 개수는 앞선 정수만 필요합니다.');
  const variationTopN = normalizeBlogAutoVariationNumberValue(variationTopRaw, 5);

  const keywordReuseGapRaw = String(keywordReuseGapEl?.value ?? '').trim();
  if (keywordReuseGapRaw && !/^\d+$/.test(keywordReuseGapRaw)) throw new Error('중복 키워드 금지 간격은 0 이상의 정수만 입력할 수 있습니다.');
  const keywordReuseGap = normalizeBlogAutoKeywordReuseGapValue(keywordReuseGapRaw, 15);

  const categories = serializeSelectedBlogAutoCategories();

  return {
    COLLECT_TRENDS_ENABLED: Boolean(modeEl?.checked),
    COLLECT_TRENDS_CATEGORIES: categories,
    COLLECT_TRENDS_TIME: (trendsTimeEl?.value || '07:30').trim(),
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: Boolean(variationNewEl?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: Boolean(variationDashEl?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: Boolean(variationNumberEnabledEl?.checked),
    COLLECT_TRENDS_FILTER_TYPE: (variationTypeEl?.value || 'min').trim(),
    COLLECT_TRENDS_FILTER_MIN_INCR: variationMin,
    COLLECT_TRENDS_FILTER_TOP_N: variationTopN,
    COLLECT_TRENDS_REUSE_GAP_DAYS: keywordReuseGap
  };
}

function setSelectedBlogAutoCategories(categories = []) {
  blogAutoCategorySelected = new Set(parseCategoryTokens(categories));
}

function ensureSelectedCategoriesInCatalog() {
  if (!blogAutoCategorySelected.size) return;
  const existingKeys = new Set(blogAutoCategoryCatalog.map((v) => String(v).toLowerCase()));
  for (const category of blogAutoCategorySelected.values()) {
    const key = String(category).toLowerCase();
    if (!existingKeys.has(key)) {
      blogAutoCategoryCatalog.push(category);
      existingKeys.add(key);
    }
  }
}

function renderBlogAutoCategoryOptions() {
  const optionContainers = Array.from(document.querySelectorAll('[data-blog-category-options]'));
  if (optionContainers.length === 0) return;

  const categories = Array.from(new Set(blogAutoCategoryCatalog.map(normalizeCategoryToken).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }));

  if (categories.length === 0) {
    optionContainers.forEach((el) => {
      el.innerHTML = '<p class="category-hint">표시할 카테고리가 없습니다.</p>';
    });
    return;
  }

  const html = categories
    .map((value) => {
      const escaped = escapeHtml(value);
      const active = blogAutoCategorySelected.has(value) ? 'active' : '';
      return `<button type="button" class="category-option-btn ${active}" data-blog-collect-trends-category-toggle="${escaped}">${escaped}</button>`;
    })
    .join('');
  optionContainers.forEach((el) => {
    el.innerHTML = html;
  });
}

function renderBlogAutoCategoryUi() {
  ensureSelectedCategoriesInCatalog();
  renderBlogAutoCategoryOptions();
}

function applyBlogAutoCategoryCatalog(data = {}) {
  const list = Array.isArray(data.categories) ? data.categories : [];
  blogAutoCategoryCatalog = parseCategoryTokens(list);
  blogAutoCategoryCatalogMeta = {
    runtimeCount: Number(data.runtimeCategories?.length || 0),
    trendCount: Number(data.trendCategories?.length || 0),
    updatedAt: String(data.updatedAt || '')
  };
}

async function loadBlogAutoCategoryCatalog(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  try {
    const query = force ? '?force=true' : '';
    const data = await fetchJson(`/api/v1/blog/auto/categories${query}`);
    applyBlogAutoCategoryCatalog(data);
    renderBlogAutoCategoryUi();
    if (!silent) {
      const base = `카테고리 목록 갱신 완료 (${blogAutoCategoryCatalog.length}건)`;
      const detail = `(마스터 ${blogAutoCategoryCatalogMeta.runtimeCount} / 트렌드 ${blogAutoCategoryCatalogMeta.trendCount})`;
      setBlogAutoResultText(`${base} ${detail}`);
    }
  } catch (e) {
    if (!silent) setBlogAutoResultText(`카테고리 목록 갱신 실패: ${e.message}`);
  }
}

function clearAllBlogAutoCategories() {
  blogAutoCategorySelected.clear();
  renderBlogAutoCategoryUi();
  scheduleSettingsMajorAutoSave({ immediate: true });
}

function setShoppingAutoResultText(message) {
  const resultEl = document.getElementById('shopping-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function applyShoppingAutoDailyPostsLimitUi() {
  const inputEl = document.getElementById('shopping-auto-daily-posts');
  const hintEl = document.getElementById('shopping-auto-daily-posts-hint');
  if (!inputEl) return;

  const planLabelRaw = String(shoppingAutoPlanName || '').trim();
  const planLabel = planLabelRaw
    ? planLabelRaw.replace(/\s+plan$/i, '').trim() || planLabelRaw
    : '현재';

  if (typeof shoppingAutoPlanMaxPosts === 'number' && Number.isFinite(shoppingAutoPlanMaxPosts) && shoppingAutoPlanMaxPosts > 0) {
    inputEl.max = String(shoppingAutoPlanMaxPosts);
    const current = parseInt((inputEl.value || '').trim(), 10);
    if (Number.isInteger(current) && current > shoppingAutoPlanMaxPosts) {
      inputEl.value = String(shoppingAutoPlanMaxPosts);
    }
    if (hintEl) hintEl.textContent = `${planLabel} 플랜 1회 최대 발행: ${shoppingAutoPlanMaxPosts}건`;
    return;
  }

  inputEl.removeAttribute('max');
  if (hintEl) hintEl.textContent = `${planLabel} 플랜 1회 최대 발행: 제한 없음`;
}

async function loadShoppingAutoPlanLimit(options = {}) {
  const silent = options?.silent === true;
  try {
    const capabilities = await fetchJson('/api/v1/capabilities?quiet=1');
    shoppingAutoPlanName = String(capabilities?.planName || capabilities?.planCode || '현재').trim() || '현재';
    const raw = capabilities?.limits?.max_shopping_posts_per_run;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      shoppingAutoPlanMaxPosts = parsed;
    } else {
      shoppingAutoPlanMaxPosts = null;
    }
    applyShoppingAutoDailyPostsLimitUi();
  } catch (e) {
    shoppingAutoPlanMaxPosts = null;
    applyShoppingAutoDailyPostsLimitUi();
    if (!silent) setShoppingAutoResultText(`플랜 제한 조회 실패: ${e.message}`);
  }
}

function normalizeShoppingAutoDailyPostsValue(rawValue) {
  let value = parseInt(String(rawValue || '').trim(), 10);
  if (!Number.isInteger(value) || value < 0) value = 0;
  if (typeof shoppingAutoPlanMaxPosts === 'number' && Number.isFinite(shoppingAutoPlanMaxPosts) && shoppingAutoPlanMaxPosts > 0) {
    value = Math.min(value, shoppingAutoPlanMaxPosts);
  }
  return value;
}

function clampShoppingAutoDailyPostsInputValue(options = {}) {
  const force = options?.force === true;
  const inputEl = document.getElementById('shopping-auto-daily-posts');
  if (!inputEl) return;

  const raw = String(inputEl.value || '').trim();
  if (!raw) {
    if (force) inputEl.value = '0';
    return;
  }

  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    if (force) inputEl.value = '0';
    return;
  }

  const normalized = normalizeShoppingAutoDailyPostsValue(parsed);
  if (normalized !== parsed) {
    inputEl.value = String(normalized);
  }
}


function normalizeBlogAutoVariationNumberValue(rawValue, fallback = 50) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function normalizeBlogAutoVariationNumberEnabledValue(rawValue, fallback = true) {
  if (typeof rawValue === 'boolean') return rawValue;
  const raw = String(rawValue ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'on', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'off', 'n'].includes(raw)) return false;
  return fallback;
}

function normalizeBlogAutoKeywordReuseGapValue(rawValue, fallback = 15) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function syncBlogAutoVariationNumberUi() {
  const enabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const minWrap = document.getElementById('blog-collect-trends-filter-min-wrap');
  const topWrap = document.getElementById('blog-collect-trends-filter-top-wrap');
  if (!enabledEl) return;
  const enabled = Boolean(enabledEl.checked);

  if (minWrap) {
    const minInput = document.getElementById('blog-collect-trends-filter-min');
    if (minInput) minInput.disabled = !enabled;
    minWrap.classList.toggle('input-disabled', !enabled);
  }
  if (topWrap) {
    const topInput = document.getElementById('blog-collect-trends-filter-top');
    if (topInput) topInput.disabled = !enabled;
    topWrap.classList.toggle('input-disabled', !enabled);
  }
}

function syncBlogAutoVariationTypeUi() {
  const typeEl = document.getElementById('blog-collect-trends-filter-type');
  const minWrap = document.getElementById('blog-collect-trends-filter-min-wrap');
  const topWrap = document.getElementById('blog-collect-trends-filter-top-wrap');
  if (!typeEl || !minWrap || !topWrap) return;

  if (typeEl.value === 'top') {
    minWrap.style.display = 'none';
    topWrap.style.display = 'block';
  } else {
    minWrap.style.display = 'block';
    topWrap.style.display = 'none';
  }
}
function normalizeBlogAutoVariationNumberValue(rawValue, fallback = 50) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function normalizeBlogAutoVariationNumberEnabledValue(rawValue, fallback = true) {
  if (typeof rawValue === 'boolean') return rawValue;
  const str = String(rawValue ?? '').toLowerCase();
  if (str === 'true') return true;
  if (str === 'false') return false;
  return fallback;
}


async function loadBlogCollectSettings() {
  const modeEl = document.getElementById('blog-collect-trends-enabled');
  const trendsTimeEl = document.getElementById('blog-collect-trends-time');
  const variationNewEl = document.getElementById('blog-collect-trends-filter-new');
  const variationDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const variationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');
  setBlogCollectResultText('불러오는 중...');
  try {
    const [data] = await Promise.all([
      fetchJson('/api/v1/settings/major'),
      loadBlogAutoCategoryCatalog({ silent: true })
    ]);
    const fields = data?.fields || {};
    if (modeEl) modeEl.checked = Boolean(fields.COLLECT_TRENDS_ENABLED);
    setSelectedBlogAutoCategories(fields.COLLECT_TRENDS_CATEGORIES || '');
    renderBlogAutoCategoryUi();

    const catVal = String(fields.COLLECT_TRENDS_WP_CATEGORY || '');
    const triggerText = document.getElementById('blog-collect-trends-wp-category-text');
    if (triggerText) {
      triggerText.textContent = catVal || '카테고리 선택 (미지정 시 기본)';
    }
    localStorage.setItem('blog_collect_trends_wp_category_value', catVal);
    localStorage.setItem('blog_collect_trends_wp_category_name', catVal || '카테고리 선택 (미지정 시 기본)');

    // Async Init
    initWpCategorySelector({
      optionsContainerId: 'blog-collect-trends-wp-category-options',
      triggerTextId: 'blog-collect-trends-wp-category-text',
      containerId: 'blog-collect-trends-wp-category-container',
      storagePrefix: 'blog_collect_trends_'
    });

    if (trendsTimeEl) trendsTimeEl.value = String(fields.COLLECT_TRENDS_TIME || '07:30');

    if (variationNewEl) variationNewEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW);
    if (variationDashEl) variationDashEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH);
    const variationTypeEl = document.getElementById('blog-collect-trends-filter-type');
    if (variationNumberEnabledEl) {
      variationNumberEnabledEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER);
    }
    if (variationTypeEl) {
      variationTypeEl.value = String(fields.COLLECT_TRENDS_FILTER_TYPE || 'min');
    }
    if (variationMinEl) {
      const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
      variationMinEl.value = val === '' ? '' : String(val);
    }
    if (variationTopEl) {
      const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
      variationTopEl.value = val === '' ? '' : String(val);
    }
    syncBlogAutoVariationTypeUi();
    syncBlogAutoVariationNumberUi();
    if (keywordReuseGapEl) {
      keywordReuseGapEl.value = String(fields.COLLECT_TRENDS_REUSE_GAP_DAYS || 15);
    }

    const rssGlobalEnabledEl = document.getElementById('blog-collect-rss-enabled');
    if (rssGlobalEnabledEl) rssGlobalEnabledEl.checked = Boolean(fields.COLLECT_RSS_ENABLED ?? false);

    let rssArr = [];
    try { rssArr = typeof fields.COLLECT_RSS_CONFIGS === 'string' ? JSON.parse(fields.COLLECT_RSS_CONFIGS) : fields.COLLECT_RSS_CONFIGS; } catch (e) { }
    renderBlogCollectRssUi(rssArr);

    setBlogCollectResultText([
      '불러오기 완료',
      '- 수집 기준을 확인했습니다.',
      '- 변경사항은 즉시 반영됩니다.'
    ].join('\n'));
  } catch (e) {
    setBlogCollectResultText(`오류: ${e.message}`);
  }
}

async function saveBlogCollectSettings() {
  setBlogCollectResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };

    const uiSettings = getBlogAutoSettingsFromUi();

    const payload = {
      ...fields,
      ...uiSettings,
      COLLECT_RSS_ENABLED: Boolean(document.getElementById('blog-collect-rss-enabled')?.checked),
      COLLECT_RSS_CONFIGS: JSON.stringify(currentRssConfigs)
    };
    await postJson('/api/v1/settings/major', payload);

    setBlogCollectResultText([
      '저장 완료',
      '- 자동수집 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setBlogCollectResultText(`오류: ${e.message}`);
  }
}

async function loadBlogAutoSettings() {
  const publishEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('blog-publish-auto-interval');
  const publishBatchEl = document.getElementById('blog-publish-auto-batch');
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};

    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.PUBLISH_AUTO_BATCH_SIZE || 1);

    const targetChannels = String(fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-publish-target]').forEach(el => {
      el.checked = targetChannels.includes(el.getAttribute('data-publish-target'));
    });

    if (headlessEl) headlessEl.checked = Boolean(fields.PUBLISH_AUTO_HEADLESS ?? true);
    if (document.getElementById('blog-publish-auto-start-time')) document.getElementById('blog-publish-auto-start-time').value = String(fields.PUBLISH_AUTO_START_TIME || '00:00');
    if (document.getElementById('blog-publish-auto-end-time')) document.getElementById('blog-publish-auto-end-time').value = String(fields.PUBLISH_AUTO_END_TIME || '23:59');

    setBlogAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경사항은 즉시 반영됩니다.'
    ].join('\n'));
  } catch (e) {
    setBlogAutoResultText(`오류: ${e.message}`);
  }
}

async function saveBlogAutoSettings() {
  const publishEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('blog-publish-auto-interval');
  const publishBatchEl = document.getElementById('blog-publish-auto-batch');
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };

    const payload = {
      ...fields,
      PUBLISH_AUTO_ENABLED: Boolean(publishEnabledEl?.checked),
      PUBLISH_AUTO_INTERVAL_MIN: parseInt(publishIntervalEl?.value || '60', 10),
      PUBLISH_AUTO_BATCH_SIZE: parseInt(publishBatchEl?.value || '1', 10),
      PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(','),
      PUBLISH_AUTO_HEADLESS: Boolean(headlessEl?.checked),
      PUBLISH_AUTO_START_TIME: (document.getElementById('blog-publish-auto-start-time')?.value || '00:00').trim(),
      PUBLISH_AUTO_END_TIME: (document.getElementById('blog-publish-auto-end-time')?.value || '23:59').trim()
    };

    await postJson('/api/v1/settings/major', payload);

    setBlogAutoResultText([
      '저장 완료',
      '- 자동발행 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setBlogAutoResultText(`오류: ${e.message}`);
  }
}

async function runBlogCollectTrendsManual() {
  if (!guardUiConfigReady('트렌드 수동 실행')) return;
  const resultEl = document.getElementById('blog-collect-trends-result');
  const runDateEl = document.getElementById('blog-collect-trends-date');

  const rawDate = String(runDateEl?.value || '').trim();

  const confirmMessage = rawDate ? `${rawDate} 기준으로 트렌드 수집을 수동 실행하시겠습니까?` : `오늘 날짜를 기준으로 트렌드 수집을 수동 실행하시겠습니까?`;
  if (await showUiConfirm(confirmMessage) === false) return;

  if (resultEl) resultEl.textContent = '트렌드 수집 실행 중...';
  try {
    const settings = getBlogAutoSettingsFromUi();
    const data = await postJson('/api/v1/auto/collect/trends/run', { trendDate: rawDate, settings });
    // Handle both data structures (nested or direct summary) gracefully
    const dataPayload = data?.data || data;
    const summary = dataPayload?.summary || dataPayload || {};

    const lines = [
      '수동 수집 완료',
      `- 트렌드 수집: ${Number(summary?.trendsCollected || 0)}건`,
      `- Topics 추가: ${Number(summary?.trendsToTopics || 0)}건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await loadBlogTopics({ silent: true });
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function runBlogCollectRssManual() {
  if (!guardUiConfigReady('RSS 1회 수집')) return;
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (await showUiConfirm('RSS 수집을 수동 실행하시겠습니까?') === false) return;
  if (resultEl) resultEl.textContent = 'RSS 수집 실행 중...';
  try {
    const data = await postJson('/api/v1/auto/collect/rss/run', {
      settingsOverrides: {
        COLLECT_RSS_CONFIGS: currentRssConfigs
      }
    });
    if (resultEl) resultEl.textContent = `RSS 수집 완료: ${JSON.stringify(data.data?.summary || data)}`;
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function loadShoppingAutoSettings() {
  const modeEl = document.getElementById('shopping-auto-mode');
  const dailyPostsEl = document.getElementById('shopping-auto-daily-posts');
  const timeEl = document.getElementById('shopping-auto-time');
  const notifyEnabledEl = document.getElementById('shopping-auto-notify-enabled');
  const headlessEl = document.getElementById('shopping-auto-headless');
  setShoppingAutoResultText('불러오는 중...');
  try {
    const [data] = await Promise.all([
      fetchJson('/api/v1/settings/major'),
      loadShoppingAutoPlanLimit({ silent: true })
    ]);
    const fields = data?.fields || {};
    if (modeEl) modeEl.checked = Boolean(fields.SHOPPING_AUTO_MODE);
    if (headlessEl) headlessEl.checked = Boolean(fields.BLOG_AUTO_HEADLESS ?? fields.HEADLESS ?? true);
    if (dailyPostsEl) dailyPostsEl.value = String(fields.SHOPPING_AUTO_DAILY_POSTS ?? 3);
    applyShoppingAutoDailyPostsLimitUi();
    if (timeEl) timeEl.value = String(fields.SHOPPING_AUTO_TIME || '07:50');
    if (notifyEnabledEl) {
      notifyEnabledEl.checked = false;
      notifyEnabledEl.disabled = true;
    }
    setShoppingAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경사항은 즉시 반영됩니다.'
    ].join('\n'));
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
  }
}

async function saveShoppingAutoSettings() {
  const modeEl = document.getElementById('shopping-auto-mode');
  const dailyPostsEl = document.getElementById('shopping-auto-daily-posts');
  const timeEl = document.getElementById('shopping-auto-time');
  const headlessEl = document.getElementById('shopping-auto-headless');
  setShoppingAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };
    const dailyPosts = normalizeShoppingAutoDailyPostsValue(dailyPostsEl?.value || '3');
    if (dailyPostsEl) dailyPostsEl.value = String(dailyPosts);
    const payload = {
      ...fields,
      SHOPPING_AUTO_MODE: Boolean(modeEl?.checked),
      SHOPPING_AUTO_DAILY_POSTS: dailyPosts,
      SHOPPING_AUTO_TIME: (timeEl?.value || '07:50').trim(),
      SHOPPING_AUTO_NOTIFY_ENABLED: false,
      BLOG_AUTO_HEADLESS: Boolean(headlessEl?.checked)
    };
    const saved = await postJson('/api/v1/settings/major', payload);
    const savedFields = saved?.fields || {};
    if (modeEl) modeEl.checked = Boolean(savedFields.SHOPPING_AUTO_MODE);
    if (headlessEl) headlessEl.checked = Boolean(savedFields.BLOG_AUTO_HEADLESS ?? savedFields.HEADLESS ?? true);
    if (dailyPostsEl) dailyPostsEl.value = String(savedFields.SHOPPING_AUTO_DAILY_POSTS ?? 3);
    applyShoppingAutoDailyPostsLimitUi();
    if (timeEl) timeEl.value = String(savedFields.SHOPPING_AUTO_TIME || '07:50');
    setShoppingAutoResultText([
      '저장 완료',
      '- 쇼핑 자동발행 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
  }
}

async function runShoppingAutoManual() {
  if (!guardUiConfigReady('쇼핑 자동발행 수동 실행')) return;
  if (shoppingAutoManualRunInFlight) return;

  const resultEl = document.getElementById('shopping-auto-result');
  const batchEl = document.getElementById('shopping-publish-auto-batch');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');

  const shouldProceed = await showUiConfirm('쇼핑커넥트 자동발행 파이프라인을 수동 실행하시겠습니까?', {
    title: '수동 실행 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed === false) {
    if (resultEl) resultEl.textContent = '수동 실행이 취소되었습니다.';
    return;
  }

  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const targets = Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  shoppingAutoManualRunInFlight = true;
  if (resultEl) resultEl.textContent = '쇼핑 자동발행 파이프라인 실행 중...';
  pauseDashboardPolling();
  try {
    const data = await postJson('/api/v1/auto/shopping/run', {
      settingsOverrides: {
        SHOPPING_PUBLISH_AUTO_BATCH_SIZE: batchSize,
        SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: targets,
        SHOPPING_PUBLISH_AUTO_HEADLESS: headless
      }
    });
    const summary = data?.summary || {};
    const lines = [
      '쇼핑 수동 실행 완료',
      `- 시도/성공: ${Number(summary?.attempted || 0)} / ${Number(summary?.success || 0)}건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await Promise.all([
      loadDashboard(),
      loadBlogShopping({ silent: true })
    ]);
  } catch (e) {
    console.error('[Shopping][ManualRun] Failed:', e);
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  } finally {
    shoppingAutoManualRunInFlight = false;
    resumeDashboardPolling();
  }
}

async function runBlogPublishAutoManual() {
  if (!guardUiConfigReady('자동발행 수동 실행')) return;
  if (blogAutoManualRunInFlight) return;

  const batchEl = document.getElementById('blog-publish-auto-batch');
  const headlessEl = document.getElementById('blog-publish-auto-headless');
  const resultEl = document.getElementById('blog-publish-auto-result');
  if (await showUiConfirm('큐에서 가져와서 수동 발행을 시도하시겠습니까?') === false) return;

  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const targets = Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  blogAutoManualRunInFlight = true;
  if (resultEl) resultEl.textContent = '발행 파이프라인 실행 중...';

  try {
    const data = await postJson('/api/v1/auto/publish/run', {
      settingsOverrides: {
        PUBLISH_AUTO_BATCH_SIZE: batchSize,
        PUBLISH_AUTO_TARGET_CHANNELS: targets,
        PUBLISH_AUTO_HEADLESS: headless
      }
    });
    const summary = data?.summary || {};
    const lines = [
      '수동 실행 완료',
      `- 블로그 발행 시도/성공: ${Number(summary?.blogAttempted || 0)} / ${Number(summary?.blogSuccess || 0)}건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\\n');
    await Promise.all([
      loadDashboard(),
      loadBlogTopics({ silent: true })
    ]);
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  } finally {
    blogAutoManualRunInFlight = false;
  }
}

function bindActions() {
  document.querySelectorAll('.app-title').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelector('.nav-btn[data-view="dashboard"]').click();
    });
  });

  // Logs 위젯 이벤트 (Pill 탭 전환)
  const logsTabBtns = Array.from(document.querySelectorAll('.logs-tab-btn'));
  logsTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      logsTabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const tabName = e.target.getAttribute('data-logs-tab');
      document.querySelectorAll('.logs-tab-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`logs-tab-${tabName}`).style.display = 'block';
      if (tabName === 'system') loadLogFiles();
      else loadDashboardLogs();
    });
  });

  const logsActivityRefreshBtn = document.getElementById('logs-activity-refresh-btn');
  if (logsActivityRefreshBtn) {
    logsActivityRefreshBtn.addEventListener('click', () => {
      loadDashboardLogs();
      logsActivityRefreshBtn.textContent = '불러오는 중...';
      setTimeout(() => logsActivityRefreshBtn.textContent = '새로고침', 500);
    });
  }

  const logsSystemFileSelect = document.getElementById('logs-system-file-select');
  const logsSystemRefreshBtn = document.getElementById('logs-system-refresh-btn');
  if (logsSystemFileSelect) {
    logsSystemFileSelect.addEventListener('change', loadSystemLog);
  }
  if (logsSystemRefreshBtn) {
    logsSystemRefreshBtn.addEventListener('click', () => {
      loadSystemLog();
      logsSystemRefreshBtn.textContent = '불러오는 중...';
      setTimeout(() => logsSystemRefreshBtn.textContent = '현재 파일 새로고침', 500);
    });
  }

  const dialogBackdrop = document.getElementById('ui-dialog-backdrop');
  const dialogConfirmBtn = document.getElementById('ui-dialog-confirm');
  const dialogCancelBtn = document.getElementById('ui-dialog-cancel');
  if (dialogConfirmBtn) {
    dialogConfirmBtn.addEventListener('click', () => closeUiDialog(true));
  }
  if (dialogCancelBtn) {
    dialogCancelBtn.addEventListener('click', () => closeUiDialog(false));
  }
  if (dialogBackdrop) {
    dialogBackdrop.addEventListener('click', (e) => {
      if (e.target === dialogBackdrop) closeUiDialog(false);
    });
  }
  document.querySelectorAll('.label-help').forEach((helpEl) => {
    helpEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    helpEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backdrop = document.getElementById('ui-dialog-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) {
      closeUiDialog(false);
    }
  });

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadConfigStatus().finally(() => loadDashboard());
    });
  }

  const saveBtn = document.getElementById('quick-save-btn');
  const publishBtn = document.getElementById('quick-publish-btn');
  const clearBtn = document.getElementById('quick-clear-btn');
  const resultEl = document.getElementById('quick-result');
  let quickPublishInFlight = false;
  let shoppingQuickPublishInFlight = false;

  const buildQuickPayload = (mode) => {
    const targets = [];
    if (document.getElementById('quick-target-naver')?.checked) targets.push('naver');
    if (document.getElementById('quick-target-wordpress')?.checked) targets.push('wordpress');

    const payload = {
      subject: (document.getElementById('quick-subject')?.value || '').trim(),
      keywords: (document.getElementById('quick-keywords')?.value || '').trim(),
      instruction: (document.getElementById('quick-instruction')?.value || '').trim(),
      referenceUrl: (document.getElementById('quick-reference-url')?.value || '').trim(),
      imageGeneration: Boolean(document.getElementById('quick-image-generation')?.checked),
      externalReference: Boolean(document.getElementById('quick-external-reference')?.checked),
      headless: Boolean(document.getElementById('quick-headless')?.checked),
      publishMode: mode,
      targets
    };

    if (targets.includes('wordpress')) {
      payload.category = (localStorage.getItem('last_quick_wp_category_value') || '').trim();
      payload.postStatus = (document.getElementById('quick-wp-post-status')?.value || 'publish').trim();
      payload.scheduleDate = (document.getElementById('quick-wp-schedule-date')?.value || '').trim();
    }

    // [Consolidated] Individual options are now persisted via initGlobalPublishSettingsSync change listeners.

    return payload;
  };

  const runQuickPublish = async (mode) => {
    if (!resultEl) return;
    if (!guardUiConfigReady('빠른발행')) return;
    if (quickPublishInFlight) {
      resultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    quickPublishInFlight = true;
    if (saveBtn) saveBtn.disabled = true;
    if (publishBtn) publishBtn.disabled = true;

    const dummyPayload = buildQuickPayload(mode);

    // [New] WordPress 예약 일시 검증
    if (dummyPayload.targets.includes('wordpress') && dummyPayload.postStatus === 'schedule') {
      if (!dummyPayload.scheduleDate) {
        if (resultEl) resultEl.textContent = '⚠️ 예약 발행을 위해서는 예약 일시를 선택해야 합니다.';
        showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
        if (saveBtn) saveBtn.disabled = false;
        if (publishBtn) publishBtn.disabled = false;
        quickPublishInFlight = false;
        return;
      }
    }

    // [New] Require at least one of Subject, Keywords, or Reference URL
    if (!dummyPayload.subject && !dummyPayload.keywords && !dummyPayload.referenceUrl) {
      const msg = 'Subject, Keywords, 참고 URL 중 최소 하나는 입력해 주세요.';
      if (resultEl) resultEl.textContent = `⚠️ ${msg}`;
      showUiPopup(msg);
      if (saveBtn) saveBtn.disabled = false;
      if (publishBtn) publishBtn.disabled = false;
      quickPublishInFlight = false;
      return;
    }

    const preCheck = checkPublishPrerequisites(dummyPayload.targets);
    if (!preCheck.ok) {
      resultEl.textContent = preCheck.message;
      quickPublishInFlight = false;
      if (saveBtn) saveBtn.disabled = false;
      if (publishBtn) publishBtn.disabled = false;
      return;
    }

    try {
      const actionText = mode === 'append_and_publish' ? '글감 등록 & 발행' : '글감 등록';
      await runWithLiveProgress({
        targetEl: resultEl,
        requestLabel: actionText,
        requestFn: () => postJson('/api/v1/blog/quick-publish', buildQuickPayload(mode))
      });
      await loadDashboard();
    } catch (e) {
      // runWithLiveProgress에서 상세 로그/오류를 이미 표기함
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (publishBtn) publishBtn.disabled = false;
      quickPublishInFlight = false;
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener('click', () => runQuickPublish('append_only'));
  }
  if (publishBtn) {
    publishBtn.addEventListener('click', () => runQuickPublish('append_and_publish'));
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const subjectEl = document.getElementById('quick-subject');
      const keywordsEl = document.getElementById('quick-keywords');
      const instructionEl = document.getElementById('quick-instruction');
      const referenceUrlEl = document.getElementById('quick-reference-url');
      if (subjectEl) subjectEl.value = '';
      if (keywordsEl) keywordsEl.value = '';
      if (instructionEl) instructionEl.value = '';
      if (referenceUrlEl) referenceUrlEl.value = '';

      const wpCategoryText = document.getElementById('quick-wp-category-text');
      const wpStatusEl = document.getElementById('quick-wp-post-status');
      const wpDateEl = document.getElementById('quick-wp-schedule-date');
      if (wpCategoryText) wpCategoryText.textContent = '카테고리 선택 (미지정 시 기본)';
      localStorage.removeItem('last_quick_wp_category_name');
      localStorage.removeItem('last_quick_wp_category_value');

      if (wpStatusEl) wpStatusEl.value = 'publish';
      if (wpDateEl) wpDateEl.value = '';
      if (typeof window.toggleQuickWpScheduleDate === 'function') window.toggleQuickWpScheduleDate();
      if (referenceUrlEl) referenceUrlEl.value = '';
      if (resultEl) resultEl.textContent = '입력 내용을 지웠습니다.';
      subjectEl?.focus();
    });
  }

  const shoppingQuickSaveBtn = document.getElementById('shopping-quick-save-btn');
  const shoppingQuickPublishBtn = document.getElementById('shopping-quick-publish-btn');
  const shoppingQuickResultEl = document.getElementById('shopping-quick-result');
  const shoppingQuickUrlInput = document.getElementById('shopping-quick-url');
  const shoppingQuickProductInput = document.getElementById('shopping-quick-product');
  const buildShoppingQuickPayload = (mode) => {
    const targets = [];
    if (document.getElementById('shopping-quick-target-naver')?.checked) targets.push('naver');
    if (document.getElementById('shopping-quick-target-wordpress')?.checked) targets.push('wordpress');

    const payload = {
      shortUrl: (shoppingQuickUrlInput?.value || '').trim(),
      product: (shoppingQuickProductInput?.value || '').trim(),
      headless: Boolean(document.getElementById('shopping-quick-headless')?.checked),
      publishMode: mode,
      targets
    };

    if (targets.includes('wordpress')) {
      payload.category = (localStorage.getItem('last_shopping_quick_wp_category_value') || '').trim();
      payload.postStatus = (document.getElementById('shopping-quick-wp-post-status')?.value || 'publish').trim();
      payload.scheduleDate = (document.getElementById('shopping-quick-wp-schedule-date')?.value || '').trim();
    }

    return payload;
  };
  const runShoppingQuickPublish = async (mode) => {
    if (!shoppingQuickResultEl) return;
    if (!guardUiConfigReady('쇼핑커넥트 빠른발행')) return;
    if (shoppingQuickPublishInFlight) {
      shoppingQuickResultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    shoppingQuickPublishInFlight = true;
    if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = true;
    if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = true;

    const dummyPayload = buildShoppingQuickPayload(mode);
    const preCheck = checkPublishPrerequisites(dummyPayload.targets);
    if (!preCheck.ok) {
      shoppingQuickResultEl.textContent = preCheck.message;
      shoppingQuickPublishInFlight = false;
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      return;
    }

    try {
      const actionText = mode === 'append_and_publish' ? '쇼핑 글감 등록 & 발행' : '쇼핑 글감 등록';
      await runWithLiveProgress({
        targetEl: shoppingQuickResultEl,
        requestLabel: actionText,
        requestFn: () => postJson('/api/v1/shopping/quick-publish', buildShoppingQuickPayload(mode))
      });
      await Promise.all([loadDashboard(), loadBlogShopping({ silent: true })]);
    } catch (e) {
      // runWithLiveProgress에서 상세 로그/오류를 이미 표기함
    } finally {
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      shoppingQuickPublishInFlight = false;
    }
  };

  if (shoppingQuickSaveBtn) {
    shoppingQuickSaveBtn.addEventListener('click', () => runShoppingQuickPublish('append_only'));
  }
  if (shoppingQuickPublishBtn) {
    shoppingQuickPublishBtn.addEventListener('click', () => runShoppingQuickPublish('append_and_publish'));
  }

  const blogTabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const shoppingTabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const blogTrendsDateInput = document.getElementById('blog-trends-date');
  const blogTrendsQFilter = document.getElementById('blog-trends-q-filter');
  const blogTrendsQClearBtn = document.getElementById('blog-trends-q-clear-btn');
  const blogTrendsCollectBtn = document.getElementById('blog-trends-collect-btn');
  const blogTrendsRefreshBtn = document.getElementById('blog-trends-refresh-btn');
  const blogTrendsSearchBtn = document.getElementById('blog-trends-search-btn');
  const blogTrendsToTopicsBtn = document.getElementById('blog-trends-to-topics-btn');
  const blogTrendsPrevBtn = document.getElementById('blog-trends-page-prev');
  const blogTrendsNextBtn = document.getElementById('blog-trends-page-next');
  const blogRefreshBtn = document.getElementById('blog-refresh-btn');
  const blogBatchBtn = document.getElementById('blog-batch-btn');
  const blogTopicsPrevBtn = document.getElementById('blog-topics-page-prev');
  const blogTopicsNextBtn = document.getElementById('blog-topics-page-next');
  const blogTopicsQClearBtn = document.getElementById('blog-topics-q-clear-btn');
  const shoppingRefreshBtn = document.getElementById('shopping-refresh-btn');
  const shoppingQClearBtn = document.getElementById('shopping-q-clear-btn');
  const shoppingBatchBtn = document.getElementById('shopping-batch-btn');
  const shoppingStatusFilter = document.getElementById('shopping-status-filter');
  const shoppingQFilter = document.getElementById('shopping-q-filter');
  const shoppingPrevBtn = document.getElementById('shopping-page-prev');
  const shoppingNextBtn = document.getElementById('shopping-page-next');
  const blogStatusFilter = document.getElementById('blog-status-filter');
  const blogQFilter = document.getElementById('blog-q-filter');
  const blogTrendsTableBody = document.getElementById('blog-trends-table-body');
  const blogTopicsTableBody = document.getElementById('blog-table-body');
  const shoppingTableBody = document.getElementById('shopping-table-body');
  const sortableHeaders = Array.from(document.querySelectorAll('.data-table th.sortable'));

  blogTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.blogTab || '');
      activateBlogTab(tabName, { forceReload: true });
    });
  });
  shoppingTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.shoppingTab || '');
      activateShoppingTab(tabName, { forceReload: true });
    });
  });

  if (blogTrendsCollectBtn) {
    blogTrendsCollectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBlogTrendsCollect();
    });
  }
  if (blogTrendsRefreshBtn) blogTrendsRefreshBtn.addEventListener('click', () => loadBlogTrends());
  if (blogTrendsSearchBtn) {
    blogTrendsSearchBtn.addEventListener('click', () => {
      setPageInfo('trends', { offset: 0 });
      loadBlogTrends();
    });
  }
  if (blogTrendsQClearBtn) {
    blogTrendsQClearBtn.addEventListener('click', () => {
      if (blogTrendsQFilter) blogTrendsQFilter.value = '';
      setPageInfo('trends', { offset: 0 });
      loadBlogTrends();
      blogTrendsQFilter?.focus();
    });
  }
  if (blogTrendsToTopicsBtn) blogTrendsToTopicsBtn.addEventListener('click', runTrendsToTopics);
  if (blogTrendsQFilter) {
    blogTrendsQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('trends', { offset: 0 });
        loadBlogTrends();
      }
    });
  }
  // 날짜 입력창 Enter로 수집을 바로 실행하지 않는다.
  // (중복 호출/오동작 방지)
  if (blogTrendsPrevBtn) {
    blogTrendsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTrends();
    });
  }
  if (blogTrendsNextBtn) {
    blogTrendsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTrends();
    });
  }

  if (blogRefreshBtn) blogRefreshBtn.addEventListener('click', loadBlogTopics);
  if (blogTopicsQClearBtn) {
    blogTopicsQClearBtn.addEventListener('click', () => {
      if (blogQFilter) blogQFilter.value = '';
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
      blogQFilter?.focus();
    });
  }
  if (blogBatchBtn) blogBatchBtn.addEventListener('click', runBlogBatchAction);
  const blogDeleteBatchBtn = document.getElementById('blog-delete-batch-btn');
  if (blogDeleteBatchBtn) {
    blogDeleteBatchBtn.addEventListener('click', async () => {
      const rowIndices = Array.from(blogSelectedRowIndices);
      if (rowIndices.length === 0) {
        showUiPopup('삭제할 글감을 선택해 주세요.');
        return;
      }
      if (!confirm(`선택한 ${rowIndices.length}개의 글감을 삭제하시겠습니까?\n구글 시트에서도 행이 영구 삭제됩니다.`)) {
        return;
      }
      const resultBox = document.getElementById('blog-action-result');
      if (resultBox) resultBox.textContent = '글감 삭제 중...';
      try {
        await postJson('/api/v1/blog/topics/delete', { rowIndices });
        blogSelectedRowIndices.clear();
        updateBlogSelectionUi();
        await loadBlogTopics();
        if (resultBox) resultBox.textContent = `성공: ${rowIndices.length}개의 글감을 삭제했습니다.`;
      } catch (err) {
        if (resultBox) resultBox.textContent = `삭제 실패: ${err.message}`;
        showUiPopup(`삭제 실패: ${err.message}`);
      }
    });
  }
  if (shoppingRefreshBtn) shoppingRefreshBtn.addEventListener('click', loadBlogShopping);
  if (shoppingQClearBtn) {
    shoppingQClearBtn.addEventListener('click', () => {
      if (shoppingQFilter) shoppingQFilter.value = '';
      setPageInfo('shopping', { offset: 0 });
      loadBlogShopping();
      shoppingQFilter?.focus();
    });
  }
  if (shoppingBatchBtn) shoppingBatchBtn.addEventListener('click', runShoppingBatchAction);
  const shoppingDeleteBatchBtn = document.getElementById('shopping-delete-batch-btn');
  if (shoppingDeleteBatchBtn) {
    shoppingDeleteBatchBtn.addEventListener('click', async () => {
      const rowIndices = Array.from(blogShoppingSelectedRowIndices);
      if (rowIndices.length === 0) {
        showUiPopup('삭제할 상품을 선택해 주세요.');
        return;
      }
      if (!confirm(`선택한 ${rowIndices.length}개의 상품을 삭제하시겠습니까?\n구글 시트에서도 행이 영구 삭제됩니다.`)) {
        return;
      }
      const shoppingResultBox = document.getElementById('shopping-action-result');
      if (shoppingResultBox) shoppingResultBox.textContent = '상품 삭제 중...';
      try {
        await postJson('/api/v1/shopping/topics/delete', { rowIndices });
        blogShoppingSelectedRowIndices.clear();
        updateShoppingSelectionUi();
        await loadBlogShopping();
        if (shoppingResultBox) shoppingResultBox.textContent = `성공: ${rowIndices.length}개의 상품을 삭제했습니다.`;
      } catch (err) {
        if (shoppingResultBox) shoppingResultBox.textContent = `삭제 실패: ${err.message}`;
        showUiPopup(`삭제 실패: ${err.message}`);
      }
    });
  }
  if (shoppingStatusFilter) {
    shoppingStatusFilter.addEventListener('change', () => {
      setPageInfo('shopping', { offset: 0 });
      loadBlogShopping();
    });
  }
  if (shoppingQFilter) {
    shoppingQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('shopping', { offset: 0 });
        loadBlogShopping();
      }
    });
  }
  if (shoppingPrevBtn) {
    shoppingPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('shopping');
      setPageInfo('shopping', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogShopping();
    });
  }
  if (shoppingNextBtn) {
    shoppingNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('shopping');
      setPageInfo('shopping', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogShopping();
    });
  }
  if (blogStatusFilter) {
    blogStatusFilter.addEventListener('change', () => {
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
    });
  }
  if (blogQFilter) {
    blogQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('topics', { offset: 0 });
        loadBlogTopics();
      }
    });
  }
  if (blogTopicsPrevBtn) {
    blogTopicsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTopics();
    });
  }
  if (blogTopicsNextBtn) {
    blogTopicsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTopics();
    });
  }

  // Select All Header Checkbox Listeners
  const trendsSelectAll = document.getElementById('blog-trends-table-select-all');
  if (trendsSelectAll) {
    trendsSelectAll.addEventListener('change', () => {
      const checked = trendsSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.trend-row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogTrendsSelectedRowIndices.add(rowIndex);
        else blogTrendsSelectedRowIndices.delete(rowIndex);
      });
      updateTrendsSelectionUi();
    });
  }

  const blogSelectAll = document.getElementById('blog-table-select-all');
  if (blogSelectAll) {
    blogSelectAll.addEventListener('change', () => {
      const checked = blogSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogSelectedRowIndices.add(rowIndex);
        else blogSelectedRowIndices.delete(rowIndex);
      });
      updateBlogSelectionUi();
    });
  }

  const shoppingSelectAll = document.getElementById('shopping-table-select-all');
  if (shoppingSelectAll) {
    shoppingSelectAll.addEventListener('change', () => {
      const checked = shoppingSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.shopping-row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogShoppingSelectedRowIndices.add(rowIndex);
        else blogShoppingSelectedRowIndices.delete(rowIndex);
      });
      updateShoppingSelectionUi();
    });
  }

  if (blogTrendsTableBody) {
    blogTrendsTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.trend-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findTrendByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogTrendsSelectedRowIndices.add(rowIndex);
      } else {
        blogTrendsSelectedRowIndices.delete(rowIndex);
      }
      updateTrendsSelectionUi();
    });
  }

  if (blogTopicsTableBody) {
    blogTopicsTableBody.addEventListener('change', async (e) => {
      const selector = e.target?.closest('input.row-selector');
      if (selector) {
        const rowIndex = Number(selector.value);
        if (!Number.isInteger(rowIndex)) return;
        if (selector.checked) {
          blogSelectedRowIndices.add(rowIndex);
        } else {
          blogSelectedRowIndices.delete(rowIndex);
        }
        updateBlogSelectionUi();
        return;
      }

      const toggle = e.target?.closest('input.inline-toggle');
      if (toggle) {
        const rowIndex = Number(toggle.dataset.rowIndex);
        const field = String(toggle.dataset.field || '');
        if (!Number.isInteger(rowIndex) || !['imageGeneration', 'externalReference'].includes(field)) return;
        const patch = {};
        patch[field] = Boolean(toggle.checked);
        try {
          await saveBlogRowPatch(rowIndex, patch, { silent: true });
        } catch (err) {
          toggle.checked = !toggle.checked;
          const resultBox = document.getElementById('blog-action-result');
          if (resultBox) resultBox.textContent = `오류: ${err.message}`;
        }
      }
    });

    blogTopicsTableBody.addEventListener('click', (e) => {
      if (e.target?.closest('.inline-editor')) return;
      const cell = e.target?.closest('td.editable-cell');
      if (!cell) return;
      startBlogInlineEdit(cell);
    });
  }

  if (shoppingTableBody) {
    shoppingTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.shopping-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findShoppingByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogShoppingSelectedRowIndices.add(rowIndex);
      } else {
        blogShoppingSelectedRowIndices.delete(rowIndex);
      }
      updateShoppingSelectionUi();
    });

    shoppingTableBody.addEventListener('click', (e) => {
      if (e.target?.closest('.inline-editor')) return;
      const cell = e.target?.closest('td.editable-cell');
      if (!cell) return;
      startShoppingInlineEdit(cell);
    });
  }

  sortableHeaders.forEach((th) => {
    const onSort = () => {
      const tableName = String(th.dataset.sortTable || '').trim();
      const key = String(th.dataset.sortKey || '').trim();
      if (!tableName || !key) return;
      toggleTableSort(tableName, key);
    };
    th.addEventListener('click', onSort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort();
      }
    });
  });

  const settingsMajorRefreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const settingsMajorSaveBtns = document.querySelectorAll('.settings-major-save-btn');
  const settingsAdvancedRefreshBtn = document.getElementById('settings-advanced-refresh-btn');
  const settingsAdvancedSaveBtn = document.getElementById('settings-advanced-save-btn');
  const settingsNaverLoginBtn = document.getElementById('settings-naver-login-btn');
  const settingsOpenGoogleSheetBtn = document.getElementById('settings-open-google-sheet-btn');
  const settingsGoogleAuthFileBtn = document.getElementById('settings-google-auth-file');
  const settingsGoogleAuthSaveBtn = document.getElementById('settings-google-auth-save-btn');
  const settingsTypingSpeedEl = document.getElementById('settings-typing-speed');
  const blogCollectRefreshBtn = document.getElementById('blog-collect-trends-refresh-btn');
  const blogCollectSaveBtn = document.getElementById('blog-collect-trends-save-btn');
  const blogCollectTrendsRunBtn = document.getElementById('blog-collect-trends-run-btn');
  const blogCollectRssRunBtn = document.getElementById('blog-collect-rss-run-btn');
  const blogCollectRssAddBtn = document.getElementById('blog-collect-rss-add-btn');
  const blogAutoRefreshBtn = document.getElementById('blog-publish-auto-refresh-btn');
  const blogAutoSaveBtn = document.getElementById('blog-publish-auto-save-btn');
  const blogAutoCategoryOptionsEls = Array.from(document.querySelectorAll('[data-blog-category-options]'));
  const blogAutoVariationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const blogAutoVariationNumberInputEl = document.getElementById('blog-collect-trends-filter-min');
  const blogAutoVariationTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const blogAutoRunBtn = document.getElementById('blog-publish-auto-run-btn');
  const shoppingAutoRefreshBtn = document.getElementById('shopping-auto-refresh-btn');
  const shoppingAutoSaveBtn = document.getElementById('shopping-auto-save-btn');
  const shoppingAutoRunBtn = document.getElementById('shopping-publish-auto-run-btn');
  const shoppingAutoDailyPostsInputEl = document.getElementById('shopping-auto-daily-posts');
  const settingsTypingPreviewInputEl = document.getElementById('settings-typing-preview-input');
  const settingsTypingPreviewReplayBtn = document.getElementById('settings-typing-preview-replay');
  const settingsTabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const settingsMajorAutoSaveInputs = [
    document.getElementById('settings-listen-port'),
    document.getElementById('settings-naver-id'),
    document.getElementById('settings-wordpress-url'),
    document.getElementById('settings-wordpress-user-id'),
    document.getElementById('settings-wordpress-app-password'),
    document.getElementById('settings-gemini-api-key'),
    document.getElementById('settings-google-sheet-url'),
    document.getElementById('blog-collect-trends-time'),
    document.getElementById('blog-collect-trends-filter-min'),
    document.getElementById('blog-collect-trends-filter-top'),
    document.getElementById('blog-collect-trends-reuse-gap'),
    document.getElementById('blog-publish-auto-interval'),
    document.getElementById('blog-publish-auto-batch'),
    document.getElementById('blog-publish-auto-start-time'),
    document.getElementById('blog-publish-auto-end-time'),
    document.getElementById('shopping-publish-auto-interval'),
    document.getElementById('shopping-publish-auto-batch'),
    document.getElementById('shopping-publish-auto-start-time'),
    document.getElementById('shopping-publish-auto-end-time'),
    document.getElementById('settings-notify-telegram-bot-token'),
    document.getElementById('settings-notify-telegram-chat-id'),
    document.getElementById('settings-notify-bitly-token'),
  ].filter(Boolean);
  const settingsMajorAutoSaveSelects = [
    document.getElementById('settings-listen-host'),

    document.getElementById('settings-typing-speed'),
    document.getElementById('blog-collect-trends-filter-type')
  ].filter(Boolean);
  const settingsMajorAutoSaveChecks = [
    document.getElementById('blog-collect-trends-enabled'),
    document.getElementById('blog-collect-trends-filter-new'),
    document.getElementById('blog-collect-trends-filter-dash'),
    document.getElementById('blog-collect-trends-filter-number-enabled'),
    document.getElementById('blog-publish-auto-enabled'),
    document.getElementById('blog-publish-auto-headless'),
    document.getElementById('shopping-publish-auto-enabled'),
    document.getElementById('shopping-publish-auto-headless'),
    document.getElementById('blog-publish-auto-notify-enabled'),
    document.getElementById('shopping-publish-auto-notify-enabled'),
    document.getElementById('settings-notify-telegram-enabled'),
    ...Array.from(document.querySelectorAll('[data-publish-target]')),
    ...Array.from(document.querySelectorAll('[data-shopping-publish-target]'))
  ].filter(Boolean);

  settingsMajorRefreshBtns.forEach(btn => btn.addEventListener('click', loadSettingsMajor));
  settingsMajorSaveBtns.forEach(btn => btn.addEventListener('click', () => saveSettingsMajor({ mode: 'manual' })));
  if (settingsNaverLoginBtn) settingsNaverLoginBtn.addEventListener('click', startNaverLoginFromUi);
  const settingsWordPressVerifyBtn = document.getElementById('settings-wordpress-verify-btn');
  if (settingsWordPressVerifyBtn) settingsWordPressVerifyBtn.addEventListener('click', verifyWordPressAuthFromUi);
  if (settingsOpenGoogleSheetBtn) settingsOpenGoogleSheetBtn.addEventListener('click', openGoogleSheetFromUi);
  if (settingsGoogleAuthFileBtn) settingsGoogleAuthFileBtn.addEventListener('change', handleGoogleAuthFileUpload);
  if (settingsGoogleAuthSaveBtn) settingsGoogleAuthSaveBtn.addEventListener('click', handleGoogleAuthTextSave);
  if (settingsTypingSpeedEl) settingsTypingSpeedEl.addEventListener('change', playSettingsTypingPreview);
  if (blogCollectRefreshBtn) blogCollectRefreshBtn.addEventListener('click', loadBlogCollectSettings);
  if (blogCollectSaveBtn) blogCollectSaveBtn.addEventListener('click', saveBlogCollectSettings);
  if (blogCollectTrendsRunBtn) blogCollectTrendsRunBtn.addEventListener('click', runBlogCollectTrendsManual);
  if (blogCollectRssRunBtn) blogCollectRssRunBtn.addEventListener('click', runBlogCollectRssManual);
  if (blogCollectRssAddBtn) blogCollectRssAddBtn.addEventListener('click', window.addRssConfig);
  if (blogAutoRefreshBtn) blogAutoRefreshBtn.addEventListener('click', loadBlogAutoSettings);
  if (blogAutoSaveBtn) blogAutoSaveBtn.addEventListener('click', saveBlogAutoSettings);
  if (blogAutoRunBtn) blogAutoRunBtn.addEventListener('click', runBlogPublishAutoManual);
  if (blogAutoVariationNumberEnabledEl) {
    blogAutoVariationNumberEnabledEl.addEventListener('change', syncBlogAutoVariationNumberUi);
  }
  if (blogAutoVariationTypeEl) {
    blogAutoVariationTypeEl.addEventListener('change', syncBlogAutoVariationTypeUi);
  }
  if (shoppingAutoRefreshBtn) shoppingAutoRefreshBtn.addEventListener('click', loadShoppingAutoSettings);
  if (shoppingAutoSaveBtn) shoppingAutoSaveBtn.addEventListener('click', saveShoppingAutoSettings);
  if (shoppingAutoRunBtn) shoppingAutoRunBtn.addEventListener('click', runShoppingAutoManual);
  blogAutoCategoryOptionsEls.forEach((containerEl) => {
    containerEl.addEventListener('click', (e) => {
      const btn = e.target?.closest('button[data-blog-collect-trends-category-toggle]');
      if (!btn) return;
      const category = normalizeCategoryToken(btn.dataset.blogCollectTrendsCategoryToggle || '');
      if (!category) return;
      if (blogAutoCategorySelected.has(category)) blogAutoCategorySelected.delete(category);
      else blogAutoCategorySelected.add(category);
      renderBlogAutoCategoryUi();
      scheduleSettingsMajorAutoSave({ immediate: true });
    });
  });
  if (blogAutoVariationNumberInputEl) {
    blogAutoVariationNumberInputEl.addEventListener('blur', () => {
      const normalized = normalizeBlogAutoVariationNumberValue(blogAutoVariationNumberInputEl.value, 50);
      blogAutoVariationNumberInputEl.value = normalized === '' ? '' : String(normalized);
    });
  }
  if (blogAutoVariationNumberEnabledEl) {
    blogAutoVariationNumberEnabledEl.addEventListener('change', () => {
      syncBlogAutoVariationNumberUi();
    });
  }
  if (shoppingAutoDailyPostsInputEl) {
    shoppingAutoDailyPostsInputEl.addEventListener('input', () => {
      clampShoppingAutoDailyPostsInputValue({ force: false });
    });
    shoppingAutoDailyPostsInputEl.addEventListener('blur', () => {
      clampShoppingAutoDailyPostsInputValue({ force: true });
      applyShoppingAutoDailyPostsLimitUi();
    });
  }
  const settingsNotifyTelegramTestBtn = document.getElementById('settings-notify-telegram-test-btn');
  if (settingsNotifyTelegramTestBtn) {
    settingsNotifyTelegramTestBtn.addEventListener('click', async () => {
      const botToken = (document.getElementById('settings-notify-telegram-bot-token')?.value || '').trim();
      const chatId = (document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim();
      const resultEl = document.getElementById('settings-notify-telegram-test-result');

      if (!botToken || !chatId) {
        if (resultEl) {
          resultEl.textContent = '❌ 봇 토큰과 챗 ID를 입력해주세요.';
          resultEl.style.color = 'var(--danger)';
        }
        return;
      }

      settingsNotifyTelegramTestBtn.disabled = true;
      if (resultEl) {
        resultEl.textContent = '⏳ 테스트 중...';
        resultEl.style.color = 'var(--text-muted)';
      }

      try {
        const res = await postJson('/api/v1/settings/test-telegram', { botToken, chatId });
        if (resultEl) {
          resultEl.textContent = '✅ 성공! 텔레그램 메시지를 확인하세요.';
          resultEl.style.color = 'var(--success)';
        }
      } catch (e) {
        if (resultEl) {
          resultEl.textContent = '❌ 실패: ' + e.message;
          resultEl.style.color = 'var(--danger)';
        }
      } finally {
        settingsNotifyTelegramTestBtn.disabled = false;
      }
    });
  }
  if (settingsTypingPreviewReplayBtn) settingsTypingPreviewReplayBtn.addEventListener('click', playSettingsTypingPreview);
  if (settingsTypingPreviewInputEl) {
    settingsTypingPreviewInputEl.placeholder = SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
    settingsTypingPreviewInputEl.addEventListener('input', () => {
      setSettingsTypingPreviewMeta('문구가 변경되었습니다. [다시 재생]을 누르거나 입력창을 벗어나면 재생됩니다.');
    });
    settingsTypingPreviewInputEl.addEventListener('blur', () => {
      playSettingsTypingPreview();
    });
  }
  settingsTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateSettingsTab(btn.dataset.settingsTab, { forceReload: true });
    });
  });
  settingsMajorAutoSaveInputs.forEach((inputEl) => {
    inputEl.addEventListener('input', () => scheduleSettingsMajorAutoSave());
    inputEl.addEventListener('blur', () => scheduleSettingsMajorAutoSave({ immediate: true }));
    // type="time" 필드는 change 이벤트가 더 확실하게 저장 트리거임
    if (inputEl.type === 'time') {
      inputEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
    }
  });
  settingsMajorAutoSaveSelects.forEach((selectEl) => {
    selectEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
  });
  settingsMajorAutoSaveChecks.forEach((checkEl) => {
    checkEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
  });
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const fileInput = document.getElementById(`settings-image-file-${slot}`);
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          settingsShoppingImageFileState[slot] = file;
        } else {
          clearStagedSettingsShoppingImage(slot);
        }
        renderSettingsShoppingImageSlot(slot);
      });
    }

    const resetBtn = document.getElementById(`settings-image-reset-${slot}`);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        restoreSettingsShoppingDefault(slot);
      });
    }

    const clearBtn = document.getElementById(`settings-image-clear-${slot}`);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSettingsShoppingOptional(slot);
      });
    }
  });
  if (settingsAdvancedRefreshBtn) settingsAdvancedRefreshBtn.addEventListener('click', loadSettingsAdvanced);
  if (settingsAdvancedSaveBtn) settingsAdvancedSaveBtn.addEventListener('click', saveSettingsAdvanced);

  // Advanced 탭 smart refresh: 편집 추적 + stale 배너 버튼
  const settingsAdvancedContentEl = document.getElementById('settings-advanced-content');
  if (settingsAdvancedContentEl) {
    settingsAdvancedContentEl.addEventListener('input', () => {
      settingsAdvancedContentEl.dataset.editedSinceLoad = 'true';
    });
  }
  const settingsAdvancedStaleReloadBtn = document.getElementById('settings-advanced-stale-reload-btn');
  if (settingsAdvancedStaleReloadBtn) {
    settingsAdvancedStaleReloadBtn.addEventListener('click', () => {
      loadSettingsAdvanced(); // 배너 dismiss는 loadSettingsAdvanced 내부에서 처리
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  checkSetupBanner();
  const settingsCheckUpdateBtn = document.getElementById('settings-check-update-btn');
  if (settingsCheckUpdateBtn) {
    settingsCheckUpdateBtn.addEventListener('click', () => {
      checkUpdate(true);
    });
  }

  try { initClockWidget(); } catch (e) { console.warn('initClockWidget error:', e); }
  try { checkUpdate(false); } catch (e) { console.warn('checkUpdate error:', e); }

  // Sidebar Toggle (Desktop)
  try {
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebar = document.getElementById('sidebar');

    // Restore state
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed && sidebar) {
      sidebar.classList.add('collapsed');
    }

    if (sidebarToggleBtn && sidebar) {
      sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const nowCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar-collapsed', nowCollapsed);

        // Trigger a window resize event to let other components (like tables) adjust if needed
        window.dispatchEvent(new Event('resize'));
      });
    }
  } catch (e) { console.warn('Sidebar toggle init error:', e); }

  // Mobile Menu Toggle
  try {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
      function toggleMenu() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
      }
      mobileMenuBtn.addEventListener('click', toggleMenu);
      sidebarOverlay.addEventListener('click', toggleMenu);

      // Close menu when a navigation button is clicked on mobile
      const navBtns = document.querySelectorAll('.nav-btn');
      navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          if (window.innerWidth <= 960 && sidebar.classList.contains('open')) {
            toggleMenu();
          }
        });
      });
    }
  } catch (e) { console.warn('Mobile menu init error:', e); }

  // Server Control Buttons
  try {
    const restartBtn = document.getElementById('server-restart-btn');
    const stopBtn = document.getElementById('server-stop-btn');

    if (restartBtn) {
      restartBtn.addEventListener('click', async () => {
        const confirmed = await showUiDialog({
          title: '서버 재시작',
          message: '서버를 재시작하시겠습니까?\n잠시 후 자동으로 페이지가 새로고침됩니다.',
          showCancel: true,
          confirmText: '재시작',
          cancelText: '취소'
        });
        if (!confirmed) return;
        restartBtn.disabled = true;
        restartBtn.textContent = '재시작 중...';
        try {
          await postJson('/api/v1/system/restart');
          setTimeout(() => { location.reload(); }, 3500);
        } catch (e) {
          restartBtn.disabled = false;
          restartBtn.textContent = '🔄 재시작';
          await showUiDialog({ title: '오류', message: '재시작에 실패했습니다: ' + e.message });
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        const confirmed = await showUiDialog({
          title: '⚠️ 서버 종료',
          message: '서버를 완전히 종료하시겠습니까?\n\n종료 후에는 이 페이지도 연결이 끊기며,\n다시 시작하려면 터미널에서 수동으로 실행해야 합니다.',
          showCancel: true,
          confirmText: '종료',
          cancelText: '취소'
        });
        if (!confirmed) return;
        stopBtn.disabled = true;
        stopBtn.textContent = '종료 중...';
        try {
          await postJson('/api/v1/system/stop');
        } catch (e) {
          // Connection refused is expected after stop
        }
      });
    }
  } catch (e) { console.warn('Server control init error:', e); }

  // Update Banner Events
  try {
    const updateCloseBtn = document.getElementById('update-close-btn');
    if (updateCloseBtn) {
      updateCloseBtn.addEventListener('click', () => {
        const banner = document.getElementById('update-banner');
        if (banner) banner.classList.add('hidden');
      });
    }

    const updateDetailsBtn = document.getElementById('update-details-btn');
    if (updateDetailsBtn) {
      updateDetailsBtn.addEventListener('click', () => {
        if (uiUpdateInfo && uiUpdateInfo.htmlUrl) {
          window.open(uiUpdateInfo.htmlUrl, '_blank');
        }
      });
    }

    const updateNowBtn = document.getElementById('update-now-btn');
    if (updateNowBtn) {
      updateNowBtn.addEventListener('click', () => {
        applyUpdate();
      });
    }
  } catch (e) { console.warn('Update banner init error:', e); }

  try {
    const dashLogRefreshBtn = document.getElementById('dash-log-refresh-btn');
    if (dashLogRefreshBtn) {
      dashLogRefreshBtn.addEventListener('click', () => {
        loadDashboardLogs();
        dashLogRefreshBtn.textContent = '불러오는 중...';
        setTimeout(() => dashLogRefreshBtn.textContent = '새로고침', 500);
      });
    }
  } catch (e) { console.warn('Dash log refresh init error:', e); }

  try {
    const dashContentRefreshBtn = document.getElementById('dash-content-refresh-btn');
    if (dashContentRefreshBtn) {
      dashContentRefreshBtn.addEventListener('click', async () => {
        const original = dashContentRefreshBtn.textContent;
        dashContentRefreshBtn.textContent = '불러오는 중...';
        dashContentRefreshBtn.disabled = true;
        try {
          await loadDashboardExternalContent({ force: true, silent: false });
        } finally {
          dashContentRefreshBtn.disabled = false;
          dashContentRefreshBtn.textContent = original || '새로고침';
        }
      });
    }
  } catch (e) { console.warn('Dash content refresh init error:', e); }

  try { bindNavigation(); } catch (e) { console.warn('bindNavigation error:', e); }
  try { bindActions(); } catch (e) { console.warn('bindActions error:', e); }
  try { playSettingsTypingPreview(); } catch (e) { console.warn('playSettingsTypingPreview error:', e); }
  try { loadGoogleAuthStatus(); } catch (e) { console.warn('loadGoogleAuthStatus error:', e); }

  // 🚀 설정 초기 로딩 (어느 탭에서든 즉시 발행 가능하도록)
  loadSettingsMajor();

  // 🚀 비동기 병렬 초기화 (블로킹 제거)
  loadConfigStatus().finally(() => {
    console.log('[UI] Initial config status check completed');
  });

  // Unify and Persistence Publish Settings (Headless, Targets)
  initGlobalPublishSettingsSync();

  // Category Search Event (V2 - Custom Dropdown)

  // Category Search Event (V2 - Custom Dropdown)
  const wpCatSearchV2 = document.getElementById('quick-wp-category-search-v2');
  if (wpCatSearchV2) {
    wpCatSearchV2.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const optionsContainer = document.getElementById('quick-wp-category-options-v2');
      if (!optionsContainer) return;

      const options = optionsContainer.querySelectorAll('.custom-select-option');
      let found = false;
      options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        const match = text.includes(q);
        opt.style.display = match ? '' : 'none';
        if (match) found = true;
      });

      // Handle "No results" message
      let noResultEl = optionsContainer.querySelector('.custom-select-no-results');
      if (!found) {
        if (!noResultEl) {
          noResultEl = document.createElement('div');
          noResultEl.className = 'custom-select-no-results';
          noResultEl.textContent = '검색 결과가 없습니다.';
          optionsContainer.appendChild(noResultEl);
        }
      } else if (noResultEl) {
        noResultEl.remove();
      }
    });

    // Prevent closing when clicking search box
    wpCatSearchV2.addEventListener('click', (e) => e.stopPropagation());
  }

  // Shopping Category Search Event (V2 - Custom Dropdown)
  const shoppingWpCatSearchV2 = document.getElementById('shopping-quick-wp-category-search-v2');
  if (shoppingWpCatSearchV2) {
    shoppingWpCatSearchV2.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const optionsContainer = document.getElementById('shopping-quick-wp-category-options-v2');
      if (!optionsContainer) return;

      const options = optionsContainer.querySelectorAll('.custom-select-option');
      let found = false;
      options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        const match = text.includes(q);
        opt.style.display = match ? '' : 'none';
        if (match) found = true;
      });

      // Handle "No results" message
      let noResultEl = optionsContainer.querySelector('.custom-select-no-results');
      if (!found) {
        if (!noResultEl) {
          noResultEl = document.createElement('div');
          noResultEl.className = 'custom-select-no-results';
          noResultEl.textContent = '검색 결과가 없습니다.';
          optionsContainer.appendChild(noResultEl);
        }
      } else if (noResultEl) {
        noResultEl.remove();
      }
    });

    // Prevent closing when clicking search box
    shoppingWpCatSearchV2.addEventListener('click', (e) => e.stopPropagation());
  }

  // Blog Collect Category Search Event
  const blogCollectWpCatSearchV2 = document.getElementById('blog-collect-trends-wp-category-search-v2');
  if (blogCollectWpCatSearchV2) {
    blogCollectWpCatSearchV2.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const optionsContainer = document.getElementById('blog-collect-trends-wp-category-options');
      if (!optionsContainer) return;

      const options = optionsContainer.querySelectorAll('.custom-select-option');
      let found = false;
      options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        const match = text.includes(q);
        opt.style.display = match ? '' : 'none';
        if (match) found = true;
      });

      let noResultEl = optionsContainer.querySelector('.custom-select-no-results');
      if (!found) {
        if (!noResultEl) {
          noResultEl = document.createElement('div');
          noResultEl.className = 'custom-select-no-results';
          noResultEl.textContent = '검색 결과가 없습니다.';
          optionsContainer.appendChild(noResultEl);
        }
      } else if (noResultEl) {
        noResultEl.remove();
      }
    });
    blogCollectWpCatSearchV2.addEventListener('click', (e) => e.stopPropagation());
  }
  // Blog Collect Custom Dropdown Trigger
  const blogCollectWpCatTrigger = document.getElementById('blog-collect-trends-wp-category-trigger');
  const blogCollectWpCatContainer = document.getElementById('blog-collect-trends-wp-category-container');
  if (blogCollectWpCatTrigger && blogCollectWpCatContainer) {
    blogCollectWpCatTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = blogCollectWpCatContainer.classList.contains('open');
      // Close all other custom dropdowns
      document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== blogCollectWpCatContainer) c.classList.remove('open');
      });
      blogCollectWpCatContainer.classList.toggle('open');
      if (!isOpen) {
        // Focus search when opening
        setTimeout(() => blogCollectWpCatSearchV2?.focus(), 50);
      }
    });
  }

  // Custom Dropdown Trigger
  const wpCatTrigger = document.getElementById('quick-wp-category-trigger');
  const wpCatContainer = document.getElementById('quick-wp-category-container');
  if (wpCatTrigger && wpCatContainer) {
    wpCatTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wpCatContainer.classList.contains('open');
      // Close all other custom dropdowns
      document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== wpCatContainer) c.classList.remove('open');
      });
      wpCatContainer.classList.toggle('open');
      if (!isOpen) {
        // Focus search when opening
        setTimeout(() => wpCatSearchV2?.focus(), 50);
      }
    });
  }

  // Shopping Custom Dropdown Trigger
  const shoppingWpCatTrigger = document.getElementById('shopping-quick-wp-category-trigger');
  const shoppingWpCatContainer = document.getElementById('shopping-quick-wp-category-container');
  if (shoppingWpCatTrigger && shoppingWpCatContainer) {
    shoppingWpCatTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = shoppingWpCatContainer.classList.contains('open');
      // Close all other custom dropdowns
      document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== shoppingWpCatContainer) c.classList.remove('open');
      });
      shoppingWpCatContainer.classList.toggle('open');
      if (!isOpen) {
        // Focus search when opening
        setTimeout(() => shoppingWpCatSearchV2?.focus(), 50);
      }
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    wpCatContainer?.classList.remove('open');
    shoppingWpCatContainer?.classList.remove('open');
    blogCollectWpCatContainer?.classList.remove('open');
  });

  // Initial WP Options Sync
  window.toggleQuickWpOptions();

  // 대시보드 별도 로드 (블로킹 방지)
  loadDashboard().finally(() => {
    console.log('[UI] Initial dashboard load attempted');
  });

  // 시트 검사는 백그라운드에서 진행
  setTimeout(() => {
    if (uiConfigReady) {
      ensureSheetsPreflightUi({ silent: true }).then(ready => {
        if (ready) loadDashboard();
      });
    }
  }, 2000);
  loadBlogCollectSettings();
  loadBlogAutoSettings();
  renderBlogLastBatchResult(blogLastBatchResult);
  updateBlogSelectionUi();
  updateTrendsSelectionUi();
  updateShoppingSelectionUi();
  updateSortableHeadersUi();
  renderTrendsPagination();
  renderTopicsPagination();
  renderShoppingPagination();
  setInterval(() => {
    if (isDashboardPollingPaused()) return;
    loadDashboard();
    checkSetupBanner();

    // 자동 새로고침: 로그/이력 뷰가 활성화되어 있으면 함께 갱신
    const logsViewEl = document.getElementById('view-logs');
    if (logsViewEl && logsViewEl.classList.contains('active')) {
      const activeTab = document.querySelector('.logs-tab-btn.active');
      const tabName = activeTab ? activeTab.getAttribute('data-logs-tab') : 'activity';
      if (tabName === 'system') {
        loadSystemLog();
      } else {
        loadDashboardLogs();
      }
    }
  }, 30000);

  // 대시보드 자동발행 "다음 실행"은 분 단위로 상대시간을 갱신
  setInterval(() => {
    renderDashboardAutoSchedule();
  }, 60000);
});

/**
 * Common WordPress Category Custom Select Initializer
 * @param {string} optionsContainerId - ID of the container for dropdown options (e.g., 'quick-wp-category-options-v2')
 * @param {string} triggerTextId - ID of the text element on the trigger button (e.g., 'quick-wp-category-text')
 * @param {string} containerId - ID of the main wrapper (e.g., 'quick-wp-category-container')
 * @param {string} storagePrefix - Prefix for localStorage keys (e.g., 'quick_' or 'shopping_quick_')
 */
async function initWpCategorySelector({ optionsContainerId, triggerTextId, containerId, storagePrefix }) {
  const optionsContainer = document.getElementById(optionsContainerId);
  const triggerText = document.getElementById(triggerTextId);
  const container = document.getElementById(containerId);

  // 이미 렌더링 되어 있고 캐시도 있다면 스킵
  const hasOptions = optionsContainer && optionsContainer.querySelectorAll('.custom-select-option').length > 0;
  if (hasOptions && window.wpCategoryCache) return;

  if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">불러오는 중...</div>';

  try {
    const categories = await window.fetchWpCategories();
    if (Array.isArray(categories)) {
      if (optionsContainer) {
        optionsContainer.innerHTML = '';

        // Default "No Selection" Option
        const defaultOpt = document.createElement('div');
        defaultOpt.className = 'custom-select-option';
        defaultOpt.dataset.value = '';
        defaultOpt.textContent = '카테고리 선택 (미지정 시 기본)';
        optionsContainer.appendChild(defaultOpt);

        // Populate Categories
        categories.forEach(cat => {
          const opt = document.createElement('div');
          opt.className = 'custom-select-option';
          opt.dataset.value = cat.name;
          opt.textContent = `${cat.name} (${cat.count})`;
          optionsContainer.appendChild(opt);
        });

        // Click Listeners
        optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = el.dataset.value;
            const text = el.textContent;

            // Update UI
            if (triggerText) triggerText.textContent = text;
            optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => opt.classList.remove('selected'));
            el.classList.add('selected');

            // Persistence
            localStorage.setItem(`${storagePrefix}wp_category_name`, text);
            localStorage.setItem(`${storagePrefix}wp_category_value`, val);

            // Close
            if (container) container.classList.remove('open');
          });
        });

        // Restore last selected
        const savedName = localStorage.getItem(`${storagePrefix}wp_category_name`);
        const savedVal = localStorage.getItem(`${storagePrefix}wp_category_value`);
        if (savedName && triggerText) {
          triggerText.textContent = savedName;
          const savedEl = Array.from(optionsContainer.querySelectorAll('.custom-select-option')).find(opt => opt.dataset.value === savedVal);
          if (savedEl) savedEl.classList.add('selected');
        }
      }
    } else {
      if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">목록 호출 실패</div>';
    }
  } catch (e) {
    console.error(`WP Categories fetch failed for ${storagePrefix}:`, e);
    if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">호출 오류</div>';
  }
}

// WordPress Quick Publish UI Helpers
window.toggleQuickWpOptions = async function () {
  const panel = document.getElementById('quick-wp-options-panel');
  const checkbox = document.getElementById('quick-target-wordpress');

  if (panel && checkbox) {
    if (checkbox.checked) {
      panel.style.display = 'block';
      await initWpCategorySelector({
        optionsContainerId: 'quick-wp-category-options-v2',
        triggerTextId: 'quick-wp-category-text',
        containerId: 'quick-wp-category-container',
        storagePrefix: 'last_quick_'
      });
    } else {
      panel.style.display = 'none';
    }
  }
};

window.toggleQuickWpScheduleDate = function () {
  const input = document.getElementById('quick-wp-schedule-date');
  const status = document.getElementById('quick-wp-post-status')?.value;
  if (input) {
    input.disabled = (status !== 'schedule');
  }
};

/**
 * Unify and Persistence Publish Settings (Headless, Targets) across all tabs
 */
function initGlobalPublishSettingsSync() {
  const syncGroups = [
    {
      key: 'pub_pref_headless',
      ids: ['quick-headless', 'blog-trends-headless', 'blog-batch-headless', 'shopping-quick-headless', 'shopping-batch-headless', 'shopping-publish-auto-headless', 'blog-publish-auto-headless'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_naver',
      ids: ['quick-target-naver', 'blog-batch-target-naver', 'shopping-quick-target-naver', 'shopping-batch-target-naver', 'blog-publish-auto-target-naver', 'shopping-publish-auto-target-naver'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_wordpress',
      ids: ['quick-target-wordpress', 'blog-batch-target-wordpress', 'shopping-quick-target-wordpress', 'shopping-batch-target-wordpress', 'blog-publish-auto-target-wordpress', 'shopping-publish-auto-target-wordpress'],
      type: 'checkbox',
      default: false
    },
    {
      key: 'pub_pref_image_generation',
      ids: ['quick-image-generation'], // extensible
      type: 'checkbox',
      default: false
    },
    {
      key: 'pub_pref_external_reference',
      ids: ['quick-external-reference'], // extensible
      type: 'checkbox',
      default: true
    }
  ];

  // Helper to update all elements in a group
  const updateGroupUi = (group, value) => {
    group.ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (group.type === 'checkbox') {
        el.checked = (value === 'true' || value === true);
      } else {
        el.value = value;
      }
    });
    // Special Trigger: If WP target changed, sync WP options visibility
    if (group.key === 'pub_pref_target_wordpress') {
      if (typeof toggleQuickWpOptions === 'function') toggleQuickWpOptions();
      if (typeof toggleShoppingQuickWpOptions === 'function') toggleShoppingQuickWpOptions();
    }
  };

  // 1. Initial Load & Apply
  syncGroups.forEach(group => {
    let saved = localStorage.getItem(group.key);
    if (saved === null) {
      saved = String(group.default);
      localStorage.setItem(group.key, saved);
    }
    updateGroupUi(group, saved);
  });

  // 2. Event Listeners for Syncing
  syncGroups.forEach(group => {
    group.ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('change', () => {
        const newValue = (group.type === 'checkbox') ? el.checked : el.value;
        localStorage.setItem(group.key, String(newValue));
        updateGroupUi(group, newValue);
      });
    });
  });

  // 3. Keep other Quick Publish specific options that are not shared but need persistence
  const quickSpecific = [
    { key: 'quick_wp_post_status', id: 'quick-wp-post-status', type: 'select', default: 'publish' },
    { key: 'quick_wp_schedule_date', id: 'quick-wp-schedule-date', type: 'input', default: '' },
    { key: 'shopping_quick_wp_post_status', id: 'shopping-quick-wp-post-status', type: 'select', default: 'publish' },
    { key: 'shopping_quick_wp_schedule_date', id: 'shopping-quick-wp-schedule-date', type: 'input', default: '' }
  ];

  quickSpecific.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;

    // Restore
    const saved = localStorage.getItem(item.key);
    if (saved !== null) el.value = saved;
    else if (item.default) el.value = item.default;

    // Listener
    el.addEventListener('change', () => {
      localStorage.setItem(item.key, el.value);
      if (item.id === 'quick-wp-post-status' && typeof toggleQuickWpScheduleDate === 'function') {
        toggleQuickWpScheduleDate();
      } else if (item.id === 'shopping-quick-wp-post-status' && typeof toggleShoppingQuickWpScheduleDate === 'function') {
        toggleShoppingQuickWpScheduleDate();
      }
    });
  });

  // Initial dependency sync
  if (typeof toggleQuickWpScheduleDate === 'function') toggleQuickWpScheduleDate();
}

// Shopping Connect Quick Publish WP Helpers
window.toggleShoppingQuickWpOptions = async function () {
  const panel = document.getElementById('shopping-quick-wp-options-panel');
  const checkbox = document.getElementById('shopping-quick-target-wordpress');

  if (panel && checkbox) {
    if (checkbox.checked) {
      panel.style.display = 'block';
      await initWpCategorySelector({
        optionsContainerId: 'shopping-quick-wp-category-options-v2',
        triggerTextId: 'shopping-quick-wp-category-text',
        containerId: 'shopping-quick-wp-category-container',
        storagePrefix: 'last_shopping_quick_'
      });
    } else {
      panel.style.display = 'none';
    }
  }
};

window.toggleShoppingQuickWpScheduleDate = function () {
  const input = document.getElementById('shopping-quick-wp-schedule-date');
  const status = document.getElementById('shopping-quick-wp-post-status')?.value;
  if (input) {
    input.disabled = (status !== 'schedule');
  }
};
