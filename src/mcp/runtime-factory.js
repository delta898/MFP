const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { createAgentRuntime } = require('../host/agent/runtime');
const { ConfirmationStore } = require('../adapters/storage/confirmations/confirmation-store');
const { createCapabilityRegistry } = require('../capabilities');
const { createKnowledgeRuntime } = require('../composition/knowledge-runtime');
const { getRuntimeHooks } = require('../runtime-hooks');
const { createMcpPrototypeAdapter } = require('./prototype-adapter');

const NullLogger = {
    debug() { },
    info() { },
    warn() { },
    error() { }
};

function createMcpPrototypeRuntime(options = {}) {
    const CONFIG = options.config || {};
    const License = options.License;
    if (!License) throw new Error('MCP runtime requires an injected licensing port.');
    const confirmationPersistPath = process.env.MCP_CONFIRMATION_STORE_PATH
        || path.resolve(__dirname, '..', '..', '.tmp', 'mcp-confirmations.json');
    const hooks = getRuntimeHooks();
    const resolveWritableConfigPath = hooks.resolveWritableConfigPath
        || (() => CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS?.configFile || path.join(process.cwd(), 'config', 'config.json'));
    const buildDefaultConfigTemplate = hooks.buildDefaultConfigTemplate || (() => '{}');
    const syncAutoRunnerWithConfig = hooks.syncAutoRunnerWithConfig || (() => { });
    const resolveNaverAutoCategoryCatalog = hooks.resolveNaverAutoCategoryCatalog || null;

    const knowledgeRuntime = createKnowledgeRuntime({ CONFIG, License, Logger: NullLogger, axios });
    const capabilityRegistry = createCapabilityRegistry({
        ...knowledgeRuntime,
        fs,
        path,
        axios,
        Logger: NullLogger,
        CONFIG,
        License,
        eventStore: null,
        resolveWritableConfigPath,
        buildDefaultConfigTemplate,
        syncAutoRunnerWithConfig,
        resolveNaverAutoCategoryCatalog
    });

    const runtime = createAgentRuntime({
        capabilityRegistry,
        confirmationStore: new ConfirmationStore({
            persistPath: confirmationPersistPath
        }),
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
