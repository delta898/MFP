'use strict';

const { createBlogWritingApplication } = require('../applications/blog/writing/application');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

const REQUIRED_PLUGIN_IDS = Object.freeze(['ai-gateway', 'wordpress-publisher']);

function createBlogWritingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime({ registry: corePluginRegistry });
    const { executeOperation } = corePluginRuntime.ensurePlugins(REQUIRED_PLUGIN_IDS, options.pluginDependencies || {});
    const application = createBlogWritingApplication({
        executeOperation,
        getTextModel: options.getTextModel,
        getImageModel: options.getImageModel,
        textModel: options.textModel,
        imageModel: options.imageModel,
        resolveTextModel: options.resolveTextModel,
        resolveImageModel: options.resolveImageModel,
        supportsJson: options.supportsJson
    });
    return Object.freeze({ corePluginRegistry, corePluginRuntime, pluginHost: corePluginRuntime.host, application });
}

module.exports = { REQUIRED_PLUGIN_IDS, createBlogWritingSystem };
