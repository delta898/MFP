'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const { randomUUID } = require('node:crypto');
const { createImageOptimizationService } = require('../utilities/media/image-optimization-service');
const { createCorePluginRuntime } = require('./core-plugin-runtime');
const { createAiGenerationSystem } = require('./ai-generation');
const { createBlogWritingSystem } = require('./blog-writing');
const { createWordPressPublishingSystem } = require('./wordpress-publishing');
const { createNaverPublishingSystem } = require('./naver-publishing');
const { createBlogPublishingApplication } = require('../applications/blog/publishing/application');
const { formatNaverLinks } = require('../adapters/naver/publishing/related-posts');
const { createBlogPostingApplication } = require('../applications/blog/posting/application');
const { createBlogReferenceContentFetcher } = require('../adapters/web/blog-reference-content-fetcher');
const { createReferenceSearchGateway } = require('../adapters/knowledge/blog-reference-search');
const { createShoppingGenerationApplication } = require('../applications/shopping/generation/application');
const { inferTransport } = require('../../packages/plugins/core/ai-gateway/transport-registry');
const { createSupabaseModelCatalogPort } = require('../adapters/storage/ai-model-catalog/supabase-port');
const { createModelCatalogService } = require('../../packages/plugins/core/ai-gateway');
const { applyRemoteCatalog, getCatalogStatus } = require('../../packages/plugins/core/ai-gateway/catalog-registry');
const { APP_VERSION } = require('../host/application-metadata');
const { createPlatformWorkspaceResolver } = require('../adapters/storage/workspaces/platform-workspace');
const { createManuscriptImageFileReader } = require('../adapters/storage/manuscript-drafts/image-file-reader');
const { createWordPressPublishedAssetSettings } = require('../adapters/storage/config/wordpress-published-assets');
const { createRelatedPostsService } = require('../services/related-posts/service');
const { createNaverBlogPostFeed } = require('../adapters/web/related-posts/naver-blog-post-feed');
const { createWordPressPostFeed } = require('../adapters/web/related-posts/wordpress-post-feed');
const { runWithHeartbeat } = require('../utilities/async/run-with-heartbeat');
const { convertToMobileNaverBlogUrl } = require('../utilities/text/naver-blog-url');

