'use strict';

const { createBlogWritingApplication } = require('../applications/blog-writing');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

const REQUIRED_PLUGIN_IDS = Object.freeze(['content-generator', 'wordpress-publisher']);

function createBlogWritingSystem(options = {}) {
    const corePluginRegistry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime({ registry: corePluginRegistry });
    const { executeOperation } = corePluginRuntime.ensurePlugins(REQUIRED_PLUGIN_IDS, options.pluginDependencies || {});
    const application = createBlogWritingApplication({ executeOperation });
    return Object.freeze({ corePluginRegistry, corePluginRuntime, pluginHost: corePluginRuntime.host, application });
}

module.exports = { REQUIRED_PLUGIN_IDS, createBlogWritingSystem };
