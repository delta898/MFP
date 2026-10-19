'use strict';

const { createGitHubDesignStyleCatalog } = require('../../adapters/catalogs/amade/design-style-catalog');
const { createDesignStylesRouteHandler } = require('../../adapters/ui/site-hosting/design-styles/routes');
const { createManuscriptDraftService } = require('../../applications/blog/manuscript-drafts/application');
const { createCorePluginsRouteHandler } = require('../../adapters/ui/plugins/core-plugins.routes');
const { createWidgetPluginsRouteHandler } = require('../../adapters/ui/widget-plugins.routes');
const { createSettingsWritingProfileRuntime } = require('../settings-writing-profile');

function createUiApiRuntime(deps = {}) {
    const {
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
        ShoppingManager,
        axios,
        cheerio,
        TelegramService,
        TelegramBotService,
        SlackService,
        telegramPairingService,
        snsAiService,
        cardNewsLedgerStore,
        cardNewsProjectRepository,
        cardNewsSourceService,
        cardNewsMediaTransport,
        socialPublisher,
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
        getBlogBatchPublishStatus,
        getBlogAutoSettingsSnapshot,
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
        cardNewsGenerationService,
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
        keywordResearchApplication,
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
        blogWritingApplication,
        aiGenerationService,
        aiGateway,
        connectionVerification,
        blogPublishingApplication,
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
    let productApiRouteHandler = null;
    let cloudflareConnectionRouteHandler = null;
    let cloudflareConnectionService = null;
    let siteHostingApplication = null;
    let siteHostingSiteService = null;
    let siteHostingProjectRouteHandler = null;
    let siteHostingSiteRouteHandler = null;
    let manuscriptDraftService = null;

    function getManuscriptDraftService() {
        if (!manuscriptDraftService) {
            manuscriptDraftService = createManuscriptDraftService({
                fs,
                path,
                findImageByPrefix,
                Logger,
                workspaceDir: CONFIG?.WORKSPACE_DIR,
                generateAiImage: typeof blogWritingApplication?.generateImage === 'function'
                    ? (prompt, context = {}) => blogWritingApplication.generateImage(prompt, {}, {
                        signal: context.signal,
                        reportProgress: context.onProgress
                    })
                    : null,
                relatedPosts: {
                    fetchPosts: typeof relatedPostsService?.fetchConfiguredRelatedPosts === 'function'
                        ? ({ title, content }) => relatedPostsService.fetchConfiguredRelatedPosts({ title, content, keywords: [] }, 3)
                        : null,
                    pickHeading: typeof relatedPostsService?.pickHeading === 'function'
                        ? () => relatedPostsService.pickHeading()
                        : null,
                    toMobileUrl: require('../../utilities/text/naver-blog-url').toMobileNaverBlogPostUrl
                }
            });
        }
        return manuscriptDraftService;
    }
    let designStylesRouteHandler = null;
    let corePluginsRouteHandler = null;
    let widgetPluginsRouteHandler = null;
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
                getSnsAutomationStatus,
                getBlogBatchPublishStatus,
                getBlogAutoSettingsSnapshot,
                triggerSnsDiscoveryCycle,
                triggerSnsDistributionCycle,
                publishReadyTopicsBatch,
                startReadyTopicsBatch
            });
            const controller = createBlogAutoController({
                service,
                sendSuccess,
                sendError,
                Logger
            });
            blogAutoRouteHandler = createBlogAutoRouteHandler({ controller });
        }
        return blogAutoRouteHandler;
    }

    function getSettingsRouteHandlerInstance() {
        if (!settingsRouteHandler) {
            const writingProfileApplication = createSettingsWritingProfileRuntime({
                fs,
                path,
                config: CONFIG || {},
                axios,
                cheerio,
                blogWritingApplication,
                aiGenerationService
            });
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
                ensureRuntimeRemoteMcpConfig,
                generateRemoteMcpBearerToken,
                createConfigRevision,
                parseConfigValue,
                TelegramService,
                TelegramBotService,
                SlackService,
                telegramPairingService,
                writingProfileApplication,
                socialPublisher,
                axios,
                cheerio,
                blogWritingApplication,
                aiGenerationService,
                aiGateway,
                connectionVerification
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
                socialPublisher: socialPublisher,
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
                fs,
                path,
                logger: Logger,
                repository: cardNewsProjectRepository,
                sourceService: cardNewsSourceService,
                generationService: cardNewsGenerationService,
                getSupportedImageModels: () => cardNewsGenerationService.getSupportedModels?.('image') || [],
                ledgerStore: cardNewsLedgerStore,
                isImageModelVerified: (model) => Boolean(connectionVerification?.getTrustedAiModelVerification('image', model)),
                socialPublisher: socialPublisher,
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
                ? createKeywordsService({ keywordResearchApplication, smartUsageService: getSmartUsageServiceInstance() })
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
            const service = createBlogKeywordDiscoveryApplication({
                keywordResearchApplication,
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

    function createProductApiDeps() {
        const baseDeps = {
            APP_VERSION,
            Logger,
            Updater,
            relatedPostsService,
            fetchReferenceContent,
            findImageByPrefix,
            GoogleSheets,
            manuscriptDraftService: getManuscriptDraftService(),
            blogWritingApplication,
            aiGenerationService,
            blogPublishingApplication,
            getSiteHostingSiteService: getSiteHostingSiteServiceInstance,
            BrowserLauncher,
            fs,
            path,
            CONFIG,
            License,
            ShoppingManager,
            axios,
            cheerio,
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

    function getProductApiRouteHandlerInstance() {
        if (!productApiRouteHandler) {
            productApiRouteHandler = createProductApiRouteHandler(createProductApiDeps());
        }
        return productApiRouteHandler;
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
            siteHostingProjectRouteHandler = createSiteHostingProjectRouteHandler({
                service: getSiteHostingApplicationInstance().projectService,
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
        if (!siteHostingSiteService) siteHostingSiteService = getSiteHostingApplicationInstance().siteService;
        return siteHostingSiteService;
    }

    function getSiteHostingApplicationInstance() {
        if (!siteHostingApplication) {
            siteHostingApplication = createSiteHostingApplication({
                Logger,
                fs,
                path,
                manuscriptDraftService: getManuscriptDraftService(),
                workspaceDir: CONFIG?.WORKSPACE_DIR,
                runtimeEnvironment: CONFIG?.RUNTIME_ENVIRONMENT,
                corePluginRuntime,
                getCloudflareDeploymentCredentials: (accountId) => getCloudflareConnectionServiceInstance().getDeploymentCredentials(accountId)
            });
        }
        return siteHostingApplication;
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

    function getCorePluginsRouteHandlerInstance() {
        if (!corePluginsRouteHandler) {
            corePluginsRouteHandler = createCorePluginsRouteHandler({ corePluginRuntime, sendSuccess, sendError });
        }
        return corePluginsRouteHandler;
    }

    function getWidgetPluginsRouteHandlerInstance() {
        if (!widgetPluginsRouteHandler) {
            widgetPluginsRouteHandler = createWidgetPluginsRouteHandler({
                catalog: widgetPluginCatalog,
                fs,
                sendSuccess,
                sendError,
                getContentType
            });
        }
        return widgetPluginsRouteHandler;
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
                getWidgetPluginsRouteHandlerInstance().tryHandleRoute,
                getCorePluginsRouteHandlerInstance(),
                getDesignStylesRouteHandlerInstance(),
                getProductApiRouteHandlerInstance()
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

    function handleWidgetPluginAsset(requestId, method, pathname, res) {
        return getWidgetPluginsRouteHandlerInstance().tryHandleAsset({ requestId, method, pathname, res });
    }

    return {
        createProductApiDeps,
        getApiRouteHub: getApiRouteHubInstance,
        getBlogAutoRouteHandler: getBlogAutoRouteHandlerInstance,
        getProductApiRouteHandler: getProductApiRouteHandlerInstance,
        getSettingsRouteHandler: getSettingsRouteHandlerInstance,
        getCorePluginsRouteHandler: getCorePluginsRouteHandlerInstance,
        getWidgetPluginsRouteHandler: getWidgetPluginsRouteHandlerInstance,
        getManualSnsRouteHandler: getManualSnsRouteHandlerInstance,
        getCardNewsRouteHandler: getCardNewsRouteHandlerInstance,
        getSurfaceContentRouteHandler: getSurfaceContentRouteHandlerInstance,
        getTopicRecommendationsRouteHandler: getTopicRecommendationsRouteHandlerInstance,
        getRecommendationCenterRouteHandler: getRecommendationCenterRouteHandlerInstance,
        getKeywordDiscoveryRouteHandler: getKeywordDiscoveryRouteHandlerInstance,
        getKeywordsRouteHandler: getKeywordsRouteHandlerInstance,
        handleApi,
        handleWidgetPluginAsset
    };
}

module.exports = {
    createUiApiRuntime
};
