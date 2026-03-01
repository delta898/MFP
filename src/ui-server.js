const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const License = require('./license');
const Constants = require('./constants');
const { APP_VERSION } = Constants;
const CONFIG = require('./config-loader');
const Logger = require('./logger');
Logger.debug(`Application version: ${APP_VERSION}`);
const { checkAuthSessionValid } = require('./auth-session');
const Utils = require('./utils');
const Core = require('./core');
const BrowserLauncher = require('./browser-launcher');
const TrendManager = require('./trend-manager');
const ShoppingManager = require('./shopping-manager');
const Updater = require('./updater');
const RuntimeConfig = require('./runtime-config');
const { createBlogAutoService } = require('./ui-api/services/blog-auto.service');
const { createBlogAutoController } = require('./ui-api/controllers/blog-auto.controller');
const { createBlogAutoRouteHandler } = require('./ui-api/routes/blog-auto.routes');
const { createSettingsService } = require('./ui-api/services/settings.service');
const { createSettingsController } = require('./ui-api/controllers/settings.controller');
const { createSettingsRouteHandler } = require('./ui-api/routes/settings.routes');
const { createLegacyApiRouteHandler } = require('./ui-api/routes/legacy-api.routes');
const { createApiRouteHub } = require('./ui-api/routes');
const UiValidators = require('./ui-api/middleware/validate');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4577;
const UI_SESSION_CHECK_TTL_MS = 120000;
const UI_SHEETS_PREFLIGHT_TTL_MS = 10 * 60 * 1000;
const blogRuntimeLogs = new Map();
const shoppingRuntimeLogs = new Map();
const ALLOWED_TYPING_SPEEDS = ['QUICK', 'FAST', 'NORMAL', 'HUMAN'];
const NAVER_AUTO_DEFAULTS = {
    mode: false,
    categories: '',
    maxPostsPerRun: 3,
    minPostGapMin: 0,
    trendsTime: '07:30',
    imageGeneration: true,
    externalReference: true,
    notifyEnabled: false,
    variationIncludeNew: false,
    variationIncludeDash: false,
    variationIncludeNumber: true,
    variationNumber: 50,
    keywordReuseGapDays: 15,
    headless: true
};
const NAVER_SHOPPING_AUTO_DEFAULTS = {
    mode: false,
    dailyPosts: 3,
    time: '07:50',
    notifyEnabled: false
};
const AUTO_TRENDS_RETRY_WAIT_MS = 5 * 60 * 1000;
const AUTO_TRENDS_MAX_RETRIES = 3;
const NAVER_AUTO_CATEGORY_MASTER_KEYS = ['NAVER_AUTO_CATEGORIES_MASTER', 'naver_auto_categories_master'];
const autoRuntimeState = {
    enabled: false,
    running: false,
    status: 'stopped', // stopped | waiting | running | error
    message: '블로그 자동 모드 비활성화',
    startedAt: null,
    lastRunAt: null,
    nextRunAt: null,
    lastSummary: null,
    cycleCount: 0,
    timer: null,
    lastPublishAtMs: 0
};
const shoppingAutoRuntimeState = {
    enabled: false,
    running: false,
    status: 'stopped', // stopped | waiting | running | error
    message: '쇼핑 자동 모드 비활성화',
    startedAt: null,
    lastRunAt: null,
    nextRunAt: null,
    lastSummary: null,
    cycleCount: 0,
    timer: null,
    dayKey: '',
    shoppingPublishedToday: 0
};
const SHOPPING_IMAGE_SLOT_MAP = {
    ftc: { key: 'FTC_DISCLOSURE_IMAGE_URL', fileBase: 'ftc_disclosure', label: '공정위 이미지', required: true },
    cta1: { key: 'SHOPPING_CTA_IMAGE_URL1', fileBase: 'shopping_cta_1', label: '구매 독려 이미지 1', required: true },
    cta2: { key: 'SHOPPING_CTA_IMAGE_URL2', fileBase: 'shopping_cta_2', label: '구매 독려 이미지 2', required: false },
    cta3: { key: 'SHOPPING_CTA_IMAGE_URL3', fileBase: 'shopping_cta_3', label: '구매 독려 이미지 3', required: false }
};
const DEFAULT_SHOPPING_IMAGE_SOURCES = {
    FTC_DISCLOSURE_IMAGE_URL: './config/images/ftc_disclosure.jpeg',
    SHOPPING_CTA_IMAGE_URL1: './config/images/shopping_cta_1.jpeg',
    SHOPPING_CTA_IMAGE_URL2: './config/images/shopping_cta_2.jpeg',
    SHOPPING_CTA_IMAGE_URL3: './config/images/shopping_cta_3.jpeg'
};
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const naverLoginState = {
    status: 'idle', // idle | running | success | failed
    message: '',
    startedAt: null,
    finishedAt: null,
    detectedBy: '',
    error: ''
};
const uiSheetsPreflightState = {
    inFlight: null,
    status: 'idle', // idle | checking | ready | error
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastError: ''
};
const QUICK_PUBLISH_DEDUPE_TTL_MS = 90 * 1000;
const quickPublishRecentMap = new Map();
let blogAutoRouteHandler = null;
let settingsRouteHandler = null;
let legacyApiRouteHandler = null;
let apiRouteHub = null;

function setBlogRuntimeLog(rowIndex, message) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    blogRuntimeLogs.set(rowIndex, {
        message: String(message || '').trim()
    });
}

function clearBlogRuntimeLog(rowIndex) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    blogRuntimeLogs.delete(rowIndex);
}

function clearAllBlogRuntimeLogs() {
    blogRuntimeLogs.clear();
}

function getBlogRuntimeLogMap() {
    const map = new Map();
    for (const [rowIndex, log] of blogRuntimeLogs.entries()) {
        map.set(rowIndex, String(log?.message || ''));
    }
    return map;
}

function setShoppingRuntimeLog(rowIndex, message) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    shoppingRuntimeLogs.set(rowIndex, {
        message: String(message || '').trim()
    });
}

function clearAllShoppingRuntimeLogs() {
    shoppingRuntimeLogs.clear();
}

function getShoppingRuntimeLogMap() {
    const map = new Map();
    for (const [rowIndex, log] of shoppingRuntimeLogs.entries()) {
        map.set(rowIndex, String(log?.message || ''));
    }
    return map;
}

function setNaverLoginState(patch = {}) {
    Object.assign(naverLoginState, patch);
}

function getNaverLoginStatus() {
    const startedAtMs = naverLoginState.startedAt ? new Date(naverLoginState.startedAt).getTime() : null;
    const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
    return {
        status: naverLoginState.status,
        message: naverLoginState.message,
        startedAt: naverLoginState.startedAt,
        finishedAt: naverLoginState.finishedAt,
        detectedBy: naverLoginState.detectedBy,
        error: naverLoginState.error,
        isRunning: naverLoginState.status === 'running',
        elapsedSeconds
    };
}

function getUiSheetsPreflightStatus() {
    return {
        status: uiSheetsPreflightState.status,
        lastCheckedAt: uiSheetsPreflightState.lastCheckedAt,
        lastSuccessAt: uiSheetsPreflightState.lastSuccessAt,
        lastError: uiSheetsPreflightState.lastError
    };
}

function shouldUseUiSheetsPreflightCache(force = false) {
    if (force) return false;
    if (!uiSheetsPreflightState.lastSuccessAt) return false;
    const last = new Date(uiSheetsPreflightState.lastSuccessAt).getTime();
    if (!Number.isFinite(last)) return false;
    return (Date.now() - last) < UI_SHEETS_PREFLIGHT_TTL_MS;
}

async function ensureSheetsReadyForUi(options = {}) {
    const force = Boolean(options.force);
    if (!CONFIG?.GOOGLE_SHEET_ID) {
        throw new Error('GOOGLE_SHEET_URL(또는 GOOGLE_SHEET_ID)이 비어 있습니다. 설정에서 먼저 입력해 주세요.');
    }

    if (shouldUseUiSheetsPreflightCache(force)) {
        return {
            ok: true,
            cached: true,
            spreadsheetId: String(CONFIG.GOOGLE_SHEET_ID || '').trim(),
            ...getUiSheetsPreflightStatus()
        };
    }

    if (uiSheetsPreflightState.inFlight) {
        return uiSheetsPreflightState.inFlight;
    }

    uiSheetsPreflightState.status = 'checking';
    uiSheetsPreflightState.lastCheckedAt = new Date().toISOString();
    uiSheetsPreflightState.lastError = '';

    uiSheetsPreflightState.inFlight = (async () => {
        const ensured = await Utils.ensureAllSheetsExist();
        if (!ensured?.success) {
            throw new Error(ensured?.message || '필수 시트 준비에 실패했습니다.');
        }
        uiSheetsPreflightState.status = 'ready';
        uiSheetsPreflightState.lastSuccessAt = new Date().toISOString();
        uiSheetsPreflightState.lastError = '';
        return {
            ok: true,
            cached: false,
            spreadsheetId: String(ensured?.spreadsheetId || CONFIG.GOOGLE_SHEET_ID || '').trim(),
            ...getUiSheetsPreflightStatus()
        };
    })()
        .catch((e) => {
            uiSheetsPreflightState.status = 'error';
            uiSheetsPreflightState.lastError = String(e?.message || e || 'unknown');
            throw e;
        })
        .finally(() => {
            uiSheetsPreflightState.lastCheckedAt = new Date().toISOString();
            uiSheetsPreflightState.inFlight = null;
        });

    return uiSheetsPreflightState.inFlight;
}

function resolveUiRoot() {
    const candidates = [
        path.join(process.cwd(), 'ui'),
        path.join(__dirname, '..', 'ui')
    ];

    for (const dir of candidates) {
        try {
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                return dir;
            }
        } catch (e) { }
    }
    return null;
}

function jsonMeta(requestId) {
    return {
        requestId,
        timestamp: new Date().toISOString()
    };
}

function sendJson(res, requestId, statusCode, payload) {
    if (res.headersSent || res.writableEnded) {
        Logger.warn(`⚠️ [UI][API] 응답이 이미 전송되어 중복 응답을 건너뜁니다. (requestId: ${requestId})`);
        return false;
    }
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
        ...payload,
        meta: jsonMeta(requestId)
    }));
    return true;
}

function sendSuccess(res, requestId, data, statusCode = 200) {
    return sendJson(res, requestId, statusCode, { success: true, data, error: null });
}

function sendError(res, requestId, statusCode, code, message) {
    return sendJson(res, requestId, statusCode, {
        success: false,
        data: null,
        error: { code, message: String(message || '요청 처리 중 오류가 발생했습니다.') }
    });
}

function toFeatureMap(rawFeatures) {
    return (rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures))
        ? rawFeatures
        : {};
}

function getFeatureInt(features, key, fallback = null) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const num = parseInt(map[key], 10);
    if (Number.isNaN(num) || num < 0) return fallback;
    return num;
}

function getFeatureBool(features, key, fallback = true) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const value = map[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'off'].includes(v)) return false;
    }
    return fallback;
}

function isCommandEnabled(features, command) {
    const keyMap = {
        pub: 'cmd_pub',
        batch: 'cmd_batch',
        trends: 'cmd_trends',
        shopping: 'cmd_shopping'
    };
    const key = keyMap[command];
    if (!key) return true;
    return getFeatureBool(features, key, true);
}

function parseMaxPosts(value, fallback = 3) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return fallback;
    return parsed;
}

function resolveMaxBlogPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_BLOG_POSTS_PER_RUN, 3);
}

function resolveMaxShoppingPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_SHOPPING_POSTS_PER_RUN, 3);
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
}

function sanitizePathname(pathname) {
    const safe = String(pathname || '/').split('?')[0].split('#')[0];
    const normalized = path.normalize(safe).replace(/^(\.\.[/\\])+/, '');
    return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

function createRequestId() {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function checkNaverSessionForUi() {
    return checkAuthSessionValid({ cacheTtlMs: UI_SESSION_CHECK_TTL_MS });
}

function normalizeBool(input, fallback = false) {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input !== 0;
    if (typeof input === 'string') {
        const v = input.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
    }
    return fallback;
}

function normalizeKeywords(input) {
    if (Array.isArray(input)) {
        return input.map(v => String(v || '').trim()).filter(Boolean);
    }
    return String(input || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function normalizePublishMode(input) {
    const mode = String(input || '').trim().toLowerCase();
    if (mode === 'append_and_publish') return 'append_and_publish';
    return 'append_only';
}

function buildQuickPublishDedupeKey({ subject, keywords, instruction, referenceUrl, imageGeneration, externalReference }) {
    const normalizedSubject = String(subject || '').trim().toLowerCase();
    const normalizedKeywords = Array.isArray(keywords)
        ? keywords.map(v => String(v || '').trim().toLowerCase()).filter(Boolean).join(',')
        : '';
    const normalizedInstruction = String(instruction || '').trim().toLowerCase();
    const normalizedReferenceUrl = String(referenceUrl || '').trim().toLowerCase();
    const normalizedImageGeneration = imageGeneration ? '1' : '0';
    const normalizedExternalReference = externalReference ? '1' : '0';
    return [
        normalizedSubject,
        normalizedKeywords,
        normalizedInstruction,
        normalizedReferenceUrl,
        normalizedImageGeneration,
        normalizedExternalReference
    ].join('|');
}

function cleanupQuickPublishDedupeCache(nowMs = Date.now()) {
    for (const [key, entry] of quickPublishRecentMap.entries()) {
        if (!entry || !Number.isFinite(entry.updatedAtMs) || (nowMs - entry.updatedAtMs) > QUICK_PUBLISH_DEDUPE_TTL_MS) {
            quickPublishRecentMap.delete(key);
        }
    }
}

function parseIntSafe(input, fallback = null, min = null) {
    const parsed = parseInt(input, 10);
    if (Number.isNaN(parsed)) return fallback;
    if (min !== null && parsed < min) return fallback;
    return parsed;
}

function parseBoolQuery(input) {
    const value = String(input || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(value);
}

function normalizeSortDir(input, fallback = 'desc') {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'desc') return 'desc';
    if (value === 'asc') return 'asc';
    return fallback;
}

function normalizeListenHost(input, fallback = DEFAULT_HOST) {
    const raw = String(input || '').trim();
    if (!raw) return fallback;
    if (raw.toLowerCase() === 'localhost') return '127.0.0.1';
    if (raw === '0.0.0.0' || raw === '127.0.0.1') return raw;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return raw;
    return fallback;
}

function normalizeListenPort(input, fallback = DEFAULT_PORT) {
    const parsed = parseInt(String(input || ''), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return fallback;
    return parsed;
}

function extractGoogleSheetId(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) return raw;
    try {
        const u = new URL(raw);
        const byPath = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
        if (byPath?.[1]) return byPath[1];
        const byQuery = u.searchParams.get('id');
        if (byQuery && /^[a-zA-Z0-9-_]{20,}$/.test(byQuery)) return byQuery;
    } catch (e) { }
    return '';
}

function normalizeGoogleSheetUrl(rawUrl, fallbackId = '') {
    const input = String(rawUrl || '').trim();
    if (input) {
        const fromInputId = extractGoogleSheetId(input);
        if (fromInputId) {
            return `https://docs.google.com/spreadsheets/d/${fromInputId}`;
        }
        if (/^https?:\/\//i.test(input)) return input;
    }
    const id = extractGoogleSheetId(fallbackId);
    if (!id) return '';
    return `https://docs.google.com/spreadsheets/d/${id}`;
}

function compareSortValues(a, b) {
    const aNull = a === null || a === undefined || a === '';
    const bNull = b === null || b === undefined || b === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;

    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
}

function getTopicSortValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return Number(item.rowNumber || 0);
    if (key === 'subject') return String(item.subject || '');
    if (key === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
    if (key === 'instruction') return String(item.content_guide?.additional_instructions || '');
    if (key === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
    if (key === 'imageGeneration') return item.image_options?.generate === true ? 1 : 0;
    if (key === 'externalReference') return item.use_external_ref === true ? 1 : 0;
    if (key === 'runtimeLog') return String(item.runtimeLog || '');
    if (key === 'status') return String(item.status || '');
    return Number(item.rowNumber || 0);
}

function sortTopicItems(items, sortBy = 'rowNumber', sortDir = 'desc') {
    const key = String(sortBy || 'rowNumber').trim();
    const direction = String(sortDir || 'desc').trim().toLowerCase() === 'desc' ? -1 : 1;
    const source = Array.isArray(items) ? items : [];
    return source
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const cmp = compareSortValues(getTopicSortValue(a.item, key), getTopicSortValue(b.item, key));
            if (cmp !== 0) return cmp * direction;
            return a.index - b.index;
        })
        .map(v => v.item);
}

function getShoppingSortValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return Number(item.rowNumber || 0);
    if (key === 'product') return String(item.product || '');
    if (key === 'shortUrl') return String(item.shortUrl || '');
    if (key === 'runtimeLog') return String(item.runtimeLog || '');
    if (key === 'status') return String(item.status || '');
    if (key === 'publishedAt') return String(item.publishedAt || '');
    return Number(item.rowNumber || 0);
}

function sortShoppingItems(items, sortBy = 'rowNumber', sortDir = 'desc') {
    const key = String(sortBy || 'rowNumber').trim();
    const direction = String(sortDir || 'desc').trim().toLowerCase() === 'desc' ? -1 : 1;
    const source = Array.isArray(items) ? items : [];
    return source
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const cmp = compareSortValues(getShoppingSortValue(a.item, key), getShoppingSortValue(b.item, key));
            if (cmp !== 0) return cmp * direction;
            return a.index - b.index;
        })
        .map(v => v.item);
}

function resolveReadableConfigSource() {
    const configPath = CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS.configFile;
    if (fs.existsSync(configPath)) {
        return { path: configPath, sourceType: 'config' };
    }
    // config-loader.js 에서 이미 샘플 복사 로직이 실행되었을 것이므로, 
    // 여기서는 현재 활성화된 소스 경로를 우선 반환합니다.
    return {
        path: configPath,
        sourceType: fs.existsSync(configPath) ? 'config' : 'sample'
    };
}

function resolveWritableConfigPath() {
    return CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS.configFile;
}

function readConfigRaw(configSource) {
    if (!configSource?.path || !fs.existsSync(configSource.path)) {
        throw new Error(`설정 파일을 찾을 수 없습니다: ${configSource?.path || '(unknown)'}`);
    }
    return fs.readFileSync(configSource.path, 'utf-8');
}

function createConfigRevision(raw) {
    return crypto.createHash('sha1').update(String(raw || ''), 'utf8').digest('hex');
}

function tryResolveReadableConfigSource() {
    try {
        return resolveReadableConfigSource();
    } catch (e) {
        return null;
    }
}

function buildDefaultConfigTemplate() {
    return [
        '# BlogGenius config (auto-generated)',
        'NAVER_ID = ',
        'GEMINI_API_KEY = ',
        'GOOGLE_AUTH_JSON = ./config/service_account.json',
        'GOOGLE_SHEET_URL = ',
        `LISTEN_HOST = ${DEFAULT_HOST}`,
        `LISTEN_PORT = ${DEFAULT_PORT}`,
        'HEADLESS = false',
        'TYPING_SPEED = FAST',
        'NAVER_AUTO_MODE = false',
        'NAVER_AUTO_CATEGORIES = ',
        'NAVER_AUTO_MAX_POSTS_PER_RUN = 3',
        'NAVER_AUTO_TRENDS_TIME = 07:30',
        'NAVER_AUTO_IMAGE_GENERATION = true',
        'NAVER_AUTO_EXTERNAL_REFERENCE = true',
        'NAVER_AUTO_NOTIFY_ENABLED = false',
        'NAVER_AUTO_VARIATION_INCLUDE_NEW = false',
        'NAVER_AUTO_VARIATION_INCLUDE_DASH = false',
        'NAVER_AUTO_VARIATION_INCLUDE_NUMBER = true',
        'NAVER_AUTO_VARIATION_NUMBER = 50',
        'NAVER_AUTO_VARIATION_TOP_N = 5',
        'NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS = 15',
        'NAVER_AUTO_HEADLESS = true',
        'NAVER_SHOPPING_AUTO_MODE = false',
        'NAVER_SHOPPING_AUTO_DAILY_POSTS = 3',
        'NAVER_SHOPPING_AUTO_TIME = 07:50',
        'NAVER_SHOPPING_AUTO_NOTIFY_ENABLED = false',
        `FTC_DISCLOSURE_IMAGE_URL = ${DEFAULT_SHOPPING_IMAGE_SOURCES.FTC_DISCLOSURE_IMAGE_URL}`,
        `SHOPPING_CTA_IMAGE_URL1 = ${DEFAULT_SHOPPING_IMAGE_SOURCES.SHOPPING_CTA_IMAGE_URL1}`,
        `SHOPPING_CTA_IMAGE_URL2 = ${DEFAULT_SHOPPING_IMAGE_SOURCES.SHOPPING_CTA_IMAGE_URL2}`,
        `SHOPPING_CTA_IMAGE_URL3 = ${DEFAULT_SHOPPING_IMAGE_SOURCES.SHOPPING_CTA_IMAGE_URL3}`,
        ''
    ].join('\n');
}

function parseConfigValue(raw, key) {
    const lines = String(raw || '').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [left, ...rest] = trimmed.split('=');
        if (String(left || '').trim() !== key) continue;
        const joined = rest.join('=');
        const value = joined.includes('#') ? joined.split('#')[0] : joined;
        return String(value || '').trim();
    }
    return '';
}

