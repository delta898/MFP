const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const { createLicensingRuntime } = require('./licensing');
const { createShoppingContentPreparationRuntime } = require('./shopping-content-preparation');
const TelegramService = require('../adapters/messaging/telegram/service');
const SlackService = require('../slack-service');
const { createUrlShorteningSystem } = require('./url-shortening');
const { APP_VERSION } = require('../host/application-metadata');
const CONFIG = require('../host/configuration/runtime-config');
const { License } = createLicensingRuntime({ config: CONFIG });
const Logger = require('../utilities/logging/logger');
Logger.configureRuntime({ logLevel: CONFIG.LOG_LEVEL, rootDir: CONFIG.ROOT_DIR });
const { service: urlShorteningService } = createUrlShorteningSystem({ CONFIG, logger: Logger });
const GoogleOAuth = require('../adapters/google/auth/google-oauth');
const { createGoogleSheetsClient } = require('../adapters/google/sheets/client');
const { extractGoogleSheetId, normalizeGoogleSheetUrl } = require('../adapters/google/sheets/spreadsheet-reference');
const GoogleSheets = require('../adapters/storage/google-sheets/operations');
GoogleSheets.configureRuntime({ config: CONFIG });
Logger.debug(`Application version: ${APP_VERSION}`);
const NaverAuthSession = require('../adapters/naver/auth-session');
const naverAuthConfiguration = Object.freeze({
    authPath: CONFIG.AUTH_FILE_PATH,
    naverId: CONFIG.NAVER_ID,
    writeUrl: CONFIG.WRITE_URL,
    browserChannel: CONFIG.BROWSER_CHANNEL
});
const checkAuthSessionValid = (options = {}) => NaverAuthSession.checkAuthSessionValid({ ...naverAuthConfiguration, ...options });
const peekAuthSessionState = (options = {}) => NaverAuthSession.peekAuthSessionState({ ...naverAuthConfiguration, ...options });
const clearAuthSession = (options = {}) => NaverAuthSession.clearAuthSession({ ...naverAuthConfiguration, ...options });
const { createPlatformWorkspaceResolver } = require('../adapters/storage/workspaces/platform-workspace');
const { createManuscriptImageFileReader } = require('../adapters/storage/manuscript-drafts/image-file-reader');
const { parseStructuredJsonResponse } = require('../utilities/text/structured-json-response');
const TelegramBotService = require('../telegram-bot.service');
TelegramBotService.GoogleSheets = GoogleSheets;
TelegramBotService.License = License;
TelegramBotService.CONFIG = CONFIG;
const BrowserLauncher = require('../utilities/browser/browser-launcher');
const resolvePlatformWorkspaceDir = createPlatformWorkspaceResolver({ config: CONFIG, fs, path, logger: Logger });
const findImageByPrefix = createManuscriptImageFileReader({ fs, path, logger: Logger });
const ShoppingManager = createShoppingContentPreparationRuntime({ config: CONFIG, License, resolvePlatformWorkspaceDir });
const Updater = require('../host/updater');
Updater.configure(CONFIG);
const { createRuntimeConfigApi } = require('../runtime-config');
const RuntimeConfig = createRuntimeConfigApi({ config: CONFIG, logger: Logger });
const { registerRuntimeHooks } = require('../runtime-hooks');
const {
    ensureRuntimeRemoteMcpConfig,
    generateRemoteMcpBearerToken,
    normalizeRemoteMcpHost,
    normalizeRemoteMcpPath,
    normalizeRemoteMcpPort
} = require('../host/configuration/mcp-remote-config');
const remoteMcpService = require('../host/mcp/remote-service');
const { createMcpPrototypeRuntime } = require('./mcp-runtime');
const { startHttpMcpServer } = require('../adapters/messaging/mcp/server/http-server');
remoteMcpService.configureRemoteMcpService({
    config: CONFIG,
    logger: Logger,
    startServer: startHttpMcpServer,
    createServices: (config) => createMcpPrototypeRuntime({ config, License })
});
const { restartRemoteMcpService, getRemoteServiceStatus } = remoteMcpService;
const { buildLocalMarkdownPreview } = require('../applications/blog/manuscript-drafts/preview');
const { materializeSelectedFilesToWorkspace } = require('../adapters/storage/manuscript-drafts/selected-files-workspace');
const { appendRelatedPostsToPastedMarkdown } = require('../applications/blog/posting/pasted-markdown-related-posts');
const {
    getAiModelCatalog,
    buildModelSelectionFromFields,
    normalizeStoredModelProfiles,
    mergeActiveSelectionsIntoProfiles,
    normalizeChatModelSource
} = require('../services/ai/model-configuration');
const { normalizeWritingStyle } = require('../services/content-writing/writing-style');
const { normalizeWritingStrategy } = require('../services/content-writing/writing-strategy');
const { createSnsSheetStore } = require('../applications/sns/distribution/sns-sheet-store');
const { createGoogleSheetsSnsGateway } = require('../adapters/storage/google-sheets-sns-gateway');
const { createCardNewsRuntime } = require('./card-news-runtime');
const { normalizeCardNewsBuiltinSources, normalizeCardNewsRssSources } = require('../applications/card-news/sources/feed-sources');
const { createSnsRssDiscovery } = require('../applications/sns/distribution/sns-rss-discovery');
const { createRssFeedClient } = require('../adapters/web/rss-feed-client');
const { createSnsDistributionRunner } = require('../applications/sns/distribution/sns-distribution-runner');
const { createSnsAiService } = require('../applications/sns/generation/sns-ai-service');
const { createManualSnsService } = require('../applications/sns/publishing/manual-sns-service');
const { normalizeSnsAiMode } = require('../services/sns/ai-policy');
const { runInteractiveNaverLoginFlow } = require('../adapters/naver/auth-flow');
const { createUiSessionRuntime } = require('../adapters/ui/account/session/session-runtime');
const { createUiHttpUtils } = require('../adapters/ui/http/http-utils');
const { createQuickPublishRuntime } = require('./quick-publish-runtime');
const { createSnsAutomationScheduler } = require('../applications/sns/distribution/automation-scheduler');
const { createSelectedTopicBatchPublisher } = require('../applications/blog/publishing/selected-topic-batch-publisher');
const { createSnsAutomationApplication } = require('../applications/sns/distribution/automation-application');
const { createContentActionHandlers } = require('../adapters/ui/content/content-api/action-handlers');
const { createShoppingQuickPublishHandler } = require('../adapters/ui/shopping/publishing/quick-publish-handler');
const { createBlogManualPublishingApplication } = require('../applications/blog/publishing/manual-publishing-application');
const { presentBlogImageGenerationProgress } = require('../adapters/ui/blog-posting-progress');
const { presentNaverPublishProgress } = require('../adapters/ui/naver-publish-progress');
const { createUiApiRuntime } = require('./api/ui-api-runtime');
const { createBlogBetaRuntimeComposition } = require('./blog-beta-runtime');
const { createSocialPublishingSystem } = require('./social-publishing');
const { createCardNewsGenerationSystem } = require('./card-news-generation');
const { createSnsGenerationSystem } = require('./sns-generation');
const { createBundledWidgetPluginCatalog } = require('./widget-plugins');
const { createUiHttpServerRuntime } = require('../host/ui/http-server-runtime');
const { createUiServerStartup } = require('../host/ui/startup');
const { createGoogleOAuthCallbackHandler } = require('../adapters/ui/google/oauth-callback');
const { createHtmlCompositionRuntime } = require('../adapters/ui/assets/composition/html-composition');
const { createCssCompositionRuntime } = require('../adapters/ui/assets/composition/css-composition');
const { createJsCompositionRuntime } = require('../adapters/ui/assets/composition/js-composition');
const { getAgentEventStore, initializeAgentMemory } = require('../host/memory/runtime');
const { createActivityLifecycleRecorder } = require('../services/memory/activity-lifecycle');
const { createCapabilityRuntime } = require('./capability-runtime');
const { createKnowledgeRuntime } = require('./knowledge-runtime');
const { createAgentRuntime } = require('../host/agent/runtime');
const { ConfirmationStore } = require('../adapters/storage/confirmations/confirmation-store');
const { createTopicRecommendationLearningService } = require('../services/recommendations/topic-recommendation-learning');
const { recordRecommendationFeedback } = require('../services/recommendations/adapters/recommendation-feedback-adapter');
const { createRecommendationRuntime } = require('./recommendations/runtime');
const { parseIntSafe, parseBoolQuery, normalizeSortDir } = require('../adapters/ui/http/query-values');
const { sortShoppingItems, sortTopicItems } = require('../adapters/ui/content/content-api/sorting');
const { createConfigFileRuntime } = require('../host/configuration/ui-config-file');
const { createAutoPublishPolicy } = require('../applications/blog/automation/auto-publish-policy');
const { createSettingsFields } = require('../adapters/ui/settings/settings-fields');
const {
    toFeatureMap,
    getFeatureBool,
    getEnableSnsDistribution,
    isCommandEnabled,
    parseMaxPosts
} = require('../runtime-feature-flags');
const { createBlogAutoService } = require('../adapters/ui/blog/automation/service');
const { createBlogAutoController } = require('../adapters/ui/blog/automation/controller');
const { createBlogAutoRouteHandler } = require('../adapters/ui/blog/automation/routes');
const { createSettingsService } = require('../adapters/ui/settings/service');
const { createSettingsController } = require('../adapters/ui/settings/controller');
const { createSettingsRouteHandler } = require('../adapters/ui/settings/routes');
const { createManualSnsController } = require('../adapters/ui/sns/controller');
const { createManualSnsRouteHandler } = require('../adapters/ui/sns/routes');
const { createCardNewsService } = require('../applications/card-news/application');
const { createCardNewsController } = require('../adapters/ui/card-news/controller');
const { createCardNewsRouteHandler } = require('../adapters/ui/card-news/routes');
const { createSurfaceContentService } = require('../surface-content/service');
const { createSupabaseSurfaceContentProvider } = require('../surface-content/supabase-provider');
const { createSurfaceContentController } = require('../adapters/ui/content/surface/controller');
const { createSurfaceContentRouteHandler } = require('../adapters/ui/content/surface/routes');
const { createTopicRecommendationsService } = require('../adapters/ui/blog/topic-recommendations/service');
const { createTopicRecommendationsController } = require('../adapters/ui/blog/topic-recommendations/controller');
const { createTopicRecommendationsRouteHandler } = require('../adapters/ui/blog/topic-recommendations/routes');
const { createRecommendationCenterService } = require('../applications/recommendations/center/application');
const { createRecommendationCenterController } = require('../adapters/ui/recommendations/center/controller');
const { createRecommendationCenterRouteHandler } = require('../adapters/ui/recommendations/center/routes');
const { createKeywordDiscoveryController } = require('../adapters/ui/keyword-research/discovery/controller');
const { createKeywordDiscoveryRouteHandler } = require('../adapters/ui/keyword-research/discovery/routes');
const { createBlogKeywordDiscoveryApplication } = require('../applications/blog/keyword-discovery/application');
const { createKeywordsService } = require('../adapters/ui/keyword-research/keywords/service');
const { createKeywordsController } = require('../adapters/ui/keyword-research/keywords/controller');
const { createKeywordsRouteHandler } = require('../adapters/ui/keyword-research/keywords/routes');
const { createSmartUsageService } = require('../services/licensing/smart-usage/index');
const { createKeywordResearchService } = require('../keyword-research');
const { createProductApiRouteHandler } = require('./ui-api-routes');
const { createCloudflareConnectionService, createEncryptedCredentialStore } = require('../host/cloudflare/connection-service');
const { createCloudflareConnectionRouteHandler } = require('../adapters/ui/site-hosting/cloudflare-connection/routes');
const { createSiteHostingApplication } = require('./site-hosting-application');
const { createSiteHostingProjectRouteHandler } = require('../adapters/ui/site-hosting/projects/routes');
const { createSiteHostingSiteRouteHandler } = require('../adapters/ui/site-hosting/sites/routes');
const { createApiRouteHub } = require('../adapters/ui/route-hub');

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
    currentDir: path.join(__dirname, '..'),
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
const uiConfigFileRuntime = createConfigFileRuntime({
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
    License,
    fs,
    path,
    getAiModelCatalog
});
const { corePluginRuntime, blogWritingSystem, shoppingGenerationApplication, relatedPostsService, fetchReferenceContent, blogPostingApplication, blogPublishingApplication, aiGenerationSystem } = blogBetaComposition;
ShoppingManager.relatedPostsService = relatedPostsService;
const keywordResearchService = createKeywordResearchService({
    CONFIG,
    Logger,
    License,
    blogWritingApplication: blogWritingSystem.application
});
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
    fetchFeed: createRssFeedClient({ httpClient: axios, logger: Logger }).fetchAndParse,
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
const topicRecommendationKnowledgeRuntime = createKnowledgeRuntime({ CONFIG, Logger, License, axios });
const topicRecommendationCapabilityRegistry = createCapabilityRuntime({
    ...topicRecommendationKnowledgeRuntime,
    CONFIG,
    Logger,
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
} = createRecommendationRuntime({
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
const autoPublishPolicy = createAutoPublishPolicy({
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
} = autoPublishPolicy;
const snsAutomationScheduler = createSnsAutomationScheduler({
    CONFIG,
    Logger
});
const {
    setHandlers: setSnsAutomationHandlers,
    getStatus: getSnsAutomationStatus,
    syncSnsAutomationWithConfig,
    triggerSnsDiscoveryCycle,
    triggerSnsStartupDiscovery,
    triggerSnsDistributionCycle
} = snsAutomationScheduler;
const syncAutoRunnerWithConfig = syncSnsAutomationWithConfig;

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

const uiSettingsFieldsRuntime = createSettingsFields({
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
    parseStructuredJsonResponse
});

const publishActionsRuntime = createBlogManualPublishingApplication({
    fs,
    path,
    crypto,
    CONFIG,
    Logger,
    relatedPostsService,
    findImageByPrefix,
    GoogleSheets,
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
    presentBlogImageGenerationProgress,
    presentNaverPublishProgress
});
const {
    executeLocalMarkdownPublish,
    executeQuickPreviewPublish,
    executeQuickPublish,
    getQuickPreviewImagePayload,
    processMultiPlatformPublish
} = publishActionsRuntime;

const contentActionsRuntime = createContentActionHandlers({
    path,
    CONFIG,
    GoogleSheets,
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
    presentBlogImageGenerationProgress,
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
const { executeShoppingQuickPublish } = createShoppingQuickPublishHandler({
    CONFIG,
    License,
    GoogleSheets,
    normalizePublishMode,
    toFeatureMap,
    isCommandEnabled,
    checkAuthSessionValid,
    getFeatureBool,
    getExecuteShoppingRowAction: () => executeShoppingRowAction
});
const snsAutomationApplication = createSnsAutomationApplication({
    rssDiscovery: snsRssDiscovery,
    distributionRunner: snsDistributionRunner
});
const selectedTopicBatchPublisher = createSelectedTopicBatchPublisher({
    CONFIG,
    Logger,
    checkPublishLicense: (options) => License.checkLicenseStatus(options),
    canBatchPublish: (features) => isCommandEnabled(toFeatureMap(features), 'batch'),
    readTopics: (options) => GoogleSheets.readGoogleSheetTopicsAll(options),
    publishRow: (request) => executeBlogBatchRowsAction(request),
    normalizeNonNegativeInt,
    notifyPublishSummary: async (summary) => {
        let detailMsg = '';
        const displayItems = (summary.results || []).filter((item) => item.success).slice(0, 3);
        if (displayItems.length > 0) {
            detailMsg += '\n\n<b>[발행 내역 (최대 3건)]</b>';
            for (const item of displayItems) {
                const title = item.data?.title || '제목 없음';
                const results = item.data?.results || {};
                const platforms = [];
                if (results.naver?.success) platforms.push('N');
                if (results.wordpress?.success) platforms.push('W');
                const platformIndicator = platforms.length > 0 ? `[${platforms.join('/')}] ` : '';
                let itemLine = `\n• ${platformIndicator}${title}`;
                if (results.wordpress?.success && results.wordpress?.postUrl) {
                    let shortUrl = results.wordpress.postUrl;
                    if (urlShorteningService?.isConfigured?.()) {
                        shortUrl = await urlShorteningService.shorten(results.wordpress.postUrl);
                    }
                    itemLine += ` (${shortUrl})`;
                }
                detailMsg += itemLine;
            }
        }
        const msg = `<b>[블로그 글감 발행 완료]</b>\n- 성공: <b>${summary.successCount}</b>건\n- 실패: <b>${summary.failCount}</b>건${detailMsg}\n- 시각: ${new Date(summary.completedAt || Date.now()).toLocaleString()}`;
        if (CONFIG.NOTIFY_TELEGRAM_ENABLED) {
            TelegramService.sendNotification(msg, {
                botToken: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
                chatId: CONFIG.NOTIFY_TELEGRAM_CHAT_ID,
                enabled: CONFIG.NOTIFY_TELEGRAM_ENABLED
            }).catch((error) => Logger.error(`텔레그램 알림 전송 에러: ${error.message}`));
        }
        if (CONFIG.NOTIFY_SLACK_ENABLED) {
            SlackService.sendNotification(msg, {
                webhookUrl: CONFIG.NOTIFY_SLACK_WEBHOOK_URL,
                enabled: CONFIG.NOTIFY_SLACK_ENABLED
            }).catch((error) => Logger.error(`Slack 알림 전송 에러: ${error.message}`));
        }
    }
});
const runSnsDiscoveryCycle = (trigger) => snsAutomationApplication.discover(trigger);
const runSnsDistributionCycle = (trigger) => snsAutomationApplication.distribute(trigger);
const runSnsAutomationCycle = (trigger) => snsAutomationApplication.runAutomaticCycle(trigger);
const publishReadyTopicsBatch = (...args) => selectedTopicBatchPublisher.publishReadyTopicsBatch(...args);
const startReadyTopicsBatch = (...args) => selectedTopicBatchPublisher.startReadyTopicsBatch(...args);

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

let reloadUiServer;
function scheduleUiReload(host, port) {
    setTimeout(async () => {
        await reloadUiServer(host, port);
    }, 500);
}
const uiApiRouteRuntime = createUiApiRuntime({
    APP_VERSION,
    Logger,
    Updater,
    relatedPostsService,
    fetchReferenceContent,
    findImageByPrefix,
    GoogleSheets,
    BrowserLauncher,
    fs,
    path,
    CONFIG,
    License,
    keywordResearchService,
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
    getSnsAutomationStatus,
    getBlogBatchPublishStatus: () => selectedTopicBatchPublisher.getStatus(),
    getBlogAutoSettingsSnapshot: () => getBlogAutoSettingsSnapshot(),
    triggerSnsDiscoveryCycle,
    triggerSnsDistributionCycle,
    publishReadyTopicsBatch,
    startReadyTopicsBatch,
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
    createBlogKeywordDiscoveryApplication,
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
    createProductApiRouteHandler,
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
    ensureRuntimeRemoteMcpConfig,
    generateRemoteMcpBearerToken,
    createConfigRevision,
    sendSuccess,
    sendError
});
const { handleApi, handleWidgetPluginAsset } = uiApiRouteRuntime;

setSnsAutomationHandlers({
    runSnsDiscoveryCycle,
    runSnsDistributionCycle,
    runSnsAutomationCycle,
});

const handleGoogleOAuthCallback = createGoogleOAuthCallbackHandler({
    googleOAuth: GoogleOAuth,
    clearGoogleAuthCache: () => GoogleSheets.clearGoogleAuthCache()
});

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
        const TelegramBotService = require('../telegram-bot.service');
        TelegramBotService.init();
    },
    stopTelegramBotService: async () => {
        const TelegramBotService = require('../telegram-bot.service');
        await TelegramBotService.stop();
    }
});
const { startUiServer: startUiServerRuntime } = uiHttpServerRuntime;
reloadUiServer = uiHttpServerRuntime.reloadUiServer;

const { startUiServer } = createUiServerStartup({
    config: CONFIG,
    logger: Logger,
    initializeAgentMemory,
    startUiServerRuntime
});

module.exports = {
    startUiServer,
    __testing: {
        buildMajorSettings
    }
};
