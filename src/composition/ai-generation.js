'use strict';

const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createAiGatewayAdapter } = require('../adapters/plugins/ai-gateway');
const { createAiGenerationService } = require('../services/ai/generation');

function createAiGenerationSystem(options = {}) {
    if (typeof options.getModelCatalog !== 'function') {
        throw new TypeError('AI Generation composition requires getModelCatalog().');
    }
    const corePluginRegistry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const corePluginRuntime = options.corePluginRuntime;
    if (!corePluginRuntime || typeof corePluginRuntime.ensurePlugins !== 'function') {
        throw new TypeError('AI Generation composition requires a shared Core Plugin runtime.');
    }
    const dependencies = options.pluginDependencies || {};
    const { executeOperation } = corePluginRuntime.ensurePlugins(['ai-gateway'], {
        ...(dependencies['ai-gateway'] ? { 'ai-gateway': dependencies['ai-gateway'] } : {})
    });
    const gateway = createAiGatewayAdapter({
        executeOperation,
        getSupport: options.getSupport,
        registerVerificationProfile: options.registerVerificationProfile,
        releaseVerificationProfile: options.releaseVerificationProfile
    });
    const service = createAiGenerationService({
        gateway,
        getModelCatalog: options.getModelCatalog,
        getConfiguredModels: options.getConfiguredModels,
        logger: options.logger
    });
    return Object.freeze({ corePluginRegistry, corePluginRuntime, pluginHost: corePluginRuntime.host, gateway, service });
}

module.exports = { createAiGenerationSystem };