function parseConfigBool(rawValue, fallback = false) {
    const value = String(rawValue || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(value)) return true;
    if (['false', '0', 'no', 'off'].includes(value)) return false;
    return fallback;
}

function normalizeTypingSpeed(input, fallback = 'NORMAL') {
    const value = String(input || '').trim().toUpperCase();
    return ALLOWED_TYPING_SPEEDS.includes(value) ? value : fallback;
}

function normalizePositiveInt(input, fallback) {
    const parsed = parseInt(String(input ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function normalizeNonNegativeInt(input, fallback) {
    const parsed = parseInt(String(input ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed < 0) return fallback;
    return parsed;
}

function normalizeIntegerOrBlank(input, fallback = '') {
    const raw = String(input ?? '').trim();
    if (!raw) return fallback;
    const parsed = parseInt(raw, 10);
    if (!Number.isInteger(parsed)) return fallback;
    return parsed;
}

function parseCsvTokens(input) {
    if (Array.isArray(input)) {
        return input
            .map((token) => String(token || '').trim())
            .filter(Boolean);
    }
    return String(input || '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
}

function dedupeOrderedStrings(items = []) {
    const out = [];
    const seen = new Set();
    for (const raw of items) {
        const value = String(raw || '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

function parseCategoryListRaw(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return [];
    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const normalized = parsed
                    .map((item, index) => {
                        if (typeof item === 'string') {
                            return {
                                label: String(item || '').trim(),
                                order: Number.MAX_SAFE_INTEGER - (100000 - index)
                            };
                        }
                        if (item && typeof item === 'object') {
                            const enabled = item.enabled !== false;
                            if (!enabled) return null;
                            const label = String(item.label || item.code || item.name || '').trim();
                            const orderRaw = Number(item.order);
                            const order = Number.isFinite(orderRaw)
                                ? orderRaw
                                : (Number.MAX_SAFE_INTEGER - (100000 - index));
                            return { label, order };
                        }
                        return null;
                    })
                    .filter((v) => v && v.label);
                normalized.sort((a, b) => a.order - b.order);
                return dedupeOrderedStrings(normalized.map((v) => v.label));
            }
        } catch (_e) { }
    }
    return dedupeOrderedStrings(
        raw
            .split(/[\n,]/)
            .map((token) => token.trim())
            .filter(Boolean)
    );
}

async function resolveNaverAutoCategoryCatalog(options = {}) {
    const force = Boolean(options.force);
    let runtimeCategories = [];
    let trendCategories = [];
    let configCategories = [];

    try {
        const runtimeMap = await RuntimeConfig.fetchRuntimeConfig(NAVER_AUTO_CATEGORY_MASTER_KEYS, force);
        const runtimeRaw = String(
            runtimeMap?.NAVER_AUTO_CATEGORIES_MASTER
            || runtimeMap?.naver_auto_categories_master
            || ''
        ).trim();
        runtimeCategories = parseCategoryListRaw(runtimeRaw);
    } catch (_e) { }

    try {
        const trendsRes = await Utils.readGoogleSheetTrendsAll({
            q: '',
            limit: 100000,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'desc'
        });
        const items = Array.isArray(trendsRes?.items) ? trendsRes.items : [];
        trendCategories = dedupeOrderedStrings(items.map((item) => String(item?.category || '').trim()));
    } catch (_e) { }

    try {
        const fromConfig = normalizeNaverAutoSettings({});
        configCategories = parseCategoryListRaw(fromConfig?.NAVER_AUTO_CATEGORIES || '');
    } catch (_e) { }

    const categories = dedupeOrderedStrings([
        ...runtimeCategories,
        ...trendCategories,
        ...configCategories
    ]);

    return {
        categories,
        runtimeCategories,
        trendCategories,
        configCategories,
        updatedAt: new Date().toISOString()
    };
}

function toBoolLike(input, fallback = false) {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input !== 0;
    if (typeof input === 'string') {
        const v = input.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
    }
    return fallback;
}

function normalizeTimeHHmm(input, fallback = '07:30') {
    const raw = String(input || '').trim();
    const m = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return fallback;
    return `${m[1]}:${m[2]}`;
}

function parseVariationMeta(raw) {
    const text = String(raw || '').trim();
    const lower = text.toLowerCase();
    if (!text || text === '-') return { kind: 'dash', number: null, raw: text };
    if (lower === 'new') return { kind: 'new', number: null, raw: text };
    const cleaned = text.replace(/[^\d-]/g, '');
    if (/\d/.test(cleaned)) {
        const parsed = parseInt(cleaned, 10);
        if (Number.isInteger(parsed)) return { kind: 'number', number: parsed, raw: text };
    }
    return { kind: 'other', number: null, raw: text };
}

function matchesVariationFilter(rawVariation, settings = {}) {
    const includeNew = toBoolLike(
        settings.NAVER_AUTO_VARIATION_INCLUDE_NEW ?? settings.AUTO_TRENDS_VARIATION_INCLUDE_NEW,
        false
    );
    const includeDash = toBoolLike(
        settings.NAVER_AUTO_VARIATION_INCLUDE_DASH ?? settings.AUTO_TRENDS_VARIATION_INCLUDE_DASH,
        false
    );
    const includeNumber = toBoolLike(
        settings.NAVER_AUTO_VARIATION_INCLUDE_NUMBER ?? settings.AUTO_TRENDS_VARIATION_INCLUDE_NUMBER,
        true
    );
    const threshold = normalizeIntegerOrBlank(
        settings.NAVER_AUTO_VARIATION_NUMBER ?? settings.AUTO_TRENDS_MIN_VARIATION,
        ''
    );
    // "new", "-", "증감(숫자 기준 이상)"은 OR 조건.
    const useNumber = includeNumber && Number.isInteger(threshold);
    const hasFilter = includeNew || includeDash || useNumber;
    if (!hasFilter) return true;

    const meta = parseVariationMeta(rawVariation);
    if (includeNew && meta.kind === 'new') return true;
    if (includeDash && meta.kind === 'dash') return true;
    if (useNumber && meta.kind === 'number' && Number(meta.number) >= Number(threshold)) return true;
    return false;
}

function normalizeYmdToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const compact = raw.match(/(\d{4})(\d{2})(\d{2})/);
    if (compact) {
        const y = compact[1];
        const m = compact[2];
        const d = compact[3];
        return `${y}-${m}-${d}`;
    }

    const dashed = raw.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
    if (dashed) {
        const y = dashed[1];
        const m = String(parseInt(dashed[2], 10)).padStart(2, '0');
        const d = String(parseInt(dashed[3], 10)).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    return '';
}

function ymdToUtcTimestamp(ymd) {
    const normalized = normalizeYmdToken(ymd);
    if (!normalized) return NaN;
    const [y, m, d] = normalized.split('-').map((v) => parseInt(v, 10));
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return NaN;
    return Date.UTC(y, m - 1, d);
}

function isYmdWithinRecentDays(historyYmd, baseYmd, gapDays) {
    const gap = normalizeNonNegativeInt(gapDays, 0);
    if (gap <= 0) return false;
    const historyTs = ymdToUtcTimestamp(historyYmd);
    const baseTs = ymdToUtcTimestamp(baseYmd);
    if (!Number.isFinite(historyTs) || !Number.isFinite(baseTs)) return false;
    const diffDays = Math.floor((baseTs - historyTs) / 86400000);
    return diffDays >= 0 && diffDays < gap;
}

function buildTopicReuseKey(subject, keywords) {
    const kwText = Array.isArray(keywords)
        ? keywords.join(', ')
        : String(keywords || '');
    const firstKeyword = kwText
        .split(',')
        .map((v) => String(v || '').trim())
        .find(Boolean);
    const basis = firstKeyword || String(subject || '').trim();
    return String(basis || '').trim().toLowerCase();
}

function getSeoulTodayYmd() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const day = parts.find((p) => p.type === 'day')?.value || '';
    if (!year || !month || !day) return '';
    return `${year}-${month}-${day}`;
}

function matchesAnyToken(text, tokens = []) {
    const haystack = String(text || '').toLowerCase();
    if (!haystack || !Array.isArray(tokens) || tokens.length === 0) return false;
    return tokens.some((token) => haystack.includes(String(token || '').toLowerCase()));
}

function normalizeNaverAutoSettings(input = {}) {
    const categoriesRaw = String(
        input.NAVER_AUTO_CATEGORIES
        ?? input.AUTO_INCLUDE_CATEGORIES
        ?? input.AUTO_CATEGORIES
        ?? CONFIG.NAVER_AUTO_CATEGORIES
        ?? CONFIG.AUTO_INCLUDE_CATEGORIES
        ?? CONFIG.AUTO_CATEGORIES
        ?? NAVER_AUTO_DEFAULTS.categories
    ).trim();

    const mode = toBoolLike(
        input.NAVER_AUTO_MODE ?? input.AUTO_MODE,
        toBoolLike(CONFIG.NAVER_AUTO_MODE ?? CONFIG.AUTO_MODE, NAVER_AUTO_DEFAULTS.mode)
    );
    const maxPostsPerRun = normalizeNonNegativeInt(
        input.NAVER_AUTO_MAX_POSTS_PER_RUN
        ?? input.NAVER_AUTO_DAILY_POSTS
        ?? input.AUTO_MAX_BLOG_PER_CYCLE
        ?? input.AUTO_DAILY_BLOG_CAP,
        normalizeNonNegativeInt(
            CONFIG.NAVER_AUTO_MAX_POSTS_PER_RUN
            ?? CONFIG.NAVER_AUTO_DAILY_POSTS
            ?? CONFIG.AUTO_MAX_BLOG_PER_CYCLE
            ?? CONFIG.AUTO_DAILY_BLOG_CAP,
            NAVER_AUTO_DEFAULTS.maxPostsPerRun
        )
    );
    const minPostGapMin = normalizeNonNegativeInt(
        input.NAVER_AUTO_MIN_POST_GAP_MIN ?? input.AUTO_MIN_POST_GAP_MIN,
        normalizeNonNegativeInt(
            CONFIG.NAVER_AUTO_MIN_POST_GAP_MIN ?? CONFIG.AUTO_MIN_POST_GAP_MIN,
            NAVER_AUTO_DEFAULTS.minPostGapMin
        )
    );
    const trendsTime = normalizeTimeHHmm(
        input.NAVER_AUTO_TRENDS_TIME,
        normalizeTimeHHmm(CONFIG.NAVER_AUTO_TRENDS_TIME, NAVER_AUTO_DEFAULTS.trendsTime)
    );
    const imageGeneration = toBoolLike(
        input.NAVER_AUTO_IMAGE_GENERATION ?? input.AUTO_IMAGE_GENERATION,
        toBoolLike(CONFIG.NAVER_AUTO_IMAGE_GENERATION ?? CONFIG.AUTO_IMAGE_GENERATION, NAVER_AUTO_DEFAULTS.imageGeneration)
    );
    const externalReference = toBoolLike(
        input.NAVER_AUTO_EXTERNAL_REFERENCE ?? input.AUTO_USE_EXTERNAL_REF,
        toBoolLike(CONFIG.NAVER_AUTO_EXTERNAL_REFERENCE ?? CONFIG.AUTO_USE_EXTERNAL_REF, NAVER_AUTO_DEFAULTS.externalReference)
    );
    const notifyEnabled = toBoolLike(
        input.NAVER_AUTO_NOTIFY_ENABLED,
        toBoolLike(CONFIG.NAVER_AUTO_NOTIFY_ENABLED, NAVER_AUTO_DEFAULTS.notifyEnabled)
    );
    const variationIncludeNew = toBoolLike(
        input.NAVER_AUTO_VARIATION_INCLUDE_NEW ?? input.AUTO_TRENDS_VARIATION_INCLUDE_NEW,
        toBoolLike(
            CONFIG.NAVER_AUTO_VARIATION_INCLUDE_NEW ?? CONFIG.AUTO_TRENDS_VARIATION_INCLUDE_NEW,
            NAVER_AUTO_DEFAULTS.variationIncludeNew
        )
    );
    const variationIncludeDash = toBoolLike(
        input.NAVER_AUTO_VARIATION_INCLUDE_DASH ?? input.AUTO_TRENDS_VARIATION_INCLUDE_DASH,
        toBoolLike(
            CONFIG.NAVER_AUTO_VARIATION_INCLUDE_DASH ?? CONFIG.AUTO_TRENDS_VARIATION_INCLUDE_DASH,
            NAVER_AUTO_DEFAULTS.variationIncludeDash
        )
    );
    const variationIncludeNumber = toBoolLike(
        input.NAVER_AUTO_VARIATION_INCLUDE_NUMBER ?? input.AUTO_TRENDS_VARIATION_INCLUDE_NUMBER,
        toBoolLike(
            CONFIG.NAVER_AUTO_VARIATION_INCLUDE_NUMBER ?? CONFIG.AUTO_TRENDS_VARIATION_INCLUDE_NUMBER,
            NAVER_AUTO_DEFAULTS.variationIncludeNumber
        )
    );
    const hasVariationNumberInput =
        Object.prototype.hasOwnProperty.call(input, 'NAVER_AUTO_VARIATION_NUMBER')
        || Object.prototype.hasOwnProperty.call(input, 'AUTO_TRENDS_MIN_VARIATION');
    const variationNumberSource = hasVariationNumberInput
        ? (input.NAVER_AUTO_VARIATION_NUMBER ?? input.AUTO_TRENDS_MIN_VARIATION)
        : (CONFIG.NAVER_AUTO_VARIATION_NUMBER ?? CONFIG.AUTO_TRENDS_MIN_VARIATION);
    const variationNumber = normalizeIntegerOrBlank(variationNumberSource, NAVER_AUTO_DEFAULTS.variationNumber);

    const hasVariationTypeInput = Object.prototype.hasOwnProperty.call(input, 'NAVER_AUTO_VARIATION_TYPE');
    const variationTypeSource = hasVariationTypeInput ? input.NAVER_AUTO_VARIATION_TYPE : CONFIG.NAVER_AUTO_VARIATION_TYPE;
    const variationType = String(variationTypeSource || 'min').trim();

    const hasVariationTopNInput = Object.prototype.hasOwnProperty.call(input, 'NAVER_AUTO_VARIATION_TOP_N') || Object.prototype.hasOwnProperty.call(input, 'AUTO_TRENDS_TOP_N');
    const variationTopNSource = hasVariationTopNInput ? (input.NAVER_AUTO_VARIATION_TOP_N ?? input.AUTO_TRENDS_TOP_N) : (CONFIG.NAVER_AUTO_VARIATION_TOP_N ?? CONFIG.AUTO_TRENDS_TOP_N);
    const variationTopN = normalizeIntegerOrBlank(variationTopNSource, 5);
    const keywordReuseGapDays = normalizeNonNegativeInt(
        input.NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS ?? input.AUTO_KEYWORD_REUSE_GAP_DAYS,
        normalizeNonNegativeInt(
            CONFIG.NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS ?? CONFIG.AUTO_KEYWORD_REUSE_GAP_DAYS,
            NAVER_AUTO_DEFAULTS.keywordReuseGapDays
        )
    );
    const headless = toBoolLike(
        input.NAVER_AUTO_HEADLESS ?? CONFIG.NAVER_AUTO_HEADLESS,
        NAVER_AUTO_DEFAULTS.headless
    );

    return {
        NAVER_AUTO_MODE: mode,
        NAVER_AUTO_CATEGORIES: categoriesRaw,
        NAVER_AUTO_MAX_POSTS_PER_RUN: maxPostsPerRun,
        NAVER_AUTO_MIN_POST_GAP_MIN: minPostGapMin,
        NAVER_AUTO_TRENDS_TIME: trendsTime,
        NAVER_AUTO_IMAGE_GENERATION: imageGeneration,
        NAVER_AUTO_EXTERNAL_REFERENCE: externalReference,
        NAVER_AUTO_NOTIFY_ENABLED: notifyEnabled,
        NAVER_AUTO_VARIATION_INCLUDE_NEW: variationIncludeNew,
        NAVER_AUTO_VARIATION_INCLUDE_DASH: variationIncludeDash,
        NAVER_AUTO_VARIATION_INCLUDE_NUMBER: variationIncludeNumber,
        NAVER_AUTO_VARIATION_TYPE: variationType,
        NAVER_AUTO_VARIATION_NUMBER: variationNumber,
        NAVER_AUTO_VARIATION_TOP_N: variationTopN,
        NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS: keywordReuseGapDays,
        NAVER_AUTO_HEADLESS: headless,

        // legacy alias (내부 호환)
        AUTO_MODE: mode,
        AUTO_INCLUDE_CATEGORIES: categoriesRaw,
        AUTO_CATEGORIES: categoriesRaw,
        AUTO_MIN_POST_GAP_MIN: minPostGapMin,
        AUTO_INTERVAL_MIN: 60,
        AUTO_TRENDS_ENABLED: true,
        AUTO_TOPICS_ENABLED: true,
        AUTO_IMAGE_GENERATION: imageGeneration,
        AUTO_USE_EXTERNAL_REF: externalReference,
        AUTO_TRENDS_VARIATION_INCLUDE_NEW: variationIncludeNew,
        AUTO_TRENDS_VARIATION_INCLUDE_DASH: variationIncludeDash,
        AUTO_TRENDS_VARIATION_INCLUDE_NUMBER: variationIncludeNumber,
        AUTO_TRENDS_MIN_VARIATION: variationNumber,
        AUTO_KEYWORD_REUSE_GAP_DAYS: keywordReuseGapDays
    };
}

function normalizeNaverShoppingAutoSettings(input = {}) {
    const hasModeKey = Object.prototype.hasOwnProperty.call(input, 'NAVER_SHOPPING_AUTO_MODE');
    const hasLegacyModeKey = Object.prototype.hasOwnProperty.call(input, 'AUTO_SHOPPING_ENABLED');
    const hasDailyPostsKey = Object.prototype.hasOwnProperty.call(input, 'NAVER_SHOPPING_AUTO_DAILY_POSTS');
    const hasLegacyDailyPostsKey = Object.prototype.hasOwnProperty.call(input, 'AUTO_MAX_SHOPPING_PER_CYCLE');

    const mode = toBoolLike(
        hasModeKey
            ? input.NAVER_SHOPPING_AUTO_MODE
            : (hasLegacyModeKey ? input.AUTO_SHOPPING_ENABLED : CONFIG.NAVER_SHOPPING_AUTO_MODE),
        toBoolLike(CONFIG.NAVER_SHOPPING_AUTO_MODE, NAVER_SHOPPING_AUTO_DEFAULTS.mode)
    );
    const dailyPosts = normalizeNonNegativeInt(
        hasDailyPostsKey
            ? input.NAVER_SHOPPING_AUTO_DAILY_POSTS
            : (hasLegacyDailyPostsKey ? input.AUTO_MAX_SHOPPING_PER_CYCLE : CONFIG.NAVER_SHOPPING_AUTO_DAILY_POSTS),
        normalizeNonNegativeInt(CONFIG.NAVER_SHOPPING_AUTO_DAILY_POSTS, NAVER_SHOPPING_AUTO_DEFAULTS.dailyPosts)
    );
    const time = normalizeTimeHHmm(
        input.NAVER_SHOPPING_AUTO_TIME,
        normalizeTimeHHmm(CONFIG.NAVER_SHOPPING_AUTO_TIME, NAVER_SHOPPING_AUTO_DEFAULTS.time)
    );
    const notifyEnabled = toBoolLike(
        input.NAVER_SHOPPING_AUTO_NOTIFY_ENABLED,
        toBoolLike(CONFIG.NAVER_SHOPPING_AUTO_NOTIFY_ENABLED, NAVER_SHOPPING_AUTO_DEFAULTS.notifyEnabled)
    );

    return {
        NAVER_SHOPPING_AUTO_MODE: mode,
        NAVER_SHOPPING_AUTO_DAILY_POSTS: dailyPosts,
        NAVER_SHOPPING_AUTO_TIME: time,
        NAVER_SHOPPING_AUTO_NOTIFY_ENABLED: notifyEnabled,

        // legacy alias (내부 호환)
        AUTO_SHOPPING_ENABLED: mode,
        AUTO_MAX_SHOPPING_PER_CYCLE: dailyPosts
    };
}

function applyConfigUpdates(raw, updates = {}) {
    const nextUpdates = { ...updates };
    const lines = String(raw || '').split(/\r?\n/);
    const pendingKeys = new Set(Object.keys(nextUpdates));
    const nextLines = lines.map((line) => {
        if (/^\s*#/.test(line) || !line.includes('=')) return line;
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
        if (!match) return line;
        const key = match[1];
        if (!pendingKeys.has(key)) return line;
        pendingKeys.delete(key);
        const indent = (line.match(/^\s*/) || [''])[0];
        return `${indent}${key} = ${nextUpdates[key]}`;
    });

    if (pendingKeys.size > 0) {
        if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
            nextLines.push('');
        }
        for (const key of pendingKeys) {
            nextLines.push(`${key} = ${nextUpdates[key]}`);
        }
    }

    return nextLines.join('\n');
}

function buildMajorSettings(raw, configSource) {
    const fallbackTyping = normalizeTypingSpeed(CONFIG.TYPING_SPEED, 'NORMAL');
    const fallbackListenHost = normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST);
    const fallbackListenPort = normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT);
    const naverId = parseConfigValue(raw, 'NAVER_ID') || String(CONFIG.NAVER_ID || '');
    const geminiApiKey = parseConfigValue(raw, 'GEMINI_API_KEY') || String(CONFIG.GEMINI_API_KEY || '');
    const googleSheetUrlRaw = parseConfigValue(raw, 'GOOGLE_SHEET_URL') || String(CONFIG.GOOGLE_SHEET_URL || '');
    const legacySheetId = parseConfigValue(raw, 'GOOGLE_SHEET_ID') || String(CONFIG.GOOGLE_SHEET_ID || '');
    const googleSheetUrl = normalizeGoogleSheetUrl(googleSheetUrlRaw, legacySheetId);
    const listenHostRaw = parseConfigValue(raw, 'LISTEN_HOST');
    const listenPortRaw = parseConfigValue(raw, 'LISTEN_PORT');
    const headlessRaw = parseConfigValue(raw, 'HEADLESS');
    const typingRaw = parseConfigValue(raw, 'TYPING_SPEED');
    const ftcImageUrl = parseConfigValue(raw, 'FTC_DISCLOSURE_IMAGE_URL') || String(CONFIG.FTC_DISCLOSURE_IMAGE_URL || '');
    const ctaImageUrl1 = parseConfigValue(raw, 'SHOPPING_CTA_IMAGE_URL1') || String(CONFIG.SHOPPING_CTA_IMAGE_URL1 || '');
    const ctaImageUrl2 = parseConfigValue(raw, 'SHOPPING_CTA_IMAGE_URL2') || String(CONFIG.SHOPPING_CTA_IMAGE_URL2 || '');
    const ctaImageUrl3 = parseConfigValue(raw, 'SHOPPING_CTA_IMAGE_URL3') || String(CONFIG.SHOPPING_CTA_IMAGE_URL3 || '');
    const updateChannel = parseConfigValue(raw, 'UPDATE_CHANNEL') || String(CONFIG.UPDATE_CHANNEL || 'stable');
    const autoSettings = normalizeNaverAutoSettings({
        NAVER_AUTO_MODE: parseConfigValue(raw, 'NAVER_AUTO_MODE') || parseConfigValue(raw, 'AUTO_MODE'),
        NAVER_AUTO_CATEGORIES:
            parseConfigValue(raw, 'NAVER_AUTO_CATEGORIES')
            || parseConfigValue(raw, 'AUTO_INCLUDE_CATEGORIES')
            || parseConfigValue(raw, 'AUTO_CATEGORIES'),
        NAVER_AUTO_MAX_POSTS_PER_RUN:
            parseConfigValue(raw, 'NAVER_AUTO_MAX_POSTS_PER_RUN')
            || parseConfigValue(raw, 'NAVER_AUTO_DAILY_POSTS')
            || parseConfigValue(raw, 'AUTO_MAX_BLOG_PER_CYCLE')
            || parseConfigValue(raw, 'AUTO_DAILY_BLOG_CAP'),
        NAVER_AUTO_TRENDS_TIME: parseConfigValue(raw, 'NAVER_AUTO_TRENDS_TIME'),
        NAVER_AUTO_IMAGE_GENERATION: parseConfigValue(raw, 'NAVER_AUTO_IMAGE_GENERATION') || parseConfigValue(raw, 'AUTO_IMAGE_GENERATION'),
        NAVER_AUTO_EXTERNAL_REFERENCE: parseConfigValue(raw, 'NAVER_AUTO_EXTERNAL_REFERENCE') || parseConfigValue(raw, 'AUTO_USE_EXTERNAL_REF'),
        NAVER_AUTO_NOTIFY_ENABLED: parseConfigValue(raw, 'NAVER_AUTO_NOTIFY_ENABLED'),
        NAVER_AUTO_VARIATION_INCLUDE_NEW: parseConfigValue(raw, 'NAVER_AUTO_VARIATION_INCLUDE_NEW') || parseConfigValue(raw, 'AUTO_TRENDS_VARIATION_INCLUDE_NEW'),
        NAVER_AUTO_VARIATION_INCLUDE_DASH: parseConfigValue(raw, 'NAVER_AUTO_VARIATION_INCLUDE_DASH') || parseConfigValue(raw, 'AUTO_TRENDS_VARIATION_INCLUDE_DASH'),
        NAVER_AUTO_VARIATION_INCLUDE_NUMBER: parseConfigValue(raw, 'NAVER_AUTO_VARIATION_INCLUDE_NUMBER') || parseConfigValue(raw, 'AUTO_TRENDS_VARIATION_INCLUDE_NUMBER'),
        NAVER_AUTO_VARIATION_TYPE: parseConfigValue(raw, 'NAVER_AUTO_VARIATION_TYPE') || 'min',
        NAVER_AUTO_VARIATION_NUMBER: parseConfigValue(raw, 'NAVER_AUTO_VARIATION_NUMBER') || parseConfigValue(raw, 'AUTO_TRENDS_MIN_VARIATION'),
        NAVER_AUTO_VARIATION_TOP_N: parseConfigValue(raw, 'NAVER_AUTO_VARIATION_TOP_N') || parseConfigValue(raw, 'AUTO_TRENDS_TOP_N'),
        NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS: parseConfigValue(raw, 'NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS') || parseConfigValue(raw, 'AUTO_KEYWORD_REUSE_GAP_DAYS'),
        NAVER_AUTO_HEADLESS: parseConfigValue(raw, 'NAVER_AUTO_HEADLESS')
    });
    const shoppingAutoSettings = normalizeNaverShoppingAutoSettings({
        NAVER_SHOPPING_AUTO_MODE: parseConfigValue(raw, 'NAVER_SHOPPING_AUTO_MODE'),
        NAVER_SHOPPING_AUTO_DAILY_POSTS: parseConfigValue(raw, 'NAVER_SHOPPING_AUTO_DAILY_POSTS'),
        NAVER_SHOPPING_AUTO_TIME: parseConfigValue(raw, 'NAVER_SHOPPING_AUTO_TIME'),
        NAVER_SHOPPING_AUTO_NOTIFY_ENABLED: parseConfigValue(raw, 'NAVER_SHOPPING_AUTO_NOTIFY_ENABLED')
    });
    const listenHost = normalizeListenHost(listenHostRaw, fallbackListenHost);
    const listenPort = normalizeListenPort(listenPortRaw, fallbackListenPort);
    const headless = parseConfigBool(headlessRaw, Boolean(CONFIG.HEADLESS));
    const typingSpeed = normalizeTypingSpeed(typingRaw, fallbackTyping);

    const fields = {
        LISTEN_HOST: listenHost,
        LISTEN_PORT: listenPort,
        NAVER_ID: naverId,
        GEMINI_API_KEY: geminiApiKey,
        GOOGLE_SHEET_URL: googleSheetUrl,
        HEADLESS: headless,
        TYPING_SPEED: typingSpeed,
        FTC_DISCLOSURE_IMAGE_URL: ftcImageUrl,
        SHOPPING_CTA_IMAGE_URL1: ctaImageUrl1,
        SHOPPING_CTA_IMAGE_URL2: ctaImageUrl2,
        SHOPPING_CTA_IMAGE_URL3: ctaImageUrl3,
        UPDATE_CHANNEL: updateChannel,
        NAVER_AUTO_MODE: autoSettings.NAVER_AUTO_MODE,
        NAVER_AUTO_CATEGORIES: autoSettings.NAVER_AUTO_CATEGORIES,
        NAVER_AUTO_MAX_POSTS_PER_RUN: autoSettings.NAVER_AUTO_MAX_POSTS_PER_RUN,
        NAVER_AUTO_TRENDS_TIME: autoSettings.NAVER_AUTO_TRENDS_TIME,
        NAVER_AUTO_IMAGE_GENERATION: autoSettings.NAVER_AUTO_IMAGE_GENERATION,
        NAVER_AUTO_EXTERNAL_REFERENCE: autoSettings.NAVER_AUTO_EXTERNAL_REFERENCE,
        NAVER_AUTO_NOTIFY_ENABLED: autoSettings.NAVER_AUTO_NOTIFY_ENABLED,
        NAVER_AUTO_VARIATION_INCLUDE_NEW: autoSettings.NAVER_AUTO_VARIATION_INCLUDE_NEW,
        NAVER_AUTO_VARIATION_INCLUDE_DASH: autoSettings.NAVER_AUTO_VARIATION_INCLUDE_DASH,
        NAVER_AUTO_VARIATION_INCLUDE_NUMBER: autoSettings.NAVER_AUTO_VARIATION_INCLUDE_NUMBER,
        NAVER_AUTO_VARIATION_TYPE: autoSettings.NAVER_AUTO_VARIATION_TYPE,
        NAVER_AUTO_VARIATION_NUMBER: autoSettings.NAVER_AUTO_VARIATION_NUMBER,
        NAVER_AUTO_VARIATION_TOP_N: autoSettings.NAVER_AUTO_VARIATION_TOP_N,
        NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS: autoSettings.NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS,
        NAVER_AUTO_HEADLESS: autoSettings.NAVER_AUTO_HEADLESS,
        NAVER_SHOPPING_AUTO_MODE: shoppingAutoSettings.NAVER_SHOPPING_AUTO_MODE,
        NAVER_SHOPPING_AUTO_DAILY_POSTS: shoppingAutoSettings.NAVER_SHOPPING_AUTO_DAILY_POSTS,
        NAVER_SHOPPING_AUTO_TIME: shoppingAutoSettings.NAVER_SHOPPING_AUTO_TIME,
        NAVER_SHOPPING_AUTO_NOTIFY_ENABLED: shoppingAutoSettings.NAVER_SHOPPING_AUTO_NOTIFY_ENABLED
    };

    return {
        configPath: configSource?.path || '',
        configSourceType: configSource?.sourceType || 'config',
        fields,
        typingSpeedOptions: ALLOWED_TYPING_SPEEDS,
        shoppingImageDefaults: { ...DEFAULT_SHOPPING_IMAGE_SOURCES },
        shoppingImageSlots: buildShoppingImageSlots(fields)
    };
}

function applyRuntimeConfigFromMajor(fields = {}) {
    const listenHost = normalizeListenHost(fields.LISTEN_HOST, normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST));
    const listenPort = normalizeListenPort(fields.LISTEN_PORT, normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT));
    const naverId = String(fields.NAVER_ID || '').trim();
    const geminiApiKey = String(fields.GEMINI_API_KEY || '').trim();
    const googleSheetUrl = normalizeGoogleSheetUrl(fields.GOOGLE_SHEET_URL, CONFIG.GOOGLE_SHEET_ID);
    const googleSheetId = extractGoogleSheetId(googleSheetUrl);
    const headless = Boolean(fields.HEADLESS);
    const typingSpeed = normalizeTypingSpeed(fields.TYPING_SPEED, 'NORMAL');
    const ftcImageUrl = String(fields.FTC_DISCLOSURE_IMAGE_URL || '').trim();
    const ctaImageUrl1 = String(fields.SHOPPING_CTA_IMAGE_URL1 || '').trim();
    const ctaImageUrl2 = String(fields.SHOPPING_CTA_IMAGE_URL2 || '').trim();
    const ctaImageUrl3 = String(fields.SHOPPING_CTA_IMAGE_URL3 || '').trim();
    const autoSettings = normalizeNaverAutoSettings(fields);
    const shoppingAutoSettings = normalizeNaverShoppingAutoSettings(fields);

    CONFIG.NAVER_ID = naverId;
    CONFIG.LISTEN_HOST = listenHost;
    CONFIG.LISTEN_PORT = listenPort;
    CONFIG.GEMINI_API_KEY = geminiApiKey;
    CONFIG.GOOGLE_SHEET_URL = googleSheetUrl;
    CONFIG.GOOGLE_SHEET_ID = googleSheetId;
    CONFIG.HEADLESS = headless;
    CONFIG.TYPING_SPEED = typingSpeed;
    CONFIG.TYPING = CONFIG.TYPING_PRESETS?.[typingSpeed] || CONFIG.TYPING;
    CONFIG.WRITE_URL = `https://blog.naver.com/${naverId}/postwrite`;
    CONFIG.FTC_DISCLOSURE_IMAGE_URL = ftcImageUrl;
    CONFIG.SHOPPING_CTA_IMAGE_URL1 = ctaImageUrl1;
    CONFIG.SHOPPING_CTA_IMAGE_URL2 = ctaImageUrl2;
    CONFIG.SHOPPING_CTA_IMAGE_URL3 = ctaImageUrl3;
    Object.assign(CONFIG, autoSettings);
    Object.assign(CONFIG, shoppingAutoSettings);
}

