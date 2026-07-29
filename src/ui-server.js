const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const License = require('./license');
const TelegramService = require('./telegram-service');
const SlackService = require('./slack-service');
const UrlService = require('./url-service');
const Constants = require('./constants');
const { APP_VERSION } = Constants;
const CONFIG = require('./config-loader');
const Logger = require('./logger');
Logger.debug(`Application version: ${APP_VERSION}`);
const { recordDashboardActivity } = require('./activity/dashboard-activity-store');
const { checkAuthSessionValid } = require('./auth-session');
const Utils = require('./utils');
const Core = require('./core');
const TelegramBotService = require('./telegram-bot.service');
const BrowserLauncher = require('./browser-launcher');
const TrendManager = require('./trend-manager');
const ShoppingManager = require('./shopping-manager');
const Updater = require('./updater');
const RuntimeConfig = require('./runtime-config');
const { registerRuntimeHooks } = require('./runtime-hooks');
const {
    ensureRuntimeRemoteMcpConfig,
    normalizeRemoteMcpHost,
    normalizeRemoteMcpPath,
    normalizeRemoteMcpPort
} = require('./mcp/remote-config');
const { restartRemoteMcpService, getRemoteServiceStatus } = require('./mcp/remote-service');
const { buildLocalMarkdownPreview } = require('./content/local-markdown-preview');
const { materializeSelectedFilesToWorkspace } = require('./content/local-markdown-workspace');
const { appendRelatedPostsToPastedMarkdown } = require('./content/pasted-markdown-related-posts');
const { getAiModelCatalog, buildModelSelectionFromFields } = require('./ai-model-config');
const { normalizeWritingStyle } = require('./content/writing-style');
const { BufferClient } = require('./social/gateways/buffer-client');
const { createSnsSheetStore } = require('./social/sns-sheet-store');
const { createGoogleSheetsSnsGateway } = require('./social/google-sheets-sns-gateway');
const { createSnsRssDiscovery } = require('./social/sns-rss-discovery');
const { createSnsDistributionRunner } = require('./social/sns-distribution-runner');
const { createSnsAiService } = require('./social/sns-ai-service');
const { normalizeSnsAiMode } = require('./social/sns-ai-policy');
const { runInteractiveNaverLoginFlow } = require('./naver-auth-flow');
const { createUiSessionRuntime } = require('./ui-runtime/session-runtime');
const { createUiHttpUtils } = require('./ui-runtime/http-utils');
const { createQuickPublishRuntime } = require('./ui-runtime/quick-publish-runtime');
const { createAutoRunnerRuntime } = require('./ui-runtime/auto-runner-runtime');
const { createAutoCycleRuntime } = require('./ui-runtime/auto-cycle-runtime');
const { createContentActionsRuntime } = require('./ui-runtime/content-actions-runtime');
const { createTrendActionsRuntime } = require('./ui-runtime/trend-actions-runtime');
const { createPublishActionsRuntime } = require('./ui-runtime/publish-actions-runtime');
const { createUiApiRouteRuntime } = require('./ui-runtime/api-route-runtime');
const { createUiHttpServerRuntime } = require('./ui-runtime/http-server-runtime');
const { createUiHelpersRuntime } = require('./ui-runtime/ui-helpers-runtime');
const { createUiConfigFileRuntime } = require('./ui-runtime/config-file-runtime');
const {
    toFeatureMap,
    getFeatureBool,
    getEnableSnsDistribution,
    isCommandEnabled,
    parseMaxPosts
} = require('./runtime-feature-flags');
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
const COLLECT_TRENDS_DEFAULTS = {
    enabled: false,
    categories: '',
    time: '07:30',
    reuseGapDays: 15,
    filterMinIncr: 50,
    filterIncludeNew: false,
    filterIncludeDash: false,
    filterIncludeNumber: true,
    filterType: 'min',
    filterTopN: 5,
    trendsMaxRetries: 3,
    trendsRetryWaitMs: 5 * 60 * 1000
};

const PUBLISH_AUTO_DEFAULTS = {
    enabled: false,
    intervalMin: 60,
    batchSize: 1,
    notifyEnabled: false,
    targetChannels: 'naver',
    headless: true,
    imageGeneration: true,
    externalReference: false,
    startTime: '00:00',
    endTime: '23:59'
};
const SHOPPING_AUTO_DEFAULTS = {
    mode: false,
    dailyPosts: 10,
    time: '07:50',
    notifyEnabled: false
};
const BLOG_AUTO_CATEGORY_MASTER_KEYS = ['NAVER_AUTO_CATEGORIES_MASTER', 'BLOG_AUTO_CATEGORIES_MASTER', 'blog_auto_categories_master', 'naver_auto_categories_master'];
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

const uiSessionRuntime = createUiSessionRuntime({
    CONFIG,
    Utils,
    Logger,
    checkAuthSessionValid,
    runInteractiveNaverLoginFlow,
    sessionCheckTtlMs: UI_SESSION_CHECK_TTL_MS,
    sheetsPreflightTtlMs: UI_SHEETS_PREFLIGHT_TTL_MS
});
const {
    setNaverLoginState,
    getNaverLoginState,
    getNaverLoginStatus,
    ensureSheetsReadyForUi,
    checkNaverSessionForUi,
    runNaverLoginFlowForUi
} = uiSessionRuntime;
const uiHttpUtils = createUiHttpUtils({
    fs,
    path,
    Logger,
    currentDir: __dirname,
    appRoot: CONFIG.PATHS.appRoot
});
const {
    resolveUiRoot,
    sendSuccess,
    sendError,
    getContentType,
    sanitizePathname,
    shouldServeUiShell,
    createRequestId,
    readJsonBody
} = uiHttpUtils;
const uiHelpersRuntime = createUiHelpersRuntime({
    recordDashboardActivity
});
const {
    formatActivityTargets,
    normalizeSortDir,
    parseBoolQuery,
    parseIntSafe,
    recordUiActivity,
    sortShoppingItems,
    sortTopicItems
} = uiHelpersRuntime;
const uiConfigFileRuntime = createUiConfigFileRuntime({
    fs,
    crypto,
    CONFIG,
    defaultHost: DEFAULT_HOST,
    defaultPort: DEFAULT_PORT,
    defaultShoppingImageSources: DEFAULT_SHOPPING_IMAGE_SOURCES
});
const {
    resolveReadableConfigSource,
    resolveWritableConfigPath,
    readConfigRaw,
    createConfigRevision,
    tryResolveReadableConfigSource,
    buildDefaultConfigTemplate,
    parseConfigValue
} = uiConfigFileRuntime;
const quickPublishRuntime = createQuickPublishRuntime({
    dedupeTtlMs: 90 * 1000,
    previewTtlMs: 6 * 60 * 60 * 1000
});
const {
    buildQuickPublishDedupeKey,
    cleanupRecentEntries: cleanupQuickPublishDedupeCache,
    getRecentEntry: getQuickPublishRecentEntry,
    hasRecentEntry: hasQuickPublishRecentEntry,
    setRecentEntry: setQuickPublishRecentEntry,
    getPreviewSession: getQuickPublishPreviewSession,
    deletePreviewSession: deleteQuickPublishPreviewSession,
    registerPreviewSession: registerQuickPublishPreviewSession,
    selectPreviewTarget: selectQuickPublishPreviewTarget
} = quickPublishRuntime;
const snsSheetGateway = createGoogleSheetsSnsGateway({
    Utils,
    CONFIG,
    httpClient: axios
});
const snsSheetStore = createSnsSheetStore({
    gateway: snsSheetGateway
});
const snsRssDiscovery = createSnsRssDiscovery({
    CONFIG,
    License,
    Utils,
    store: snsSheetStore,
    getEnableSnsDistribution,
    Logger,
    httpClient: axios
});
const snsAiService = createSnsAiService({
    CONFIG,
    Utils,
    Logger
});
const snsDistributionRunner = createSnsDistributionRunner({
    CONFIG,
    License,
    store: snsSheetStore,
    bufferClient: new BufferClient({ axios }),
    aiService: snsAiService,
    urlService: UrlService,
    notificationService: TelegramService,
    getEnableSnsDistribution,
    Logger
});
const autoRunnerRuntime = createAutoRunnerRuntime({
    CONFIG,
    Logger,
    parseConfigBool,
    normalizeNonNegativeInt,
    normalizeTimeHHmm,
    computeNextWindowedRunAt,
    normalizeShoppingAutoSettings,
    getBlogAutoSettingsSnapshot: () => getBlogAutoSettingsSnapshot(),
    getShoppingAutoSettingsSnapshot: () => getShoppingAutoSettingsSnapshot(),
    publishAutoDefaults: PUBLISH_AUTO_DEFAULTS,
    shoppingAutoDefaults: SHOPPING_AUTO_DEFAULTS
});
const {
    autoRuntimeState,
    publishRuntimeState,
    shoppingAutoRuntimeState,
    setHandlers: setAutoRunnerHandlers,
    resetShoppingDailyCountersIfNeeded,
    getAutoStatusPayload,
    refreshLegacyAutoRuntimeState,
    syncAutoRunnerWithConfig,
    triggerSnsDiscoveryCycle,
    triggerSnsStartupDiscovery,
    triggerSnsDistributionCycle,
    scheduleNextShoppingAutoCycle,
    stopShoppingAutoRunner,
    syncShoppingAutoRunnerWithConfig
} = autoRunnerRuntime;

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
    if (mode === 'publish') return 'publish';
    if (mode === 'append_and_generate') return 'append_and_generate';
    if (mode === 'append_and_publish') return 'append_and_publish';
    return 'append_only';
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

