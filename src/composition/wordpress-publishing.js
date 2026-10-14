'use strict';

const { createWordPressPublishingApplication } = require('../applications/blog/publishing/wordpress');
const { createWordPressPublisherAdapter } = require('../adapters/plugins/wordpress-publisher');
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
    const dependencies = options.pluginDependencies || {};
    const { executeOperation } = corePluginRuntime.ensurePlugins(['wordpress-publisher'], {
        ...(dependencies['wordpress-publisher'] ? { 'wordpress-publisher': dependencies['wordpress-publisher'] } : {})
    });
    const publisher = createWordPressPublisherAdapter({ executeOperation });
    const application = createWordPressPublishingApplication({ publisher });
    return Object.freeze({ corePluginRegistry, corePluginRuntime, pluginHost: corePluginRuntime.host, publisher, application });
}

module.exports = { createWordPressPublishingSystem };
