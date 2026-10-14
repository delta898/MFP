'use strict';

const { createGeneratedWordPressPublishingApplication } = require('../applications/generated-wordpress-publishing');
const { createWordPressPublishingApplication } = require('../applications/wordpress-publishing');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

const REQUIRED_PLUGIN_IDS = Object.freeze(['ai-gateway', 'wordpress-publisher']);

function createGeneratedWordPressPublishingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime({ registry: corePluginRegistry });
    const { executeOperation } = corePluginRuntime.ensurePlugins(REQUIRED_PLUGIN_IDS, options.pluginDependencies || {});
    const wordpressApplication = createWordPressPublishingApplication({ executeOperation });
    const application = createGeneratedWordPressPublishingApplication({
        executeOperation,
        getTextModel: options.getTextModel,
        textModel: options.textModel,
        resolveTextModel: options.resolveTextModel || ((selection) => selection),
        publish: (request, context) => wordpressApplication.publish(request, context),
        validatePublicationRequest: (request) => wordpressApplication.validate(request)
    });

    return Object.freeze({ corePluginRegistry, corePluginRuntime, pluginHost: corePluginRuntime.host, application });
}

module.exports = { REQUIRED_PLUGIN_IDS, createGeneratedWordPressPublishingSystem };
