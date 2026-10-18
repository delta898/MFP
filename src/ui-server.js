const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const License = require('./license');
const TelegramService = require('./adapters/messaging/telegram/service');
const SlackService = require('./slack-service');
const { createUrlShorteningSystem } = require('./composition/url-shortening');
const { APP_VERSION } = require('./constants');
const CONFIG = require('./config-loader');
const Logger = require('./utilities/logging/logger');
Logger.configureRuntime({ logLevel: CONFIG.LOG_LEVEL, rootDir: CONFIG.ROOT_DIR });
const { service: urlShorteningService } = createUrlShorteningSystem({ CONFIG, logger: Logger });
const GoogleOAuth = require('./adapters/google/auth/google-oauth');
const { createGoogleSheetsClient } = require('./adapters/google/sheets/client');
const { extractGoogleSheetId, normalizeGoogleSheetUrl } = require('./adapters/google/sheets/spreadsheet-reference');
const GoogleSheets = require('./adapters/storage/google-sheets/operations');
Logger.debug(`Application version: ${APP_VERSION}`);
const NaverAuthSession = require('./adapters/naver/auth-session');
const naverAuthConfiguration = Object.freeze({
    authPath: CONFIG.AUTH_FILE_PATH,
    naverId: CONFIG.NAVER_ID,
    writeUrl: CONFIG.WRITE_URL,
    browserChannel: CONFIG.BROWSER_CHANNEL
});
const checkAuthSessionValid = (options = {}) => NaverAuthSession.checkAuthSessionValid({ ...naverAuthConfiguration, ...options });
const peekAuthSessionState = (options = {}) => NaverAuthSession.peekAuthSessionState({ ...naverAuthConfiguration, ...options });
const clearAuthSession = (options = {}) => NaverAuthSession.clearAuthSession({ ...naverAuthConfiguration, ...options });
const Utils = require('./utils');
const Core = require('./core');
const TelegramBotService = require('./telegram-bot.service');
TelegramBotService.GoogleSheets = GoogleSheets;
const BrowserLauncher = require('./utilities/browser/browser-launcher');
const ShoppingManager = require('./applications/shopping/content-preparation/application');
const Updater = require('./host/updater');
Updater.configure(CONFIG);
const { createRuntimeConfigApi } = require('./runtime-config');
const RuntimeConfig = createRuntimeConfigApi({ config: CONFIG, logger: Logger });
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
const {
    getAiModelCatalog,
    buildModelSelectionFromFields,
    normalizeStoredModelProfiles,
    mergeActiveSelectionsIntoProfiles,
    normalizeChatModelSource
} = require('./services/ai/model-configuration');
const { normalizeWritingStyle } = require('./content/writing-style');
const { normalizeWritingStrategy } = require('./content/writing-strategy');
const { createSnsSheetStore } = require('./applications/sns/distribution/sns-sheet-store');
const { createGoogleSheetsSnsGateway } = require('./adapters/storage/google-sheets-sns-gateway');
const { createCardNewsRuntime } = require('./composition/card-news-runtime');
const { normalizeCardNewsBuiltinSources, normalizeCardNewsRssSources } = require('./applications/card-news/sources/feed-sources');
const { createSnsRssDiscovery } = require('./applications/sns/distribution/sns-rss-discovery');
const { createSnsDistributionRunner } = require('./applications/sns/distribution/sns-distribution-runner');
const { createSnsAiService } = require('./applications/sns/generation/sns-ai-service');
const { createManualSnsService } = require('./applications/sns/publishing/manual-sns-service');
const { normalizeSnsAiMode } = require('./services/sns/ai-policy');
const { runInteractiveNaverLoginFlow } = require('./adapters/naver/auth-flow');
const { createUiSessionRuntime } = require('./ui-runtime/session-runtime');
const { createUiHttpUtils } = require('./ui-runtime/http-utils');
const { createQuickPublishRuntime } = require('./ui-runtime/quick-publish-runtime');
const { createAutoRunnerRuntime } = require('./ui-runtime/auto-runner-runtime');
const { createAutoCycleRuntime } = require('./ui-runtime/auto-cycle-runtime');
const { createContentActionsRuntime } = require('./ui-runtime/content-actions-runtime');
const { createTrendActionsRuntime } = require('./ui-runtime/trend-actions-runtime');
const { createPublishActionsRuntime } = require('./ui-runtime/publish-actions-runtime');
const { createUiApiRouteRuntime } = require('./ui-runtime/api-route-runtime');
const { createBlogBetaRuntimeComposition } = require('./composition/blog-beta-runtime');
const { createSocialPublishingSystem } = require('./composition/social-publishing');
const { createCardNewsGenerationSystem } = require('./composition/card-news-generation');
const { createSnsGenerationSystem } = require('./composition/sns-generation');
const { createBundledWidgetPluginCatalog } = require('./composition/widget-plugins');
const { createUiHttpServerRuntime } = require('./ui-runtime/http-server-runtime');
const { createHtmlCompositionRuntime } = require('./ui-runtime/html-composition-runtime');
const { createCssCompositionRuntime } = require('./ui-runtime/css-composition-runtime');
const { createJsCompositionRuntime } = require('./ui-runtime/js-composition-runtime');
const { closeAgentMemory, getAgentEventStore, initializeAgentMemory } = require('./memory/store');
const { createActivityLifecycleRecorder } = require('./memory/activity-lifecycle');
const { createCapabilityRegistry } = require('./capabilities');
const { createAgentRuntime } = require('./host/agent/runtime');
const { ConfirmationStore } = require('./adapters/storage/confirmations/confirmation-store');
const { createTopicRecommendationLearningService } = require('./recommendations/topic-recommendation-learning');
const { recordRecommendationFeedback } = require('./recommendations/adapters/recommendation-feedback-adapter');
const { createUiRecommendationRuntime } = require('./ui-runtime/recommendation-runtime');
const { createUiHelpersRuntime } = require('./ui-runtime/ui-helpers-runtime');
const { createUiConfigFileRuntime } = require('./ui-runtime/config-file-runtime');
const { createAutomationPolicyRuntime } = require('./ui-runtime/automation-policy-runtime');
const { createUiSettingsFieldsRuntime } = require('./ui-runtime/settings-fields-runtime');
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
const { createSettingsService } = require('./adapters/ui/settings/service');
const { createSettingsController } = require('./adapters/ui/settings/controller');
const { createSettingsRouteHandler } = require('./adapters/ui/settings/routes');
const { createManualSnsController } = require('./ui-api/controllers/manual-sns.controller');
const { createManualSnsRouteHandler } = require('./ui-api/routes/manual-sns.routes');
const { createCardNewsService } = require('./applications/card-news/application');
const { createCardNewsController } = require('./ui-api/controllers/card-news.controller');
const { createCardNewsRouteHandler } = require('./ui-api/routes/card-news.routes');
const { createSurfaceContentService } = require('./surface-content/service');
const { createSupabaseSurfaceContentProvider } = require('./surface-content/supabase-provider');
const { createSurfaceContentController } = require('./ui-api/controllers/surface-content.controller');
const { createSurfaceContentRouteHandler } = require('./ui-api/routes/surface-content.routes');
const { createTopicRecommendationsService } = require('./ui-api/services/topic-recommendations.service');
const { createTopicRecommendationsController } = require('./ui-api/controllers/topic-recommendations.controller');
const { createTopicRecommendationsRouteHandler } = require('./ui-api/routes/topic-recommendations.routes');
const { createRecommendationCenterService } = require('./ui-api/services/recommendation-center.service');
const { createRecommendationCenterController } = require('./ui-api/controllers/recommendation-center.controller');
const { createRecommendationCenterRouteHandler } = require('./ui-api/routes/recommendation-center.routes');
const { createKeywordDiscoveryService } = require('./ui-api/services/keyword-discovery.service');
const { createKeywordDiscoveryController } = require('./ui-api/controllers/keyword-discovery.controller');
const { createKeywordDiscoveryRouteHandler } = require('./ui-api/routes/keyword-discovery.routes');
const { createKeywordsService } = require('./ui-api/services/keywords.service');
const { createKeywordsController } = require('./ui-api/controllers/keywords.controller');
const { createKeywordsRouteHandler } = require('./ui-api/routes/keywords.routes');
const { createSmartUsageService } = require('./smart-usage');
const { createLegacyApiRouteHandler } = require('./ui-api/routes/legacy-api.routes');
const { createCloudflareConnectionService, createEncryptedCredentialStore } = require('./host/cloudflare/connection-service');
const { createCloudflareConnectionRouteHandler } = require('./ui-api/routes/cloudflare-connection.routes');
const { createSiteHostingApplication } = require('./composition/site-hosting-application');
const { createSiteHostingProjectRouteHandler } = require('./ui-api/routes/site-hosting-project.routes');
const { createSiteHostingSiteRouteHandler } = require('./ui-api/routes/site-hosting-site.routes');
const { createApiRouteHub } = require('./ui-api/routes');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4577;
const UI_SESSION_CHECK_TTL_MS = 120000;
const UI_SHEETS_PREFLIGHT_TTL_MS = 10 * 60 * 1000;
const blogRuntimeLogs = new Map();
const shoppingRuntimeLogs = new Map();
const ALLOWED_TYPING_SPEEDS = ['QUICK', 'FAST', 'NORMAL', 'HUMAN'];
const COLLECT_TRENDS_DEFAULTS = {
    categories: '',
    reuseGapDays: 15,
    filterMinIncr: 50,
    filterIncludeNew: false,
    filterIncludeDash: false,
    filterIncludeNumber: true,
    filterType: 'min',
    filterTopN: 5
};