function parseMajorFieldsFromRequest(requestBody = {}) {
    const listenHost = normalizeListenHost(requestBody.LISTEN_HOST, DEFAULT_HOST);
    const listenPort = normalizeListenPort(requestBody.LISTEN_PORT, DEFAULT_PORT);
    const naverId = String(requestBody.NAVER_ID || '').trim();
    const geminiApiKey = String(requestBody.GEMINI_API_KEY || '').trim();
    const googleSheetUrl = normalizeGoogleSheetUrl(requestBody.GOOGLE_SHEET_URL, requestBody.GOOGLE_SHEET_ID);
    const headless = normalizeBool(requestBody.HEADLESS, false);
    const typingSpeed = normalizeTypingSpeed(requestBody.TYPING_SPEED, 'NORMAL');
    const ftcImageUrl = String(requestBody.FTC_DISCLOSURE_IMAGE_URL || '').trim();
    const ctaImageUrl1 = String(requestBody.SHOPPING_CTA_IMAGE_URL1 || '').trim();
    const ctaImageUrl2 = String(requestBody.SHOPPING_CTA_IMAGE_URL2 || '').trim();
    const ctaImageUrl3 = String(requestBody.SHOPPING_CTA_IMAGE_URL3 || '').trim();
    const autoSettings = normalizeNaverAutoSettings(requestBody);
    const shoppingAutoSettings = normalizeNaverShoppingAutoSettings(requestBody);
    return {
        LISTEN_HOST: listenHost,
        LISTEN_PORT: listenPort,
        NAVER_ID: naverId,
        GEMINI_API_KEY: geminiApiKey,
        GOOGLE_SHEET_URL: googleSheetUrl,
        HEADLESS: headless,
        TYPING_SPEED: typingSpeed,
        FTC_DISCLOSURE_IMAGE_URL: ftcImageUrl,
        SHOPPING_CTA_IMAGE_URL1: ctaImageUrl1,
        SHOPPING_CTA_IMAGE_URL2: ctaImageUrl2,
        SHOPPING_CTA_IMAGE_URL3: ctaImageUrl3,
        ...autoSettings,
        ...shoppingAutoSettings
    };
}

