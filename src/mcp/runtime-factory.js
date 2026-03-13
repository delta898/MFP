const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG = require('../config-loader');
const { createAgentRuntime } = require('../agent/runtime');
const { createCapabilityRegistry } = require('../capabilities');
const { getRuntimeHooks } = require('../runtime-hooks');
const { createMcpPrototypeAdapter } = require('./prototype-adapter');

const NullLogger = {
    debug() { },
    info() { },
    warn() { },
    error() { }
};

function createMcpPrototypeRuntime() {
    const hooks = getRuntimeHooks();
    const resolveWritableConfigPath = hooks.resolveWritableConfigPath
        || (() => CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS?.configFile || path.join(process.cwd(), 'config', 'config.json'));
    const buildDefaultConfigTemplate = hooks.buildDefaultConfigTemplate || (() => '{}');
    const syncAutoRunnerWithConfig = hooks.syncAutoRunnerWithConfig || (() => { });
    const syncShoppingAutoRunnerWithConfig = hooks.syncShoppingAutoRunnerWithConfig || (() => { });
    const resolveNaverAutoCategoryCatalog = hooks.resolveNaverAutoCategoryCatalog || null;

    const capabilityRegistry = createCapabilityRegistry({
        fs,
        path,
        axios,
        Logger: NullLogger,
        CONFIG,
        eventStore: null,
        resolveWritableConfigPath,
        buildDefaultConfigTemplate,
        syncAutoRunnerWithConfig,
        syncShoppingAutoRunnerWithConfig,
        resolveNaverAutoCategoryCatalog
    });

    const runtime = createAgentRuntime({
        capabilityRegistry,
        eventStore: null
    });

    const adapter = createMcpPrototypeAdapter({
        capabilityRegistry,
        runtime
    });

    return {
        capabilityRegistry,
        runtime,
        adapter
    };
}

module.exports = {
    createMcpPrototypeRuntime
};
