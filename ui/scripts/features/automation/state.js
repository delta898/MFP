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
