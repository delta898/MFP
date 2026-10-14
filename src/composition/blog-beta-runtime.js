'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const ImageServiceDefault = require('../image-service');
const { createCorePluginRuntime } = require('./core-plugin-runtime');
const { createBlogWritingSystem } = require('./blog-writing');
const { createBlogPublishingApplication } = require('../applications/blog/publishing/application');
const { createBlogGeniusAiTransport } = require('../adapters/ai/gateway-transport');
const { resolveGatewayModel, supportsGatewayFeature } = require('../applications/blog/writing/gateway-model-resolver');
const { describeSupport } = require('../../packages/plugins/core/ai-gateway');

function createBlogBetaRuntimeComposition(options = {}) {
    const { CONFIG, Logger, getAiModelCatalog } = options;
    if (!CONFIG || typeof getAiModelCatalog !== 'function') {
        throw new TypeError('Blog Beta composition requires CONFIG and getAiModelCatalog().');
    }
    const fs = options.fs || fsDefault;
    const path = options.path || pathDefault;
    const ImageService = options.ImageService || ImageServiceDefault;
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime();
    const getGatewaySupport = options.getGatewaySupport || describeSupport;
    const getModelCatalog = () => getAiModelCatalog();
    const getSupport = () => getGatewaySupport();

    const blogWritingSystem = createBlogWritingSystem({
        corePluginRuntime,
        getTextModel: () => ({ provider: CONFIG.TEXT_MODEL_CONFIG?.provider, modelId: CONFIG.TEXT_MODEL_CONFIG?.code }),
        getImageModel: () => ({ provider: CONFIG.IMAGE_MODEL_CONFIG?.provider, modelId: CONFIG.IMAGE_MODEL_CONFIG?.code }),
        resolveTextModel: (selection) => resolveGatewayModel('text', selection, getModelCatalog(), getSupport()),
        resolveImageModel: (selection) => resolveGatewayModel('image', selection, getModelCatalog(), getSupport()),
        supportsJson: (model) => supportsGatewayFeature('text', model, 'jsonResponse', getSupport(), getModelCatalog()),
        pluginDependencies: {
            'ai-gateway': { transport: createBlogGeniusAiTransport({ config: CONFIG, fetch: options.fetch, lookup: options.lookup }) },
            'wordpress-publisher': {
                getCredentials: async () => ({
                    url: CONFIG.WORDPRESS_URL,
                    userId: CONFIG.WORDPRESS_USER_ID,
                    appPassword: CONFIG.WORDPRESS_APP_PASSWORD
                })
            }
        }
    });

    const blogPublishingApplication = createBlogPublishingApplication({
        Core: options.Core,
        ImageService,
        blogWritingApplication: blogWritingSystem.application,
        CONFIG,
        Logger,
        fs,
        path
    });

    return Object.freeze({ corePluginRuntime, blogWritingSystem, blogPublishingApplication });
}

module.exports = { createBlogBetaRuntimeComposition };
