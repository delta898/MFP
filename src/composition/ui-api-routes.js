// Transitional UI API assembly. Product workflows are being moved to Applications in slices.
const os = require('os');
const { machineIdSync } = require('node-machine-id');
const { createSystemRouteHandler } = require('../adapters/ui/account/system/routes');
const { createSessionLicenseRouteHandler } = require('../adapters/ui/account/session-license/routes');
const { createContentRouteHandler } = require('../adapters/ui/content/content-api/routes');
const { createTrendsRouteHandler } = require('../adapters/ui/blog/trends/routes');
const { createTrendPostingRouteHandler } = require('../adapters/ui/blog/trend-posting/routes');
const { createAccountRouteHandler } = require('../adapters/ui/account/routes');
const { createContinuousPublishingRouteHandler } = require('../adapters/ui/blog/continuous-publishing/routes');
const { createSystemService } = require('../ui-api/services/system.service');
const { createSessionLicenseService } = require('../ui-api/services/session-license.service');
const { createContentService } = require('../ui-api/services/content.service');
const { createTrendsService } = require('../ui-api/services/trends.service');
const { createTrendPostingService } = require('../adapters/ui/blog/trend-posting/service');
const { createSystemController } = require('../adapters/ui/account/system/controller');
const { createSessionLicenseController } = require('../adapters/ui/account/session-license/controller');
const { createContentController } = require('../adapters/ui/content/content-api/controller');
const { createTrendsController } = require('../adapters/ui/blog/trends/controller');
const { createTrendPostingController } = require('../adapters/ui/blog/trend-posting/controller');
const { createAccountController } = require('../adapters/ui/account/controller');
const { createContinuousPublishingController } = require('../adapters/ui/blog/continuous-publishing/controller');
const { createContinuousPublishingService } = require('../ui-api/services/continuous-publishing.service');
const { createSiteHostingQueueExecutor } = require('../applications/blog/queue-execution/site-hosting-executor');
const { createContentLifecycleAdapterRegistry } = require('./content-lifecycle-adapters');
const { createGoogleDriveSpreadsheets } = require('../adapters/google/drive/spreadsheets');
const { createAccountOverviewService } = require('../applications/account/overview/application');
const { createBlogExecutionCoordinator } = require('../applications/blog/execution/execution-coordinator');
const { createBlogTrendPosting } = require('./blog-trend-posting');
const { createConnectionReadinessService } = require('../applications/account/overview/connection-readiness');
const {
    readConnectionVerification,
    recordWordPressVerification,
    getWordPressVerification,
    configureConnectionVerificationState
} = require('../adapters/storage/connection-verifications/state-store');
const { createConnectionSignature, isVerificationTrusted } = require('../services/connection-verification/policy');

