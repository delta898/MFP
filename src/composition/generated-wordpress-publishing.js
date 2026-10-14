'use strict';

const { createGeneratedWordPressPublishingApplication } = require('../applications/generated-wordpress-publishing');
const { createWordPressPublishingApplication } = require('../applications/wordpress-publishing');
const { createPluginHost } = require('../platform/plugin-host');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { composePlugins } = require('./plugin-runtime-composition');

const REQUIRED_PLUGIN_IDS = Object.freeze(['content-generator', 'wordpress-publisher']);

function createGeneratedWordPressPublishingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRegistry || createCorePluginRegistry();
    const dependenciesByPluginId = options.pluginDependencies || {};
    const plugins = composePlugins({
        catalog: corePluginRegistry,
        pluginIds: REQUIRED_PLUGIN_IDS,
        dependenciesByPluginId
    });
    const pluginHost = createPluginHost({ plugins });
    const executeOperation = (pluginId, operationId, input, context) => (
        pluginHost.execute(pluginId, operationId, input, context)
    );
    const wordpressApplication = createWordPressPublishingApplication({ executeOperation });
    const application = createGeneratedWordPressPublishingApplication({
        executeOperation,
        publish: (request, context) => wordpressApplication.publish(request, context),
        validatePublicationRequest: (request) => wordpressApplication.validate(request)
    });

    return Object.freeze({ corePluginRegistry, pluginHost, application });
}

module.exports = { REQUIRED_PLUGIN_IDS, createGeneratedWordPressPublishingSystem };
