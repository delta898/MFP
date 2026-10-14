'use strict';

const { createPluginHost } = require('../platform/plugin-host');
const { createWordPressPublishingApplication } = require('../applications/wordpress-publishing');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { composePlugins } = require('./plugin-runtime-composition');

function createWordPressPublishingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRegistry || createCorePluginRegistry();
    if (typeof corePluginRegistry?.createPlugin !== 'function' || typeof corePluginRegistry?.has !== 'function') {
        throw new TypeError('Composition requires a valid Core Plugin registry.');
    }
    if (!corePluginRegistry.has('wordpress-publisher')) {
        throw new TypeError('WordPress publishing Application requires the wordpress-publisher Core Plugin.');
    }
    const plugins = composePlugins({
        catalog: corePluginRegistry,
        pluginIds: ['wordpress-publisher'],
        dependenciesByPluginId: options.pluginDependencies || {}
    });
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