function isAllowedImageSourceValue(value) {
    const v = String(value || '').trim();
    if (!v) return true;
    if (/^https:\/\//i.test(v)) return true;
    if (/^http:\/\//i.test(v)) return false;
    if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(v)) return false;
    return true;
}

function validateRequiredShoppingImageSources(fields = {}) {
    const errors = [];
    for (const slotInfo of Object.values(SHOPPING_IMAGE_SLOT_MAP)) {
        if (!slotInfo.required) continue;
        const value = String(fields[slotInfo.key] || '').trim();
        if (!value) {
            errors.push(`${slotInfo.label}는 필수입니다.`);
        }
    }
    return errors;
}

function resolveRuntimePath(rawPath, options = {}) {
    const raw = String(rawPath || '').trim();
    if (!raw) return '';

    if (typeof CONFIG.resolveRuntimePath === 'function') {
        const resolved = CONFIG.resolveRuntimePath(raw, options || {});
        if (resolved) return resolved;
    }

    const appRoot = CONFIG.APP_ROOT_DIR || process.cwd();
    const writablePath = resolveWritableConfigPath();
    const configDir = path.dirname(writablePath);
    const execDir = path.dirname(process.execPath || process.cwd());
    const mustExist = Boolean(options?.mustExist);

    const candidates = path.isAbsolute(raw)
        ? [raw]
        : [
            path.resolve(appRoot, raw),
            path.resolve(configDir, raw),
            path.resolve(execDir, raw)
        ];

    for (const candidate of candidates) {
        if (!mustExist || fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return '';
}

function resolveLocalImagePathFromSource(source) {
    const raw = String(source || '').trim();
    if (!raw || /^https?:\/\//i.test(raw)) return '';

    if (typeof CONFIG.resolveRuntimePath === 'function') {
        const resolved = CONFIG.resolveRuntimePath(raw, { mustExist: true });
        if (resolved) {
            try {
                if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
            } catch (e) { }
        }
    }

    const writablePath = resolveWritableConfigPath();
    const configDir = path.dirname(writablePath);
    const appRoot = CONFIG.APP_ROOT_DIR || process.cwd();
    const execDir = path.dirname(process.execPath || process.cwd());
    const candidates = [];
    if (/^file:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (parsed.protocol === 'file:') {
                const host = decodeURIComponent(parsed.hostname || '');
                let localPath = decodeURIComponent(parsed.pathname || '');
                if (host === '.') {
                    localPath = `.${localPath}`;
                } else if (host && host !== 'localhost') {
                    localPath = `//${host}${localPath}`;
                }
                if (process.platform === 'win32' && /^[\/\\][A-Za-z]:/.test(localPath)) {
                    localPath = localPath.slice(1);
                }
                if (localPath) candidates.push(localPath);
            }
        } catch (e) {
            const afterScheme = raw.replace(/^file:\/\//i, '');
            if (afterScheme) candidates.push(afterScheme);
        }
    } else {
        candidates.push(raw);
    }

    const expanded = [];
    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim();
        if (!normalized) continue;
        if (path.isAbsolute(normalized)) {
            expanded.push(normalized);
        } else {
            expanded.push(path.resolve(appRoot, normalized));
            expanded.push(path.resolve(configDir, normalized));
            expanded.push(path.resolve(execDir, normalized));
        }
    }

    for (const candidate of expanded) {
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        } catch (e) { }
    }

    return '';
}

function buildShoppingImageSlots(fields = {}) {
    const slots = {};
    for (const [slot, info] of Object.entries(SHOPPING_IMAGE_SLOT_MAP)) {
        const source = String(fields[info.key] || '').trim();
        const isRemote = /^https?:\/\//i.test(source);
        const isLocal = !!source && !isRemote;
        const defaultSource = String(DEFAULT_SHOPPING_IMAGE_SOURCES[info.key] || '').trim();
        const previewUrl = source
            ? (isLocal
                ? `/api/v1/settings/shopping-image/preview?slot=${encodeURIComponent(slot)}&_t=${Date.now()}`
                : source)
            : '';
        slots[slot] = {
            slot,
            label: info.label,
            key: info.key,
            source,
            defaultSource,
            required: Boolean(info.required),
            mode: source ? (isLocal ? 'local' : 'remote') : 'empty',
            previewUrl
        };
    }
    return slots;
}

function inferImageExt(fileName = '', mimeType = '') {
    const fromName = path.extname(String(fileName || '')).toLowerCase();
    if (ALLOWED_IMAGE_EXTS.has(fromName)) return fromName;
    const m = String(mimeType || '').toLowerCase();
    if (m.includes('png')) return '.png';
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    return '';
}

function parseBase64ImagePayload(requestBody = {}) {
    const fileName = String(requestBody.fileName || '').trim();
    const mimeType = String(requestBody.mimeType || '').trim();
    let base64Data = String(requestBody.base64Data || '').trim();
    if (!base64Data) throw new Error('이미지 데이터가 비어 있습니다.');

    const dataUrlMatch = base64Data.match(/^data:([^;,]+);base64,(.+)$/i);
    if (dataUrlMatch) {
        if (!mimeType) {
            requestBody.mimeType = dataUrlMatch[1] || '';
        }
        base64Data = dataUrlMatch[2] || '';
    }

    const ext = inferImageExt(fileName, mimeType || requestBody.mimeType || '');
    if (!ext) throw new Error('지원하지 않는 이미지 형식입니다. (png/jpg/jpeg/webp/gif)');

    let buffer;
    try {
        buffer = Buffer.from(base64Data, 'base64');
    } catch (e) {
        throw new Error('이미지 base64 디코딩에 실패했습니다.');
    }
    if (!buffer || buffer.length < 128) throw new Error('이미지 데이터가 너무 작습니다.');
    if (buffer.length > 10 * 1024 * 1024) throw new Error('이미지 파일이 너무 큽니다. (최대 10MB)');

    return { buffer, ext };
}

function isNaverLoginCompletedUrl(urlLike) {
    const urlStr = String(urlLike || '');
    return /naver\.com/i.test(urlStr) && !/nid\.naver\.com|nidlogin\.login/i.test(urlStr);
}

async function waitForNaverLoginCompleted(page, context, timeoutMs = 300000) {
    const start = Date.now();
    const pollIntervalMs = 500;

    const samePageWait = page.waitForURL(url => isNaverLoginCompletedUrl(url), { timeout: timeoutMs })
        .then(() => 'same-page-url')
        .catch(() => null);

    const pollWait = (async () => {
        while (Date.now() - start < timeoutMs) {
            for (const p of context.pages()) {
                try {
                    if (isNaverLoginCompletedUrl(p.url())) {
                        return 'any-page-url';
                    }
                } catch (e) { }
            }

            try {
                const cookies = await context.cookies([
                    'https://www.naver.com',
                    'https://naver.com',
                    'https://nid.naver.com'
                ]);
                const hasAuthCookie = cookies.some(c =>
                    c && (c.name === 'NID_AUT' || c.name === 'NID_SES')
                );
                if (hasAuthCookie) {
                    return 'auth-cookie';
                }
            } catch (e) { }

            await Utils.sleep(pollIntervalMs);
        }
        return null;
    })();

    const reason = await Promise.race([samePageWait, pollWait]);
    if (!reason) {
        throw new Error('네이버 로그인 완료를 확인하지 못했습니다. 다시 시도해 주세요.');
    }
    return reason;
}

async function closeBrowserResources(context, browser) {
    try { if (context) await context.close(); } catch (e) { }
    try { if (browser) await browser.close(); } catch (e) { }
}

async function runNaverLoginFlowForUi() {
    let browser = null;
    let context = null;
    try {
        Logger.info('🔐 [UI] 네이버 로그인 프로세스 시작');
        setNaverLoginState({
            status: 'running',
            message: '브라우저 실행 중...',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            detectedBy: '',
            error: ''
        });

        browser = await BrowserLauncher.launchBrowser({ headless: false });
        Logger.info('🔐 [UI] 로그인 브라우저 실행 완료');
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        setNaverLoginState({
            status: 'running',
            message: '로그인 페이지를 여는 중...'
        });
        await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

        setNaverLoginState({
            status: 'running',
            message: '브라우저에서 로그인 후 완료를 기다리는 중...'
        });
        const detectedBy = await waitForNaverLoginCompleted(page, context, 300000);
        Logger.info(`✅ [UI] 네이버 로그인 완료 감지 (${detectedBy})`);

        const authPath = CONFIG.AUTH_FILE_PATH;
        fs.mkdirSync(path.dirname(authPath), { recursive: true });
        await context.storageState({ path: authPath });
        Logger.info(`✅ [UI] 로그인 인증 저장 완료: ${authPath}`);

        setNaverLoginState({
            status: 'success',
            message: `로그인 완료 및 인증 저장됨 (${authPath})`,
            finishedAt: new Date().toISOString(),
            detectedBy,
            error: ''
        });
    } catch (e) {
        Logger.error(`❌ [UI] 네이버 로그인 실패: ${e.message}`);
        setNaverLoginState({
            status: 'failed',
            message: '로그인 실패',
            finishedAt: new Date().toISOString(),
            error: String(e?.message || 'unknown error')
        });
    } finally {
        await closeBrowserResources(context, browser);
    }
}

async function executeQuickPublish(requestBody) {
    const subject = String(requestBody?.subject || '').trim();
    const keywords = normalizeKeywords(requestBody?.keywords);
    const instruction = String(requestBody?.instruction || '').trim();
    const externalReference = normalizeBool(requestBody?.externalReference, true);
    const imageGenerationRequested = normalizeBool(requestBody?.imageGeneration, false);
    const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
    const referenceUrl = String(requestBody?.referenceUrl || '').trim();
    const publishMode = normalizePublishMode(requestBody?.publishMode);

    if (!subject) {
        return { success: false, code: 'INVALID_SUBJECT', message: 'Subject는 필수입니다.' };
    }

    if (referenceUrl && !/^https?:\/\//i.test(referenceUrl)) {
        return { success: false, code: 'INVALID_REFERENCE_URL', message: '참고 URL 형식이 올바르지 않습니다. (http/https)' };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }

    const features = toFeatureMap(precheck.features);
    if (publishMode === 'append_and_publish' && !isCommandEnabled(features, 'batch')) {
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 즉시 발행 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
    }

    const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);
    const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
    const imageGenerationFinal = imageGenerationRequested && imageGenerationEnabledByPlan;

    const nowMs = Date.now();
    cleanupQuickPublishDedupeCache(nowMs);
    const dedupeKey = buildQuickPublishDedupeKey({
        subject,
        keywords,
        instruction,
        referenceUrl,
        imageGeneration: imageGenerationFinal,
        externalReference
    });
    const existingEntry = quickPublishRecentMap.get(dedupeKey) || null;

    await Utils.ensureAllSheetsExist();

    let appendStatus = publishMode === 'append_and_publish' ? '블로그 발행 준비 완료' : '대기';
    let rowNumber = null;
    let rowIndex = null;
    let deduplicated = false;

    if (existingEntry && Number.isInteger(existingEntry.rowIndex)) {
        deduplicated = true;
        rowNumber = existingEntry.rowNumber ?? null;
        rowIndex = existingEntry.rowIndex;
        appendStatus = existingEntry.status || appendStatus;

        if (publishMode === 'append_only') {
            return {
                success: true,
                data: {
                    mode: publishMode,
                    sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                    rowNumber,
                    rowIndex,
                    status: appendStatus,
                    deduplicated
                }
            };
        }

        if (existingEntry.published) {
            return {
                success: true,
                data: {
                    mode: publishMode,
                    sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                    rowNumber,
                    rowIndex,
                    status: '블로그 발행 완료',
                    deduplicated,
                    targetDir: existingEntry.targetDir || null
                }
            };
        }

        if (appendStatus !== '블로그 발행 준비 완료' && Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '기존 글감 재사용');
            appendStatus = '블로그 발행 준비 완료';
        }
        quickPublishRecentMap.set(dedupeKey, {
            ...existingEntry,
            status: appendStatus,
            updatedAtMs: nowMs
        });
    } else {
        const appendResult = await Utils.appendGoogleSheetTopics([{
            subject,
            keywords,
            content_guide: {
                additional_instructions: instruction,
                reference_urls: referenceUrl ? [referenceUrl] : []
            },
            use_external_ref: externalReference,
            image_options: {
                generate: imageGenerationFinal,
                count: 4
            },
            source: 'manual',
            trendDate: '',
            status: appendStatus
        }], {
            defaultStatus: appendStatus
        });

        if (!appendResult?.success) {
            return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 시트 추가에 실패했습니다.' };
        }

        rowNumber = Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] : null;
        rowIndex = Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] : null;

        quickPublishRecentMap.set(dedupeKey, {
            rowNumber,
            rowIndex,
            status: appendStatus,
            published: false,
            targetDir: null,
            updatedAtMs: nowMs
        });
    }

    if (publishMode === 'append_only') {
        return {
            success: true,
            data: {
                mode: publishMode,
                sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                rowNumber,
                rowIndex,
                status: appendStatus,
                deduplicated
            }
        };
    }

    const session = await checkAuthSessionValid();
    if (!session.ok) {
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const topicData = {
        rowIndex: Number.isInteger(rowIndex) ? rowIndex : 0,
        subject,
        keywords,
        content_guide: {
            additional_instructions: instruction,
            reference_urls: referenceUrl ? [referenceUrl] : []
        },
        use_external_ref: externalReference,
        image_options: {
            generate: imageGenerationFinal,
            count: 4
        },
        status: '블로그 발행 준비 완료'
    };

    try {
        const result = await Core.generateContent(topicData, null, {
            enableRelatedPostsAutoLink
        });
        await Core.prepareImages(result.targetDir, topicData, {
            imageGenerationEnabled: imageGenerationFinal
        });

        const verify = await License.verifyLicense();
        if (!verify.success) {
            if (Number.isInteger(rowIndex)) {
                await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '라이선스 부족으로 발행 보류');
            }
            quickPublishRecentMap.set(dedupeKey, {
                rowNumber,
                rowIndex,
                status: '블로그 발행 준비 완료',
                published: false,
                targetDir: null,
                updatedAtMs: Date.now()
            });
            return {
                success: false,
                code: 'LICENSE_VERIFY_FAILED',
                message: verify.message
            };
        }

        if (Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '발행 시작');
        }

        await Core.publishToBlog(result.targetDir, { headless });

        if (Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 완료', '발행 완료');
        }
        quickPublishRecentMap.set(dedupeKey, {
            rowNumber,
            rowIndex,
            status: '블로그 발행 완료',
            published: true,
            targetDir: result.targetDir || null,
            updatedAtMs: Date.now()
        });

        return {
            success: true,
            data: {
                mode: publishMode,
                sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                rowNumber,
                rowIndex,
                status: '블로그 발행 완료',
                deduplicated,
                targetDir: result.targetDir
            }
        };
    } catch (e) {
        if (Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '실패', e.message);
        }
        quickPublishRecentMap.set(dedupeKey, {
            rowNumber,
            rowIndex,
            status: '실패',
            published: false,
            targetDir: null,
            updatedAtMs: Date.now()
        });
        return {
            success: false,
            code: 'QUICK_PUBLISH_FAILED',
            message: e.message
        };
    }
}

async function executeShoppingQuickPublish(requestBody = {}) {
    const shortUrl = String(requestBody?.shortUrl || requestBody?.url || '').trim();
    const product = String(requestBody?.product || '').trim();
    const publishMode = normalizePublishMode(requestBody?.publishMode);

    if (!shortUrl) {
        return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL은 필수입니다.' };
    }
    if (!/^https?:\/\//i.test(shortUrl)) {
        return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL 형식이 올바르지 않습니다. (http/https)' };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }
    const features = toFeatureMap(precheck.features);
    if (publishMode === 'append_and_publish' && !isCommandEnabled(features, 'shopping')) {
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)' };
    }

    await Utils.ensureAllSheetsExist();
    const appendStatus = publishMode === 'append_and_publish' ? '발행 준비 완료' : '준비';
    const appendResult = await Utils.appendGoogleSheetShopping([{
        shortUrl,
        product,
        status: appendStatus
    }], {
        defaultStatus: appendStatus
    });

    if (!appendResult?.success) {
        return {
            success: false,
            code: 'SHOPPING_APPEND_FAILED',
            message: appendResult?.message || 'shopping 시트 추가에 실패했습니다.'
        };
    }

    const rowNumber = Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] : null;
    const rowIndex = Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] : null;

    if (publishMode === 'append_only') {
        return {
            success: true,
            data: {
                mode: publishMode,
                sheet: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping',
                rowNumber,
                rowIndex,
                status: appendStatus
            }
        };
    }

    if (!Number.isInteger(rowIndex)) {
        return {
            success: false,
            code: 'SHOPPING_APPEND_ROW_INDEX_MISSING',
            message: '추가된 행 인덱스를 확인하지 못했습니다.'
        };
    }

    const session = await checkAuthSessionValid();
    if (!session.ok) {
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const result = await executeShoppingRowAction(
        { rowIndex },
        { enableRelatedPostsAutoLink: getFeatureBool(features, 'enable_related_posts_auto_link', true) }
    );

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        data: {
            mode: publishMode,
            sheet: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping',
            rowNumber,
            rowIndex,
            ...(result.data || {})
        }
    };
}

async function executeBlogRowAction(requestBody, options = {}) {
    const action = String(requestBody?.action || '').trim().toLowerCase();
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const emitProgress = (message) => {
        if (!onProgress) return;
        try {
            onProgress(String(message || ''));
        } catch (e) { }
    };

    if (!['gen', 'batch'].includes(action)) {
        return { success: false, code: 'INVALID_ACTION', message: '지원하지 않는 action입니다. (gen|batch)' };
    }
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const topics = await Utils.readGoogleSheetTopicsAll({ limit: 100000, offset: 0 });
    const topicData = (topics.items || []).find(item => item.rowIndex === rowIndex);
    if (!topicData) {
        return { success: false, code: 'TOPIC_NOT_FOUND', message: `대상 rowIndex(${rowIndex})를 찾지 못했습니다.` };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }
    const features = toFeatureMap(precheck.features);
    const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
    const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);

    const topicPayload = {
        rowIndex: topicData.rowIndex,
        subject: topicData.subject,
        keywords: topicData.keywords || [],
        content_guide: {
            additional_instructions: topicData.content_guide?.additional_instructions || '',
            reference_urls: topicData.content_guide?.reference_urls || []
        },
        use_external_ref: topicData.use_external_ref === true,
        image_options: {
            generate: topicData.image_options?.generate === true,
            count: parseIntSafe(topicData.image_options?.count, 4, 1) || 4
        },
        status: topicData.status
    };

    const imageGenerationFinal = imageGenerationEnabledByPlan && topicPayload.image_options.generate;

    try {
        // action=batch(발행)은 생성/이미지 준비 전에 세션을 먼저 확인해
        // 불필요한 대기/비용이 발생하지 않도록 한다.
        if (action === 'batch') {
            const session = await checkAuthSessionValid();
            if (!session.ok) {
                await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '네이버 세션 만료');
                return {
                    success: false,
                    code: 'NAVER_SESSION_INVALID',
                    message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
                };
            }
        }

        emitProgress('콘텐츠 생성 중...');
        const result = await Core.generateContent(topicPayload, null, {
            enableRelatedPostsAutoLink
        });
        emitProgress('이미지 준비 중...');
        await Core.prepareImages(result.targetDir, topicPayload, {
            imageGenerationEnabled: imageGenerationFinal
        });

        if (action === 'gen') {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', `생성 완료: ${path.basename(result.targetDir)}`);
            return {
                success: true,
                data: {
                    action,
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    status: '블로그 발행 준비 완료',
                    targetDir: result.targetDir
                }
            };
        }

        // action=batch (단건 생성+발행)
        if (!isCommandEnabled(features, 'batch')) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '플랜 정책으로 발행 불가(cmd_batch=false)');
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
        }

        emitProgress('라이선스 확인 중...');
        const verify = await License.verifyLicense();
        if (!verify.success) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '라이선스 부족으로 발행 보류');
            return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
        }

        await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '발행 시작');
        emitProgress('블로그 발행 중...');

        const autoSettings = getAutoSettingsSnapshot();
        const batchHeadless = typeof requestBody?.headless === 'boolean'
            ? requestBody.headless : autoSettings.NAVER_AUTO_HEADLESS;

        await Core.publishToBlog(result.targetDir, {
            headless: batchHeadless
        });

        emitProgress('시트 상태 반영 중...');
        await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 완료', '발행 완료');

        return {
            success: true,
            data: {
                action,
                rowIndex,
                rowNumber: rowIndex + 2,
                status: '블로그 발행 완료',
                targetDir: result.targetDir
            }
        };
    } catch (e) {
        await Utils.updateGoogleSheetStatus(rowIndex, '실패', e.message);
        return { success: false, code: 'BLOG_ACTION_FAILED', message: e.message };
    }
}