const PUBLISH_AUTO_DEFAULTS = {
    batchSize: 1,
    postStatus: 'publish',
    notifyEnabled: false,
    targetChannels: 'naver',
    headless: true,
    imageMode: 'generate',
    imageGeneration: true,
    externalReference: false
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

const uiSessionRuntime = createUiSessionRuntime({
    CONFIG,
    Utils,
    GoogleSheets,
    Logger,
    checkAuthSessionValid,
    peekAuthSessionState,
    clearAuthSession,
    runInteractiveNaverLoginFlow: (options = {}) => runInteractiveNaverLoginFlow({
        authPath: CONFIG.AUTH_FILE_PATH,
        browserChannel: CONFIG.BROWSER_CHANNEL,
        ...options
    }),
    sessionCheckTtlMs: UI_SESSION_CHECK_TTL_MS,
    sheetsPreflightTtlMs: UI_SHEETS_PREFLIGHT_TTL_MS
});
const {
    setNaverLoginState,
    getNaverLoginState,
    getNaverLoginStatus,
    ensureSheetsReadyForUi,
    checkNaverSessionForUi,
    peekNaverSessionForUi,
    logoutNaverSessionForUi,
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
const htmlCompositionRuntime = createHtmlCompositionRuntime({ fs, path });
const composeUiShell = (uiRoot) => htmlCompositionRuntime.composeHtmlFile({ uiRoot }).html;
const cssCompositionRuntime = createCssCompositionRuntime({ fs, path });
const composeUiStyles = (uiRoot) => cssCompositionRuntime.composeCssFile({ uiRoot }).css;
const jsCompositionRuntime = createJsCompositionRuntime({ fs, path });
const composeUiScript = (uiRoot) => jsCompositionRuntime.composeJsFile({ uiRoot }).js;
const uiHelpersRuntime = createUiHelpersRuntime();
const {
    normalizeSortDir,
    parseBoolQuery,
    parseIntSafe,
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
    previewTtlMs: 6 * 60 * 60 * 1000,
    fs, path, Logger, workspaceDir: CONFIG.WORKSPACE_DIR
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
    selectPreviewTarget: selectQuickPublishPreviewTarget,
    trackPreviewDirs: trackQuickPublishPreviewDirs
} = quickPublishRuntime;
const googleSheetsClient = createGoogleSheetsClient({
    getAccessToken: async (scopes) => (await GoogleOAuth.getAccessToken(scopes)).accessToken,
    httpClient: axios,
    logger: Logger
});
const snsSheetGateway = createGoogleSheetsSnsGateway({
    GoogleSheets,
    googleSheetsClient,
    CONFIG
});
const snsSheetStore = createSnsSheetStore({
    gateway: snsSheetGateway
});
const cardNewsRuntime = createCardNewsRuntime({
    GoogleSheets,
    CONFIG,
    httpClient: axios,
    fs,
    path,
    GoogleOAuth,
    googleSheetsClient,
    logger: Logger,
    cheerio
});
const {
    cardNewsLedgerStore,
    cardNewsProjectRepository,
    cardNewsMediaTransport,
    cardNewsSourceService,
    cardNewsRssIntake,
    cardNewsRssIntakeScheduler
} = cardNewsRuntime;
const blogBetaComposition = createBlogBetaRuntimeComposition({
    CONFIG,
    Logger,
    Core,
    Utils,
    fs,
    path,
    getAiModelCatalog
});
const { corePluginRuntime, blogWritingSystem, shoppingGenerationApplication, blogPostingApplication, blogPublishingApplication, aiGenerationSystem } = blogBetaComposition;
const socialPublishingSystem = createSocialPublishingSystem({ corePluginRuntime, CONFIG, axios });
const socialPublisher = socialPublishingSystem.publisher;
const widgetPluginCatalog = createBundledWidgetPluginCatalog({ fs, path, logger: Logger, configDir: CONFIG.PATHS.configDir });
const snsGenerationSystem = createSnsGenerationSystem({
    aiGeneration: aiGenerationSystem.service,
    getWritingModel: () => CONFIG.TEXT_MODEL_CONFIG,
    getChatModel: () => CONFIG.CHAT_MODEL_CONFIG || CONFIG.TEXT_MODEL_CONFIG,
    getImageModel: () => CONFIG.IMAGE_MODEL_CONFIG,
    logger: Logger
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
    generationApplication: snsGenerationSystem.application,
    Logger
});
const recordActivityLifecycle = createActivityLifecycleRecorder({
    eventStore: getAgentEventStore({ baseDir: CONFIG.ROOT_DIR }),
    Logger
});
const topicRecommendationEventStore = getAgentEventStore({ baseDir: CONFIG.ROOT_DIR });
const topicRecommendationCapabilityRegistry = createCapabilityRegistry({
    CONFIG,
    Logger,
    Utils,
    GoogleSheets,
    blogWritingApplication: blogWritingSystem.application,
    License,
    axios,
    eventStore: topicRecommendationEventStore
});
const topicRecommendationAgentRuntime = createAgentRuntime({
    capabilityRegistry: topicRecommendationCapabilityRegistry,
    confirmationStore: new ConfirmationStore({
        persistPath: path.join(CONFIG.ROOT_DIR || process.cwd(), 'data', 'recommendation-confirmations.json')
    }),
    eventStore: topicRecommendationEventStore
});
const {
    handoffService: recommendationCenterHandoffService,
    retrievalService: topicRecommendationRetrievalService,
    refreshService: recommendationCenterRefreshService,
    deliveryScheduler: recommendationDeliveryScheduler
} = createUiRecommendationRuntime({
    CONFIG,
    License,
    Logger,
    eventStore: topicRecommendationEventStore,
    capabilityRegistry: topicRecommendationCapabilityRegistry,
    confirmationStore: topicRecommendationAgentRuntime.confirmationStore,
    fs,
    path
});
const topicRecommendationLearningService = createTopicRecommendationLearningService({
    recordActivityLifecycle,
    recordRecommendationFeedback: (input) => recordRecommendationFeedback({
        ...input,
        eventStore: topicRecommendationEventStore
    })
});
const snsDistributionRunner = createSnsDistributionRunner({
    CONFIG,
    License,
    store: snsSheetStore,
    socialPublisher: socialPublisher,
    aiService: snsAiService,
    urlService: urlShorteningService,
    notificationService: TelegramService,
    getEnableSnsDistribution,
    Logger,
    recordActivityLifecycle
});
const automationPolicyRuntime = createAutomationPolicyRuntime({
    CONFIG,
    Logger,
    toBoolLike,
    normalizeIntegerOrBlank,
    normalizeNonNegativeInt,
    normalizePositiveInt,
    collectTrendsDefaults: COLLECT_TRENDS_DEFAULTS,
    publishAutoDefaults: PUBLISH_AUTO_DEFAULTS
});
const {
    normalizeTimeHHmm,
    computeNextWindowedRunAt,
    parseVariationMeta,
    matchesVariationFilter,
    normalizeYmdToken,
    buildTopicReuseKey,
    getRecentTopicKeys,
    matchesAnyToken,
    normalizeCollectTrendsSettings,
    normalizePublishAutoSettings,
    normalizeBlogAutoSettings
} = automationPolicyRuntime;
const autoRunnerRuntime = createAutoRunnerRuntime({
    CONFIG,
    Logger,
    parseConfigBool,
    normalizeNonNegativeInt,
    normalizeTimeHHmm,
    computeNextWindowedRunAt,
    getBlogAutoSettingsSnapshot: () => getBlogAutoSettingsSnapshot(),
    publishAutoDefaults: PUBLISH_AUTO_DEFAULTS
});
const {
    autoRuntimeState,
    publishRuntimeState,
    setHandlers: setAutoRunnerHandlers,
    getAutoStatusPayload,
    refreshLegacyAutoRuntimeState,
    syncAutoRunnerWithConfig,
    triggerSnsDiscoveryCycle,
    triggerSnsStartupDiscovery,
    triggerSnsDistributionCycle
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

const uiSettingsFieldsRuntime = createUiSettingsFieldsRuntime({
    fs,
    path,
    CONFIG,
    TelegramBotService,
    ensureRuntimeRemoteMcpConfig,
    normalizeWritingStrategy,
    normalizeBufferChannels,
    normalizeSnsAiMode,
    normalizeSnsSourceBlogs,
    normalizeCardNewsBuiltinSources,
    normalizeCardNewsRssSources,
    getAiModelCatalog,
    normalizeStoredModelProfiles,
    getRemoteServiceStatus,
    normalizeListenHost,
    normalizeListenPort,
    normalizeWritingStyle,
    normalizeGoogleSheetUrl,
    extractGoogleSheetId,
    normalizeTypingSpeed,
    buildModelSelectionFromFields,
    normalizeChatModelSource,
    normalizeBlogAutoSettings,
    normalizeBool,
    mergeActiveSelectionsIntoProfiles,
    normalizeIntegerOrBlank,
    normalizeNonNegativeInt,
    normalizeTimeHHmm,
    normalizePositiveInt,
    normalizeCollectTrendsSettings,
    normalizePublishAutoSettings,
    normalizeRemoteMcpHost,
    normalizeRemoteMcpPort,
    normalizeRemoteMcpPath,
    resolveWritableConfigPath,
    defaultHost: DEFAULT_HOST,
    defaultPort: DEFAULT_PORT,
    allowedTypingSpeeds: ALLOWED_TYPING_SPEEDS,
    shoppingImageSlotMap: SHOPPING_IMAGE_SLOT_MAP,
    defaultShoppingImageSources: DEFAULT_SHOPPING_IMAGE_SOURCES,
    allowedImageExts: ALLOWED_IMAGE_EXTS
});
const {
    applyConfigUpdates,
    buildMajorSettings,
    applyRuntimeConfigFromMajor,
    parseMajorFieldsFromRequest,
    isAllowedImageSourceValue,
    validateRequiredShoppingImageSources,
    resolveRuntimePath,
    resolveLocalImagePathFromSource,
    buildShoppingImageSlots,
    parseBase64ImagePayload
} = uiSettingsFieldsRuntime;


const cardNewsGenerationSystem = createCardNewsGenerationSystem({
    aiGeneration: aiGenerationSystem.service,
    getTextModel: () => CONFIG.TEXT_MODEL_CONFIG,
    getImageModel: () => CONFIG.IMAGE_MODEL_CONFIG,
    getModelCatalog: getAiModelCatalog,
    fs,
    path,
    workspaceDir: CONFIG.PATHS?.workspace,
    logger: Logger,
    parseStructuredJsonResponse: Utils.parseStructuredJsonResponse.bind(Utils)
});

const publishActionsRuntime = createPublishActionsRuntime({
    fs,
    path,
    crypto,
    CONFIG,
    Logger,
    Utils,
    GoogleSheets,
    Core,
    blogWritingApplication: blogWritingSystem.application,
    blogPostingApplication,
    blogPublishingApplication,
    License,
    TelegramBotService,
    buildLocalMarkdownPreview,
    materializeSelectedFilesToWorkspace,
    appendRelatedPostsToPastedMarkdown,
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
    trackQuickPublishPreviewDirs,
    recordActivityLifecycle,
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
    GoogleSheets,
    Core,
    blogPostingApplication,
    blogWritingApplication: blogWritingSystem.application,
    shoppingGenerationApplication,
    blogPublishingApplication,
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
    clearAllBlogRuntimeLogs,
    setBlogRuntimeLog,
    clearAllShoppingRuntimeLogs,
    setShoppingRuntimeLog,
    recordActivityLifecycle
});
const {
    executeBlogBatchRowsAction,
    executeBlogRowAction,
    executeBlogTopicUpdate,
    executeBlogTopicsDelete,
    executeShoppingBatchRowsAction,
    executeShoppingRowAction,
    executeShoppingRowUpdate,
    executeShoppingTopicsDelete
} = contentActionsRuntime;
const trendActionsRuntime = createTrendActionsRuntime({
    Logger,
    CONFIG,
    Utils,
    GoogleSheets,
    ensureSheetsReadyForUi,
    parseIntSafe,
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
    executeTrendsToTopicsAction,
    filterAutoTopicCandidates,
    processAndAppendTrendsToTopics
} = trendActionsRuntime;

const autoCycleRuntime = createAutoCycleRuntime({
    CONFIG,
    Logger,
    License,
    Utils,
    GoogleSheets,
    urlShorteningService,
    TelegramService,
    SlackService,
    ensureSheetsReadyForUi,
    parseCsvTokens,
    normalizeNonNegativeInt,
    parseConfigBool,
    autoRuntimeState,
    publishRuntimeState,
    refreshLegacyAutoRuntimeState,
    syncAutoRunnerWithConfig,
    executeBlogBatchRowsAction,
    snsRssDiscovery,
    snsDistributionRunner
});
const {
    runSnsDiscoveryCycle,
    runSnsDistributionCycle,
    runSnsAutomationCycle,
    runAutoPublishCycle,
    triggerAutoPublishCycle
} = autoCycleRuntime;

function getBlogAutoSettingsSnapshot() {
    return normalizeBlogAutoSettings({});
}

registerRuntimeHooks({
    resolveWritableConfigPath,
    buildDefaultConfigTemplate,
    syncAutoRunnerWithConfig,
    generateChatText: (prompt, modelOptions = {}) => blogWritingSystem.application.generateChatText(prompt, {
        generationOptions: {
            ...(typeof modelOptions.temperature === 'number' ? { temperature: modelOptions.temperature } : {}),
            ...(typeof modelOptions.maxTokens === 'number' ? { maxOutputTokens: modelOptions.maxTokens } : {}),
            ...(modelOptions.responseMimeType === 'application/json' ? { responseFormat: 'json' } : {}),
            ...(modelOptions.reasoningEffort ? { reasoningEffort: modelOptions.reasoningEffort } : {})
        }
    })
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
    GoogleSheets,
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
    TelegramBotService,
    SlackService,
    snsAiService,
    cardNewsLedgerStore,
    cardNewsProjectRepository,
    cardNewsSourceService,
    cardNewsMediaTransport,
    socialPublisher: socialPublisher,
    urlShorteningService,
    recordActivityLifecycle,
    DEFAULT_HOST,
    DEFAULT_PORT,
    SHOPPING_IMAGE_SLOT_MAP,
    parseBoolQuery,
    ensureSheetsReadyForUi,
    toFeatureMap,
    checkNaverSessionForUi,
    peekNaverSessionForUi,
    logoutNaverSessionForUi,
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
    resolveLocalImagePathFromSource,
    getContentType,
    resolveRuntimePath,
    buildMajorSettings,
    executeQuickPublish,
    executeQuickPreviewPublish,
    getQuickPreviewImagePayload,
    deleteQuickPublishPreviewSession,
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
    executeShoppingRowUpdate,
    executeBlogTopicUpdate,
    executeBlogTopicsDelete,
    executeShoppingTopicsDelete,
    executeTrendsToTopicsAction,
    executeKeywordsToTopicsAction,
    getAutoStatusPayload,
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
    createManualSnsService,
    createManualSnsController,
    createManualSnsRouteHandler,
    createCardNewsService,
    cardNewsGenerationService: cardNewsGenerationSystem.application,
    createCardNewsController,
    createCardNewsRouteHandler,
    createSurfaceContentService,
    createSupabaseSurfaceContentProvider,
    createSurfaceContentController,
    createSurfaceContentRouteHandler,
    createTopicRecommendationsService,
    createTopicRecommendationsController,
    createTopicRecommendationsRouteHandler,
    createRecommendationCenterService,
    createRecommendationCenterController,
    createRecommendationCenterRouteHandler,
    recommendationCenterHandoffService,
    recommendationCenterRefreshService,
    createKeywordDiscoveryService,
    createKeywordDiscoveryController,
    createKeywordDiscoveryRouteHandler,
    createKeywordsService,
    createKeywordsController,
    createKeywordsRouteHandler,
    createSmartUsageService,
    topicRecommendationAgentRuntime,
    topicRecommendationCapabilityRegistry,
    topicRecommendationRetrievalService,
    topicRecommendationEventStore,
    topicRecommendationLearningService,
    createLegacyApiRouteHandler,
    createCloudflareConnectionService,
    createEncryptedCredentialStore,
    createCloudflareConnectionRouteHandler,
    createSiteHostingApplication,
    createSiteHostingProjectRouteHandler,
    createSiteHostingSiteRouteHandler,
    createApiRouteHub,
    corePluginRuntime,
    widgetPluginCatalog,
    blogWritingApplication: blogWritingSystem.application,
    aiGenerationService: aiGenerationSystem.service,
    aiGateway: aiGenerationSystem.gateway,
    blogPublishingApplication,
    normalizeYmdToken,
    normalizeListenHost,
    normalizeListenPort,
    isAllowedImageSourceValue,
    validateRequiredShoppingImageSources,
    scheduleUiReload,
    restartRemoteMcpService,
    getRemoteServiceStatus,
    createConfigRevision,
    sendSuccess,
    sendError
});
const { handleApi, handleWidgetPluginAsset } = uiApiRouteRuntime;

setAutoRunnerHandlers({
    runSnsDiscoveryCycle,
    runSnsDistributionCycle,
    runSnsAutomationCycle,
});

async function handleGoogleOAuthCallback({ url, res }) {
    try {
        const code = String(url.searchParams.get('code') || '').trim();
        const state = String(url.searchParams.get('state') || '').trim();
        if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(GoogleOAuth.renderCallbackHtml({ success: false, message: '인증 코드 또는 상태값이 없습니다.' }));
            return true;
        }
        const tokens = await GoogleOAuth.exchangeCode(code, state);
        GoogleSheets.clearGoogleAuthCache();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(GoogleOAuth.renderCallbackHtml({ success: true, email: String(tokens.connected_email || '') }));
        return true;
    } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(GoogleOAuth.renderCallbackHtml({ success: false, message: error.message }));
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
    composeUiShell,
    composeUiStyles,
    composeUiScript,
    normalizeListenHost,
    normalizeListenPort,
    createRequestId,
    readJsonBody,
    handleApi,
    handleWidgetPluginAsset,
    sanitizePathname,
    shouldServeUiShell,
    sendError,
    getContentType,
    syncAutoRunnerWithConfig,
    triggerSnsStartupDiscovery,
    startCardNewsRssIntake: () => cardNewsRssIntakeScheduler.start(),
    stopCardNewsRssIntake: () => cardNewsRssIntakeScheduler.stop(),
    startRecommendationDelivery: () => recommendationDeliveryScheduler.start(),
    stopRecommendationDelivery: () => recommendationDeliveryScheduler.stop(),
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
const { startUiServer: startUiServerRuntime, reloadUiServer } = uiHttpServerRuntime;

async function startUiServer(options = {}) {
    const deferred = options.safeMode !== true && options.deferOptionalStartup === true;
    if (options.safeMode !== true && !deferred) {
        await initializeAgentMemory({ baseDir: CONFIG.ROOT_DIR });
    } else {
        Logger.warn(options.safeMode === true
            ? '⚠️ [AgentMemory] 안전 모드에서 지능형 메모리 초기화를 건너뜁니다.'
            : 'ℹ️ [AgentMemory] 첫 화면 이후 지능형 메모리를 초기화합니다.');
    }
    const started = await startUiServerRuntime(options);
    if (!deferred) return started;
    return {
        ...started,
        startDeferredServices: async () => {
            const memory = Promise.resolve()
                .then(() => initializeAgentMemory({ baseDir: CONFIG.ROOT_DIR }))
                .catch((error) => {
                    Logger.error(`❌ [AgentMemory] 지연 초기화 실패: ${error.message}`, error);
                    return false;
                });
            const optional = Promise.resolve()
                .then(() => started.startOptionalServices())
                .catch((error) => {
                    Logger.error(`❌ [UI] 지연 백그라운드 기능 시작 실패: ${error.message}`, error);
                    return [];
                });
            const [memoryReady, optionalResults] = await Promise.all([memory, optional]);
            return { memoryReady, optionalResults };
        }
    };
}

module.exports = {
    closeAgentMemory,
    startUiServer,
    reloadUiServer,
    __testing: {
        buildMajorSettings
    }
};
