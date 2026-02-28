const { createSystemRouteHandler } = require('./system.routes');
const { createSessionLicenseRouteHandler } = require('./session-license.routes');
const { createContentRouteHandler } = require('./content.routes');
const { createTrendsRouteHandler } = require('./trends.routes');
const { createSystemService } = require('../services/system.service');
const { createSessionLicenseService } = require('../services/session-license.service');
const { createContentService } = require('../services/content.service');
const { createTrendsService } = require('../services/trends.service');
const { createSystemController } = require('../controllers/system.controller');
const { createSessionLicenseController } = require('../controllers/session-license.controller');
const { createContentController } = require('../controllers/content.controller');
const { createTrendsController } = require('../controllers/trends.controller');

function createLegacyApiRouteHandler(deps = {}) {
    const systemService = createSystemService({
        APP_VERSION: deps.APP_VERSION,
        Utils: deps.Utils,
        fs: deps.fs,
        path: deps.path,
        CONFIG: deps.CONFIG,
        parseBoolQuery: deps.parseBoolQuery,
        ensureSheetsReadyForUi: deps.ensureSheetsReadyForUi,
        logger: deps.Logger,
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
        getFeatureInt: deps.getFeatureInt,
        resolveMaxBlogPostsPerRun: deps.resolveMaxBlogPostsPerRun,
        resolveMaxShoppingPostsPerRun: deps.resolveMaxShoppingPostsPerRun,
        checkNaverSessionForUi: deps.checkNaverSessionForUi,
        getNaverLoginStatus: deps.getNaverLoginStatus,
        getNaverLoginState: deps.getNaverLoginState,
        setNaverLoginState: deps.setNaverLoginState,
        runNaverLoginFlowForUi: deps.runNaverLoginFlowForUi
    });
    const sessionLicenseController = createSessionLicenseController({
        service: sessionLicenseService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger
    });

    const contentService = createContentService({
        Utils: deps.Utils,
        fs: deps.fs,
        path: deps.path,
        CONFIG: deps.CONFIG,
        ShoppingManager: deps.ShoppingManager,
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
        executeBlogTopicUpdate: deps.executeBlogTopicUpdate
    });
    const contentController = createContentController({
        service: contentService,
        sendSuccess: deps.sendSuccess,
        sendError: deps.sendError,
        logger: deps.Logger
    });

    const trendsService = createTrendsService({
        Utils: deps.Utils,
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

    const handlers = [
        createSystemRouteHandler({ controller: systemController }),
        createSessionLicenseRouteHandler({ controller: sessionLicenseController }),
        createContentRouteHandler({ controller: contentController }),
        createTrendsRouteHandler({ controller: trendsController })
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