async function executeBlogBatchRowsAction(requestBody) {
    try {
        await ensureSheetsReadyForUi();
    } catch (e) {
        return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${e.message}` };
    }

    const rawRowIndices = Array.isArray(requestBody?.rowIndices) ? requestBody.rowIndices : [];
    const rowIndices = Array.from(new Set(
        rawRowIndices
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));

    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: 'rowIndices는 0 이상의 정수 배열이어야 합니다.' };
    }

    // 새 배치 요청 시작 시 이전 런타임 로그를 정리한다.
    clearAllBlogRuntimeLogs();

    rowIndices.forEach((rowIndex) => {
        setBlogRuntimeLog(rowIndex, '요청 접수');
    });

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, `중단: ${precheck.message || '라이선스 확인 실패'}`);
        });
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }

    const features = toFeatureMap(precheck.features);
    if (!isCommandEnabled(features, 'batch')) {
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, '중단: 현재 플랜에서 batch 사용 불가');
        });
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
    }

    // 배치 시작 전에 세션을 1차 확인해, 로그인 만료/미로그인 상태를 즉시 안내한다.
    const initialSession = await checkAuthSessionValid();
    if (!initialSession.ok) {
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, '중단: 네이버 로그인 세션이 유효하지 않습니다.');
        });
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const featureMax = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
    const effectiveMax = featureMax === 0 ? rowIndices.length : Math.max(1, featureMax);
    const targetRowIndices = rowIndices.slice(0, effectiveMax);
    const skippedByLimit = rowIndices.slice(effectiveMax);
    const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : null;

    const results = [];
    let successCount = 0;
    let failCount = 0;

    targetRowIndices.forEach((rowIndex, i) => {
        setBlogRuntimeLog(rowIndex, `대기열 등록 (${i + 1}/${targetRowIndices.length})`);
    });

    for (let i = 0; i < targetRowIndices.length; i += 1) {
        const rowIndex = targetRowIndices[i];
        setBlogRuntimeLog(rowIndex, `처리 시작 (${i + 1}/${targetRowIndices.length})`);
        const result = await executeBlogRowAction(
            { action: 'batch', rowIndex, headless },
            {
                onProgress: (message) => setBlogRuntimeLog(rowIndex, message),
                isAutoCycle: requestBody?.isAutoCycle === true
            }
        );
        if (result.success) {
            successCount += 1;
            results.push({
                rowIndex,
                success: true,
                data: result.data
            });
            setBlogRuntimeLog(rowIndex, '완료');
            continue;
        }

        failCount += 1;
        setBlogRuntimeLog(rowIndex, `실패: ${result.message || 'unknown error'}`);
        results.push({
            rowIndex,
            success: false,
            code: result.code || 'BLOG_ACTION_FAILED',
            message: result.message || '블로그 발행 처리에 실패했습니다.'
        });

        const shouldStop = ['LICENSE_VERIFY_FAILED', 'LICENSE_STATUS_FAILED', 'NAVER_SESSION_INVALID'].includes(result.code);
        if (shouldStop) {
            const remaining = targetRowIndices.slice(i + 1);
            for (const restRowIndex of remaining) {
                setBlogRuntimeLog(restRowIndex, '중단: 이전 치명 오류로 실행 중단');
                results.push({
                    rowIndex: restRowIndex,
                    success: false,
                    code: 'SKIPPED_AFTER_FATAL_ERROR',
                    message: '이전 치명 오류로 인해 실행이 중단되었습니다.'
                });
            }
            break;
        }
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            attemptedCount: targetRowIndices.length,
            successCount,
            failCount,
            maxPerRun: effectiveMax,
            skippedByLimit,
            results
        }
    };
}

async function executeShoppingRowAction(requestBody, options = {}) {
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const progress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const report = (message) => {
        if (progress) progress(String(message || '').trim());
    };

    try {
        const shoppingResult = await Utils.readGoogleSheetShoppingAll({ limit: 100000, offset: 0 });
        const allItems = Array.isArray(shoppingResult.items) ? shoppingResult.items : [];
        const target = allItems.find(item => item.rowIndex === rowIndex);
        if (!target) {
            return { success: false, code: 'SHOPPING_ROW_NOT_FOUND', message: `shopping row(${rowIndex + 2})를 찾지 못했습니다.` };
        }
        const shortUrl = String(target.shortUrl || '').trim();
        if (!shortUrl) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL이 비어 있습니다.' };
        }

        report('상태 업데이트: 발행 중');
        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 중', false);

        report('쇼핑 콘텐츠 생성 중');
        const runtimeOptions = {
            enableRelatedPostsAutoLink: options.enableRelatedPostsAutoLink !== false
        };
        const buildResult = await ShoppingManager.buildPostFromShortUrl(shortUrl, runtimeOptions);

        report('라이선스 확인 중');
        const verify = await License.verifyLicense();
        if (!verify.success) {
            await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 준비 완료');
            return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
        }

        report('네이버 발행 단계 진행 중');

        const publishOptions = {
            affiliateUrl: shortUrl,
            requireAffiliateUrl: true
        };
        const autoSettings = getAutoSettingsSnapshot();
        const batchHeadless = typeof requestBody?.headless === 'boolean'
            ? requestBody.headless : autoSettings.NAVER_AUTO_HEADLESS;

        publishOptions.headless = batchHeadless;

        await Core.publishToBlog(buildResult.targetDir, publishOptions);
        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 완료');

        return {
            success: true,
            data: {
                rowIndex,
                rowNumber: rowIndex + 2,
                status: '발행 완료',
                shortUrl,
                targetDir: buildResult.targetDir
            }
        };
    } catch (e) {
        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '실패');
        return { success: false, code: 'SHOPPING_ACTION_FAILED', message: e.message };
    }
}

async function executeShoppingBatchRowsAction(requestBody = {}) {
    try {
        await ensureSheetsReadyForUi();
    } catch (e) {
        return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${e.message}` };
    }

    const rawRowIndices = Array.isArray(requestBody?.rowIndices) ? requestBody.rowIndices : [];
    const rowIndices = Array.from(new Set(
        rawRowIndices
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));

    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: 'rowIndices는 0 이상의 정수 배열이어야 합니다.' };
    }

    clearAllShoppingRuntimeLogs();
    rowIndices.forEach((rowIndex) => {
        setShoppingRuntimeLog(rowIndex, '요청 접수');
    });

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, `중단: ${precheck.message || '라이선스 확인 실패'}`);
        });
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }

    const features = toFeatureMap(precheck.features);
    if (!isCommandEnabled(features, 'shopping')) {
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, '중단: 현재 플랜에서 shopping 사용 불가');
        });
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)' };
    }

    const initialSession = await checkAuthSessionValid();
    if (!initialSession.ok) {
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, '중단: 네이버 로그인 세션이 유효하지 않습니다.');
        });
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const featureMax = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());
    const effectiveMax = featureMax === 0 ? rowIndices.length : Math.max(1, featureMax);
    const targetRowIndices = rowIndices.slice(0, effectiveMax);
    const skippedByLimit = rowIndices.slice(effectiveMax);
    const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);

    targetRowIndices.forEach((rowIndex, i) => {
        setShoppingRuntimeLog(rowIndex, `대기열 등록 (${i + 1}/${targetRowIndices.length})`);
    });

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetRowIndices.length; i += 1) {
        const rowIndex = targetRowIndices[i];
        setShoppingRuntimeLog(rowIndex, `처리 시작 (${i + 1}/${targetRowIndices.length})`);
        const result = await executeShoppingRowAction(
            { rowIndex },
            {
                enableRelatedPostsAutoLink,
                onProgress: (message) => setShoppingRuntimeLog(rowIndex, message)
            }
        );

        if (result.success) {
            successCount += 1;
            results.push({
                rowIndex,
                success: true,
                data: result.data
            });
            setShoppingRuntimeLog(rowIndex, '완료');
            continue;
        }

        failCount += 1;
        setShoppingRuntimeLog(rowIndex, `실패: ${result.message || 'unknown error'}`);
        results.push({
            rowIndex,
            success: false,
            code: result.code || 'SHOPPING_ACTION_FAILED',
            message: result.message || '쇼핑 발행 처리에 실패했습니다.'
        });

        const shouldStop = ['LICENSE_VERIFY_FAILED', 'LICENSE_STATUS_FAILED', 'NAVER_SESSION_INVALID'].includes(result.code);
        if (shouldStop) {
            const remaining = targetRowIndices.slice(i + 1);
            for (const restRowIndex of remaining) {
                setShoppingRuntimeLog(restRowIndex, '중단: 이전 치명 오류로 실행 중단');
                results.push({
                    rowIndex: restRowIndex,
                    success: false,
                    code: 'SKIPPED_AFTER_FATAL_ERROR',
                    message: '이전 치명 오류로 인해 실행이 중단되었습니다.'
                });
            }
            break;
        }
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            attemptedCount: targetRowIndices.length,
            successCount,
            failCount,
            maxPerRun: effectiveMax,
            skippedByLimit,
            results
        }
    };
}

async function executeShoppingAutoManualAction(requestBody = {}) {
    try {
        await ensureSheetsReadyForUi();
    } catch (e) {
        return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${e.message}` };
    }

    const settingsOverrides = (requestBody?.settingsOverrides && typeof requestBody.settingsOverrides === 'object')
        ? requestBody.settingsOverrides
        : {};
    const settings = normalizeNaverShoppingAutoSettings({
        ...CONFIG,
        ...settingsOverrides
    });

    const summary = {
        shoppingAttempted: 0,
        shoppingSuccess: 0,
        skipped: []
    };

    const targetLimit = normalizeNonNegativeInt(
        settings.NAVER_SHOPPING_AUTO_DAILY_POSTS,
        NAVER_SHOPPING_AUTO_DEFAULTS.dailyPosts
    );
    if (targetLimit <= 0) {
        summary.skipped.push('1회 최대 발행수가 0건으로 설정되어 실행을 건너뜁니다.');
        return { success: true, data: { summary } };
    }

    const shoppingRes = await Utils.readGoogleSheetShoppingAll({
        status: '발행 준비 완료',
        q: '',
        limit: 100000,
        offset: 0,
        sortBy: 'rowNumber',
        sortDir: 'asc'
    });
    const shoppingItems = Array.isArray(shoppingRes.items) ? shoppingRes.items : [];
    const rowIndices = shoppingItems
        .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0))
        .slice(0, targetLimit)
        .map((item) => item.rowIndex)
        .filter((v) => Number.isInteger(v) && v >= 0);

    summary.shoppingAttempted = rowIndices.length;
    if (rowIndices.length === 0) {
        summary.skipped.push('상태가 "발행 준비 완료"인 쇼핑 후보가 없어 실행을 건너뜁니다.');
        return { success: true, data: { summary } };
    }

    const batchResult = await executeShoppingBatchRowsAction({ action: 'batch', rowIndices });
    if (!batchResult.success) {
        return batchResult;
    }
    summary.shoppingSuccess = Number(batchResult?.data?.successCount || 0);
    const failCount = Number(batchResult?.data?.failCount || 0);
    if (failCount > 0) summary.skipped.push(`쇼핑 발행 실패 ${failCount}건`);

    return {
        success: true,
        data: {
            summary,
            batch: batchResult.data
        }
    };
}

async function executeShoppingRowUpdate(requestBody = {}) {
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const product = String(requestBody?.product || '').trim();
    const shortUrl = String(requestBody?.shortUrl || '').trim();
    const status = String(requestBody?.status || '').trim();
    const allowedStatus = new Set(['준비', '발행 준비 완료', '발행 중', '발행 완료', '실패']);

    if (shortUrl && !/^https?:\/\//i.test(shortUrl)) {
        return { success: false, code: 'INVALID_SHOPPING_URL', message: 'URL 형식이 올바르지 않습니다. (http/https)' };
    }
    if (status && !allowedStatus.has(status)) {
        return { success: false, code: 'INVALID_STATUS', message: '상태 값이 올바르지 않습니다.' };
    }

    try {
        await Utils.updateGoogleSheetShoppingEditableFields(rowIndex, {
            product,
            shortUrl,
            status
        });
        return {
            success: true,
            data: {
                rowIndex,
                rowNumber: rowIndex + 2,
                message: '수정 완료'
            }
        };
    } catch (e) {
        return {
            success: false,
            code: 'SHOPPING_ROW_UPDATE_FAILED',
            message: e.message
        };
    }
}

async function executeBlogTopicUpdate(requestBody) {
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const subject = String(requestBody?.subject || '').trim();
    if (!subject) {
        return { success: false, code: 'INVALID_SUBJECT', message: 'Subject는 비워둘 수 없습니다.' };
    }

    const referenceUrl = String(requestBody?.referenceUrl || '').trim();
    const status = String(requestBody?.status || '').trim();
    const allowedStatus = new Set(['대기', '블로그 발행 준비 완료', '발행 중', '블로그 발행 완료', '실패']);
    if (referenceUrl) {
        const urls = referenceUrl
            .split(',')
            .map(v => String(v || '').trim())
            .filter(Boolean);
        const invalid = urls.find(u => !/^https?:\/\//i.test(u));
        if (invalid) {
            return { success: false, code: 'INVALID_REFERENCE_URL', message: `참고 URL 형식이 올바르지 않습니다: ${invalid}` };
        }
    }
    if (status && !allowedStatus.has(status)) {
        return { success: false, code: 'INVALID_STATUS', message: '상태 값이 올바르지 않습니다.' };
    }

    try {
        await Utils.updateGoogleSheetTopicEditableFields(rowIndex, {
            subject,
            keywords: String(requestBody?.keywords || '').trim(),
            instruction: String(requestBody?.instruction || '').trim(),
            referenceUrl,
            status,
            imageGeneration: normalizeBool(requestBody?.imageGeneration, false),
            externalReference: normalizeBool(requestBody?.externalReference, true)
        });

        return {
            success: true,
            data: {
                rowIndex,
                rowNumber: rowIndex + 2,
                message: '수정 완료'
            }
        };
    } catch (e) {
        return {
            success: false,
            code: 'TOPIC_UPDATE_FAILED',
            message: e.message
        };
    }
}

async function executeTrendCollectAction(requestBody = {}) {
    try {
        await ensureSheetsReadyForUi();
    } catch (e) {
        return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${e.message}` };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }
    const features = toFeatureMap(precheck.features);
    if (!isCommandEnabled(features, 'trends')) {
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 trends 기능이 비활성화되어 있습니다. (cmd_trends=false)' };
    }
    const dateInput = String(requestBody?.date || '').trim();
    const includeCategories = parseCsvTokens(requestBody?.categories);
    const explicitTargetDate = normalizeYmdToken(dateInput);
    if (dateInput && !getFeatureBool(features, 'enable_trends_date_override', false)) {
        return {
            success: false,
            code: 'FEATURE_DISABLED',
            message: '현재 플랜에서 날짜 지정 트렌드 기능이 비활성화되어 있습니다. (enable_trends_date_override=false)'
        };
    }

    const session = await checkAuthSessionValid();
    if (!session.ok) {
        return { success: false, code: 'NAVER_SESSION_INVALID', message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 로그인해 주세요.' };
    }

    // 수집 전 pre-check:
    // 날짜(YYYY-MM-DD/YYYYMMDD) + 카테고리 지정인 경우,
    // 해당 날짜/카테고리 데이터가 이미 trends 시트에 존재하면 수집을 생략한다.
    if (explicitTargetDate && includeCategories.length > 0) {
        try {
            const trendsExisting = await Utils.readGoogleSheetTrendsAll({
                status: '',
                q: '',
                limit: 100000,
                offset: 0,
                sortBy: 'rowNumber',
                sortDir: 'desc'
            });
            const items = Array.isArray(trendsExisting?.items) ? trendsExisting.items : [];
            const existingByDateCategory = new Set(
                items
                    .filter((row) => normalizeYmdToken(row?.date) === explicitTargetDate)
                    .map((row) => `${String(row?.category || '').trim().toLowerCase()}`)
                    .filter(Boolean)
            );
            const requestedCategories = includeCategories
                .map((v) => String(v || '').trim().toLowerCase())
                .filter(Boolean);
            const allCovered = requestedCategories.length > 0
                && requestedCategories.every((cat) => existingByDateCategory.has(cat));
            if (allCovered) {
                Logger.info(`ℹ️ [Collect] pre-check: ${explicitTargetDate} ${includeCategories.join('|')} 카테고리 데이터가 이미 trends 시트에 있어 수집을 생략합니다.`);
                return {
                    success: true,
                    data: {
                        collectedCount: 0,
                        rawCollectedCount: 0,
                        date: explicitTargetDate,
                        appendedCount: 0,
                        skippedByPrecheck: true,
                        message: '이미 수집된 날짜/카테고리 데이터가 있어 트렌드 수집을 생략했습니다.'
                    }
                };
            }
        } catch (e) {
            Logger.warn(`⚠️ [Collect] pre-check 실패로 수집을 계속 진행합니다: ${e.message}`);
        }
    }

    const headless = typeof requestBody?.headless === 'boolean'
        ? requestBody.headless : Boolean(CONFIG.HEADLESS);

    const trendResult = await TrendManager.fetchTrends({
        date: dateInput || undefined,
        headless
    });
    const trendKeywords = Array.isArray(trendResult?.keywords) ? trendResult.keywords : [];
    if (trendKeywords.length === 0) {
        return {
            success: true,
            data: {
                collectedCount: 0,
                rawCollectedCount: 0,
                date: trendResult?.date || null,
                appendedCount: 0,
                message: '수집된 트렌드가 없습니다.'
            }
        };
    }

    const normalizedIncludeCategories = includeCategories
        .map((token) => String(token || '').trim().toLowerCase())
        .filter(Boolean);
    const includeCategorySet = new Set(normalizedIncludeCategories);

    const filteredTrendKeywords = includeCategorySet.size > 0
        ? trendKeywords.filter((item) => {
            const category = String(item?.category || '').trim().toLowerCase();
            return includeCategorySet.has(category);
        })
        : trendKeywords;

    if (includeCategorySet.size > 0) {
        Logger.info(`ℹ️ [Collect] 카테고리 필터 적용: ${includeCategories.join('|')} (전체 ${trendKeywords.length}건 중 저장 대상 ${filteredTrendKeywords.length}건)`);
    }

    if (filteredTrendKeywords.length === 0) {
        return {
            success: true,
            data: {
                collectedCount: 0,
                rawCollectedCount: trendKeywords.length,
                date: trendResult?.date || null,
                appendedCount: 0,
                message: '선택 카테고리에 해당하는 트렌드가 없어 저장하지 않았습니다.'
            }
        };
    }

    const verify = await License.verifyLicense();
    if (!verify.success) {
        return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
    }

    const appendResult = await Utils.appendGoogleSheetTrends(filteredTrendKeywords, trendResult?.date || null);
    if (!appendResult?.success) {
        return { success: false, code: 'TRENDS_APPEND_FAILED', message: appendResult?.message || 'trends 시트 추가에 실패했습니다.' };
    }

    return {
        success: true,
        data: {
            collectedCount: filteredTrendKeywords.length,
            rawCollectedCount: trendKeywords.length,
            appendedCount: appendResult.addedCount || filteredTrendKeywords.length,
            date: appendResult.date || trendResult?.date || null,
            message: '트렌드 수집 및 시트 추가 완료'
        }
    };
}

