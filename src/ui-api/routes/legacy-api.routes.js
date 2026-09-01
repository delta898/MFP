const { createSystemRouteHandler } = require('./system.routes');
const { createSessionLicenseRouteHandler } = require('./session-license.routes');
const { createContentRouteHandler } = require('./content.routes');
const { createTrendsRouteHandler } = require('./trends.routes');
const { createTrendPostingRouteHandler } = require('./trend-posting.routes');
const { createAccountRouteHandler } = require('./account.routes');
const { createContinuousPublishingRouteHandler } = require('./continuous-publishing.routes');
const { createSystemService } = require('../services/system.service');
const { createSessionLicenseService } = require('../services/session-license.service');
const { createContentService } = require('../services/content.service');
const { createTrendsService } = require('../services/trends.service');
const { createTrendPostingService } = require('../services/trend-posting.service');
const { createSystemController } = require('../controllers/system.controller');
const { createSessionLicenseController } = require('../controllers/session-license.controller');
const { createContentController } = require('../controllers/content.controller');
const { createTrendsController } = require('../controllers/trends.controller');
const { createTrendPostingController } = require('../controllers/trend-posting.controller');
const { createAccountController } = require('../controllers/account.controller');
const { createContinuousPublishingController } = require('../controllers/continuous-publishing.controller');
const { createContinuousPublishingService } = require('../services/continuous-publishing.service');
const { createAccountOverviewService } = require('../../account/overview-service');
const { createBlogNextExecutionCoordinator } = require('../../blog-next/execution-coordinator');
const WordPressClient = require('../../wordpress-client');

function createLegacyApiRouteHandler(deps = {}) {
    const blogNextExecutionCoordinator = deps.blogNextExecutionCoordinator
        || createBlogNextExecutionCoordinator();
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
        cheerio: deps.cheerio
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
        WordPressClient,
        CONFIG: deps.CONFIG
    });
    const sessionLicenseController = createSessionLicenseController({
        service: sessionLicenseService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger
    });

    const accountService = createAccountOverviewService({
        License: deps.License,
        CONFIG: deps.CONFIG,
        APP_VERSION: deps.APP_VERSION,
        toFeatureMap: deps.toFeatureMap,
        checkNaverSessionForUi: deps.checkNaverSessionForUi
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
        axios: deps.axios,
        RuntimeConfig: deps.RuntimeConfig,
        CONFIG: deps.CONFIG,
        License: deps.License,
        GoogleOAuth: require('../../google-oauth'),
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
        syncShoppingAutoRunnerWithConfig: deps.syncShoppingAutoRunnerWithConfig,
        resolveLocalImagePathFromSource: deps.resolveLocalImagePathFromSource,
        getContentType: deps.getContentType,
        resolveRuntimePath: deps.resolveRuntimePath,
        buildMajorSettings: deps.buildMajorSettings,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        executeQuickPublish: deps.executeQuickPublish,
        executeQuickPreviewPublish: deps.executeQuickPreviewPublish,
        getQuickPreviewImagePayload: deps.getQuickPreviewImagePayload,
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
        executeShoppingAutoManualAction: deps.executeShoppingAutoManualAction,
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

    const continuousPublishingService = createContinuousPublishingService({
        Utils: deps.Utils,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        executeBlogRowAction: deps.executeBlogRowAction,
        executeBlogTopicsDelete: deps.executeBlogTopicsDelete,
        CONFIG: deps.CONFIG,
        TelegramService: deps.TelegramService,
        SlackService: deps.SlackService,
        fs: deps.fs,
        path: deps.path,
        blogNextExecutionCoordinator
    });
    if (String(deps.CONFIG?.CONFIG_DIR || '').trim()) {
        continuousPublishingService.startAutomationScheduler();
    }
    const continuousPublishingController = createContinuousPublishingController({
        service: continuousPublishingService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError
    });

    const trendsService = createTrendsService({
        Utils: deps.Utils,
        Logger: deps.Logger,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        parseIntSafe: deps.parseIntSafe,
        normalizeSortDir: deps.normalizeSortDir,
        executeTrendCollectAction: deps.executeTrendCollectAction,
        executeTrendsToTopicsAction: deps.executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction: deps.executeKeywordsToTopicsAction
    });
    const trendsController = createTrendsController({
        service: trendsService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError
    });

    const trendPostingService = createTrendPostingService({
        License: deps.License,
        Utils: deps.Utils,
        Logger: deps.Logger,
        axios: deps.axios,
        baseUrl: deps.CONFIG?.TRENDS_API_PUBLIC_CONFIG?.url
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

    return async function tryHandleLegacyApi(ctx = {}) {
        for (const handler of handlers) {
            const handled = await handler(ctx);
            if (handled) return true;
        }
        return false;
    };
}

module.exports = {
    createLegacyApiRouteHandler
};
