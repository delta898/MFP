'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const ImageServiceDefault = require('../image-service');
const { createCorePluginRuntime } = require('./core-plugin-runtime');
const { createAiGenerationSystem } = require('./ai-generation');
const { createBlogWritingSystem } = require('./blog-writing');
const { createWordPressPublishingSystem } = require('./wordpress-publishing');
const { createBlogPublishingApplication } = require('../applications/blog/publishing/application');
const { createBlogGeniusAiTransport } = require('../adapters/ai/gateway-transport');

function createBlogBetaRuntimeComposition(options = {}) {
    const { CONFIG, Logger, getAiModelCatalog } = options;
    if (!CONFIG || typeof getAiModelCatalog !== 'function') {
        throw new TypeError('Blog Beta composition requires CONFIG and getAiModelCatalog().');
    }
    const fs = options.fs || fsDefault;
    const path = options.path || pathDefault;
    const ImageService = options.ImageService || ImageServiceDefault;
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime();
    const pluginDependencies = {
        'ai-gateway': { transport: createBlogGeniusAiTransport({ config: CONFIG, fetch: options.fetch, lookup: options.lookup }) },
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
        getSupport: options.getGatewaySupport
    });
    const wordpressPublishingSystem = createWordPressPublishingSystem({ corePluginRuntime, pluginDependencies });
    const blogWritingSystem = createBlogWritingSystem({
        aiGeneration: aiGenerationSystem.service,
        getTextModel: () => ({ provider: CONFIG.TEXT_MODEL_CONFIG?.provider, modelId: CONFIG.TEXT_MODEL_CONFIG?.code }),
        getImageModel: () => ({ provider: CONFIG.IMAGE_MODEL_CONFIG?.provider, modelId: CONFIG.IMAGE_MODEL_CONFIG?.code })
    });

    const blogPublishingApplication = createBlogPublishingApplication({
        Core: options.Core,
        ImageService,
        wordpressPublishingApplication: wordpressPublishingSystem.application,
        CONFIG,
        Logger,
        fs,
        path
    });

    return Object.freeze({
        corePluginRuntime,
        aiGenerationSystem,
        wordpressPublishingSystem,
        blogWritingSystem,
        blogPublishingApplication
    });
}

module.exports = { createBlogBetaRuntimeComposition };
