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
        snsAiService,
        recordActivityLifecycle,
        DEFAULT_HOST,
        DEFAULT_PORT,
        SHOPPING_IMAGE_SLOT_MAP,
        parseBoolQuery,
        ensureSheetsReadyForUi,
        toFeatureMap,
        checkNaverSessionForUi,
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
        createManualSnsService,
        createManualSnsController,
        createManualSnsRouteHandler,
        createSurfaceContentService,
        createSupabaseSurfaceContentProvider,
        createSurfaceContentController,
        createSurfaceContentRouteHandler,
        createTopicRecommendationsService,
        createTopicRecommendationsController,
        createTopicRecommendationsRouteHandler,
        topicRecommendationAgentRuntime,
        topicRecommendationRetrievalService,
        topicRecommendationEventStore,
        topicRecommendationLearningService,
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
        WordPressClient,
        createConfigRevision,
        sendSuccess,
        sendError
    } = deps;

    let blogAutoRouteHandler = null;
    let settingsRouteHandler = null;
    let manualSnsRouteHandler = null;
    let surfaceContentRouteHandler = null;
    let topicRecommendationsRouteHandler = null;
    let legacyApiRouteHandler = null;
    let apiRouteHub = null;

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
                syncShoppingAutoRunnerWithConfig,
                scheduleUiReload,
                restartRemoteMcpService,
                getRemoteServiceStatus,
                createConfigRevision,
                parseConfigValue,
                TelegramService,
                BufferClient
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
                createWordPressClient: () => new WordPressClient({
                    url: CONFIG.WORDPRESS_URL,
                    userId: CONFIG.WORDPRESS_USER_ID,
                    appPassword: CONFIG.WORDPRESS_APP_PASSWORD,
                    axios
                }),
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
                learningService: topicRecommendationLearningService
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

    function createLegacyApiDeps() {
        const baseDeps = {
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
            RuntimeConfig
        };

        const runtimeDeps = {
            parseBoolQuery,
            ensureSheetsReadyForUi,
            toFeatureMap,
            checkNaverSessionForUi,
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
            syncShoppingAutoRunnerWithConfig,
            resolveLocalImagePathFromSource,
            getContentType,
            resolveRuntimePath,
            buildMajorSettings
        };

        const actionDeps = {
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

    function getApiRouteHubInstance() {
        if (!apiRouteHub) {
            apiRouteHub = createApiRouteHub([
                getBlogAutoRouteHandlerInstance(),
                getSettingsRouteHandlerInstance(),
                getManualSnsRouteHandlerInstance(),
                getSurfaceContentRouteHandlerInstance(),
                getTopicRecommendationsRouteHandlerInstance(),
                getLegacyApiRouteHandlerInstance()
            ]);
        }
        return apiRouteHub;
    }

    async function handleApi(requestId, method, pathname, searchParams, requestBody, res) {
        const routed = await getApiRouteHubInstance()({
            requestId,
            method,
            pathname,
            searchParams,
            requestBody,
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
        getSurfaceContentRouteHandler: getSurfaceContentRouteHandlerInstance,
        getTopicRecommendationsRouteHandler: getTopicRecommendationsRouteHandlerInstance,
        handleApi
    };
}

module.exports = {
    createUiApiRouteRuntime
};
