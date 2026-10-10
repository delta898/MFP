'use strict';

const { createGitHubDesignStyleCatalog } = require('../site-hosting/github-design-style-catalog');
const { createDesignStylesRouteHandler } = require('../ui-api/routes/design-styles.routes');
const { createManuscriptDraftService } = require('../content/manuscript-draft-service');

function createUiApiRouteRuntime(deps = {}) {
    const {
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
        TelegramBotService,
        SlackService,
        snsAiService,
        cardNewsLedgerStore,
        cardNewsMediaTransport,
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
        createManualSnsService,
        createManualSnsController,
        createManualSnsRouteHandler,
        createCardNewsService,
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
        createSiteHostingProjectService,
        createSiteHostingProjectRouteHandler,
        createSiteHostingSiteService,
        createSiteHostingSiteRouteHandler,
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
        WordPressClient,
        createConfigRevision,
        sendSuccess,
        sendError
    } = deps;

    let blogAutoRouteHandler = null;
    let settingsRouteHandler = null;
    let manualSnsRouteHandler = null;
    let cardNewsRouteHandler = null;
    let surfaceContentRouteHandler = null;
    let topicRecommendationsRouteHandler = null;
    let recommendationCenterRouteHandler = null;
    let keywordDiscoveryRouteHandler = null;
    let keywordsRouteHandler = null;
    let legacyApiRouteHandler = null;
    let cloudflareConnectionRouteHandler = null;
    let cloudflareConnectionService = null;
    let siteHostingSiteService = null;
    let siteHostingProjectRouteHandler = null;
    let siteHostingSiteRouteHandler = null;
    let manuscriptDraftService = null;

    function getManuscriptDraftService() {
        if (!manuscriptDraftService) {
            manuscriptDraftService = createManuscriptDraftService({
                fs,
                path,
                Utils,
                Logger,
                workspaceDir: CONFIG?.WORKSPACE_DIR,
                callWritingImage: typeof Utils?.callWritingImage === 'function' ? Utils.callWritingImage.bind(Utils) : null,
                relatedPosts: {
                    fetchPosts: typeof Utils?.fetchConfiguredRelatedPosts === 'function'
                        ? ({ title, content }) => Utils.fetchConfiguredRelatedPosts({ title, content, keywords: [] }, 3)
                        : typeof Utils?.fetchOwnBlogRelatedPosts === 'function'
                            ? ({ title, content }) => Utils.fetchOwnBlogRelatedPosts({ title, content, keywords: [] }, 3)
                            : null,
                    pickHeading: typeof Utils?.pickRelatedPostsHeading === 'function'
                        ? () => Utils.pickRelatedPostsHeading()
                        : null,
                    toMobileUrl: typeof Utils?.toMobileNaverBlogPostUrl === 'function'
                        ? (url) => Utils.toMobileNaverBlogPostUrl(url)
                        : null
                }
            });
        }
        return manuscriptDraftService;
    }
    let designStylesRouteHandler = null;
    let apiRouteHub = null;
    let smartUsageService = null;

    function getSmartUsageServiceInstance() {
        if (!smartUsageService) {
            smartUsageService = createSmartUsageService({ License });
        }
        return smartUsageService;
    }

    function getBlogAutoRouteHandlerInstance() {
        if (!blogAutoRouteHandler) {
            const service = createBlogAutoService({
                Logger,
                getAutoStatusPayload,
                ensureSheetsReadyForUi,
                resolveNaverAutoCategoryCatalog,
                runAutoCycle,
                runTrendCollectCycle,
                runRssCollectCycle,
                triggerSnsDiscoveryCycle,
                triggerSnsDistributionCycle,
                runAutoPublishCycle,
                triggerAutoPublishCycle
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

    function getSettingsRouteHandlerInstance() {
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
                scheduleUiReload,
                restartRemoteMcpService,
                getRemoteServiceStatus,
                createConfigRevision,
                parseConfigValue,
                TelegramService,
                TelegramBotService,
                BufferClient,
                Utils,
                axios,
                cheerio
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

    function getManualSnsRouteHandlerInstance() {
        if (!manualSnsRouteHandler) {
            const service = createManualSnsService({
                CONFIG,
                bufferClient: new BufferClient({ axios }),
                aiService: snsAiService,
                parseImagePayload: parseBase64ImagePayload,
                mediaTransport: cardNewsMediaTransport,
                Logger,
                recordActivityLifecycle
            });
            const controller = createManualSnsController({
                service,
                sendSuccess,
                sendError
            });
            manualSnsRouteHandler = createManualSnsRouteHandler({ controller });
        }
        return manualSnsRouteHandler;
    }

    function getCardNewsRouteHandlerInstance() {
        if (!cardNewsRouteHandler) {
            const service = createCardNewsService({
                CONFIG,
                License,
                axios,
                cheerio,
                fs,
                path,
                logger: Logger,
                Utils,
                ledgerStore: cardNewsLedgerStore,
                bufferClient: new BufferClient({ axios }),
                mediaTransport: cardNewsMediaTransport,
                urlService: urlShorteningService
            });
            const controller = createCardNewsController({ service, sendSuccess, sendError, fs });
            cardNewsRouteHandler = createCardNewsRouteHandler({ controller });
        }
        return cardNewsRouteHandler;
    }

    function getSurfaceContentRouteHandlerInstance() {
        if (!surfaceContentRouteHandler) {
            const provider = createSupabaseSurfaceContentProvider({
                config: CONFIG,
                License,
                logger: Logger
            });
            const service = createSurfaceContentService({
                provider,
                appVersion: APP_VERSION,
                logger: Logger
            });
            const controller = createSurfaceContentController({
                service,
                sendSuccess,
                sendError
            });
            surfaceContentRouteHandler = createSurfaceContentRouteHandler({ controller });
        }
        return surfaceContentRouteHandler;
    }

    function getTopicRecommendationsRouteHandlerInstance() {
        if (!topicRecommendationsRouteHandler) {
            const service = createTopicRecommendationsService({
                agentRuntime: topicRecommendationAgentRuntime,
                retrievalService: topicRecommendationRetrievalService,
                eventStore: topicRecommendationEventStore,
                learningService: topicRecommendationLearningService,
                smartUsageService: getSmartUsageServiceInstance()
            });
            const controller = createTopicRecommendationsController({
                service,
                sendSuccess,
                sendError
            });
            topicRecommendationsRouteHandler = createTopicRecommendationsRouteHandler({ controller });
        }
        return topicRecommendationsRouteHandler;
    }

    function getRecommendationCenterRouteHandlerInstance() {
        if (!recommendationCenterRouteHandler) {
            const service = createRecommendationCenterService({
                eventStore: topicRecommendationEventStore,
                handoffService: recommendationCenterHandoffService,
                refreshService: recommendationCenterRefreshService,
                logger: Logger
            });
            const controller = createRecommendationCenterController({
                service,
                sendSuccess,
                sendError
            });
            recommendationCenterRouteHandler = createRecommendationCenterRouteHandler({ controller });
        }
        return recommendationCenterRouteHandler;
    }

    function getKeywordsRouteHandlerInstance() {
        if (!keywordsRouteHandler && typeof createKeywordsRouteHandler === 'function') {
            const service = typeof createKeywordsService === 'function'
                ? createKeywordsService({ CONFIG, Utils, Logger, smartUsageService: getSmartUsageServiceInstance() })
                : null;
            const controller = typeof createKeywordsController === 'function'
                ? createKeywordsController({ service, sendSuccess, sendError })
                : null;
            keywordsRouteHandler = createKeywordsRouteHandler({ controller });
        }
        return keywordsRouteHandler;
    }

    function getKeywordDiscoveryRouteHandlerInstance() {
        if (!keywordDiscoveryRouteHandler) {
            const service = createKeywordDiscoveryService({
                CONFIG,
                Utils,
                Logger,
                License,
                knowledgeRegistry: topicRecommendationCapabilityRegistry?.knowledgeRegistry,
                retrievalService: topicRecommendationRetrievalService,
                eventStore: topicRecommendationEventStore,
                smartUsageService: getSmartUsageServiceInstance()
            });
            const controller = createKeywordDiscoveryController({
                service,
                sendSuccess,
                sendError
            });
            keywordDiscoveryRouteHandler = createKeywordDiscoveryRouteHandler({ controller });
        }
        return keywordDiscoveryRouteHandler;
    }

    function createLegacyApiDeps() {
        const baseDeps = {
            APP_VERSION,
            Logger,
            Updater,
            Utils,
            manuscriptDraftService: getManuscriptDraftService(),
            getSiteHostingSiteService: getSiteHostingSiteServiceInstance,
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
            SlackService,
            eventStore: topicRecommendationEventStore
        };

        const runtimeDeps = {
            parseBoolQuery,
            ensureSheetsReadyForUi,
            toFeatureMap,
            checkNaverSessionForUi,
            peekNaverSessionForUi,
            logoutNaverSessionForUi,
            getNaverLoginStatus,
            getNaverLoginState,
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
            resolveLocalImagePathFromSource,
            getContentType,
            resolveRuntimePath,
            buildMajorSettings
        };

        const actionDeps = {
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

    function getLegacyApiRouteHandlerInstance() {
        if (!legacyApiRouteHandler) {
            legacyApiRouteHandler = createLegacyApiRouteHandler(createLegacyApiDeps());
        }
        return legacyApiRouteHandler;
    }

    function getCloudflareConnectionServiceInstance() {
        if (!cloudflareConnectionService) {
            const userDataDir = String(process.env.BLOG_GENIUS_USER_DATA || CONFIG?.CONFIG_DIR || process.cwd());
            const credentialStore = createEncryptedCredentialStore({
                filePath: path.join(userDataDir, 'credentials', 'cloudflare-oauth.json'),
                fsImpl: fs,
                pathImpl: path
            });
            cloudflareConnectionService = createCloudflareConnectionService({
                clientId: CONFIG?.CLOUDFLARE_OAUTH_CLIENT_ID,
                requestedScopes: CONFIG?.CLOUDFLARE_OAUTH_SCOPES,
                credentialStore
            });
        }
        return cloudflareConnectionService;
    }

    function getCloudflareConnectionRouteHandlerInstance() {
        if (!cloudflareConnectionRouteHandler) {
            cloudflareConnectionRouteHandler = createCloudflareConnectionRouteHandler({
                service: getCloudflareConnectionServiceInstance(),
                sendSuccess,
                sendError
            });
        }
        return cloudflareConnectionRouteHandler;
    }

    function getSiteHostingProjectRouteHandlerInstance() {
        if (!siteHostingProjectRouteHandler) {
            const service = createSiteHostingProjectService({
                fs,
                path,
                workspaceDir: CONFIG?.WORKSPACE_DIR
            });
            siteHostingProjectRouteHandler = createSiteHostingProjectRouteHandler({
                service,
                sendSuccess,
                sendError
            });
        }
        return siteHostingProjectRouteHandler;
    }

    function getSiteHostingSiteRouteHandlerInstance() {
        if (!siteHostingSiteRouteHandler) {
            siteHostingSiteRouteHandler = createSiteHostingSiteRouteHandler({
                service: getSiteHostingSiteServiceInstance(),
                sendSuccess,
                sendError
            });
        }
        return siteHostingSiteRouteHandler;
    }

    function getSiteHostingSiteServiceInstance() {
        if (!siteHostingSiteService) {
            siteHostingSiteService = createSiteHostingSiteService({
                Logger,
                fs,
                path,
                manuscriptDraftService: getManuscriptDraftService(),
                workspaceDir: CONFIG?.WORKSPACE_DIR,
                runtimeEnvironment: CONFIG?.RUNTIME_ENVIRONMENT,
                getCloudflareDeploymentCredentials: (accountId) => getCloudflareConnectionServiceInstance().getDeploymentCredentials(accountId)
            });
        }
        return siteHostingSiteService;
    }

    function getDesignStylesRouteHandlerInstance() {
        if (!designStylesRouteHandler) {
            const catalog = createGitHubDesignStyleCatalog({
                fs,
                path,
                workspaceDir: CONFIG?.WORKSPACE_DIR,
                environment: CONFIG?.RUNTIME_ENVIRONMENT
            });
            designStylesRouteHandler = createDesignStylesRouteHandler({ catalog, sendSuccess, sendError });
        }
        return designStylesRouteHandler;
    }

    function getApiRouteHubInstance() {
        if (!apiRouteHub) {
            apiRouteHub = createApiRouteHub([
                getBlogAutoRouteHandlerInstance(),
                getSettingsRouteHandlerInstance(),
                getManualSnsRouteHandlerInstance(),
                getCardNewsRouteHandlerInstance(),
                getSurfaceContentRouteHandlerInstance(),
                getTopicRecommendationsRouteHandlerInstance(),
                getRecommendationCenterRouteHandlerInstance(),
                getKeywordDiscoveryRouteHandlerInstance(),
                getKeywordsRouteHandlerInstance(),
                getCloudflareConnectionRouteHandlerInstance(),
                getSiteHostingProjectRouteHandlerInstance(),
                getSiteHostingSiteRouteHandlerInstance(),
                getDesignStylesRouteHandlerInstance(),
                getLegacyApiRouteHandlerInstance()
            ]);
        }
        return apiRouteHub;
    }

    async function handleApi(requestId, method, pathname, searchParams, requestBody, res, req) {
        const routed = await getApiRouteHubInstance()({
            requestId,
            method,
            pathname,
            searchParams,
            requestBody,
            remoteAddress: req?.socket?.remoteAddress || '',
            origin: req?.headers?.origin || '',
            host: req?.headers?.host || '',
            contentType: req?.headers?.['content-type'] || '',
            res
        });
        return routed === true;
    }

    return {
        createLegacyApiDeps,
        getApiRouteHub: getApiRouteHubInstance,
        getBlogAutoRouteHandler: getBlogAutoRouteHandlerInstance,
        getLegacyApiRouteHandler: getLegacyApiRouteHandlerInstance,
        getSettingsRouteHandler: getSettingsRouteHandlerInstance,
        getManualSnsRouteHandler: getManualSnsRouteHandlerInstance,
        getCardNewsRouteHandler: getCardNewsRouteHandlerInstance,
        getSurfaceContentRouteHandler: getSurfaceContentRouteHandlerInstance,
        getTopicRecommendationsRouteHandler: getTopicRecommendationsRouteHandlerInstance,
        getRecommendationCenterRouteHandler: getRecommendationCenterRouteHandlerInstance,
        getKeywordDiscoveryRouteHandler: getKeywordDiscoveryRouteHandlerInstance,
        getKeywordsRouteHandler: getKeywordsRouteHandlerInstance,
        handleApi
    };
}

module.exports = {
    createUiApiRouteRuntime
};