async function executeTrendsToTopicsAction(requestBody = {}) {
    try {
        await ensureSheetsReadyForUi();
    } catch (e) {
        return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${e.message}` };
    }

    const rowIndices = Array.from(new Set(
        (Array.isArray(requestBody.rowIndices) ? requestBody.rowIndices : [])
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));
    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: '선택된 trends 행이 없습니다.' };
    }

    const trendsResult = await Utils.readGoogleSheetTrendsAll({ limit: 100000, offset: 0 });
    const allItems = Array.isArray(trendsResult.items) ? trendsResult.items : [];
    const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
    const selected = rowIndices.map(idx => byRowIndex.get(idx)).filter(Boolean);
    if (selected.length === 0) {
        return { success: false, code: 'TRENDS_NOT_FOUND', message: '선택된 trends 행을 찾지 못했습니다.' };
    }
    const autoSettings = getAutoSettingsSnapshot();
    const autoImageGeneration = toBoolLike(
        autoSettings.NAVER_AUTO_IMAGE_GENERATION ?? autoSettings.AUTO_IMAGE_GENERATION,
        NAVER_AUTO_DEFAULTS.imageGeneration
    );
    const autoExternalReference = toBoolLike(
        autoSettings.NAVER_AUTO_EXTERNAL_REFERENCE ?? autoSettings.AUTO_USE_EXTERNAL_REF,
        NAVER_AUTO_DEFAULTS.externalReference
    );

    const topics = selected.map(item => ({
        subject: String(item.category || item.keyword || '').trim(),
        keywords: [String(item.keyword || '').trim()].filter(Boolean),
        content_guide: {
            additional_instructions: '',
            reference_urls: []
        },
        use_external_ref: autoExternalReference,
        image_options: { generate: autoImageGeneration, count: 4 },
        source: 'auto-trends',
        trendDate: String(item.date || '').trim(),
        status: '대기'
    })).filter(item => item.subject);

    if (topics.length === 0) {
        return { success: false, code: 'EMPTY_TOPICS', message: '선택된 행에서 토픽 생성이 가능한 데이터가 없습니다.' };
    }

    const appendResult = await Utils.appendGoogleSheetTopics(topics, { defaultStatus: '대기' });
    if (!appendResult?.success) {
        return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 추가에 실패했습니다.' };
    }

    for (const rowIndex of rowIndices) {
        await Utils.updateGoogleSheetTrendStatus(rowIndex, '키워드 목록 추가 완료');
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            appendedCount: topics.length,
            rowIndices,
            message: 'trends 선택 항목을 topics에 추가했습니다.'
        }
    };
}

async function executeKeywordsToTopicsAction(requestBody = {}) {
    try {
        await ensureSheetsReadyForUi();
    } catch (e) {
        return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${e.message}` };
    }

    const rowIndices = Array.from(new Set(
        (Array.isArray(requestBody.rowIndices) ? requestBody.rowIndices : [])
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));
    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: '선택된 keywords 행이 없습니다.' };
    }

    const keywordsResult = await Utils.readGoogleSheetKeywordsAll({ limit: 100000, offset: 0 });
    const allItems = Array.isArray(keywordsResult.items) ? keywordsResult.items : [];
    const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
    const selected = rowIndices.map(idx => byRowIndex.get(idx)).filter(Boolean);
    if (selected.length === 0) {
        return { success: false, code: 'KEYWORDS_NOT_FOUND', message: '선택된 keywords 행을 찾지 못했습니다.' };
    }

    const topics = selected.map(item => {
        const keyword = String(item.keyword || '').trim();
        return {
            subject: keyword,
            keywords: keyword ? [keyword] : [],
            content_guide: {
                additional_instructions: '',
                reference_urls: []
            },
            use_external_ref: true,
            image_options: { generate: false, count: 4 },
            source: 'manual',
            trendDate: '',
            status: '대기'
        };
    }).filter(item => item.subject);

    if (topics.length === 0) {
        return { success: false, code: 'EMPTY_TOPICS', message: '선택된 행에서 토픽 생성이 가능한 데이터가 없습니다.' };
    }

    const appendResult = await Utils.appendGoogleSheetTopics(topics, { defaultStatus: '대기' });
    if (!appendResult?.success) {
        return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 추가에 실패했습니다.' };
    }

    for (const rowIndex of rowIndices) {
        await Utils.updateGoogleSheetKeywordStatus(rowIndex, '연관검색어 조사 완료');
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            appendedCount: topics.length,
            rowIndices,
            message: 'keywords 선택 항목을 topics에 추가했습니다.'
        }
    };
}

function getAutoSettingsSnapshot() {
    return normalizeNaverAutoSettings({});
}

function getShoppingAutoSettingsSnapshot() {
    return normalizeNaverShoppingAutoSettings({});
}

function getDateKeyLocal(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function resetShoppingDailyCountersIfNeeded() {
    const today = getDateKeyLocal();
    if (shoppingAutoRuntimeState.dayKey !== today) {
        shoppingAutoRuntimeState.dayKey = today;
        shoppingAutoRuntimeState.shoppingPublishedToday = 0;
    }
}

function getAutoStatusPayload() {
    const blogSettings = getAutoSettingsSnapshot();
    const shoppingSettings = getShoppingAutoSettingsSnapshot();
    return {
        blog: {
            enabled: autoRuntimeState.enabled,
            running: autoRuntimeState.running,
            status: autoRuntimeState.status,
            message: autoRuntimeState.message,
            startedAt: autoRuntimeState.startedAt,
            lastRunAt: autoRuntimeState.lastRunAt,
            nextRunAt: autoRuntimeState.nextRunAt,
            cycleCount: autoRuntimeState.cycleCount,
            lastSummary: autoRuntimeState.lastSummary,
            settings: blogSettings
        },
        shopping: {
            enabled: shoppingAutoRuntimeState.enabled,
            running: shoppingAutoRuntimeState.running,
            status: shoppingAutoRuntimeState.status,
            message: shoppingAutoRuntimeState.message,
            startedAt: shoppingAutoRuntimeState.startedAt,
            lastRunAt: shoppingAutoRuntimeState.lastRunAt,
            nextRunAt: shoppingAutoRuntimeState.nextRunAt,
            cycleCount: shoppingAutoRuntimeState.cycleCount,
            lastSummary: shoppingAutoRuntimeState.lastSummary,
            dayKey: shoppingAutoRuntimeState.dayKey,
            shoppingPublishedToday: shoppingAutoRuntimeState.shoppingPublishedToday,
            settings: shoppingSettings
        },
        // legacy compat
        enabled: autoRuntimeState.enabled || shoppingAutoRuntimeState.enabled,
        running: autoRuntimeState.running || shoppingAutoRuntimeState.running,
        status: autoRuntimeState.running ? autoRuntimeState.status : shoppingAutoRuntimeState.status,
        message: [autoRuntimeState.message, shoppingAutoRuntimeState.message].filter(Boolean).join(' / '),
        shoppingPublishedToday: shoppingAutoRuntimeState.shoppingPublishedToday
    };
}

function clearAutoTimer() {
    if (autoRuntimeState.timer) {
        clearInterval(autoRuntimeState.timer);
        autoRuntimeState.timer = null;
    }
}

function scheduleNextAutoCycle(delayMs = null) {
    clearAutoTimer();
    if (!autoRuntimeState.enabled) {
        autoRuntimeState.nextRunAt = null;
        return;
    }
    const settings = getAutoSettingsSnapshot();
    let waitMs = 0;

    if (delayMs !== null && delayMs !== undefined && delayMs !== '') {
        const parsed = parseInt(delayMs, 10);
        waitMs = Math.max(500, isNaN(parsed) ? 500 : parsed);
    } else {
        const timeStr = String(settings.NAVER_AUTO_TRENDS_TIME || '07:30').split(':');
        const targetHour = parseInt(timeStr[0] || '7', 10);
        const targetMin = parseInt(timeStr[1] || '30', 10);

        const now = new Date();
        const target = new Date(now);
        target.setHours(targetHour, targetMin, 0, 0);

        if (target.getTime() <= now.getTime()) {
            target.setDate(target.getDate() + 1);
        }

        waitMs = target.getTime() - now.getTime();
        waitMs = Math.max(60 * 1000, waitMs);

        const waitMinutes = Math.floor(waitMs / (60 * 1000));
        const waitHours = Math.floor(waitMinutes / 60);
        const remainMins = waitMinutes % 60;
        Logger.info(`ℹ️ [AUTO][블로그] 다음 블로그 자동발행 예약 완료: ${target.toLocaleString()} (약 ${waitHours}시간 ${remainMins}분 대기)`);
    }

    autoRuntimeState.nextRunAt = new Date(Date.now() + waitMs).toISOString();

    // 30초마다 현재 시간과 예약 시간을 비교하여, 목표 시간이 경과했다면 실행
    autoRuntimeState.timer = setInterval(() => {
        if (!autoRuntimeState.enabled || autoRuntimeState.running) return;

        const nowMs = Date.now();
        const targetMs = new Date(autoRuntimeState.nextRunAt).getTime();

        if (nowMs >= targetMs) {
            clearInterval(autoRuntimeState.timer);
            autoRuntimeState.timer = null;
            runAutoCycle('timer').catch((e) => {
                Logger.error(`❌ [AUTO] 사이클 실행 실패: ${e.message}`);
            });
        }
    }, 30000); // 30초마다 체크
}

function stopAutoRunner(reason = '자동 모드 중지') {
    clearAutoTimer();
    autoRuntimeState.enabled = false;
    autoRuntimeState.status = 'stopped';
    autoRuntimeState.message = reason;
    autoRuntimeState.nextRunAt = null;
}

function startAutoRunner(reason = '자동 모드 시작') {
    autoRuntimeState.enabled = true;
    if (!autoRuntimeState.startedAt) autoRuntimeState.startedAt = new Date().toISOString();
    autoRuntimeState.status = autoRuntimeState.running ? 'running' : 'waiting';
    autoRuntimeState.message = reason;
    scheduleNextAutoCycle();
}

function syncAutoRunnerWithConfig() {
    const settings = getAutoSettingsSnapshot();
    if (settings.NAVER_AUTO_MODE) {
        const timeStr = String(settings.NAVER_AUTO_TRENDS_TIME || '07:30');
        startAutoRunner(`블로그 자동 실행 활성화 (목표시간: ${timeStr})`);
    } else {
        stopAutoRunner('NAVER_AUTO_MODE가 비활성화되어 있습니다.');
    }
}

// ──────────────────────────────────────────────
// 쇼핑 독립 스케줄러
// ──────────────────────────────────────────────
function clearShoppingAutoTimer() {
    if (shoppingAutoRuntimeState.timer) {
        clearInterval(shoppingAutoRuntimeState.timer);
        shoppingAutoRuntimeState.timer = null;
    }
}

function scheduleNextShoppingAutoCycle(delayMs = null) {
    clearShoppingAutoTimer();
    if (!shoppingAutoRuntimeState.enabled) {
        shoppingAutoRuntimeState.nextRunAt = null;
        return;
    }
    const settings = getShoppingAutoSettingsSnapshot();
    let waitMs = 0;

    if (delayMs !== null && delayMs !== undefined && delayMs !== '') {
        const parsed = parseInt(delayMs, 10);
        waitMs = Math.max(500, isNaN(parsed) ? 500 : parsed);
    } else {
        const timeStr = String(settings.NAVER_SHOPPING_AUTO_TIME || '07:50').split(':');
        const targetHour = parseInt(timeStr[0] || '7', 10);
        const targetMin = parseInt(timeStr[1] || '50', 10);

        const now = new Date();
        const target = new Date(now);
        target.setHours(targetHour, targetMin, 0, 0);

        if (target.getTime() <= now.getTime()) {
            target.setDate(target.getDate() + 1);
        }

        waitMs = target.getTime() - now.getTime();
        waitMs = Math.max(60 * 1000, waitMs);

        const waitMinutes = Math.floor(waitMs / (60 * 1000));
        const waitHours = Math.floor(waitMinutes / 60);
        const remainMins = waitMinutes % 60;
        Logger.info(`ℹ️ [AUTO][쇼핑] 다음 쇼핑 자동발행 예약 완료: ${target.toLocaleString()} (약 ${waitHours}시간 ${remainMins}분 대기)`);
    }

    shoppingAutoRuntimeState.nextRunAt = new Date(Date.now() + waitMs).toISOString();

    // 30초마다 현재 시간과 예약 시간을 비교하여, 목표 시간이 경과했다면 실행
    shoppingAutoRuntimeState.timer = setInterval(() => {
        if (!shoppingAutoRuntimeState.enabled || shoppingAutoRuntimeState.running) return;

        const nowMs = Date.now();
        const targetMs = new Date(shoppingAutoRuntimeState.nextRunAt).getTime();

        if (nowMs >= targetMs) {
            clearInterval(shoppingAutoRuntimeState.timer);
            shoppingAutoRuntimeState.timer = null;
            runShoppingAutoCycle('timer').catch((e) => {
                Logger.error(`❌ [AUTO][쇼핑] 사이클 실행 실패: ${e.message}`);
            });
        }
    }, 30000); // 30초마다 체크
}

function stopShoppingAutoRunner(reason = '쇼핑 자동 모드 중지') {
    clearShoppingAutoTimer();
    shoppingAutoRuntimeState.enabled = false;
    shoppingAutoRuntimeState.status = 'stopped';
    shoppingAutoRuntimeState.message = reason;
    shoppingAutoRuntimeState.nextRunAt = null;
}

function startShoppingAutoRunner(reason = '쇼핑 자동 모드 시작') {
    shoppingAutoRuntimeState.enabled = true;
    if (!shoppingAutoRuntimeState.startedAt) shoppingAutoRuntimeState.startedAt = new Date().toISOString();
    shoppingAutoRuntimeState.status = shoppingAutoRuntimeState.running ? 'running' : 'waiting';
    shoppingAutoRuntimeState.message = reason;
    scheduleNextShoppingAutoCycle();
}

function syncShoppingAutoRunnerWithConfig() {
    const settings = getShoppingAutoSettingsSnapshot();
    if (settings.NAVER_SHOPPING_AUTO_MODE) {
        const timeStr = String(settings.NAVER_SHOPPING_AUTO_TIME || '07:50');
        startShoppingAutoRunner(`쇼핑 자동 실행 활성화 (목표시간: ${timeStr})`);
    } else {
        stopShoppingAutoRunner('NAVER_SHOPPING_AUTO_MODE가 비활성화되어 있습니다.');
    }
}

async function runShoppingAutoCycle(trigger = 'manual', options = {}) {
    const forceRun = options?.forceRun === true;
    if (!forceRun && !shoppingAutoRuntimeState.enabled) return { success: false, code: 'SHOPPING_AUTO_DISABLED', message: '쇼핑 자동 실행이 비활성화되어 있습니다.' };
    if (shoppingAutoRuntimeState.running) return { success: false, code: 'SHOPPING_AUTO_ALREADY_RUNNING', message: '다른 쇼핑 자동 사이클이 실행 중입니다.' };

    shoppingAutoRuntimeState.running = true;
    shoppingAutoRuntimeState.status = 'running';
    shoppingAutoRuntimeState.message = `쇼핑 자동 사이클 실행 중 (${trigger})`;
    shoppingAutoRuntimeState.lastRunAt = new Date().toISOString();
    shoppingAutoRuntimeState.nextRunAt = null;
    resetShoppingDailyCountersIfNeeded();

    Logger.info(`🚀 [AUTO][쇼핑] 쇼핑 자동발행 파이프라인 시작! (Trigger: ${trigger})`);

    const summary = {
        trigger,
        shoppingAttempted: 0,
        shoppingSuccess: 0,
        skipped: []
    };

    try {
        const settings = getShoppingAutoSettingsSnapshot();
        if (!settings.NAVER_SHOPPING_AUTO_MODE && !forceRun) {
            stopShoppingAutoRunner('설정에 따라 쇼핑 자동 모드 비활성화');
            return { success: false, code: 'SHOPPING_AUTO_DISABLED_BY_CONFIG', message: '쇼핑 자동 모드가 비활성화되어 있습니다.' };
        }

        const precheck = await License.checkLicenseStatus({ quiet: true });
        if (!precheck.success) {
            shoppingAutoRuntimeState.status = 'error';
            shoppingAutoRuntimeState.message = `라이선스 확인 실패: ${precheck.message}`;
            shoppingAutoRuntimeState.lastSummary = summary;
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message, data: { trigger, summary } };
        }
        const features = toFeatureMap(precheck.features);
        const maxShoppingByPlan = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());
        const planShoppingLimit = (Number.isFinite(maxShoppingByPlan) && maxShoppingByPlan > 0) ? maxShoppingByPlan : Number.MAX_SAFE_INTEGER;

        const session = await checkAuthSessionValid();
        if (!session.ok) {
            shoppingAutoRuntimeState.status = 'waiting';
            shoppingAutoRuntimeState.message = '네이버 로그인 세션이 유효하지 않아 쇼핑 자동 사이클을 대기합니다.';
            shoppingAutoRuntimeState.lastSummary = summary;
            return { success: false, code: 'NAVER_SESSION_INVALID', message: '네이버 로그인 세션이 유효하지 않습니다.', data: { trigger, summary } };
        }

        if (!isCommandEnabled(features, 'shopping')) {
            summary.skipped.push('현재 플랜에서 쇼핑 기능이 비활성화되어 건너뜁니다.');
        } else {
            const cycleCap = settings.AUTO_MAX_SHOPPING_PER_CYCLE;
            const effectiveCycleCap = cycleCap > 0 ? cycleCap : Number.MAX_SAFE_INTEGER;
            const remaining = cycleCap > 0 ? Math.max(0, cycleCap - shoppingAutoRuntimeState.shoppingPublishedToday) : Number.MAX_SAFE_INTEGER;
            const targetLimit = Math.max(0, Math.min(effectiveCycleCap, planShoppingLimit, remaining));

            if (targetLimit > 0) {
                await ensureSheetsReadyForUi();
                const shoppingRes = await Utils.readGoogleSheetShoppingAll({
                    status: '발행 준비 완료',
                    q: '',
                    limit: 100000,
                    offset: 0,
                    sortBy: 'rowNumber',
                    sortDir: 'asc'
                });
                const shoppingItems = Array.isArray(shoppingRes.items) ? shoppingRes.items : [];
                const rowIndices = shoppingItems
                    .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0))
                    .slice(0, targetLimit)
                    .map((item) => item.rowIndex)
                    .filter((v) => Number.isInteger(v) && v >= 0);
                summary.shoppingAttempted = rowIndices.length;
                if (rowIndices.length > 0) {
                    const batchResult = await executeShoppingBatchRowsAction({ action: 'batch', rowIndices, isAutoCycle: true });
                    const successCount = Number(batchResult?.data?.successCount || 0);
                    summary.shoppingSuccess = successCount;
                    if (successCount > 0) {
                        shoppingAutoRuntimeState.shoppingPublishedToday += successCount;
                    }
                    const failCount = Number(batchResult?.data?.failCount || 0);
                    if (failCount > 0) summary.skipped.push(`쇼핑 발행 실패 ${failCount}건`);
                } else {
                    summary.skipped.push('상태가 "발행 준비 완료"인 쇼핑 후보가 없어 건너뜁니다.');
                }
            } else {
                summary.skipped.push(
                    `쇼핑 발행 한도가 0건이라 건너뜁니다. `
                    + `(설정=${cycleCap}, 플랜=${Number.isFinite(planShoppingLimit) ? planShoppingLimit : '무제한'}, 잔여=${Number.isFinite(remaining) ? remaining : '무제한'})`
                );
            }
        }

        shoppingAutoRuntimeState.cycleCount += 1;
        shoppingAutoRuntimeState.status = 'waiting';
        shoppingAutoRuntimeState.message = '쇼핑 자동 사이클 완료';
        shoppingAutoRuntimeState.lastSummary = summary;

        Logger.info(`✅ [AUTO][쇼핑] 파이프라인 완료! - 쇼핑 발행 시도/성공: ${summary.shoppingAttempted}/${summary.shoppingSuccess}`);
        if (summary.skipped && summary.skipped.length > 0) {
            Logger.info(`   👉 건너뛴 사유 내역:\n      - ${summary.skipped.join('\n      - ')}`);
        }

        return { success: true, data: { trigger, summary } };
    } catch (e) {
        shoppingAutoRuntimeState.status = 'error';
        shoppingAutoRuntimeState.message = `쇼핑 자동 사이클 오류: ${e.message}`;
        shoppingAutoRuntimeState.lastSummary = summary;
        Logger.error(`❌ [AUTO][쇼핑] 사이클 오류: ${e.message}`);
        return { success: false, code: 'SHOPPING_AUTO_CYCLE_FAILED', message: e.message, data: { trigger, summary } };
    } finally {
        shoppingAutoRuntimeState.running = false;
        if (shoppingAutoRuntimeState.enabled) scheduleNextShoppingAutoCycle();
    }
}

