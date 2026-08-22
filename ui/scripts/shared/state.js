let categoryCache = null; // 워드프레스 카테고리 캐시 공통
let categoryFetchPromise = null; // 중복 요청 방지용 프로미스
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
let quickInputMode = ['ai', 'manuscript', 'pasted'].includes(localStorage.getItem('quick_input_mode'))
  ? localStorage.getItem('quick_input_mode')
  : 'ai';
const createLocalMarkdownPreviewState = () => ({
  folderLabel: '',
  selectedFiles: [],
  selectedFilesPayload: [],
  imageObjectUrls: {},
  data: null
});
let quickManuscriptPreviewState = createLocalMarkdownPreviewState();
let quickPastedPreviewState = createLocalMarkdownPreviewState();
let quickGeneratedPreviewState = {
  previewId: '',
  rowIndex: null,
  rowNumber: null,
  primaryTarget: '',
  targets: [],
  activeTarget: '',
  previews: {}
};
let quickTrendTopicContext = null;
let quickRecommendationTopicContext = null;
const quickTopicRecommendationState = {
  items: [],
  loaded: false,
  loading: false,
  error: '',
  query: '',
  smartUsageSessionId: ''
};
const quickKeywordDiscoveryState = {
  analysis: null,
  loaded: false,
  loading: false,
  error: '',
  selectedKeywordKeys: [],
  smartUsageSessionId: ''
};
const trendPostingState = {
  meta: null,
  items: [],
  itemsById: new Map(),
  savedIds: new Set(),
  recentTopicKeys: new Set(),
  recentTopicsLoaded: false,
  recentTopicsLoading: false,
  queryRange: null,
  loading: false
};
let settingsTelegramRuntimeStatus = null;
let settingsMcpRuntimeStatus = null;
let settingsMcpTokenVisible = false;
let settingsAiPresets = { text: [], image: [] };
let settingsAiProviderProfiles = { text: {}, image: {}, chat: {} };
let settingsBufferOrganizations = [];
let settingsBufferChannels = [];
let settingsBufferSelectedChannelIds = new Set();
let settingsSnsCheckInFlight = false;
let settingsSnsPublishInFlight = false;
let naverCommentDraftItems = [];
let naverCommentDraftStatusText = '설정을 확인한 뒤 실행해 주세요.';
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
  trendPosting: { key: 'latestTrendDate', direction: 'desc' },
  trends: { key: 'rowNumber', direction: 'desc' },
  topics: { key: 'rowNumber', direction: 'desc' },
  shopping: { key: 'rowNumber', direction: 'desc' }
};
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
let settingsMajorSaveInFlight = false;
let settingsMajorApplyingForm = false;
let settingsMajorLastSavedSignature = '';
let settingsMajorLoadedOnce = false;
let settingsMajorHasPendingBasicChanges = false;
let dashboardExternalContentLastLoadedAt = 0;
const DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS = 5 * 60 * 1000;
const SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT = "나 보기가 역겨워 가실 때에는\n말없이 고이 보내 드리우리다\n영변에 약산 진달래꽃\n아름 따다 가실 길에 뿌리우리다";

let uiUpdateInfo = null;
let uiUpdateLastCheckedAt = 0;
let uiUpdateCheckInFlight = false;
const systemLogRenderState = {
  fileName: '',
  lastRaw: ''
};
const MOBILE_QUICK_MODE_BREAKPOINT = 960;
let isMobileQuickMode = false;
let hasInitializedMobileQuickEntry = false;
const UPDATE_AUTO_CHECK_STALE_MS = 6 * 60 * 60 * 1000;
const UPDATE_AUTO_CHECK_POLL_MS = 30 * 60 * 1000;

function formatUpdatePublishDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildUpdateDetailsMessage(info) {
  const details = info?.details || {};
  const lines = [];
  const summary = String(details.summary || info?.body || '').trim();
  const highlights = Array.isArray(details.highlights) ? details.highlights.filter(Boolean) : [];
  const publishDate = formatUpdatePublishDate(info?.publishDate);

  if (summary) lines.push(summary);
  if (publishDate) lines.push(`배포일: ${publishDate}`);
  if (highlights.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('주요 변경');
    highlights.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  if (!summary && highlights.length === 0) {
    lines.push(`v${info?.latestVersion || ''} 업데이트 안내 정보가 아직 없습니다.`);
  }

  return lines.join('\n');
}

async function openUpdateDetailsDialog() {
  if (!uiUpdateInfo) return;
  await showUiDialog({
    title: `v${uiUpdateInfo.latestVersion} 업데이트 안내`,
    message: buildUpdateDetailsMessage(uiUpdateInfo),
    showCancel: false,
    confirmText: '확인'
  });
}

function highlightUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.remove('update-banner-attention');
  void banner.offsetWidth;
  banner.classList.add('update-banner-attention');
  window.setTimeout(() => {
    banner.classList.remove('update-banner-attention');
  }, 1800);
}

