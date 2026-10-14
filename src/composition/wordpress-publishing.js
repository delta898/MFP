'use strict';

const { createPluginHost } = require('../platform/plugin-host');
const { createWordPressPublishingApplication } = require('../applications/wordpress-publishing');
const { createCorePluginRegistry } = require('./core-plugin-registry');

function createWordPressPublishingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRegistry || createCorePluginRegistry();
    if (typeof corePluginRegistry?.createPlugins !== 'function' || typeof corePluginRegistry?.list !== 'function') {
        throw new TypeError('Composition requires a valid Core Plugin registry.');
    }
    const plugins = corePluginRegistry.createPlugins(options.pluginDependencies || {});
    if (!plugins.some((plugin) => plugin.id === 'wordpress-publisher')) {
        throw new TypeError('WordPress publishing Application requires the wordpress-publisher Core Plugin.');
    }
    const pluginHost = createPluginHost({ plugins });
    const application = createWordPressPublishingApplication({
        executeOperation: (pluginId, operationId, input, context) => (
            pluginHost.execute(pluginId, operationId, input, context)
        )
    });
    return Object.freeze({ corePluginRegistry, pluginHost, application });
}

module.exports = { createWordPressPublishingSystem };
