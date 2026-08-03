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
                Logger
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
        handleApi
    };
}

module.exports = {
    createUiApiRouteRuntime
};
