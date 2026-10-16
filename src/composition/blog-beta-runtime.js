'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const ImageServiceDefault = require('../image-service');
const { createCorePluginRuntime } = require('./core-plugin-runtime');
const { createAiGenerationSystem } = require('./ai-generation');
const { createBlogWritingSystem } = require('./blog-writing');
const { createWordPressPublishingSystem } = require('./wordpress-publishing');
const { createNaverPublishingSystem } = require('./naver-publishing');
const { createBlogPublishingApplication } = require('../applications/blog/publishing/application');
const { createBlogGeniusAiTransport } = require('../adapters/ai/gateway-transport');
const { inferTransport } = require('../ai/transport-registry');
const { createSupabaseModelCatalogPort } = require('../ai/remote-model-catalog');
const { createModelCatalogService } = require('../../packages/plugins/core/ai-gateway');
const { applyRemoteCatalog, getCatalogStatus } = require('../ai/catalog-registry');
const { APP_VERSION } = require('../constants');

function createBlogBetaRuntimeComposition(options = {}) {
    const { CONFIG, Logger, getAiModelCatalog } = options;
    if (!CONFIG || typeof getAiModelCatalog !== 'function') {
        throw new TypeError('Blog Beta composition requires CONFIG and getAiModelCatalog().');
    }
    const fs = options.fs || fsDefault;
    const path = options.path || pathDefault;
    const ImageService = options.ImageService || ImageServiceDefault;
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime();
    const catalogPort = createSupabaseModelCatalogPort({
        config: CONFIG,
        ...(options.fetchCatalog ? { fetchCatalog: options.fetchCatalog } : {}),
        ...(options.catalogFs ? { fsImpl: options.catalogFs } : {}),
        appVersion: APP_VERSION
    });
    const catalogService = createModelCatalogService({
        fetchCatalog: catalogPort.fetchCatalog,
        loadCachedCatalog: catalogPort.loadCachedCatalog,
        saveCachedCatalog: catalogPort.saveCachedCatalog,
        applySnapshot: (payload) => applyRemoteCatalog(payload, { appVersion: APP_VERSION }),
        getSnapshot: getAiModelCatalog,
        getStatus: getCatalogStatus,
        logger: Logger
    });
    const pluginDependencies = {
        'ai-gateway': {
            transport: createBlogGeniusAiTransport({ config: CONFIG, fetch: options.fetch, lookup: options.lookup }),
            catalog: catalogService
        },
        'wordpress-publisher': {
            getCredentials: async () => ({
                url: CONFIG.WORDPRESS_URL,
                userId: CONFIG.WORDPRESS_USER_ID,
                appPassword: CONFIG.WORDPRESS_APP_PASSWORD
            })
        }
    };
    const aiGenerationSystem = createAiGenerationSystem({
        corePluginRuntime,
        pluginDependencies,
        getModelCatalog: getAiModelCatalog,
        logger: Logger,
        getConfiguredModels: (kind) => {
            const profiles = CONFIG.AI_MODEL_PROFILES?.[kind] || {};
            const role = kind === 'image' ? CONFIG.IMAGE_MODEL_CONFIG : CONFIG.TEXT_MODEL_CONFIG;
            const candidates = [...Object.values(profiles), ...(role?.provider === 'direct' ? [role] : [])];
            const seen = new Set();
            return candidates.filter((profile) => {
                if (profile?.provider !== 'direct' || !String(profile.code || '').trim() || !String(profile.base_url || '').trim()) return false;
                const identity = `${profile.provider}:${String(profile.code).trim()}`;
                if (seen.has(identity)) return false;
                seen.add(identity);
                return true;
            }).map((profile) => ({
                provider: 'direct',
                code: String(profile.code).trim(),
                name: String(profile.name || profile.code).trim(),
                transport: inferTransport(kind, 'direct'),
                capabilities: {}
            }));
        },
        getSupport: options.getGatewaySupport
    });
    const wordpressPublishingSystem = createWordPressPublishingSystem({ corePluginRuntime, pluginDependencies });
    const naverPublishingSystem = createNaverPublishingSystem({
        corePluginRuntime,
        CONFIG,
        Constants: options.Constants || require('../constants'),
        Logger,
        fs,
        ...(options.BrowserLauncher ? { BrowserLauncher: options.BrowserLauncher } : {}),
        ...(options.AuthSession ? { AuthSession: options.AuthSession } : {}),
        ...(options.naverPublisherDependencies ? { pluginDependencies: { 'naver-publisher': options.naverPublisherDependencies } } : {})
    });
    const blogWritingSystem = createBlogWritingSystem({
        aiGeneration: aiGenerationSystem.service,
        getTextModel: () => ({ provider: CONFIG.TEXT_MODEL_CONFIG?.provider, modelId: CONFIG.TEXT_MODEL_CONFIG?.code }),
        getImageModel: () => ({ provider: CONFIG.IMAGE_MODEL_CONFIG?.provider, modelId: CONFIG.IMAGE_MODEL_CONFIG?.code })
    });

    const blogPublishingApplication = createBlogPublishingApplication({
        Core: options.Core,
        ImageService,
        naverPublisher: naverPublishingSystem.publisher,
        legacyNaverPublisher: {
            publish(directory, request) {
                return options.Core.publishToBlog(directory, request);
            }
        },
        wordpressPublishingApplication: wordpressPublishingSystem.application,
        Utils: options.Utils,
        CONFIG,
        Logger,
        fs,
        path
    });

    return Object.freeze({
        corePluginRuntime,
        catalogService,
        aiGenerationSystem,
        wordpressPublishingSystem,
        naverPublishingSystem,
        blogWritingSystem,
        blogPublishingApplication
    });
}

module.exports = { createBlogBetaRuntimeComposition };
