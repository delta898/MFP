// ─── 첫 실행 안내 배너 ───────────────────────────────────────────
const SETUP_BANNER_DISMISS_KEY = 'bloggenius_setup_banner_dismissed_v1';
const UI_TOAST_DEFAULT_TIMEOUT_MS = 8000;
const UI_TOAST_DEDUPE_WINDOW_MS = 15000;
let uiToastSeq = 0;
const uiToastTimers = new Map();
const uiToastRecentShownAt = new Map();
const uiToastActiveByDedupeKey = new Map();
const uiIssueStateByKey = new Map();