function scrollToUpdateBanner({ emphasize = false } = {}) {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.classList.contains('hidden')) return;
  banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (emphasize) highlightUpdateBanner();
}

function clearUpdateBannerState() {
  uiUpdateInfo = null;
  const banner = document.getElementById('update-banner');
  const normalSection = document.getElementById('update-banner-normal');
  const progressSection = document.getElementById('update-banner-progress');
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateCloseBtn = document.getElementById('update-close-btn');
  const updateCancelBtn = document.getElementById('update-cancel-btn');
  if (banner) banner.classList.add('hidden');
  if (normalSection) normalSection.style.display = '';
  if (progressSection) progressSection.style.display = 'none';
  if (updateNowBtn) updateNowBtn.style.display = '';
  if (updateCloseBtn) updateCloseBtn.style.display = '';
  if (updateCancelBtn) updateCancelBtn.style.display = 'none';
}

function shouldRefreshUpdateCheck() {
  return !uiUpdateLastCheckedAt || (Date.now() - uiUpdateLastCheckedAt) >= UPDATE_AUTO_CHECK_STALE_MS;
}

async function ensureUpdateCheckFresh(options = {}) {
  const { silent = true, force = false } = options;
  if (uiUpdateCheckInFlight) return;
  if (!force && !shouldRefreshUpdateCheck()) return;
  uiUpdateCheckInFlight = true;
  try {
    await checkUpdate(!silent, force);
  } finally {
    uiUpdateCheckInFlight = false;
  }
}

async function checkUpdate(isManual = false, isForce = false) {
  try {
    uiUpdateLastCheckedAt = Date.now();
    if (isManual) {
      showUiPopup(isForce ? '전체 환경을 다시 점검하며 강제 업데이트를 확인 중입니다...' : '최신 버전을 확인하고 있습니다...');
    }

    const url = isForce ? '/api/v1/system/update/check?force=true' : '/api/v1/system/update/check';
    const info = await fetchJson(url);
    if (info && info.hasUpdate) {
      uiUpdateInfo = info;
      const banner = document.getElementById('update-banner');
      const bannerText = document.getElementById('update-banner-text');
      if (banner && bannerText) {
        bannerText.textContent = isForce
          ? `강제 업데이트 준비 완료 (대상 버전: v${info.latestVersion})`
          : `새로운 버전(v${info.latestVersion})이 출시되었습니다!`;
        banner.classList.remove('hidden');
      }
      if (isManual) {
        const msg = isForce
          ? `현재 버전과 동일하더라도 업데이트가 가능합니다.\n상단 알림 배너의 '지금 업데이트'를 눌러 재설치를 진행하세요.`
          : `새로운 버전 v${info.latestVersion}을 찾았습니다!\n상단 알림 배너의 '지금 업데이트'를 눌러 진행하세요.`;
        showUiPopup(msg).then(() => {
          scrollToUpdateBanner({ emphasize: true });
        });
      }
    } else {
      clearUpdateBannerState();
      if (isManual) showUiPopup('현재 최신 버전을 사용 중입니다.');
    }
  } catch (e) {
    console.warn('업데이트 체크 실패:', e);
    if (isManual) showUiPopup(`업데이트 확인 실패: ${e.message}`);
  }
}

