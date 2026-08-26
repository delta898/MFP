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
let settingsWritingProfileResponse = null;
let settingsWritingProfileDraft = null;
let settingsWritingProfileSavedSignature = '';
let settingsWritingProfileDirty = false;
let settingsWritingProfileLoading = false;
let settingsWritingProfileSaving = false;
let settingsWritingPreviewInFlight = false;
