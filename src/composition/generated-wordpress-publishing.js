'use strict';

const { createGeneratedWordPressPublishingApplication } = require('../applications/blog/workflows/generated-wordpress-publishing');
const { createWordPressPublishingSystem } = require('./wordpress-publishing');
const { createAiGenerationSystem } = require('./ai-generation');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

function createGeneratedWordPressPublishingSystem(options = {}) {
    if (typeof options.getModelCatalog !== 'function') {
        throw new TypeError('Generated WordPress composition requires getModelCatalog().');
    }
    const corePluginRegistry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime({ registry: corePluginRegistry });
    const pluginDependencies = options.pluginDependencies || {};
    const aiGenerationSystem = createAiGenerationSystem({
        corePluginRuntime,
        pluginDependencies,
        getModelCatalog: options.getModelCatalog,
        getConfiguredModels: options.getConfiguredModels,
        logger: options.logger,
        getSupport: options.getGatewaySupport
    });
    const wordpressSystem = createWordPressPublishingSystem({ corePluginRuntime, pluginDependencies });
    const application = createGeneratedWordPressPublishingApplication({
        aiGeneration: aiGenerationSystem.service,
        getTextModel: options.getTextModel,
        textModel: options.textModel,
        publish: (request, context) => wordpressSystem.application.publish(request, context),
        validatePublicationRequest: (request) => wordpressSystem.application.validate(request)
    });

    return Object.freeze({
        corePluginRegistry,
        corePluginRuntime,
        pluginHost: corePluginRuntime.host,
        aiGenerationSystem,
        wordpressSystem,
        application
    });
}

module.exports = { createGeneratedWordPressPublishingSystem };