function createBlogBetaRuntimeComposition(options = {}) {
    const { CONFIG, Logger, getAiModelCatalog } = options;
    if (!CONFIG || typeof getAiModelCatalog !== 'function') {
        throw new TypeError('Blog Beta composition requires CONFIG and getAiModelCatalog().');
    }
    const fs = options.fs || fsDefault;
    const path = options.path || pathDefault;
    const imageOptimizationService = options.imageOptimizationService || createImageOptimizationService({ logger: Logger });
    const resolvePlatformWorkspaceDir = createPlatformWorkspaceResolver({ config: CONFIG, fs, path, logger: Logger });
    const findImageByPrefix = createManuscriptImageFileReader({ fs, path, logger: Logger });
    const wordpressPublishedAssetSettings = createWordPressPublishedAssetSettings({ config: CONFIG, fs, logger: Logger });
    const fetchReferenceContent = createBlogReferenceContentFetcher({ config: CONFIG, logger: Logger, axios: options.axios });
    const withHeartbeat = (label, fn) => runWithHeartbeat(label, fn, { logger: Logger });
    const relatedPostsService = createRelatedPostsService({
        config: CONFIG,
        logger: Logger,
        fetchNaverCandidates: createNaverBlogPostFeed({ config: CONFIG, logger: Logger, axios: options.axios, withHeartbeat }),
        fetchWordPressCandidates: createWordPressPostFeed({ logger: Logger, axios: options.axios, withHeartbeat })
    });
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime();
    const catalogPort = createSupabaseModelCatalogPort({
        config: CONFIG,
        ...(options.fetchCatalog ? { fetchCatalog: options.fetchCatalog } : {}),
        ...(options.catalogFs ? { fsImpl: options.catalogFs } : {}),
        appVersion: APP_VERSION,
        logger: Logger
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
    const verificationProfiles = new Map();
    const registerVerificationProfile = (kind, profile) => {
        const profileRef = randomUUID();
        verificationProfiles.set(profileRef, {
            kind: String(kind || '').trim(),
            provider: String(profile?.provider || '').trim(),
            modelId: String(profile?.code || '').trim(),
            profile
        });
        return profileRef;
    };
    const releaseVerificationProfile = (profileRef) => verificationProfiles.delete(String(profileRef || ''));
    const pluginDependencies = {
        'ai-gateway': {
            getProviderProfile: ({ kind, provider, modelId, profileRef }) => {
                if (profileRef) {
                    const candidate = verificationProfiles.get(profileRef);
                    if (candidate && candidate.kind === kind && candidate.provider === provider
                        && candidate.modelId === modelId) return candidate.profile;
                    return null;
                }
                const profile = CONFIG.AI_MODEL_PROFILES?.[kind]?.[provider];
                if (profile && typeof profile === 'object') return profile;
                const role = kind === 'image' ? CONFIG.IMAGE_MODEL_CONFIG : CONFIG.TEXT_MODEL_CONFIG;
                return role?.provider === provider ? role : null;
            },
            ...(options.fetch ? { fetch: options.fetch } : {}),
            ...(options.lookup ? { lookup: options.lookup } : {}),
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
        registerVerificationProfile,
        releaseVerificationProfile,
        getModelCatalog: getAiModelCatalog,
        logger: Logger,
        getConfiguredModels: (kind) => {
            const profiles = CONFIG.AI_MODEL_PROFILES?.[kind] || {};
            const role = kind === 'image' ? CONFIG.IMAGE_MODEL_CONFIG : CONFIG.TEXT_MODEL_CONFIG;
            const candidates = [
                ...Object.values(profiles),
                ...(role?.provider === 'direct' ? [role] : []),
                ...(kind === 'text' && CONFIG.CHAT_MODEL_CONFIG?.provider === 'direct' ? [CONFIG.CHAT_MODEL_CONFIG] : [])
            ];
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
        Logger,
        fs,
        ...(options.BrowserLauncher ? { BrowserLauncher: options.BrowserLauncher } : {}),
        ...(options.AuthSession ? { AuthSession: options.AuthSession } : {}),
        ...(options.naverPublisherDependencies ? { pluginDependencies: { 'naver-publisher': options.naverPublisherDependencies } } : {})
    });
    const blogWritingSystem = createBlogWritingSystem({
        aiGeneration: aiGenerationSystem.service,
        getTextModel: () => ({ provider: CONFIG.TEXT_MODEL_CONFIG?.provider, modelId: CONFIG.TEXT_MODEL_CONFIG?.code }),
        getChatModel: () => {
            const model = CONFIG.CHAT_MODEL_CONFIG || CONFIG.TEXT_MODEL_CONFIG;
            return model ? { provider: model.provider, modelId: model.code } : undefined;
        },
        getImageModel: () => ({ provider: CONFIG.IMAGE_MODEL_CONFIG?.provider, modelId: CONFIG.IMAGE_MODEL_CONFIG?.code })
    });
    const shoppingGenerationApplication = createShoppingGenerationApplication({
        aiGeneration: aiGenerationSystem.service,
        getTextModel: () => CONFIG.TEXT_MODEL_CONFIG,
        logger: Logger
    });
    const blogPostingApplication = createBlogPostingApplication({
        relatedPostsService,
        convertNaverBlogUrl: convertToMobileNaverBlogUrl,
        fetchReferenceContent,
        CONFIG,
        Logger,
        fs,
        path,
        blogWritingApplication: blogWritingSystem.application,
        resolvePlatformWorkspaceDir,
        referenceSearchGateway: createReferenceSearchGateway({ config: CONFIG, License: options.License })
    });
    const blogPublishingApplication = createBlogPublishingApplication({
        imageOptimizationService,
        naverPublisher: naverPublishingSystem.publisher,
        wordpressPublishingApplication: wordpressPublishingSystem.application,
        CONFIG,
        Logger,
        fs,
        path,
        findImageByPrefix,
        formatNaverLinks,
        persistWordPressAssetUrl: (key, value) => wordpressPublishedAssetSettings.persist(key, value)
    });

    return Object.freeze({
        corePluginRuntime,
        catalogService,
        aiGenerationSystem,
        wordpressPublishingSystem,
        naverPublishingSystem,
        blogWritingSystem,
        shoppingGenerationApplication,
        relatedPostsService,
        fetchReferenceContent,
        blogPostingApplication,
        blogPublishingApplication
    });
}

module.exports = { createBlogBetaRuntimeComposition };
