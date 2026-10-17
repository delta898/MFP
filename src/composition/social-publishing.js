'use strict';

const { createSocialPublisherAdapter } = require('../adapters/plugins/social-publisher');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

function createSocialPublishingSystem(options = {}) {
    const corePluginRuntime = options.corePluginRuntime || createCorePluginRuntime();
    const getCredentials = options.getCredentials || (async () => ({
        apiKey: String(options.CONFIG?.BUFFER_API_KEY || '').trim()
    }));
    const { executeOperation } = corePluginRuntime.ensurePlugins(['social-publisher'], {
        'social-publisher': { getCredentials, axios: options.axios, endpoint: options.endpoint }
    });
    const publisher = createSocialPublisherAdapter({ executeOperation });
    return Object.freeze({ corePluginRuntime, pluginHost: corePluginRuntime.host, publisher });
}

module.exports = { createSocialPublishingSystem };
