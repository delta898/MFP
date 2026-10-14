'use strict';

const { createWordPressPublishingApplication } = require('../applications/wordpress-publishing');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

function createWordPressPublishingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime({ registry: corePluginRegistry });
    if (typeof corePluginRegistry?.createPlugin !== 'function' || typeof corePluginRegistry?.has !== 'function') {
        throw new TypeError('Composition requires a valid Core Plugin registry.');
    }
    if (!corePluginRegistry.has('wordpress-publisher')) {
        throw new TypeError('WordPress publishing Application requires the wordpress-publisher Core Plugin.');
    }
    const { executeOperation } = corePluginRuntime.ensurePlugins(['wordpress-publisher'], options.pluginDependencies || {});
    const application = createWordPressPublishingApplication({
        executeOperation
    });
    return Object.freeze({ corePluginRegistry, corePluginRuntime, pluginHost: corePluginRuntime.host, application });
}

module.exports = { createWordPressPublishingSystem };