function createProductApiRouteHandler(deps = {}) {
    try {
        const configDir = String(deps.CONFIG?.CONFIG_DIR || '').trim();
        if (configDir && deps.path) {
            configureConnectionVerificationState({
                fs: deps.fs,
                path: deps.path,
                filePath: deps.path.join(configDir, 'connection_verification.json')
            });
        }
    } catch (_) {
        // Best-effort: verification persistence must never break route setup.
    }
    const GoogleOAuth = require('../adapters/google/auth/google-oauth');
    const GoogleDriveSpreadsheets = createGoogleDriveSpreadsheets({
        axios: deps.axios,
        getAccessToken: (scopes) => deps.GoogleSheets.getGoogleAccessToken(scopes),
        ensureSheetsExist: (spreadsheetId) => deps.GoogleSheets.ensureAllSheetsExistStrict(spreadsheetId)
    });
    const blogNextExecutionCoordinator = deps.blogNextExecutionCoordinator
        || createBlogExecutionCoordinator();
    const systemService = createSystemService({
        APP_VERSION: deps.APP_VERSION,
        Utils: deps.Utils,
        fs: deps.fs,
        path: deps.path,
        CONFIG: deps.CONFIG,
        parseBoolQuery: deps.parseBoolQuery,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        Logger: deps.Logger,
        axios: deps.axios,
        cheerio: deps.cheerio,
        peekGoogleOauthStatus: GoogleOAuth.peekStatus
    });
    const systemController = createSystemController({
        service: systemService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger,
        updater: deps.Updater
    });

    const sessionLicenseService = createSessionLicenseService({
        License: deps.License,
        parseBoolQuery: deps.parseBoolQuery,
        toFeatureMap: deps.toFeatureMap,
        checkNaverSessionForUi: deps.checkNaverSessionForUi,
        logoutNaverSessionForUi: deps.logoutNaverSessionForUi,
        getNaverLoginStatus: deps.getNaverLoginStatus,
        getNaverLoginState: deps.getNaverLoginState,
        setNaverLoginState: deps.setNaverLoginState,
        runNaverLoginFlowForUi: deps.runNaverLoginFlowForUi,
        blogPublishingApplication: deps.blogPublishingApplication,
        CONFIG: deps.CONFIG,
        recordWordPressVerification
    });
    const sessionLicenseController = createSessionLicenseController({
        service: sessionLicenseService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger
    });

    const connectionReadinessService = createConnectionReadinessService({
        CONFIG: deps.CONFIG,
        checkNaverSessionForUi: deps.checkNaverSessionForUi,
        blogPublishingApplication: deps.blogPublishingApplication,
        getWordPressVerification,
        recordWordPressVerification
    });

    const accountService = createAccountOverviewService({
        License: deps.License,
        CONFIG: deps.CONFIG,
        APP_VERSION: deps.APP_VERSION,
        toFeatureMap: deps.toFeatureMap,
        peekNaverSessionForUi: deps.peekNaverSessionForUi,
        peekGoogleOauthStatus: GoogleOAuth.peekStatus,
        getWordPressVerification,
        getConnectionReadiness: connectionReadinessService.getReadiness,
        resolveMachineId: () => machineIdSync({ original: true }),
        runtimeVersions: process.versions,
        platform: process.platform,
        architecture: process.arch,
        osRelease: () => os.release(),
        getSheetVerification: (spreadsheetId) => {
            const record = readConnectionVerification('sheets', createConnectionSignature([spreadsheetId]));
            if (!record || record.status === 'failed') return record;
            return isVerificationTrusted('sheets', record) ? record : null;
        }
    });
    const accountController = createAccountController({
        service: accountService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError
    });

    const contentService = createContentService({
        Utils: deps.Utils,
        fs: deps.fs,
        path: deps.path,
        manuscriptDraftService: deps.manuscriptDraftService,
        blogWritingApplication: deps.blogWritingApplication,
        blogPublishingApplication: deps.blogPublishingApplication,
        axios: deps.axios,
        RuntimeConfig: deps.RuntimeConfig,
        CONFIG: deps.CONFIG,
        License: deps.License,
        GoogleOAuth,
        GoogleDriveSpreadsheets,
        BrowserLauncher: deps.BrowserLauncher,
        ShoppingManager: deps.ShoppingManager,
        Logger: deps.Logger,
        checkNaverSessionForUi: deps.checkNaverSessionForUi,
        SHOPPING_IMAGE_SLOT_MAP: deps.SHOPPING_IMAGE_SLOT_MAP,
        parseBase64ImagePayload: deps.parseBase64ImagePayload,
        resolveWritableConfigPath: deps.resolveWritableConfigPath,
        tryResolveReadableConfigSource: deps.tryResolveReadableConfigSource,
        readConfigRaw: deps.readConfigRaw,
        buildDefaultConfigTemplate: deps.buildDefaultConfigTemplate,
        applyConfigUpdates: deps.applyConfigUpdates,
        parseConfigValue: deps.parseConfigValue,
        applyRuntimeConfigFromMajor: deps.applyRuntimeConfigFromMajor,
        parseMajorFieldsFromRequest: deps.parseMajorFieldsFromRequest,
        syncAutoRunnerWithConfig: deps.syncAutoRunnerWithConfig,
        resolveLocalImagePathFromSource: deps.resolveLocalImagePathFromSource,
        getContentType: deps.getContentType,
        resolveRuntimePath: deps.resolveRuntimePath,
        buildMajorSettings: deps.buildMajorSettings,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        executeQuickPublish: deps.executeQuickPublish,
        executeQuickPreviewPublish: deps.executeQuickPreviewPublish,
        getQuickPreviewImagePayload: deps.getQuickPreviewImagePayload,
        deleteQuickPublishPreviewSession: deps.deleteQuickPublishPreviewSession,
        executeLocalMarkdownPublish: deps.executeLocalMarkdownPublish,
        executeShoppingQuickPublish: deps.executeShoppingQuickPublish,
        sortTopicItems: deps.sortTopicItems,
        getBlogRuntimeLogMap: deps.getBlogRuntimeLogMap,
        sortShoppingItems: deps.sortShoppingItems,
        getShoppingRuntimeLogMap: deps.getShoppingRuntimeLogMap,
        parseIntSafe: deps.parseIntSafe,
        normalizeSortDir: deps.normalizeSortDir,
        executeBlogBatchRowsAction: deps.executeBlogBatchRowsAction,
        executeBlogRowAction: deps.executeBlogRowAction,
        executeShoppingBatchRowsAction: deps.executeShoppingBatchRowsAction,
        executeShoppingRowUpdate: deps.executeShoppingRowUpdate,
        executeBlogTopicUpdate: deps.executeBlogTopicUpdate,
        executeBlogTopicsDelete: deps.executeBlogTopicsDelete,
        executeShoppingTopicsDelete: deps.executeShoppingTopicsDelete,
        blogNextExecutionCoordinator
    });
    const contentController = createContentController({
        service: contentService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger
    });

    const executeSiteHostingQueueRowAction = createSiteHostingQueueExecutor({
        Utils: deps.Utils,
        GoogleSheets: deps.GoogleSheets,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        generateAiManuscriptDraft: contentService.createAiManuscriptDraftForQueue,
        getSiteHostingSiteService: deps.getSiteHostingSiteService
    });
    const lifecycleAdapters = createContentLifecycleAdapterRegistry({
        executeBlogRowAction: deps.executeBlogRowAction,
        executeShoppingBatchRowsAction: deps.executeShoppingBatchRowsAction,
        executeSiteHostingQueueRowAction
    });
    const continuousPublishingService = createContinuousPublishingService({
        Utils: deps.Utils,
        GoogleSheets: deps.GoogleSheets,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        executeBlogRowAction: deps.executeBlogRowAction,
        executeShoppingBatchRowsAction: deps.executeShoppingBatchRowsAction,
        executeSiteHostingQueueRowAction,
        lifecycleAdapters,
        getSiteHostingSiteService: deps.getSiteHostingSiteService,
        executeBlogTopicsDelete: deps.executeBlogTopicsDelete,
        CONFIG: deps.CONFIG,
        TelegramService: deps.TelegramService,
        SlackService: deps.SlackService,
        fs: deps.fs,
        path: deps.path,
        eventStore: deps.eventStore,
        blogNextExecutionCoordinator
    });
    if (String(deps.CONFIG?.CONFIG_DIR || '').trim()) {
        continuousPublishingService.startAutomationScheduler();
    }
    const continuousPublishingController = createContinuousPublishingController({
        service: continuousPublishingService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger
    });

    const trendsService = createTrendsService({
        Utils: deps.Utils,
        Logger: deps.Logger,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        parseIntSafe: deps.parseIntSafe,
        normalizeSortDir: deps.normalizeSortDir,
        executeTrendsToTopicsAction: deps.executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction: deps.executeKeywordsToTopicsAction
    });
    const trendsController = createTrendsController({
        service: trendsService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError
    });

    const trendPosting = createBlogTrendPosting({
        License: deps.License,
        GoogleSheets: deps.GoogleSheets,
        Logger: deps.Logger,
        axios: deps.axios,
        baseUrl: deps.CONFIG?.TRENDS_API_PUBLIC_CONFIG?.url
    });
    const trendPostingService = createTrendPostingService({
        application: trendPosting.application,
        Logger: deps.Logger
    });
    const trendPostingController = createTrendPostingController({
        service: trendPostingService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError
    });

    const handlers = [
        createSystemRouteHandler({ controller: systemController }),
        createSessionLicenseRouteHandler({ controller: sessionLicenseController }),
        createAccountRouteHandler({ controller: accountController }),
        createContinuousPublishingRouteHandler({ controller: continuousPublishingController }),
        createContentRouteHandler({ controller: contentController }),
        createTrendsRouteHandler({ controller: trendsController }),
        createTrendPostingRouteHandler({ controller: trendPostingController })
    ];

    return async function tryHandleProductApi(ctx = {}) {
        for (const handler of handlers) {
            const handled = await handler(ctx);
            if (handled) return true;
        }
        return false;
    };
}

module.exports = {
    createProductApiRouteHandler
};