function normalizeBufferChannels(input) {
    let channels = [];
    if (Array.isArray(input)) {
        channels = input;
    } else if (typeof input === 'string' && input.trim()) {
        try {
            const parsed = JSON.parse(input);
            channels = Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            channels = [];
        }
    }

    const seen = new Set();
    return channels
        .map((item) => ({
            id: String(item?.id || '').trim(),
            service: String(item?.service || '').trim().toLowerCase(),
            display_name: String(item?.display_name || item?.displayName || item?.name || '').trim()
        }))
        .filter((item) => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        })
        .slice(0, 3);
}

function normalizeSnsSourceBlogs(input, fallback = ['naver', 'wordpress']) {
    const source = Array.isArray(input)
        ? input
        : (input == null ? fallback : String(input).split(','));
    return [...new Set(source.map((item) => String(item || '').trim().toLowerCase()))]
        .filter((item) => item === 'naver' || item === 'wordpress');
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
        const runtimeMap = await RuntimeConfig.fetchRuntimeConfig(BLOG_AUTO_CATEGORY_MASTER_KEYS, force);
        const masterValue = String(
            runtimeMap?.NAVER_AUTO_CATEGORIES_MASTER
            || runtimeMap?.naver_auto_categories_master
            || runtimeMap?.BLOG_AUTO_CATEGORIES_MASTER
            || runtimeMap?.blog_auto_categories_master
            || ''
        ).trim();
        runtimeCategories = parseCategoryListRaw(masterValue);
    } catch (_e) {
        Logger.error(`🔍 [resolveNaverAutoCategoryCatalog] Supabase Fetch ERROR:`, _e);
    }

    try {
        const fromConfig = normalizeBlogAutoSettings({});
        // Use COLLECT_TRENDS_CATEGORIES as it is the normalized key
        configCategories = parseCategoryListRaw(fromConfig?.COLLECT_TRENDS_CATEGORIES || '');
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

function parseTimeToMinutes(input) {
    const normalized = normalizeTimeHHmm(input, '');
    if (!normalized) return null;
    const [hour, minute] = normalized.split(':').map((value) => parseInt(value, 10));
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return (hour * 60) + minute;
}

function isWithinRuntimeTimeWindow(start, end, referenceDate = new Date()) {
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    if (startMin === null || endMin === null) return true;

    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    if (!Number.isFinite(date.getTime())) return true;

    const currentMin = (date.getHours() * 60) + date.getMinutes();
    if (startMin <= endMin) {
        return currentMin >= startMin && currentMin <= endMin;
    }
    return currentMin >= startMin || currentMin <= endMin;
}

function getNextTimeWindowStart(referenceDate, start, end) {
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    const date = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date(referenceDate);
    if (!Number.isFinite(date.getTime()) || startMin === null || endMin === null) return date;
    if (isWithinRuntimeTimeWindow(start, end, date)) return date;

    const next = new Date(date);
    next.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);

    if (startMin <= endMin) {
        const currentMin = (date.getHours() * 60) + date.getMinutes();
        if (currentMin > endMin) next.setDate(next.getDate() + 1);
    }

    return next;
}