async function applyUpdate() {
  if (!uiUpdateInfo) return;

  const confirmed = await showUiConfirm(`BlogGenius v${uiUpdateInfo.latestVersion} 업데이트를 시작할까요?\n\n업데이트 완료 후 앱이 자동으로 재시작됩니다.`);
  if (!confirmed) return;

  const banner = document.getElementById('update-banner');
  const normalSection = document.getElementById('update-banner-normal');
  const progressSection = document.getElementById('update-banner-progress');
  const progressMessage = document.getElementById('update-progress-message');
  const progressPercent = document.getElementById('update-progress-percent');
  const progressBar = document.getElementById('update-progress-bar');
  const progressIcon = document.getElementById('update-progress-icon');
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateCloseBtn = document.getElementById('update-close-btn');
  const updateCancelBtn = document.getElementById('update-cancel-btn');

  // Show progress UI
  if (normalSection) normalSection.style.display = 'none';
  if (progressSection) progressSection.style.display = 'flex';
  if (banner) banner.classList.remove('hidden');
  if (updateNowBtn) updateNowBtn.style.display = 'none';
  if (updateCloseBtn) updateCloseBtn.style.display = 'none';

  const stageIcons = { downloading: '⬇️', verifying: '🔐', extracting: '📦', syncing: '🔄', done: '✅', error: '❌', idle: '⏳' };

  function setProgressUi({ message, percent, stage }) {
    // message에 대한 텍스트 (퍼센트 제외, 별도로 표시)
    const stageLabels = {
      downloading: '다운로드 중...',
      verifying: '무결성 검증 중...',
      extracting: '압축 해제 중...',
      syncing: '파일 동기화 중...',
      done: '업데이트 완료! 재시작 중...',
      error: message || '오류 발생',
      idle: '준비 중...'
    };
    if (progressMessage) progressMessage.textContent = stageLabels[stage] || message || '진행 중...';
    if (progressIcon) progressIcon.textContent = stageIcons[stage] || '⏳';

    // 퍼센트는 다운로드 단계에서만 표시
    if (stage === 'downloading') {
      const pct = typeof percent === 'number' ? percent : 0;
      if (progressPercent) progressPercent.textContent = pct > 0 ? `${pct}%` : '';
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (updateCancelBtn) updateCancelBtn.style.display = ''; // 취소 가능
    } else {
      if (progressPercent) progressPercent.textContent = '';
      if (progressBar) progressBar.style.width = '100%';
      if (updateCancelBtn) updateCancelBtn.style.display = 'none'; // 취소 불가
    }
  }

  let pollTimer = null;
  let cancelled = false;

  if (updateCancelBtn) {
    updateCancelBtn.onclick = async () => {
      cancelled = true;
      clearTimeout(pollTimer);
      if (updateCancelBtn) updateCancelBtn.disabled = true;
      if (progressMessage) progressMessage.textContent = '취소 중...';
      try { await postJson('/api/v1/system/update/cancel'); } catch (_) { }
      // Restore normal state
      setTimeout(() => {
        if (normalSection) normalSection.style.display = '';
        if (progressSection) progressSection.style.display = 'none';
        if (updateNowBtn) updateNowBtn.style.display = '';
        if (updateCloseBtn) updateCloseBtn.style.display = '';
        if (updateCancelBtn) { updateCancelBtn.style.display = 'none'; updateCancelBtn.disabled = false; }
      }, 1000);
    };
  }

  async function pollProgress() {
    if (cancelled) return;
    try {
      const p = await fetchJson('/api/v1/system/update/progress');
      setProgressUi(p);
      if (p.stage !== 'done' && p.stage !== 'error') pollTimer = setTimeout(pollProgress, 800);
    } catch (_) {
      if (!cancelled) pollTimer = setTimeout(pollProgress, 1000);
    }
  }

  try {
    const applyPromise = postJson('/api/v1/system/update/apply');
    pollTimer = setTimeout(pollProgress, 400);
    await applyPromise;
    if (cancelled) return;
    clearTimeout(pollTimer);
    setProgressUi({ stage: 'done', percent: 100 });
    setTimeout(async () => {
      try { await postJson('/api/v1/system/update/restart'); } catch (_) { }
      setTimeout(() => location.reload(), 3000);
    }, 1500);
  } catch (e) {
    if (cancelled) return;
    clearTimeout(pollTimer);
    setProgressUi({ stage: 'error', message: `업데이트 실패: ${e.message}`, percent: 0 });
    if (updateNowBtn) updateNowBtn.style.display = '';
    if (updateCloseBtn) updateCloseBtn.style.display = '';
    if (updateCancelBtn) updateCancelBtn.style.display = 'none';
    setTimeout(() => {
      if (normalSection) normalSection.style.display = '';
      if (progressSection) progressSection.style.display = 'none';
    }, 4000);
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