function filterAutoTopicCandidates(items = [], settings = {}) {
    const includeCategories = parseCsvTokens(settings.AUTO_INCLUDE_CATEGORIES);
    const todayYmd = getSeoulTodayYmd();

    return items.filter((item) => {
        const status = String(item?.status || '').trim();
        if (status !== '블로그 발행 준비 완료') return false;

        const source = String(item?.source || '').trim().toLowerCase();
        if (source !== 'auto-trends') return false;

        // 실제 자동 파이프라인은 "오늘 추가된 토픽"을 기준으로 발행한다.
        // (트렌드 데이터 일자는 전일일 수 있으므로 addedAt 우선)
        const addedAtYmd = normalizeYmdToken(item?.addedAt);
        const trendDateYmd = normalizeYmdToken(item?.trendDate);
        const candidateDateYmd = addedAtYmd || trendDateYmd;
        if (!candidateDateYmd || !todayYmd || candidateDateYmd !== todayYmd) return false;

        const subject = String(item?.subject || '').trim();
        const keywordText = Array.isArray(item?.keywords) ? item.keywords.join(', ') : String(item?.keywords || '');
        const text = `${subject} ${keywordText}`.toLowerCase();
        if (includeCategories.length > 0 && !matchesAnyToken(text, includeCategories)) return false;
        return true;
    });
}

async function executeAutoTrendsToTopics(settings = {}) {
    const readAllTrendStatuses = toBoolLike(settings.AUTO_READ_ALL_TRENDS_STATUSES, false);
    const trendsRes = await Utils.readGoogleSheetTrendsAll({
        status: readAllTrendStatuses ? '' : '대기',
        q: '',
        limit: 100000,
        offset: 0,
        sortBy: 'rowNumber',
        sortDir: 'desc'
    });
    const trends = Array.isArray(trendsRes.items) ? trendsRes.items : [];
    if (trends.length === 0) {
        return {
            appendedCount: 0,
            candidates: 0,
            rowIndices: [],
            filteredCount: 0,
            duplicateCount: 0
        };
    }

    const includeCategories = parseCsvTokens(settings.AUTO_INCLUDE_CATEGORIES);
    const targetTrendDateYmd = normalizeYmdToken(settings.AUTO_TARGET_TREND_DATE || '');
    const variationType = String(
        settings.NAVER_AUTO_VARIATION_TYPE ?? settings.AUTO_TRENDS_VARIATION_TYPE ?? 'min'
    ).trim() || 'min';
    const variationIncludeNew = toBoolLike(
        settings.NAVER_AUTO_VARIATION_INCLUDE_NEW ?? settings.AUTO_TRENDS_VARIATION_INCLUDE_NEW,
        false
    );
    const variationIncludeDash = toBoolLike(
        settings.NAVER_AUTO_VARIATION_INCLUDE_DASH ?? settings.AUTO_TRENDS_VARIATION_INCLUDE_DASH,
        false
    );
    const variationIncludeNumber = toBoolLike(
        settings.NAVER_AUTO_VARIATION_INCLUDE_NUMBER ?? settings.AUTO_TRENDS_VARIATION_INCLUDE_NUMBER,
        true
    );
    const variationNumber = normalizeIntegerOrBlank(
        settings.NAVER_AUTO_VARIATION_NUMBER ?? settings.AUTO_TRENDS_MIN_VARIATION,
        ''
    );
    const variationTopN = normalizeIntegerOrBlank(
        settings.NAVER_AUTO_VARIATION_TOP_N ?? settings.AUTO_TRENDS_TOP_N,
        5
    );
    const keywordReuseGapDays = normalizeNonNegativeInt(
        settings.NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS ?? settings.AUTO_KEYWORD_REUSE_GAP_DAYS,
        NAVER_AUTO_DEFAULTS.keywordReuseGapDays
    );
    const autoImageGeneration = toBoolLike(
        settings.NAVER_AUTO_IMAGE_GENERATION ?? settings.AUTO_IMAGE_GENERATION,
        NAVER_AUTO_DEFAULTS.imageGeneration
    );
    const autoExternalReference = toBoolLike(
        settings.NAVER_AUTO_EXTERNAL_REFERENCE ?? settings.AUTO_USE_EXTERNAL_REF,
        NAVER_AUTO_DEFAULTS.externalReference
    );

    const candidateLogLimit = 120;
    const dateCategoryMatchedRows = [];
    let dateCategoryMatchedCount = 0;
    let variationRejectedCount = 0;
    let emptyKeywordRejectedCount = 0;

    Logger.info(
        `ℹ️ [AUTO] trends→topics 적용 필터: `
        + `trendDate=${targetTrendDateYmd || '(미지정)'}, `
        + `statusScope=${readAllTrendStatuses ? 'ALL' : '대기'}, `
        + `categories=${includeCategories.length > 0 ? includeCategories.join('|') : '(전체)'}, `
        + `variationType=${variationType}, `
        + `variation=new:${variationIncludeNew ? 'Y' : 'N'},dash:${variationIncludeDash ? 'Y' : 'N'},num:${variationIncludeNumber ? 'Y' : 'N'}${variationIncludeNumber && (variationType === 'top' ? Number.isInteger(variationTopN) : variationNumber !== '') ? `(${variationType === 'top' ? `top:${variationTopN}` : `val:${variationNumber}`})` : ''}, `
        + `reuseGapDays=${keywordReuseGapDays}`
    );

    // 1차 필터링 (날짜, 카테고리, 빈 키워드 탈락)
    const baseCandidates = trends.filter((item) => {
        if (targetTrendDateYmd) {
            const itemDateYmd = normalizeYmdToken(item?.date);
            if (!itemDateYmd || itemDateYmd !== targetTrendDateYmd) return false;
        }
        const category = String(item?.category || '').trim();
        const keyword = String(item?.keyword || '').trim();
        const text = `${category} ${keyword}`.toLowerCase();
        if (includeCategories.length > 0 && !matchesAnyToken(text, includeCategories)) return false;

        dateCategoryMatchedCount += 1;
        if (!keyword) {
            emptyKeywordRejectedCount += 1;
            return false;
        }
        return true;
    });

    let filtered = [];

    if (variationType === 'top' && variationIncludeNumber && Number.isInteger(variationTopN) && variationTopN > 0) {
        // [Top N 모드]
        const rankedPool = [];
        const absoluteAllowed = []; // new, dash 등 순위 계산 없는 대상

        for (const item of baseCandidates) {
            const meta = parseVariationMeta(item?.variation);
            if (variationIncludeNew && meta.kind === 'new') {
                absoluteAllowed.push(item);
            } else if (variationIncludeDash && meta.kind === 'dash') {
                absoluteAllowed.push(item);
            } else if (meta.kind === 'number') {
                rankedPool.push({ item, score: Number(meta.number) });
            } else {
                variationRejectedCount += 1;
            }
        }

        rankedPool.sort((a, b) => b.score - a.score);
        const topSelected = rankedPool.slice(0, variationTopN).map(r => r.item);
        variationRejectedCount += Math.max(0, rankedPool.length - topSelected.length);

        filtered = [...absoluteAllowed, ...topSelected];
        // 로깅을 위해 매치된 목록 구성
        for (const item of baseCandidates) {
            if (dateCategoryMatchedRows.length >= candidateLogLimit) break;
            const isSelected = filtered.some(f => f.rowIndex === item.rowIndex);
            dateCategoryMatchedRows.push({
                rowNumber: Number(item?.rowNumber || 0),
                date: String(item?.date || '').trim(),
                category: String(item?.category || '').trim(),
                keyword: String(item?.keyword || '').trim(),
                variation: String(item?.variation || '-').trim() || '-',
                selected: isSelected,
                rejectReason: isSelected ? '' : '순위 밖 탈락(Top N)'
            });
        }
    } else {
        // [기본 수치 이상(Min) 모드 - 기존 방식 호환]
        filtered = baseCandidates.filter((item) => {
            const isMatched = matchesVariationFilter(item?.variation, settings);
            if (!isMatched) {
                variationRejectedCount += 1;
            }
            if (dateCategoryMatchedRows.length < candidateLogLimit) {
                dateCategoryMatchedRows.push({
                    rowNumber: Number(item?.rowNumber || 0),
                    date: String(item?.date || '').trim(),
                    category: String(item?.category || '').trim(),
                    keyword: String(item?.keyword || '').trim(),
                    variation: String(item?.variation || '-').trim() || '-',
                    selected: isMatched,
                    rejectReason: isMatched ? '' : '수치 미달(Min)'
                });
            }
            return isMatched;
        });
    }

    Logger.info(
        `ℹ️ [AUTO] trendDate+카테고리 후보: ${dateCategoryMatchedCount}건 `
        + `(증감 탈락 ${variationRejectedCount}, 빈키워드 탈락 ${emptyKeywordRejectedCount})`
    );
    if (dateCategoryMatchedRows.length > 0) {
        for (const row of dateCategoryMatchedRows) {
            const decision = row.selected ? '선정' : `제외(${row.rejectReason})`;
            Logger.info(
                `   • [AUTO][후보] Row ${row.rowNumber || '-'} | ${row.date || '-'} | `
                + `${row.category || '-'} | ${row.keyword || '-'} | 증감:${row.variation} | ${decision}`
            );
        }
        if (dateCategoryMatchedCount > dateCategoryMatchedRows.length) {
            Logger.info(
                `   • [AUTO][후보] ... 생략 ${dateCategoryMatchedCount - dateCategoryMatchedRows.length}건 `
                + `(로그 상한 ${candidateLogLimit}건)`
            );
        }
    }

    if (filtered.length === 0) {
        return {
            appendedCount: 0,
            candidates: 0,
            rowIndices: [],
            filteredCount: 0,
            duplicateCount: 0
        };
    }

    const existingTopicsRes = await Utils.readGoogleSheetTopicsAll({ q: '', limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'desc' });
    const existingTopics = Array.isArray(existingTopicsRes.items) ? existingTopicsRes.items : [];
    const baseYmd = getSeoulTodayYmd();
    const recentReuseKeySet = new Set();
    if (keywordReuseGapDays > 0 && baseYmd) {
        for (const item of existingTopics) {
            const key = buildTopicReuseKey(item?.subject, item?.keywords);
            if (!key) continue;
            const historyYmd = normalizeYmdToken(item?.addedAt || item?.publishedAt || item?.trendDate);
            if (!historyYmd) continue;
            if (isYmdWithinRecentDays(historyYmd, baseYmd, keywordReuseGapDays)) {
                recentReuseKeySet.add(key);
            }
        }
    }
    const inBatchKeySet = new Set();

    const topicsToAppend = [];
    const trendRowIndicesToMark = [];
    let duplicateCount = 0;
    let reuseBlockedCount = 0;
    for (const item of filtered) {
        const subject = String(item.category || item.keyword || '').trim();
        const keyword = String(item.keyword || '').trim();
        if (!subject || !keyword) continue;
        const reuseKey = buildTopicReuseKey(subject, [keyword]);
        if (keywordReuseGapDays > 0 && reuseKey && recentReuseKeySet.has(reuseKey)) {
            reuseBlockedCount += 1;
            trendRowIndicesToMark.push(item.rowIndex);
            continue;
        }
        if (reuseKey && inBatchKeySet.has(reuseKey)) {
            duplicateCount += 1;
            trendRowIndicesToMark.push(item.rowIndex);
            continue;
        }
        if (reuseKey) inBatchKeySet.add(reuseKey);
        topicsToAppend.push({
            subject,
            keywords: [keyword],
            content_guide: {
                additional_instructions: '',
                reference_urls: []
            },
            use_external_ref: autoExternalReference,
            image_options: { generate: autoImageGeneration, count: 4 },
            source: 'auto-trends',
            trendDate: String(item.date || '').trim(),
            status: '블로그 발행 준비 완료'
        });
        trendRowIndicesToMark.push(item.rowIndex);
    }

    let appendedRowIndices = [];
    if (topicsToAppend.length > 0) {
        const appendResult = await Utils.appendGoogleSheetTopics(topicsToAppend, { defaultStatus: '블로그 발행 준비 완료' });
        if (!appendResult?.success) {
            throw new Error(appendResult?.message || 'AUTO trends→topics append 실패');
        }
        appendedRowIndices = Array.isArray(appendResult?.rowIndices)
            ? appendResult.rowIndices.filter((v) => Number.isInteger(v) && v >= 0)
            : [];
    }

    if (trendRowIndicesToMark.length > 0) {
        const bulkUpdate = await Utils.updateGoogleSheetTrendStatusBulk(trendRowIndicesToMark, '키워드 목록 추가 완료');
        if (!bulkUpdate?.success) {
            // 배치 실패 시 기존 단건 로직으로 폴백
            for (const rowIndex of trendRowIndicesToMark) {
                await Utils.updateGoogleSheetTrendStatus(rowIndex, '키워드 목록 추가 완료');
            }
        }
    }

    return {
        appendedCount: topicsToAppend.length,
        candidates: filtered.length,
        rowIndices: appendedRowIndices,
        filteredCount: filtered.length,
        duplicateCount,
        reuseBlockedCount
    };
}

function waitMs(delay) {
    const ms = Math.max(0, Number(delay) || 0);
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeTrendCollectWithRetry(options = {}) {
    const date = String(options?.date || '').trim();
    const categories = options?.categories;
    const maxRetries = normalizeNonNegativeInt(options?.maxRetries, AUTO_TRENDS_MAX_RETRIES);
    const retryWaitMs = normalizeNonNegativeInt(options?.retryWaitMs, AUTO_TRENDS_RETRY_WAIT_MS);
    const maxAttempts = maxRetries + 1;
    let lastError = 'unknown';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const trendsResult = await executeTrendCollectAction({
                ...(date ? { date } : {}),
                ...(categories !== undefined ? { categories } : {})
            });
            if (trendsResult?.success) {
                return {
                    success: true,
                    collected: Number(trendsResult?.data?.appendedCount || trendsResult?.data?.collectedCount || 0),
                    attempt,
                    maxAttempts
                };
            }
            lastError = String(trendsResult?.message || trendsResult?.code || 'unknown');
        } catch (e) {
            lastError = String(e?.message || e || 'unknown');
        }

        if (attempt < maxAttempts) {
            Logger.warn(`⚠️ [AUTO] 트렌드 수집 실패 (${attempt}/${maxAttempts}): ${lastError}`);
            const waitMin = Math.max(1, Math.round(retryWaitMs / 60000));
            Logger.info(`   ⏳ [AUTO] ${waitMin}분 후 트렌드 수집을 재시도합니다...`);
            await waitMs(retryWaitMs);
        }
    }

    return {
        success: false,
        message: lastError,
        maxRetries
    };
}