function computeNextWindowedRunAt({
    delayMs,
    intervalMs,
    startTime,
    endTime,
    baseTimeMs = Date.now(),
    preferWindowStartIfBaseOutside = false
}) {
    const baseDelayMs = Number.isFinite(delayMs)
        ? Math.max(500, Number(delayMs))
        : Math.max(500, Number(intervalMs) || 500);
    const baseDate = new Date(baseTimeMs);
    const candidateAt = new Date(baseTimeMs + baseDelayMs);
    const baseOutsideWindow = !isWithinRuntimeTimeWindow(startTime, endTime, baseDate);
    const runAt = preferWindowStartIfBaseOutside && baseOutsideWindow
        ? getNextTimeWindowStart(baseDate, startTime, endTime)
        : getNextTimeWindowStart(candidateAt, startTime, endTime);
    return {
        runAt,
        candidateAt,
        adjustedByWindow: runAt.getTime() !== candidateAt.getTime()
    };
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
        settings.COLLECT_TRENDS_FILTER_INCLUDE_NEW,
        false
    );
    const includeDash = toBoolLike(
        settings.COLLECT_TRENDS_FILTER_INCLUDE_DASH,
        false
    );
    const includeNumber = toBoolLike(
        settings.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER,
        true
    );
    const threshold = normalizeIntegerOrBlank(
        settings.COLLECT_TRENDS_FILTER_MIN_INCR,
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

/**
 * 🔗 최근 N일 내에 이미 Topics 시트에 추가된 키워드들의 ReuseKey 세트를 반환
 */
function getRecentTopicKeys(existingTopics, gapDays, baseYmdInput = null) {
    const reuseKeySet = new Set();
    const baseYmd = normalizeYmdToken(baseYmdInput) || getSeoulTodayYmd();
    Logger.info(`🔍 중복 체크 시작: 기준일(TrendDate)=${baseYmd}, 간격=${gapDays}일, 기존 토픽=${existingTopics.length}건`);
    if (!gapDays || gapDays <= 0 || !baseYmd || !Array.isArray(existingTopics)) {
        return reuseKeySet;
    }

    for (const item of existingTopics) {
        const key = buildTopicReuseKey(item?.subject, item?.keywords);
        if (!key) continue;

        // Priority: trend_date (User requirement)
        const historyYmd = normalizeYmdToken(item?.trend_date || item?.trendDate || item?.created_at || item?.addedAt || item?.published_at || item?.publishedAt);
        if (!historyYmd) continue;

        if (isYmdWithinRecentDays(historyYmd, baseYmd, gapDays)) {
            reuseKeySet.add(key);
            Logger.debug(`   ✅ 중복 금지 목록(Set) 추가: ${key} (${historyYmd})`);
        }
    }
    return reuseKeySet;
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

function normalizeCollectTrendsSettings(input = {}) {
    const categories = String(
        input.COLLECT_TRENDS_CATEGORIES
        ?? input.BLOG_AUTO_CATEGORIES
        ?? CONFIG.COLLECT_TRENDS_CATEGORIES
        ?? CONFIG.BLOG_AUTO_CATEGORIES
        ?? COLLECT_TRENDS_DEFAULTS.categories
    ).trim();

    const enabled = toBoolLike(
        input.COLLECT_TRENDS_ENABLED,
        toBoolLike(CONFIG.COLLECT_TRENDS_ENABLED, COLLECT_TRENDS_DEFAULTS.enabled)
    );

    const time = normalizeTimeHHmm(
        input.COLLECT_TRENDS_TIME,
        normalizeTimeHHmm(CONFIG.COLLECT_TRENDS_TIME, COLLECT_TRENDS_DEFAULTS.time)
    );

    const reuseGapDaysSource =
        input.COLLECT_TRENDS_REUSE_GAP_DAYS
        ?? CONFIG.COLLECT_TRENDS_REUSE_GAP_DAYS
        ?? COLLECT_TRENDS_DEFAULTS.reuseGapDays;
    const reuseGapDays = normalizeNonNegativeInt(reuseGapDaysSource, COLLECT_TRENDS_DEFAULTS.reuseGapDays);

    const filterMinIncrSource =
        input.COLLECT_TRENDS_FILTER_MIN_INCR
        ?? CONFIG.COLLECT_TRENDS_FILTER_MIN_INCR
        ?? COLLECT_TRENDS_DEFAULTS.filterMinIncr;
    const filterMinIncr = normalizeIntegerOrBlank(filterMinIncrSource, COLLECT_TRENDS_DEFAULTS.filterMinIncr);

    const filterIncludeNew = toBoolLike(
        input.COLLECT_TRENDS_FILTER_INCLUDE_NEW,
        toBoolLike(CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NEW, COLLECT_TRENDS_DEFAULTS.filterIncludeNew)
    );

    const filterIncludeDash = toBoolLike(
        input.COLLECT_TRENDS_FILTER_INCLUDE_DASH,
        toBoolLike(CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_DASH, COLLECT_TRENDS_DEFAULTS.filterIncludeDash)
    );

    const filterIncludeNumber = toBoolLike(
        input.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER,
        toBoolLike(CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER, COLLECT_TRENDS_DEFAULTS.filterIncludeNumber)
    );

    const filterType = String(
        input.COLLECT_TRENDS_FILTER_TYPE
        ?? CONFIG.COLLECT_TRENDS_FILTER_TYPE
        ?? COLLECT_TRENDS_DEFAULTS.filterType
    ).trim();

    const filterTopNSource =
        input.COLLECT_TRENDS_FILTER_TOP_N
        ?? CONFIG.COLLECT_TRENDS_FILTER_TOP_N
        ?? COLLECT_TRENDS_DEFAULTS.filterTopN;
    const filterTopN = normalizeIntegerOrBlank(filterTopNSource, COLLECT_TRENDS_DEFAULTS.filterTopN);

    return {
        COLLECT_TRENDS_ENABLED: enabled,
        COLLECT_TRENDS_CATEGORIES: categories,
        BLOG_AUTO_CATEGORIES: categories, // Compatibility alias
        COLLECT_TRENDS_NAVER_CATEGORY: String(input.COLLECT_TRENDS_NAVER_CATEGORY || CONFIG.COLLECT_TRENDS_NAVER_CATEGORY || '').trim(),
        COLLECT_TRENDS_WP_CATEGORY: String(input.COLLECT_TRENDS_WP_CATEGORY || CONFIG.COLLECT_TRENDS_WP_CATEGORY || '').trim(),
        COLLECT_TRENDS_TIME: time,
        COLLECT_TRENDS_REUSE_GAP_DAYS: reuseGapDays,
        COLLECT_TRENDS_FILTER_MIN_INCR: filterMinIncr,
        COLLECT_TRENDS_FILTER_INCLUDE_NEW: filterIncludeNew,
        COLLECT_TRENDS_FILTER_INCLUDE_DASH: filterIncludeDash,
        COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: filterIncludeNumber,
        COLLECT_TRENDS_FILTER_TYPE: filterType,
        COLLECT_TRENDS_FILTER_TOP_N: filterTopN
    };
}

function normalizePublishAutoSettings(input = {}) {
    const enabled = toBoolLike(
        input.PUBLISH_AUTO_ENABLED,
        toBoolLike(CONFIG.PUBLISH_AUTO_ENABLED, PUBLISH_AUTO_DEFAULTS.enabled)
    );

    const intervalMinSource =
        input.PUBLISH_AUTO_INTERVAL_MIN
        ?? CONFIG.PUBLISH_AUTO_INTERVAL_MIN
        ?? PUBLISH_AUTO_DEFAULTS.intervalMin;
    const intervalMin = normalizeNonNegativeInt(intervalMinSource, PUBLISH_AUTO_DEFAULTS.intervalMin);

    const batchSizeSource =
        input.PUBLISH_AUTO_BATCH_SIZE
        ?? CONFIG.PUBLISH_AUTO_BATCH_SIZE
        ?? PUBLISH_AUTO_DEFAULTS.batchSize;
    const batchSize = normalizePositiveInt(batchSizeSource, PUBLISH_AUTO_DEFAULTS.batchSize);

    const notifyEnabled = toBoolLike(
        input.PUBLISH_AUTO_NOTIFY_ENABLED,
        toBoolLike(CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED, PUBLISH_AUTO_DEFAULTS.notifyEnabled)
    );

    const targetChannels = (input.PUBLISH_AUTO_TARGET_CHANNELS
        ?? CONFIG.PUBLISH_AUTO_TARGET_CHANNELS
        ?? PUBLISH_AUTO_DEFAULTS.targetChannels);

    // Convert string to array
    const targetChannelsArray = Array.isArray(targetChannels)
        ? targetChannels
        : String(targetChannels).split(',').map(v => v.trim()).filter(Boolean);

    const headless = toBoolLike(
        input.PUBLISH_AUTO_HEADLESS ?? CONFIG.PUBLISH_AUTO_HEADLESS,
        PUBLISH_AUTO_DEFAULTS.headless
    );

    const startTime = normalizeTimeHHmm(
        input.PUBLISH_AUTO_START_TIME ?? CONFIG.PUBLISH_AUTO_START_TIME,
        PUBLISH_AUTO_DEFAULTS.startTime
    );
    const endTime = normalizeTimeHHmm(
        input.PUBLISH_AUTO_END_TIME ?? CONFIG.PUBLISH_AUTO_END_TIME,
        PUBLISH_AUTO_DEFAULTS.endTime
    );

    return {
        PUBLISH_AUTO_ENABLED: enabled,
        PUBLISH_AUTO_INTERVAL_MIN: intervalMin,
        PUBLISH_AUTO_BATCH_SIZE: batchSize,
        PUBLISH_AUTO_NOTIFY_ENABLED: notifyEnabled,
        PUBLISH_AUTO_TARGET_CHANNELS: targetChannelsArray,
        PUBLISH_AUTO_HEADLESS: headless,
        PUBLISH_AUTO_START_TIME: startTime,
        PUBLISH_AUTO_END_TIME: endTime
    };
}

/** @deprecated Use separate normalization functions */
function normalizeBlogAutoSettings(input = {}) {
    return {
        ...normalizeCollectTrendsSettings(input),
        ...normalizePublishAutoSettings(input)
    };
}
function normalizeShoppingAutoSettings(input = {}) {
    const enabled = toBoolLike(
        input.SHOPPING_PUBLISH_AUTO_ENABLED ?? input.SHOPPING_AUTO_MODE,
        toBoolLike(CONFIG.SHOPPING_PUBLISH_AUTO_ENABLED ?? CONFIG.SHOPPING_AUTO_MODE, SHOPPING_AUTO_DEFAULTS.mode)
    );
    const interval = normalizeNonNegativeInt(
        input.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN ?? CONFIG.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN,
        PUBLISH_AUTO_DEFAULTS.intervalMin
    );
    const batchSize = normalizePositiveInt(
        input.SHOPPING_PUBLISH_AUTO_BATCH_SIZE
        ?? input.SHOPPING_AUTO_DAILY_POSTS
        ?? CONFIG.SHOPPING_PUBLISH_AUTO_BATCH_SIZE
        ?? CONFIG.SHOPPING_AUTO_DAILY_POSTS,
        PUBLISH_AUTO_DEFAULTS.batchSize
    );
    const headless = toBoolLike(
        input.SHOPPING_PUBLISH_AUTO_HEADLESS ?? input.SHOPPING_AUTO_HEADLESS,
        toBoolLike(CONFIG.SHOPPING_PUBLISH_AUTO_HEADLESS ?? CONFIG.SHOPPING_AUTO_HEADLESS ?? CONFIG.HEADLESS, PUBLISH_AUTO_DEFAULTS.headless)
    );
    const targets = input.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS ?? CONFIG.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS ?? PUBLISH_AUTO_DEFAULTS.targetChannels;
    const targetsArray = Array.isArray(targets) ? targets : String(targets).split(',').map(v => v.trim()).filter(Boolean);
    const notifyEnabled = toBoolLike(
        input.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED ?? input.SHOPPING_AUTO_NOTIFY_ENABLED,
        toBoolLike(CONFIG.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED ?? CONFIG.SHOPPING_AUTO_NOTIFY_ENABLED, SHOPPING_AUTO_DEFAULTS.notifyEnabled)
    );
    const startTime = normalizeTimeHHmm(
        input.SHOPPING_PUBLISH_AUTO_START_TIME ?? CONFIG.SHOPPING_PUBLISH_AUTO_START_TIME,
        PUBLISH_AUTO_DEFAULTS.startTime
    );
    const endTime = normalizeTimeHHmm(
        input.SHOPPING_PUBLISH_AUTO_END_TIME ?? CONFIG.SHOPPING_PUBLISH_AUTO_END_TIME,
        PUBLISH_AUTO_DEFAULTS.endTime
    );
    const legacyTime = normalizeTimeHHmm(
        input.SHOPPING_AUTO_TIME ?? CONFIG.SHOPPING_AUTO_TIME,
        SHOPPING_AUTO_DEFAULTS.time
    );

    return {
        SHOPPING_PUBLISH_AUTO_ENABLED: enabled,
        SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: interval,
        SHOPPING_PUBLISH_AUTO_BATCH_SIZE: batchSize,
        SHOPPING_PUBLISH_AUTO_HEADLESS: headless,
        SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: targetsArray,
        SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: notifyEnabled,
        SHOPPING_PUBLISH_AUTO_START_TIME: startTime,
        SHOPPING_PUBLISH_AUTO_END_TIME: endTime,
        SHOPPING_AUTO_MODE: enabled,
        SHOPPING_AUTO_DAILY_POSTS: batchSize,
        SHOPPING_AUTO_HEADLESS: headless,
        SHOPPING_AUTO_NOTIFY_ENABLED: notifyEnabled,
        SHOPPING_AUTO_TIME: legacyTime
    };
}

/**
 * @deprecated JSON 구조 도입으로 더 이상 사용되지 않음 (settings.service.js에서 직접 처리)
 */
function applyConfigUpdates(raw, updates = {}) {
    return raw;
}

function buildMajorSettings(raw, configSource) {
    const remoteMcp = ensureRuntimeRemoteMcpConfig(CONFIG);
    // 이제 raw(text)를 파싱하는 대신 이미 로드된 CONFIG 객체의 값을 우선 시용합니다.
    const fields = {
        LISTEN_HOST: CONFIG.LISTEN_HOST,
        LISTEN_PORT: CONFIG.LISTEN_PORT,
        NAVER_ID: CONFIG.NAVER_ID,
        WORDPRESS_URL: CONFIG.WORDPRESS_URL,
        WORDPRESS_USER_ID: CONFIG.WORDPRESS_USER_ID,
        WORDPRESS_APP_PASSWORD: CONFIG.WORDPRESS_APP_PASSWORD,
        BLOG_WRITING_MODE: CONFIG.BLOG_WRITING_MODE || 'conversational',
        BLOG_SPEECH_LEVEL: CONFIG.BLOG_SPEECH_LEVEL || 'polite',
        GOOGLE_SHEET_URL: CONFIG.GOOGLE_SHEET_URL,
        HEADLESS: CONFIG.HEADLESS,
        IMAGE_OPTIMIZATION_ENABLED: CONFIG.IMAGE_OPTIMIZATION_ENABLED,
        TYPING_SPEED: CONFIG.TYPING_SPEED,
        FTC_DISCLOSURE_IMAGE_URL: CONFIG.FTC_DISCLOSURE_IMAGE_URL,
        SHOPPING_CTA_IMAGE_URL1: CONFIG.SHOPPING_CTA_IMAGE_URL1,
        SHOPPING_CTA_IMAGE_URL2: CONFIG.SHOPPING_CTA_IMAGE_URL2,
        SHOPPING_CTA_IMAGE_URL3: CONFIG.SHOPPING_CTA_IMAGE_URL3,
        UPDATE_CHANNEL: CONFIG.UPDATE_CHANNEL || 'stable',
        UPDATE_SERVER_TYPE: CONFIG.UPDATE_SERVER_TYPE || 'github',
        CUSTOM_UPDATE_CHECK_URL: CONFIG.CUSTOM_UPDATE_CHECK_URL || '',
        UPDATE_MIRROR_REPO: CONFIG.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases',
        TEXT_MODEL_PROVIDER: CONFIG.TEXT_MODEL_CONFIG?.provider || 'gemini',
        TEXT_MODEL_PRESET_CODE: CONFIG.TEXT_MODEL_CONFIG?.provider === 'direct' ? '' : (CONFIG.TEXT_MODEL_CONFIG?.code || ''),
        TEXT_MODEL_NAME: CONFIG.TEXT_MODEL_CONFIG?.name || '',
        TEXT_MODEL_BASE_URL: CONFIG.TEXT_MODEL_CONFIG?.base_url || '',
        TEXT_MODEL_API_KEY: CONFIG.TEXT_MODEL_CONFIG?.api_key || '',
        IMAGE_MODEL_PROVIDER: CONFIG.IMAGE_MODEL_CONFIG?.provider || 'gemini',
        IMAGE_MODEL_PRESET_CODE: CONFIG.IMAGE_MODEL_CONFIG?.provider === 'direct' ? '' : (CONFIG.IMAGE_MODEL_CONFIG?.code || ''),
        IMAGE_MODEL_NAME: CONFIG.IMAGE_MODEL_CONFIG?.name || '',
        IMAGE_MODEL_BASE_URL: CONFIG.IMAGE_MODEL_CONFIG?.base_url || '',
        IMAGE_MODEL_API_KEY: CONFIG.IMAGE_MODEL_CONFIG?.api_key || '',

        // Automation - Trends
        COLLECT_TRENDS_ENABLED: CONFIG.COLLECT_TRENDS_ENABLED,
        COLLECT_TRENDS_CATEGORIES: CONFIG.COLLECT_TRENDS_CATEGORIES,
        COLLECT_TRENDS_FILTER_MIN_INCR: CONFIG.COLLECT_TRENDS_FILTER_MIN_INCR,
        COLLECT_TRENDS_FILTER_INCLUDE_NEW: CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NEW,
        COLLECT_TRENDS_FILTER_INCLUDE_DASH: CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_DASH,
        COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER,
        COLLECT_TRENDS_FILTER_TYPE: CONFIG.COLLECT_TRENDS_FILTER_TYPE,
        COLLECT_TRENDS_FILTER_TOP_N: CONFIG.COLLECT_TRENDS_FILTER_TOP_N,
        COLLECT_TRENDS_REUSE_GAP_DAYS: CONFIG.COLLECT_TRENDS_REUSE_GAP_DAYS,
        COLLECT_TRENDS_TIME: CONFIG.COLLECT_TRENDS_TIME,
        COLLECT_TRENDS_NAVER_CATEGORY: CONFIG.COLLECT_TRENDS_NAVER_CATEGORY,
        COLLECT_TRENDS_WP_CATEGORY: CONFIG.COLLECT_TRENDS_WP_CATEGORY,

        // Automation - RSS
        COLLECT_RSS_ENABLED: CONFIG.COLLECT_RSS_ENABLED,
        COLLECT_RSS_CONFIGS: CONFIG.COLLECT_RSS_CONFIGS || [],

        // Buffer SNS Distribution
        BUFFER_API_KEY: CONFIG.BUFFER_API_KEY || '',
        BUFFER_ORGANIZATION_ID: CONFIG.BUFFER_ORGANIZATION_ID || '',
        BUFFER_CHANNELS: normalizeBufferChannels(CONFIG.BUFFER_CHANNELS),
        BUFFER_HELP_URL: CONFIG.BUFFER_HELP_URL || '',
        SNS_PUBLISH_ENABLED: CONFIG.SNS_PUBLISH_ENABLED === true,
        SNS_PUBLISH_INTERVAL_MIN: Math.max(10, Number(CONFIG.SNS_PUBLISH_INTERVAL_MIN) || 10),
        SNS_AI_MODE: normalizeSnsAiMode(CONFIG.SNS_AI_MODE),
        SNS_SOURCE_BLOGS: normalizeSnsSourceBlogs(CONFIG.SNS_SOURCE_BLOGS),

        // Automation - Publish
        PUBLISH_AUTO_ENABLED: CONFIG.PUBLISH_AUTO_ENABLED,
        PUBLISH_AUTO_INTERVAL_MIN: CONFIG.PUBLISH_AUTO_INTERVAL_MIN,
        PUBLISH_AUTO_BATCH_SIZE: CONFIG.PUBLISH_AUTO_BATCH_SIZE,
        PUBLISH_AUTO_TARGET_CHANNELS: CONFIG.PUBLISH_AUTO_TARGET_CHANNELS,
        PUBLISH_AUTO_HEADLESS: CONFIG.PUBLISH_AUTO_HEADLESS,
        PUBLISH_AUTO_NOTIFY_ENABLED: CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED,
        PUBLISH_AUTO_START_TIME: CONFIG.PUBLISH_AUTO_START_TIME,
        PUBLISH_AUTO_END_TIME: CONFIG.PUBLISH_AUTO_END_TIME,

        // Automation - Shopping
        SHOPPING_PUBLISH_AUTO_ENABLED: CONFIG.SHOPPING_PUBLISH_AUTO_ENABLED,
        SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: CONFIG.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN,
        SHOPPING_PUBLISH_AUTO_BATCH_SIZE: CONFIG.SHOPPING_PUBLISH_AUTO_BATCH_SIZE,
        SHOPPING_PUBLISH_AUTO_HEADLESS: CONFIG.SHOPPING_PUBLISH_AUTO_HEADLESS,
        SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: CONFIG.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS,
        SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: CONFIG.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED,
        SHOPPING_PUBLISH_AUTO_START_TIME: CONFIG.SHOPPING_PUBLISH_AUTO_START_TIME,
        SHOPPING_PUBLISH_AUTO_END_TIME: CONFIG.SHOPPING_PUBLISH_AUTO_END_TIME,
        SHOPPING_AUTO_TIME: CONFIG.SHOPPING_AUTO_TIME,

        // Telegram Notification
        NOTIFY_TELEGRAM_ENABLED: CONFIG.NOTIFY_TELEGRAM_ENABLED,
        NOTIFY_TELEGRAM_BOT_TOKEN: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
        NOTIFY_TELEGRAM_CHAT_ID: CONFIG.NOTIFY_TELEGRAM_CHAT_ID,
        NOTIFY_BITLY_TOKEN: CONFIG.NOTIFY_BITLY_TOKEN,
        TELEGRAM_CHAT_AI_MODE: CONFIG.TELEGRAM_CHAT_AI_MODE || 'default',

        // Chat Model (Custom AI)
        CHAT_MODEL_BASE_URL: CONFIG.CHAT_MODEL_BASE_URL,
        CHAT_MODEL_API_KEY: CONFIG.CHAT_MODEL_API_KEY,
        CHAT_MODEL_CODE: CONFIG.CHAT_MODEL_CODE,

        // Slack Notification
        NOTIFY_SLACK_ENABLED: CONFIG.NOTIFY_SLACK_ENABLED,
        NOTIFY_SLACK_WEBHOOK_URL: CONFIG.NOTIFY_SLACK_WEBHOOK_URL,

        MCP_REMOTE_ENABLED: remoteMcp.enabled,
        MCP_REMOTE_HOST: remoteMcp.host,
        MCP_REMOTE_PORT: remoteMcp.port,
        MCP_REMOTE_PATH: remoteMcp.path,
        MCP_REMOTE_AUTH_TOKEN: remoteMcp.authToken
    };

    return {
        configPath: configSource?.path || CONFIG.CONFIG_SOURCE_PATH || '',
        configSourceType: configSource?.sourceType || CONFIG.CONFIG_SOURCE_TYPE || 'json',
        fields,
        telegramBotStatus: typeof TelegramBotService.getStatus === 'function'
            ? TelegramBotService.getStatus()
            : null,
        remoteMcpStatus: getRemoteServiceStatus(),
        typingSpeedOptions: ALLOWED_TYPING_SPEEDS,
        aiPresets: getAiModelCatalog(),
        shoppingImageDefaults: { ...DEFAULT_SHOPPING_IMAGE_SOURCES },
        shoppingImageSlots: buildShoppingImageSlots(fields)
    };
}

function applyRuntimeConfigFromMajor(fields = {}) {
    const listenHost = normalizeListenHost(fields.LISTEN_HOST, normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST));
    const listenPort = normalizeListenPort(fields.LISTEN_PORT, normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT));
    const naverId = String(fields.NAVER_ID || '').trim();
    const wordpressUrl = String(fields.WORDPRESS_URL || '').trim();
    const wordpressUserId = String(fields.WORDPRESS_USER_ID || '').trim();
    const wordpressAppPassword = String(fields.WORDPRESS_APP_PASSWORD || '').trim();
    const writingStyle = normalizeWritingStyle({
        writing_mode: fields.BLOG_WRITING_MODE,
        speech_level: fields.BLOG_SPEECH_LEVEL
    });
    const googleSheetUrl = normalizeGoogleSheetUrl(fields.GOOGLE_SHEET_URL, CONFIG.GOOGLE_SHEET_ID);
    const googleSheetId = extractGoogleSheetId(googleSheetUrl);
    const headless = Boolean(fields.HEADLESS);
    const typingSpeed = normalizeTypingSpeed(fields.TYPING_SPEED, 'NORMAL');
    const ftcImageUrl = String(fields.FTC_DISCLOSURE_IMAGE_URL || '').trim();
    const ctaImageUrl1 = String(fields.SHOPPING_CTA_IMAGE_URL1 || '').trim();
    const ctaImageUrl2 = String(fields.SHOPPING_CTA_IMAGE_URL2 || '').trim();
    const ctaImageUrl3 = String(fields.SHOPPING_CTA_IMAGE_URL3 || '').trim();
    const aiPresets = getAiModelCatalog();
    const textModelConfig = buildModelSelectionFromFields('text', fields, aiPresets);
    const imageModelConfig = buildModelSelectionFromFields('image', fields, aiPresets);
    const autoSettings = normalizeBlogAutoSettings(fields);
    const shoppingAutoSettings = normalizeShoppingAutoSettings(fields);
    const remoteMcp = ensureRuntimeRemoteMcpConfig(CONFIG, {
        enabled: fields.MCP_REMOTE_ENABLED,
        host: fields.MCP_REMOTE_HOST,
        port: fields.MCP_REMOTE_PORT,
        path: fields.MCP_REMOTE_PATH,
        authToken: fields.MCP_REMOTE_AUTH_TOKEN
    });

    CONFIG.NAVER_ID = naverId;
    CONFIG.WORDPRESS_URL = wordpressUrl;
    CONFIG.WORDPRESS_USER_ID = wordpressUserId;
    CONFIG.WORDPRESS_APP_PASSWORD = wordpressAppPassword;
    CONFIG.BLOG_WRITING_MODE = writingStyle.writing_mode;
    CONFIG.BLOG_SPEECH_LEVEL = writingStyle.speech_level;
    CONFIG.LISTEN_HOST = listenHost;
    CONFIG.LISTEN_PORT = listenPort;
    CONFIG.GOOGLE_SHEET_URL = googleSheetUrl;
    CONFIG.GOOGLE_SHEET_ID = googleSheetId;
    CONFIG.HEADLESS = headless;
    CONFIG.IMAGE_OPTIMIZATION_ENABLED = normalizeBool(fields.IMAGE_OPTIMIZATION_ENABLED, true);
    CONFIG.UPDATE_SERVER_TYPE = String(fields.UPDATE_SERVER_TYPE || 'github').trim() === 'custom' ? 'custom' : 'github';
    CONFIG.CUSTOM_UPDATE_CHECK_URL = String(fields.CUSTOM_UPDATE_CHECK_URL || '').trim();
    CONFIG.UPDATE_MIRROR_REPO = String(fields.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases').trim() || 'delta898/NaverAutoBlog-Releases';
    CONFIG.TEXT_MODEL_CONFIG = textModelConfig;
    CONFIG.IMAGE_MODEL_CONFIG = imageModelConfig;
    CONFIG.TEXT_MODEL = textModelConfig.code;
    CONFIG.IMAGE_MODEL = imageModelConfig.code;
    CONFIG.TEXT_MODEL_NAME = textModelConfig.name;
    CONFIG.IMAGE_MODEL_NAME = imageModelConfig.name;
    CONFIG.TEXT_MODEL_PROVIDER = textModelConfig.provider;
    CONFIG.IMAGE_MODEL_PROVIDER = imageModelConfig.provider;
    CONFIG.TEXT_MODEL_BASE_URL = textModelConfig.base_url;
    CONFIG.IMAGE_MODEL_BASE_URL = imageModelConfig.base_url;
    CONFIG.TEXT_MODEL_API_KEY = textModelConfig.api_key;
    CONFIG.IMAGE_MODEL_API_KEY = imageModelConfig.api_key;
    CONFIG.GEMINI_TEXT_ENDPOINT = textModelConfig.provider === 'gemini' && textModelConfig.code
        ? `https://generativelanguage.googleapis.com/v1beta/models/${textModelConfig.code}:generateContent`
        : '';
    CONFIG.GEMINI_IMAGE_ENDPOINT = imageModelConfig.provider === 'gemini' && imageModelConfig.code
        ? `https://generativelanguage.googleapis.com/v1beta/models/${imageModelConfig.code}:generateContent`
        : '';
    CONFIG.TYPING_SPEED = typingSpeed;
    CONFIG.TYPING = CONFIG.TYPING_PRESETS?.[typingSpeed] || CONFIG.TYPING;
    CONFIG.WRITE_URL = `https://blog.naver.com/${naverId}/postwrite`;
    CONFIG.FTC_DISCLOSURE_IMAGE_URL = ftcImageUrl;
    CONFIG.SHOPPING_CTA_IMAGE_URL1 = ctaImageUrl1;
    CONFIG.SHOPPING_CTA_IMAGE_URL2 = ctaImageUrl2;
    CONFIG.SHOPPING_CTA_IMAGE_URL3 = ctaImageUrl3;

    CONFIG.COLLECT_TRENDS_ENABLED = normalizeBool(fields.COLLECT_TRENDS_ENABLED, false);
    CONFIG.COLLECT_TRENDS_CATEGORIES = String(fields.COLLECT_TRENDS_CATEGORIES || '').trim();
    CONFIG.COLLECT_TRENDS_FILTER_MIN_INCR = normalizeIntegerOrBlank(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
    CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NEW = normalizeBool(fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW, false);
    CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_DASH = normalizeBool(fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH, false);
    CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER = normalizeBool(fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER, true);
    CONFIG.COLLECT_TRENDS_FILTER_TYPE = String(fields.COLLECT_TRENDS_FILTER_TYPE || 'min').trim();
    CONFIG.COLLECT_TRENDS_FILTER_TOP_N = normalizeIntegerOrBlank(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
    CONFIG.COLLECT_TRENDS_REUSE_GAP_DAYS = normalizeNonNegativeInt(fields.COLLECT_TRENDS_REUSE_GAP_DAYS, 15);
    CONFIG.COLLECT_TRENDS_TIME = normalizeTimeHHmm(fields.COLLECT_TRENDS_TIME, '07:30');
    CONFIG.COLLECT_TRENDS_NAVER_CATEGORY = String(fields.COLLECT_TRENDS_NAVER_CATEGORY || '').trim();
    CONFIG.COLLECT_TRENDS_WP_CATEGORY = String(fields.COLLECT_TRENDS_WP_CATEGORY || '').trim();

    CONFIG.BUFFER_API_KEY = String(fields.BUFFER_API_KEY || '').trim();
    CONFIG.BUFFER_ORGANIZATION_ID = String(fields.BUFFER_ORGANIZATION_ID || '').trim();
    CONFIG.BUFFER_CHANNELS = normalizeBufferChannels(fields.BUFFER_CHANNELS);
    CONFIG.BUFFER_HELP_URL = String(fields.BUFFER_HELP_URL || '').trim();
    CONFIG.SNS_PUBLISH_ENABLED = normalizeBool(fields.SNS_PUBLISH_ENABLED, false);
    CONFIG.SNS_PUBLISH_INTERVAL_MIN = Math.max(10, normalizePositiveInt(fields.SNS_PUBLISH_INTERVAL_MIN, 10));
    CONFIG.SNS_AI_MODE = normalizeSnsAiMode(fields.SNS_AI_MODE);
    CONFIG.SNS_SHEET_NAME = 'SNS';
    CONFIG.SNS_SOURCE_BLOGS = normalizeSnsSourceBlogs(fields.SNS_SOURCE_BLOGS);

    CONFIG.PUBLISH_AUTO_ENABLED = normalizeBool(fields.PUBLISH_AUTO_ENABLED, false);
    CONFIG.PUBLISH_AUTO_BATCH_SIZE = normalizePositiveInt(fields.PUBLISH_AUTO_BATCH_SIZE, 1);
    CONFIG.PUBLISH_AUTO_INTERVAL_MIN = normalizeNonNegativeInt(fields.PUBLISH_AUTO_INTERVAL_MIN, 60);
    CONFIG.PUBLISH_AUTO_TARGET_CHANNELS = autoSettings.PUBLISH_AUTO_TARGET_CHANNELS;
    CONFIG.PUBLISH_AUTO_HEADLESS = normalizeBool(fields.PUBLISH_AUTO_HEADLESS, true);
    CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED = normalizeBool(fields.PUBLISH_AUTO_NOTIFY_ENABLED, false);
    CONFIG.PUBLISH_AUTO_START_TIME = autoSettings.PUBLISH_AUTO_START_TIME;
    CONFIG.PUBLISH_AUTO_END_TIME = autoSettings.PUBLISH_AUTO_END_TIME;

    try {
        const rawRss = String(fields.COLLECT_RSS_CONFIGS || '').trim();
        CONFIG.COLLECT_RSS_CONFIGS = rawRss ? JSON.parse(rawRss) : [];
        if (!Array.isArray(CONFIG.COLLECT_RSS_CONFIGS)) CONFIG.COLLECT_RSS_CONFIGS = [];
    } catch {
        CONFIG.COLLECT_RSS_CONFIGS = [];
    }

    CONFIG.PUBLISH_AUTO_ENABLED = normalizeBool(fields.PUBLISH_AUTO_ENABLED, false);
    CONFIG.PUBLISH_AUTO_INTERVAL_MIN = normalizeNonNegativeInt(fields.PUBLISH_AUTO_INTERVAL_MIN, 60);
    CONFIG.PUBLISH_AUTO_BATCH_SIZE = normalizeNonNegativeInt(fields.PUBLISH_AUTO_BATCH_SIZE, 1);

    CONFIG.SHOPPING_PUBLISH_AUTO_ENABLED = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_ENABLED;
    CONFIG.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN;
    CONFIG.SHOPPING_PUBLISH_AUTO_BATCH_SIZE = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_BATCH_SIZE;
    CONFIG.SHOPPING_PUBLISH_AUTO_HEADLESS = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_HEADLESS;
    CONFIG.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS;
    CONFIG.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED = normalizeBool(fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED, false);
    CONFIG.SHOPPING_PUBLISH_AUTO_START_TIME = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_START_TIME;
    CONFIG.SHOPPING_PUBLISH_AUTO_END_TIME = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_END_TIME;
    CONFIG.SHOPPING_AUTO_MODE = shoppingAutoSettings.SHOPPING_AUTO_MODE;
    CONFIG.SHOPPING_AUTO_DAILY_POSTS = shoppingAutoSettings.SHOPPING_AUTO_DAILY_POSTS;
    CONFIG.SHOPPING_AUTO_HEADLESS = shoppingAutoSettings.SHOPPING_AUTO_HEADLESS;
    CONFIG.SHOPPING_AUTO_NOTIFY_ENABLED = shoppingAutoSettings.SHOPPING_AUTO_NOTIFY_ENABLED;
    CONFIG.SHOPPING_AUTO_TIME = shoppingAutoSettings.SHOPPING_AUTO_TIME;

    // Telegram Notify
    CONFIG.NOTIFY_TELEGRAM_ENABLED = normalizeBool(fields.NOTIFY_TELEGRAM_ENABLED, false);
    CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN = String(fields.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim();
    CONFIG.NOTIFY_TELEGRAM_CHAT_ID = String(fields.NOTIFY_TELEGRAM_CHAT_ID || '').trim();
    CONFIG.NOTIFY_BITLY_TOKEN = String(fields.NOTIFY_BITLY_TOKEN || '').trim();
    CONFIG.TELEGRAM_CHAT_AI_MODE = String(fields.TELEGRAM_CHAT_AI_MODE || 'default').trim() === 'custom' ? 'custom' : 'default';

    // Chat Model (Custom AI)
    CONFIG.CHAT_MODEL_BASE_URL = String(fields.CHAT_MODEL_BASE_URL || '').trim();
    CONFIG.CHAT_MODEL_API_KEY = String(fields.CHAT_MODEL_API_KEY || '').trim();
    CONFIG.CHAT_MODEL_CODE = String(fields.CHAT_MODEL_CODE || '').trim();

    // Slack Notify
    CONFIG.NOTIFY_SLACK_ENABLED = normalizeBool(fields.NOTIFY_SLACK_ENABLED, false);
    CONFIG.NOTIFY_SLACK_WEBHOOK_URL = String(fields.NOTIFY_SLACK_WEBHOOK_URL || '').trim();
    CONFIG.MCP_REMOTE_ENABLED = remoteMcp.enabled;
    CONFIG.MCP_REMOTE_HOST = remoteMcp.host;
    CONFIG.MCP_REMOTE_PORT = remoteMcp.port;
    CONFIG.MCP_REMOTE_PATH = remoteMcp.path;
    CONFIG.MCP_REMOTE_AUTH_TOKEN = remoteMcp.authToken;

    Object.assign(CONFIG, autoSettings);
    Object.assign(CONFIG, shoppingAutoSettings);
}

function parseMajorFieldsFromRequest(requestBody = {}) {
    const listenHost = normalizeListenHost(requestBody.LISTEN_HOST, DEFAULT_HOST);
    const listenPort = normalizeListenPort(requestBody.LISTEN_PORT, DEFAULT_PORT);
    const naverId = String(requestBody.NAVER_ID || '').trim();
    const wordpressUrl = String(requestBody.WORDPRESS_URL || '').trim();
    const wordpressUserId = String(requestBody.WORDPRESS_USER_ID || '').trim();
    const wordpressAppPassword = String(requestBody.WORDPRESS_APP_PASSWORD || '').trim();
    const writingStyle = normalizeWritingStyle({
        writing_mode: requestBody.BLOG_WRITING_MODE,
        speech_level: requestBody.BLOG_SPEECH_LEVEL
    });
    const googleSheetUrl = normalizeGoogleSheetUrl(requestBody.GOOGLE_SHEET_URL, requestBody.GOOGLE_SHEET_ID);
    const headless = normalizeBool(requestBody.HEADLESS, false);
    const typingSpeed = normalizeTypingSpeed(requestBody.TYPING_SPEED, 'NORMAL');
    const ftcImageUrl = String(requestBody.FTC_DISCLOSURE_IMAGE_URL || '').trim();
    const ctaImageUrl1 = String(requestBody.SHOPPING_CTA_IMAGE_URL1 || '').trim();
    const ctaImageUrl2 = String(requestBody.SHOPPING_CTA_IMAGE_URL2 || '').trim();
    const ctaImageUrl3 = String(requestBody.SHOPPING_CTA_IMAGE_URL3 || '').trim();

    // Reorganized Namespaces
    const collectTrendsSettings = normalizeCollectTrendsSettings(requestBody);
    const rssConfigs = (() => {
        let configs = [];
        const raw = requestBody.COLLECT_RSS_CONFIGS;
        if (Array.isArray(raw)) {
            configs = raw;
        } else if (typeof raw === 'string' && raw.trim()) {
            try { configs = JSON.parse(raw); } catch (e) { configs = []; }
        }

        return configs.map(config => {
            const includeKeywords = Array.isArray(config.includeKeywords)
                ? config.includeKeywords
                : String(config.includeKeywords || '').split(',').map(s => s.trim()).filter(Boolean);

            const excludeKeywords = Array.isArray(config.excludeKeywords)
                ? config.excludeKeywords
                : String(config.excludeKeywords || '').split(',').map(s => s.trim()).filter(Boolean);

            return {
                ...config,
                includeKeywords,
                excludeKeywords
            };
        });
    })();
    const collectRssEnabled = normalizeBool(requestBody.COLLECT_RSS_ENABLED, false);
    const imageOptimizationEnabled = normalizeBool(requestBody.IMAGE_OPTIMIZATION_ENABLED, true);
    const updateServerType = String(requestBody.UPDATE_SERVER_TYPE || 'github').trim() === 'custom' ? 'custom' : 'github';
    const customUpdateCheckUrl = String(requestBody.CUSTOM_UPDATE_CHECK_URL || '').trim();
    const updateMirrorRepo = String(requestBody.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases').trim() || 'delta898/NaverAutoBlog-Releases';
    const aiPresets = getAiModelCatalog();
    const textModelConfig = buildModelSelectionFromFields('text', requestBody, aiPresets);
    const imageModelConfig = buildModelSelectionFromFields('image', requestBody, aiPresets);

    const publishAutoSettings = normalizePublishAutoSettings(requestBody);
    const shoppingAutoSettings = normalizeShoppingAutoSettings(requestBody);
    const bufferChannels = normalizeBufferChannels(requestBody.BUFFER_CHANNELS);
    const snsSourceBlogs = normalizeSnsSourceBlogs(requestBody.SNS_SOURCE_BLOGS);

    return {
        LISTEN_HOST: listenHost,
        LISTEN_PORT: listenPort,
        NAVER_ID: naverId,
        WORDPRESS_URL: wordpressUrl,
        WORDPRESS_USER_ID: wordpressUserId,
        WORDPRESS_APP_PASSWORD: wordpressAppPassword,
        BLOG_WRITING_MODE: writingStyle.writing_mode,
        BLOG_SPEECH_LEVEL: writingStyle.speech_level,
        GOOGLE_SHEET_URL: googleSheetUrl,
        HEADLESS: headless,
        IMAGE_OPTIMIZATION_ENABLED: imageOptimizationEnabled,
        UPDATE_SERVER_TYPE: updateServerType,
        CUSTOM_UPDATE_CHECK_URL: customUpdateCheckUrl,
        UPDATE_MIRROR_REPO: updateMirrorRepo,
        TEXT_MODEL_PROVIDER: textModelConfig.provider,
        TEXT_MODEL_PRESET_CODE: textModelConfig.provider === 'direct' ? '' : textModelConfig.code,
        TEXT_MODEL_NAME: textModelConfig.name,
        TEXT_MODEL_BASE_URL: textModelConfig.base_url,
        TEXT_MODEL_API_KEY: textModelConfig.api_key,
        IMAGE_MODEL_PROVIDER: imageModelConfig.provider,
        IMAGE_MODEL_PRESET_CODE: imageModelConfig.provider === 'direct' ? '' : imageModelConfig.code,
        IMAGE_MODEL_NAME: imageModelConfig.name,
        IMAGE_MODEL_BASE_URL: imageModelConfig.base_url,
        IMAGE_MODEL_API_KEY: imageModelConfig.api_key,
        TYPING_SPEED: typingSpeed,
        FTC_DISCLOSURE_IMAGE_URL: ftcImageUrl,
        SHOPPING_CTA_IMAGE_URL1: ctaImageUrl1,
        SHOPPING_CTA_IMAGE_URL2: ctaImageUrl2,
        SHOPPING_CTA_IMAGE_URL3: ctaImageUrl3,

        ...collectTrendsSettings,
        COLLECT_RSS_ENABLED: collectRssEnabled,
        COLLECT_RSS_CONFIGS: rssConfigs,

        BUFFER_API_KEY: String(requestBody.BUFFER_API_KEY || '').trim(),
        BUFFER_ORGANIZATION_ID: String(requestBody.BUFFER_ORGANIZATION_ID || '').trim(),
        BUFFER_CHANNELS: bufferChannels,
        BUFFER_HELP_URL: String(requestBody.BUFFER_HELP_URL || CONFIG.BUFFER_HELP_URL || '').trim(),
        SNS_PUBLISH_ENABLED: normalizeBool(requestBody.SNS_PUBLISH_ENABLED, false),
        SNS_PUBLISH_INTERVAL_MIN: Math.max(10, normalizePositiveInt(requestBody.SNS_PUBLISH_INTERVAL_MIN, 10)),
        SNS_AI_MODE: normalizeSnsAiMode(requestBody.SNS_AI_MODE),
        SNS_SOURCE_BLOGS: snsSourceBlogs,

        ...publishAutoSettings,
        ...shoppingAutoSettings,

        NOTIFY_TELEGRAM_ENABLED: normalizeBool(requestBody.NOTIFY_TELEGRAM_ENABLED, false),
        NOTIFY_TELEGRAM_BOT_TOKEN: String(requestBody.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim(),
        NOTIFY_TELEGRAM_CHAT_ID: String(requestBody.NOTIFY_TELEGRAM_CHAT_ID || '').trim(),
        NOTIFY_BITLY_TOKEN: String(requestBody.NOTIFY_BITLY_TOKEN || '').trim(),
        TELEGRAM_CHAT_AI_MODE: String(requestBody.TELEGRAM_CHAT_AI_MODE || 'default').trim() === 'custom' ? 'custom' : 'default',

        CHAT_MODEL_BASE_URL: String(requestBody.CHAT_MODEL_BASE_URL || '').trim(),
        CHAT_MODEL_API_KEY: String(requestBody.CHAT_MODEL_API_KEY || '').trim(),
        CHAT_MODEL_CODE: String(requestBody.CHAT_MODEL_CODE || '').trim(),

        NOTIFY_SLACK_ENABLED: normalizeBool(requestBody.NOTIFY_SLACK_ENABLED, false),
        NOTIFY_SLACK_WEBHOOK_URL: String(requestBody.NOTIFY_SLACK_WEBHOOK_URL || '').trim(),

        MCP_REMOTE_ENABLED: normalizeBool(requestBody.MCP_REMOTE_ENABLED, false),
        MCP_REMOTE_HOST: normalizeRemoteMcpHost(requestBody.MCP_REMOTE_HOST, '127.0.0.1'),
        MCP_REMOTE_PORT: normalizeRemoteMcpPort(requestBody.MCP_REMOTE_PORT, 4578),
        MCP_REMOTE_PATH: normalizeRemoteMcpPath(requestBody.MCP_REMOTE_PATH, '/mcp'),
        MCP_REMOTE_AUTH_TOKEN: String(requestBody.MCP_REMOTE_AUTH_TOKEN || '').trim()
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

const publishActionsRuntime = createPublishActionsRuntime({
    fs,
    path,
    crypto,
    CONFIG,
    Logger,
    Utils,
    Core,
    License,
    TelegramBotService,
    buildLocalMarkdownPreview,
    materializeSelectedFilesToWorkspace,
    appendRelatedPostsToPastedMarkdown,
    formatActivityTargets,
    recordUiActivity,
    getContentType,
    normalizeKeywords,
    normalizeBool,
    normalizePublishMode,
    parseIntSafe,
    toFeatureMap,
    isCommandEnabled,
    getFeatureBool,
    checkAuthSessionValid,
    buildQuickPublishDedupeKey,
    cleanupQuickPublishDedupeCache,
    getQuickPublishRecentEntry,
    hasQuickPublishRecentEntry,
    setQuickPublishRecentEntry,
    getQuickPublishPreviewSession,
    deleteQuickPublishPreviewSession,
    registerQuickPublishPreviewSession,
    selectQuickPublishPreviewTarget,
    getExecuteShoppingRowAction: () => executeShoppingRowAction
});
const {
    executeLocalMarkdownPublish,
    executeQuickPreviewPublish,
    executeQuickPublish,
    executeShoppingQuickPublish,
    getQuickPreviewImagePayload,
    processMultiPlatformPublish
} = publishActionsRuntime;

const contentActionsRuntime = createContentActionsRuntime({
    path,
    CONFIG,
    Utils,
    Core,
    License,
    ShoppingManager,
    ensureSheetsReadyForUi,
    parseIntSafe,
    normalizeBool,
    checkAuthSessionValid,
    toFeatureMap,
    getFeatureBool,
    isCommandEnabled,
    getBlogAutoSettingsSnapshot: () => getBlogAutoSettingsSnapshot(),
    processMultiPlatformPublish,
    normalizeShoppingAutoSettings,
    normalizeNonNegativeInt,
    publishAutoDefaults: PUBLISH_AUTO_DEFAULTS,
    clearAllBlogRuntimeLogs,
    setBlogRuntimeLog,
    clearAllShoppingRuntimeLogs,
    setShoppingRuntimeLog
});
const {
    executeBlogBatchRowsAction,
    executeBlogRowAction,
    executeBlogTopicUpdate,
    executeBlogTopicsDelete,
    executeShoppingAutoManualAction,
    executeShoppingBatchRowsAction,
    executeShoppingRowAction,
    executeShoppingRowUpdate,
    executeShoppingTopicsDelete
} = contentActionsRuntime;
const trendActionsRuntime = createTrendActionsRuntime({
    Logger,
    CONFIG,
    Utils,
    License,
    TrendManager,
    ensureSheetsReadyForUi,
    recordUiActivity,
    parseIntSafe,
    checkAuthSessionValid,
    toFeatureMap,
    isCommandEnabled,
    getFeatureBool,
    getBlogAutoSettingsSnapshot: () => getBlogAutoSettingsSnapshot(),
    normalizeYmdToken,
    toBoolLike,
    normalizeNonNegativeInt,
    normalizeIntegerOrBlank,
    collectTrendsDefaults: COLLECT_TRENDS_DEFAULTS,
    publishAutoDefaults: PUBLISH_AUTO_DEFAULTS,
    parseCsvTokens,
    matchesAnyToken,
    parseVariationMeta,
    matchesVariationFilter,
    getRecentTopicKeys,
    buildTopicReuseKey
});
const {
    executeKeywordsToTopicsAction,
    executeTrendCollectAction,
    executeTrendCollectWithRetry,
    executeTrendsToTopicsAction,
    filterAutoTopicCandidates,
    processAndAppendTrendsToTopics
} = trendActionsRuntime;

const autoCycleRuntime = createAutoCycleRuntime({
    CONFIG,
    Logger,
    License,
    Utils,
    UrlService,
    TelegramService,
    SlackService,
    ensureSheetsReadyForUi,
    checkAuthSessionValid,
    recordUiActivity,
    normalizeYmdToken,
    toBoolLike,
    parseCsvTokens,
    normalizeNonNegativeInt,
    parseConfigBool,
    normalizeBlogAutoSettings,
    normalizeShoppingAutoSettings,
    getBlogAutoSettingsSnapshot: () => getBlogAutoSettingsSnapshot(),
    toFeatureMap,
    isCommandEnabled,
    parseMaxPosts,
    collectTrendsDefaults: COLLECT_TRENDS_DEFAULTS,
    blogAutoDefaults: PUBLISH_AUTO_DEFAULTS,
    autoRuntimeState,
    publishRuntimeState,
    shoppingAutoRuntimeState,
    refreshLegacyAutoRuntimeState,
    resetShoppingDailyCountersIfNeeded,
    syncAutoRunnerWithConfig,
    stopShoppingAutoRunner,
    scheduleNextShoppingAutoCycle,
    executeTrendCollectWithRetry,
    processAndAppendTrendsToTopics,
    filterAutoTopicCandidates,
    executeBlogBatchRowsAction,
    executeShoppingBatchRowsAction,
    snsRssDiscovery,
    snsDistributionRunner
});
const {
    executeShoppingAutoCycle,
    runAutoCycle,
    runTrendCollectCycle,
    runRssCollectCycle,
    runSnsDiscoveryCycle,
    runSnsDistributionCycle,
    runSnsAutomationCycle,
    runAutoPublishCycle,
    triggerAutoPublishCycle
} = autoCycleRuntime;

function getBlogAutoSettingsSnapshot() {
    return normalizeBlogAutoSettings({});
}

function getShoppingAutoSettingsSnapshot() {
    return normalizeShoppingAutoSettings({});
}

registerRuntimeHooks({
    resolveWritableConfigPath,
    buildDefaultConfigTemplate,
    syncAutoRunnerWithConfig,
    syncShoppingAutoRunnerWithConfig,
    resolveNaverAutoCategoryCatalog
});

function scheduleUiReload(host, port) {
    setTimeout(async () => {
        const { reloadUiServer } = require('./ui-server');
        await reloadUiServer(host, port);
    }, 500);
}
const uiApiRouteRuntime = createUiApiRouteRuntime({
    APP_VERSION,
    Logger,
    Updater,
    Utils,
    BrowserLauncher,
    fs,
    path,
    CONFIG,
    License,
    ShoppingManager,
    axios,
    cheerio,
    RuntimeConfig,
    TelegramService,
    DEFAULT_HOST,
    DEFAULT_PORT,
    SHOPPING_IMAGE_SLOT_MAP,
    parseBoolQuery,
    ensureSheetsReadyForUi,
    toFeatureMap,
    checkNaverSessionForUi,
    getNaverLoginStatus,
    getNaverLoginState,
    setNaverLoginState,
    runNaverLoginFlowForUi,
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
    buildMajorSettings,
    executeQuickPublish,
    executeQuickPreviewPublish,
    getQuickPreviewImagePayload,
    executeLocalMarkdownPublish,
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
    executeBlogTopicsDelete,
    executeShoppingTopicsDelete,
    executeTrendCollectAction,
    executeTrendsToTopicsAction,
    executeKeywordsToTopicsAction,
    getAutoStatusPayload,
    resolveNaverAutoCategoryCatalog,
    runAutoCycle,
    runTrendCollectCycle,
    runRssCollectCycle,
    triggerSnsDiscoveryCycle,
    triggerSnsDistributionCycle,
    runAutoPublishCycle,
    triggerAutoPublishCycle,
    createBlogAutoService,
    createBlogAutoController,
    createBlogAutoRouteHandler,
    createSettingsService,
    createSettingsController,
    createSettingsRouteHandler,
    createLegacyApiRouteHandler,
    createApiRouteHub,
    UiValidators,
    normalizeYmdToken,
    normalizeListenHost,
    normalizeListenPort,
    isAllowedImageSourceValue,
    validateRequiredShoppingImageSources,
    scheduleUiReload,
    restartRemoteMcpService,
    getRemoteServiceStatus,
    BufferClient,
    createConfigRevision,
    sendSuccess,
    sendError
});
const { handleApi } = uiApiRouteRuntime;

setAutoRunnerHandlers({
    runTrendCollectCycle,
    runRssCollectCycle,
    runSnsDiscoveryCycle,
    runSnsDistributionCycle,
    runSnsAutomationCycle,
    runAutoPublishCycle,
    executeShoppingAutoCycle
});

async function handleGoogleOAuthCallback({ url, res }) {
    const GoogleOAuth = require('./google-oauth');
    try {
        const code = String(url.searchParams.get('code') || '').trim();
        const state = String(url.searchParams.get('state') || '').trim();
        if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(GoogleOAuth.renderCallbackHtml({ success: false, message: '인증 코드 또는 상태값이 없습니다.' }));
            return true;
        }
        const tokens = await GoogleOAuth.exchangeCode(code, state);
        Utils.clearGoogleAuthCache();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(GoogleOAuth.renderCallbackHtml({ success: true, email: String(tokens.connected_email || '') }));
        return true;
    } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(require('./google-oauth').renderCallbackHtml({ success: false, message: error.message }));
        return true;
    }
}

const uiHttpServerRuntime = createUiHttpServerRuntime({
    http,
    fs,
    path,
    Logger,
    CONFIG,
    defaultHost: DEFAULT_HOST,
    defaultPort: DEFAULT_PORT,
    resolveUiRoot,
    normalizeListenHost,
    normalizeListenPort,
    createRequestId,
    readJsonBody,
    handleApi,
    sanitizePathname,
    shouldServeUiShell,
    sendError,
    getContentType,
    syncAutoRunnerWithConfig,
    triggerSnsStartupDiscovery,
    syncShoppingAutoRunnerWithConfig,
    recordUiActivity,
    handleGoogleOAuthCallback,
    initTelegramBotService: async () => {
        const TelegramBotService = require('./telegram-bot.service');
        TelegramBotService.init();
    },
    stopTelegramBotService: async () => {
        const TelegramBotService = require('./telegram-bot.service');
        await TelegramBotService.stop();
    }
});
const { startUiServer, reloadUiServer } = uiHttpServerRuntime;

module.exports = {
    startUiServer,
    reloadUiServer
};
