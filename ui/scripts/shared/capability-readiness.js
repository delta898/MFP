const UI_CAPABILITY_KEYS = Object.freeze({
  AI_TEXT: 'ai.text',
  AI_IMAGE: 'ai.image',
  CONTENT_SHEET: 'content.sheet',
  PUBLISH_ANY: 'publish.any',
  PUBLISH_NAVER: 'publish.naver',
  PUBLISH_WORDPRESS: 'publish.wordpress'
});

const uiCapabilityStates = Object.fromEntries(
  Object.values(UI_CAPABILITY_KEYS).map((key) => [key, 'unknown'])
);
let uiCapabilityRefreshInFlight = null;

function normalizeUiCapabilityState(value) {
  if (value === true) return 'ready';
  if (value === false) return 'unavailable';
  return 'unknown';
}

function applyUiCapabilityStatus(status = {}) {
  const setup = status?.setup || {};
  const next = {
    [UI_CAPABILITY_KEYS.AI_TEXT]: setup?.ai?.configured,
    [UI_CAPABILITY_KEYS.AI_IMAGE]: setup?.ai?.image_configured,
    [UI_CAPABILITY_KEYS.CONTENT_SHEET]: setup?.google?.configured,
    [UI_CAPABILITY_KEYS.PUBLISH_ANY]: setup?.publishing_channel?.configured,
    [UI_CAPABILITY_KEYS.PUBLISH_NAVER]: setup?.publishing_channel?.naver_configured,
    [UI_CAPABILITY_KEYS.PUBLISH_WORDPRESS]: setup?.publishing_channel?.wordpress_configured
  };
  Object.entries(next).forEach(([key, value]) => {
    uiCapabilityStates[key] = normalizeUiCapabilityState(value);
  });
  uiAiTextReady = uiCapabilityStates[UI_CAPABILITY_KEYS.AI_TEXT] === 'unknown'
    ? null
    : uiCapabilityStates[UI_CAPABILITY_KEYS.AI_TEXT] === 'ready';
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('bloggenius:capability-readiness', {
      detail: { ...uiCapabilityStates }
    }));
  }
  return { ...uiCapabilityStates };
}

function getUiPublishCapability(targets = []) {
  const selected = Array.isArray(targets) ? targets : [];
  if (selected.includes('naver')) return UI_CAPABILITY_KEYS.PUBLISH_NAVER;
  if (selected.includes('wordpress')) return UI_CAPABILITY_KEYS.PUBLISH_WORDPRESS;
  return UI_CAPABILITY_KEYS.PUBLISH_ANY;
}

function getUiCapabilityState(capability) {
  return uiCapabilityStates[String(capability || '')] || 'unknown';
}

function isUiCapabilityUnavailable(capability) {
  return getUiCapabilityState(capability) === 'unavailable';
}

async function refreshUiCapabilityReadiness() {
  if (!uiCapabilityRefreshInFlight) {
    uiCapabilityRefreshInFlight = fetchJson('/api/v1/config/status')
      .then(applyUiCapabilityStatus)
      .finally(() => { uiCapabilityRefreshInFlight = null; });
  }
  try {
    await uiCapabilityRefreshInFlight;
  } catch (_error) { }
  return { ...uiCapabilityStates };
}

async function ensureUiCapabilityReady(capability) {
  if (getUiCapabilityState(capability) === 'ready') return true;
  await refreshUiCapabilityReadiness();
  return getUiCapabilityState(capability) === 'ready';
}

function getUiCapabilityMessage(capability) {
  return {
    [UI_CAPABILITY_KEYS.AI_TEXT]: 'AI 글쓰기 모델 설정이 필요합니다.',
    [UI_CAPABILITY_KEYS.AI_IMAGE]: 'AI 이미지 모델 설정이 필요합니다.',
    [UI_CAPABILITY_KEYS.CONTENT_SHEET]: 'Google Spreadsheet 연결이 필요합니다.',
    [UI_CAPABILITY_KEYS.PUBLISH_ANY]: '발행 채널 설정이 필요합니다.',
    [UI_CAPABILITY_KEYS.PUBLISH_NAVER]: '네이버 블로그 설정이 필요합니다.',
    [UI_CAPABILITY_KEYS.PUBLISH_WORDPRESS]: '워드프레스 설정이 필요합니다.'
  }[capability] || '필수 설정을 확인해 주세요.';
}

function goToUiCapabilitySettings(capability) {
  const target = {
    [UI_CAPABILITY_KEYS.AI_TEXT]: ['ai', 'settings-next-ai-text-form'],
    [UI_CAPABILITY_KEYS.AI_IMAGE]: ['ai', 'settings-next-ai-image-form'],
    [UI_CAPABILITY_KEYS.CONTENT_SHEET]: ['core', 'settings-next-content-form'],
    [UI_CAPABILITY_KEYS.PUBLISH_ANY]: ['core', 'settings-next-naver-form'],
    [UI_CAPABILITY_KEYS.PUBLISH_NAVER]: ['core', 'settings-next-naver-form'],
    [UI_CAPABILITY_KEYS.PUBLISH_WORDPRESS]: ['core', 'settings-next-wordpress-form']
  }[capability];
  if (!target) return Promise.resolve();
  if (typeof navigateToSettingsNextTarget === 'function') {
    return navigateToSettingsNextTarget(target[0], target[1]);
  }
  return typeof navigateTo === 'function' ? navigateTo('settings-next', target[0]) : Promise.resolve();
}

if (typeof document !== 'undefined') {
  document.addEventListener('bloggenius:capability-readiness', () => {
    if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
    if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
    if (typeof syncBlogNextImageAiReadiness === 'function') syncBlogNextImageAiReadiness();
    if (typeof updateShoppingQuickActionAvailability === 'function') updateShoppingQuickActionAvailability();
  });
}