async function runAutoCycle(trigger = 'manual', options = {}) {
    const forceRun = options?.forceRun === true;
    const requestedTrendDate = normalizeYmdToken(options?.trendDate || options?.date || '');
    const skipTrendsCollect = toBoolLike(options?.skipTrends, false);
    const settingsOverrides = (options?.settingsOverrides && typeof options.settingsOverrides === 'object')
        ? options.settingsOverrides
        : {};
    const isManualTrigger = forceRun || String(trigger || '').toLowerCase().includes('manual');
    if (!forceRun && !autoRuntimeState.enabled) return { success: false, code: 'AUTO_DISABLED', message: '자동 실행이 비활성화되어 있습니다.' };
    if (autoRuntimeState.running) return { success: false, code: 'AUTO_ALREADY_RUNNING', message: '다른 자동 사이클이 실행 중입니다.' };

    autoRuntimeState.running = true;
    autoRuntimeState.status = 'running';
    autoRuntimeState.message = `자동 사이클 실행 중 (${trigger})`;
    autoRuntimeState.lastRunAt = new Date().toISOString();
    autoRuntimeState.nextRunAt = null;
    Logger.info(`🚀 [AUTO] 자동 발행 파이프라인(사이클) 시작! (Trigger: ${trigger})`);

    const summary = {
        trigger,
        trendsCollected: 0,
        trendsToTopics: 0,
        blogAttempted: 0,
        blogSuccess: 0,
        skipped: []
    };

    try {
        const settings = Object.keys(settingsOverrides).length > 0
            ? normalizeNaverAutoSettings({
                ...getAutoSettingsSnapshot(),
                ...settingsOverrides
            })
            : getAutoSettingsSnapshot();
        Logger.info(
            `ℹ️ [AUTO] 실행 설정값 (trigger=${trigger}, source=${Object.keys(settingsOverrides).length > 0 ? 'ui-overrides' : 'saved-config'}): `
            + `mode=${settings.AUTO_MODE ? 'on' : 'off'}, `
            + `maxPostsPerRun=${settings.NAVER_AUTO_MAX_POSTS_PER_RUN}, `
            + `categories=${settings.AUTO_INCLUDE_CATEGORIES || '(없음)'}, `
            + `trendTime=${settings.NAVER_AUTO_TRENDS_TIME || '07:30'}`
        );
        if (!settings.AUTO_MODE && !forceRun) {
            stopAutoRunner('설정에 따라 자동 모드 비활성화');
            return { success: false, code: 'AUTO_DISABLED_BY_CONFIG', message: '설정에 따라 자동 모드가 비활성화되어 있습니다.' };
        }

        const precheck = await License.checkLicenseStatus({ quiet: true });
        if (!precheck.success) {
            autoRuntimeState.status = 'error';
            autoRuntimeState.message = `라이선스 확인 실패: ${precheck.message}`;
            autoRuntimeState.lastSummary = summary;
            return {
                success: false,
                code: 'LICENSE_STATUS_FAILED',
                message: precheck.message,
                data: {
                    trigger,
                    trendDate: requestedTrendDate || '',
                    summary
                }
            };
        }
        const features = toFeatureMap(precheck.features);
        const maxBlogByPlan = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
        const planBlogLimit = (Number.isFinite(maxBlogByPlan) && maxBlogByPlan > 0) ? maxBlogByPlan : Number.MAX_SAFE_INTEGER;

        const requiresNaverSession = true;
        if (requiresNaverSession) {
            const session = await checkAuthSessionValid();
            if (!session.ok) {
                autoRuntimeState.status = 'waiting';
                autoRuntimeState.message = '네이버 로그인 세션이 유효하지 않아 자동 사이클을 대기합니다.';
                autoRuntimeState.lastSummary = summary;
                return {
                    success: false,
                    code: 'NAVER_SESSION_INVALID',
                    message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 로그인 후 다시 시도해 주세요.',
                    data: {
                        trigger,
                        trendDate: requestedTrendDate || '',
                        summary
                    }
                };
            }
        }

        let proceedAfterTrends = true;
        if (settings.AUTO_TRENDS_ENABLED) {
            if (skipTrendsCollect) {
                summary.skipped.push('요청 옵션에 따라 트렌드 수집을 건너뜁니다. (기존 trends 데이터 사용)');
            } else {
                if (!isCommandEnabled(features, 'trends')) {
                    proceedAfterTrends = false;
                    summary.skipped.push('트렌드 수집 권한이 없어 자동 발행 단계를 건너뜁니다.');
                } else {
                    const includeCategories = parseCsvTokens(settings.AUTO_INCLUDE_CATEGORIES);
                    const trendsRetryResult = await executeTrendCollectWithRetry({
                        date: requestedTrendDate,
                        categories: includeCategories,
                        maxRetries: isManualTrigger ? 0 : AUTO_TRENDS_MAX_RETRIES,
                        retryWaitMs: AUTO_TRENDS_RETRY_WAIT_MS
                    });
                    if (trendsRetryResult.success) {
                        summary.trendsCollected = Number(trendsRetryResult.collected || 0);
                    } else {
                        proceedAfterTrends = false;
                        const retryInfo = Number.isFinite(trendsRetryResult.maxRetries)
                            ? trendsRetryResult.maxRetries
                            : (isManualTrigger ? 0 : AUTO_TRENDS_MAX_RETRIES);
                        summary.skipped.push(
                            `트렌드 수집 실패(재시도 ${retryInfo}회): ${trendsRetryResult.message || 'unknown'}`
                        );
                    }
                }
            }
        }

        let appendedTopicRowIndices = [];
        if (proceedAfterTrends && settings.AUTO_TOPICS_ENABLED) {
            try {
                const mapResult = await executeAutoTrendsToTopics({
                    ...settings,
                    AUTO_TARGET_TREND_DATE: requestedTrendDate,
                    AUTO_READ_ALL_TRENDS_STATUSES: skipTrendsCollect
                });
                summary.trendsToTopics = Number(mapResult.appendedCount || 0);
                appendedTopicRowIndices = Array.isArray(mapResult?.rowIndices)
                    ? mapResult.rowIndices.filter((v) => Number.isInteger(v) && v >= 0)
                    : [];
                const filteredCount = Number(mapResult?.filteredCount || mapResult?.candidates || 0);
                const duplicateCount = Number(mapResult?.duplicateCount || 0);
                const reuseBlockedCount = Number(mapResult?.reuseBlockedCount || 0);
                Logger.info(`ℹ️ [AUTO] trends→topics 결과: 필터 통과 ${filteredCount}건, 신규 추가 ${summary.trendsToTopics}건, 중복 제외 ${duplicateCount}건, 재사용 간격 제외 ${reuseBlockedCount}건`);
                if (filteredCount === 0) {
                    summary.skipped.push('trends→topics 필터 조건에 맞는 항목이 없습니다. (카테고리/증감/기준일 확인)');
                } else if (summary.trendsToTopics === 0) {
                    summary.skipped.push(`trends→topics 신규 추가 0건 (중복 ${duplicateCount}건, 재사용 간격 제외 ${reuseBlockedCount}건)`);
                }
                if (summary.trendsToTopics > 0 && appendedTopicRowIndices.length === 0) {
                    summary.skipped.push('이번 실행에서 추가된 토픽 행을 식별하지 못해 발행 후보를 찾지 못했습니다.');
                }
            } catch (e) {
                summary.skipped.push(`trends→topics 실패: ${e.message}`);
            }
        }

        const nowMs = Date.now();
        const minGapMin = normalizeNonNegativeInt(settings.AUTO_MIN_POST_GAP_MIN, 0);
        const minGapMs = minGapMin * 60 * 1000;
        const gapAllowed = minGapMs <= 0 || autoRuntimeState.lastPublishAtMs <= 0 || (nowMs - autoRuntimeState.lastPublishAtMs >= minGapMs);
        if (!gapAllowed) {
            summary.skipped.push(`포스트 간격 제한(${minGapMin}분)으로 발행 대기`);
        }

        const maxPostsPerRun = normalizeNonNegativeInt(
            settings.NAVER_AUTO_MAX_POSTS_PER_RUN,
            NAVER_AUTO_DEFAULTS.maxPostsPerRun
        );
        const effectiveCycleBlogCap = maxPostsPerRun > 0 ? maxPostsPerRun : Number.MAX_SAFE_INTEGER;

        if (proceedAfterTrends && gapAllowed && isCommandEnabled(features, 'batch')) {
            const targetLimit = Math.max(0, Math.min(effectiveCycleBlogCap, planBlogLimit));
            if (targetLimit > 0) {
                const freshTopicRowSet = new Set(
                    appendedTopicRowIndices.filter((v) => Number.isInteger(v) && v >= 0)
                );
                const topicsRes = await Utils.readGoogleSheetTopicsAll({
                    status: '',
                    q: '',
                    limit: 100000,
                    offset: 0,
                    sortBy: 'rowNumber',
                    sortDir: 'asc'
                });
                const topicItems = Array.isArray(topicsRes.items) ? topicsRes.items : [];
                const primaryCandidates = filterAutoTopicCandidates(topicItems, settings)
                    .filter((item) => freshTopicRowSet.has(item.rowIndex))
                    .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
                let candidates = primaryCandidates;
                let fallbackUsed = false;

                if (candidates.length === 0) {
                    // 2순위: 이번 실행 신규 추가 후보가 없으면, 전체 준비완료 행에서 발행
                    candidates = topicItems
                        .filter((item) => String(item?.status || '').trim() === '블로그 발행 준비 완료')
                        .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
                    fallbackUsed = candidates.length > 0;
                    if (fallbackUsed) {
                        Logger.info(`ℹ️ [AUTO] 신규 추가 토픽 후보가 없어, 기존 준비완료 토픽 ${candidates.length}건에서 발행 대상을 선택합니다.`);
                    }
                }

                candidates = candidates.slice(0, targetLimit);
                const rowIndices = candidates.map((item) => item.rowIndex).filter((v) => Number.isInteger(v) && v >= 0);
                summary.blogAttempted = rowIndices.length;
                if (rowIndices.length > 0) {
                    const blogResult = await executeBlogBatchRowsAction({ action: 'batch', rowIndices, isAutoCycle: true });
                    const successCount = Number(blogResult?.data?.successCount || 0);
                    summary.blogSuccess = successCount;
                    if (successCount > 0) {
                        autoRuntimeState.lastPublishAtMs = Date.now();
                    }
                    const failCount = Number(blogResult?.data?.failCount || 0);
                    if (failCount > 0) summary.skipped.push(`블로그 발행 실패 ${failCount}건`);
                } else {
                    summary.skipped.push(
                        fallbackUsed
                            ? '블로그 발행 후보가 없어 건너뜁니다. (조건: 상태=블로그 발행 준비 완료)'
                            : '블로그 발행 후보가 없어 건너뜁니다. (조건: 이번 실행에서 추가된 토픽 행 + 상태/소스/일자/카테고리)'
                    );
                }
            } else {
                summary.skipped.push(
                    `블로그 발행 한도가 0건이라 건너뜁니다. `
                    + `(설정=${maxPostsPerRun}, 플랜=${Number.isFinite(planBlogLimit) ? planBlogLimit : '무제한'})`
                );
            }
        } else if (proceedAfterTrends && gapAllowed && !isCommandEnabled(features, 'batch')) {
            summary.skipped.push('현재 플랜에서 블로그 batch 기능이 비활성화되어 건너뜁니다.');
        }

        autoRuntimeState.cycleCount += 1;
        autoRuntimeState.status = 'waiting';
        autoRuntimeState.message = '블로그 자동 사이클 완료';
        autoRuntimeState.lastSummary = summary;

        Logger.info(`✅ [AUTO][블로그] 파이프라인 완료! - 트렌드 수집: ${summary.trendsCollected}건, 토픽 전환: ${summary.trendsToTopics}건, 블로그 발행 시도/성공: ${summary.blogAttempted}/${summary.blogSuccess}`);
        if (summary.skipped && summary.skipped.length > 0) {
            Logger.info(`   👉 건너뛴 사유 내역:\n      - ${summary.skipped.join('\n      - ')}`);
        }

        return {
            success: true,
            data: {
                trigger,
                trendDate: requestedTrendDate || '',
                summary
            }
        };
    } catch (e) {
        autoRuntimeState.status = 'error';
        autoRuntimeState.message = `블로그 자동 사이클 오류: ${e.message}`;
        autoRuntimeState.lastSummary = summary;
        Logger.error(`❌ [AUTO][블로그] 사이클 오류: ${e.message}`);
        return {
            success: false,
            code: 'AUTO_CYCLE_FAILED',
            message: e.message,
            data: {
                trigger,
                trendDate: requestedTrendDate || '',
                summary
            }
        };
    } finally {
        autoRuntimeState.running = false;
        if (autoRuntimeState.enabled) scheduleNextAutoCycle();
    }
}

function getBlogAutoRouteHandler() {
    if (!blogAutoRouteHandler) {
        const service = createBlogAutoService({
            Logger,
            getAutoStatusPayload,
            ensureSheetsReadyForUi,
            resolveNaverAutoCategoryCatalog,
            runAutoCycle
        });
        const validators = {
            parseForceQuery: UiValidators.parseForceQuery,
            validateBlogAutoManualRunPayload: (payload) => UiValidators.validateBlogAutoManualRunPayload(payload, normalizeYmdToken),
            isValidationError: UiValidators.isValidationError
        };
        const controller = createBlogAutoController({
            service,
            sendSuccess,
            sendError,
            Logger,
            validators
        });
        blogAutoRouteHandler = createBlogAutoRouteHandler({ controller });
    }
    return blogAutoRouteHandler;
}

function scheduleUiReload(host, port) {
    setTimeout(async () => {
        const { reloadUiServer } = require('./ui-server');
        await reloadUiServer(host, port);
    }, 500);
}

function getSettingsRouteHandler() {
    if (!settingsRouteHandler) {
        const service = createSettingsService({
            fs,
            path,
            CONFIG,
            DEFAULT_HOST,
            DEFAULT_PORT,
            SHOPPING_IMAGE_SLOT_MAP,
            tryResolveReadableConfigSource,
            readConfigRaw,
            buildDefaultConfigTemplate,
            resolveWritableConfigPath,
            buildMajorSettings,
            parseMajorFieldsFromRequest,
            normalizeListenHost,
            normalizeListenPort,
            isAllowedImageSourceValue,
            validateRequiredShoppingImageSources,
            applyConfigUpdates,
            applyRuntimeConfigFromMajor,
            syncAutoRunnerWithConfig,
            syncShoppingAutoRunnerWithConfig,
            scheduleUiReload,
            createConfigRevision,
            parseConfigValue
        });
        const controller = createSettingsController({
            service,
            sendSuccess,
            sendError
        });
        settingsRouteHandler = createSettingsRouteHandler({ controller });
    }
    return settingsRouteHandler;
}

function createLegacyApiDeps() {
    const baseDeps = {
        APP_VERSION,
        Logger,
        Updater,
        Utils,
        fs,
        path,
        CONFIG,
        License,
        ShoppingManager,
        axios,
        cheerio
    };

    const runtimeDeps = {
        parseBoolQuery,
        ensureSheetsReadyForUi,
        toFeatureMap,
        getFeatureInt,
        resolveMaxBlogPostsPerRun,
        resolveMaxShoppingPostsPerRun,
        checkNaverSessionForUi,
        getNaverLoginStatus,
        getNaverLoginState: () => naverLoginState,
        setNaverLoginState,
        runNaverLoginFlowForUi
    };

    const configDeps = {
        SHOPPING_IMAGE_SLOT_MAP,
        parseBase64ImagePayload,
        resolveWritableConfigPath,
        tryResolveReadableConfigSource,
        readConfigRaw,
        buildDefaultConfigTemplate,
        applyConfigUpdates,
        parseConfigValue,
        applyRuntimeConfigFromMajor,
        parseMajorFieldsFromRequest,
        syncAutoRunnerWithConfig,
        syncShoppingAutoRunnerWithConfig,
        resolveLocalImagePathFromSource,
        getContentType,
        resolveRuntimePath,
        buildMajorSettings
    };

    const actionDeps = {
        executeQuickPublish,
        executeShoppingQuickPublish,
        sortTopicItems,
        getBlogRuntimeLogMap,
        sortShoppingItems,
        getShoppingRuntimeLogMap,
        parseIntSafe,
        normalizeSortDir,
        executeBlogBatchRowsAction,
        executeBlogRowAction,
        executeShoppingBatchRowsAction,
        executeShoppingAutoManualAction,
        executeShoppingRowUpdate,
        executeBlogTopicUpdate,
        executeTrendCollectAction,
        executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction
    };

    return {
        ...baseDeps,
        ...runtimeDeps,
        ...configDeps,
        ...actionDeps,
        sendSuccess,
        sendError
    };
}

function getLegacyApiRouteHandler() {
    if (!legacyApiRouteHandler) {
        legacyApiRouteHandler = createLegacyApiRouteHandler(createLegacyApiDeps());
    }
    return legacyApiRouteHandler;
}

function getApiRouteHub() {
    if (!apiRouteHub) {
        apiRouteHub = createApiRouteHub([
            getBlogAutoRouteHandler(),
            getSettingsRouteHandler(),
            getLegacyApiRouteHandler()
        ]);
    }
    return apiRouteHub;
}

function readJsonBody(req, limitBytes = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limitBytes) {
                reject(new Error('요청 본문이 너무 큽니다.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf-8').trim();
                if (!raw) return resolve({});
                resolve(JSON.parse(raw));
            } catch (e) {
                reject(new Error('JSON 본문 파싱에 실패했습니다.'));
            }
        });
        req.on('error', reject);
    });
}

async function handleApi(requestId, method, pathname, searchParams, requestBody, res) {
    const routed = await getApiRouteHub()({
        requestId,
        method,
        pathname,
        searchParams,
        requestBody,
        res
    });
    return routed === true;
}

let activeUiServer = null;

async function startUiServer(options = {}) {
    const host = normalizeListenHost(options.host, normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST));
    const port = Number.isFinite(Number(options.port))
        ? normalizeListenPort(options.port, DEFAULT_PORT)
        : normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT);
    const uiRoot = resolveUiRoot();
    if (!uiRoot) {
        throw new Error('UI 정적 파일 폴더를 찾을 수 없습니다. (ui/)');
    }

    const server = http.createServer(async (req, res) => {
        const requestId = createRequestId();
        const method = String(req.method || 'GET').toUpperCase();
        const url = new URL(String(req.url || '/'), `http://127.0.0.1:${port}`);
        const pathname = url.pathname;

        try {
            if (pathname.startsWith('/api/v1/')) {
                let requestBody = {};
                if (method === 'POST') {
                    const limitBytes = pathname === '/api/v1/settings/shopping-image'
                        ? 15 * 1024 * 1024
                        : 1024 * 1024;
                    requestBody = await readJsonBody(req, limitBytes);
                }
                const apiHandled = await handleApi(requestId, method, pathname, url.searchParams, requestBody, res);
                if (apiHandled !== false) return;
                return sendError(res, requestId, 404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
            }

            if (method !== 'GET') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }

            const safePath = sanitizePathname(pathname === '/' ? 'index.html' : pathname);
            const fullPath = path.join(uiRoot, safePath);
            const rootPrefix = `${uiRoot}${path.sep}`;
            if (!(fullPath === uiRoot || fullPath.startsWith(rootPrefix))) {
                return sendError(res, requestId, 403, 'FORBIDDEN_PATH', '허용되지 않은 경로입니다.');
            }
            if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                return sendError(res, requestId, 404, 'NOT_FOUND', '요청한 리소스를 찾을 수 없습니다.');
            }

            const body = fs.readFileSync(fullPath);
            res.writeHead(200, {
                'Content-Type': getContentType(fullPath),
                'Cache-Control': 'no-store'
            });
            res.end(body);
        } catch (e) {
            Logger.error(`❌ UI 서버 요청 처리 실패: ${e.message}`);
            sendError(res, requestId, 500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            activeUiServer = server;
            resolve();
        });
    });

    syncAutoRunnerWithConfig();
    syncShoppingAutoRunnerWithConfig();

    const openHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    return { server, host, port, openHost };
}

async function reloadUiServer(newHost, newPort) {
    if (activeUiServer) {
        Logger.info(`🔄 설정 변경 감지: 기존 UI 서버(포트)를 종료하고 재시작합니다...`);
        await new Promise(resolve => {
            activeUiServer.close(() => {
                activeUiServer = null;
                resolve();
            });
        });
    }

    // 이 시점에서 기존 서버가 완전히 내려갔으므로 새 설정으로 다시 올립니다.
    // 주의: 실제 변경된 환경변수/설정이 startUiServer에서 똑같이 쓰이도록 보장해야 합니다.
    const started = await startUiServer({ host: newHost, port: newPort });
    Logger.info(`✅ UI 서버 재시작 완료: http://${started.openHost}:${started.port}`);
    return started;
}

module.exports = {
    startUiServer,
    reloadUiServer
};
