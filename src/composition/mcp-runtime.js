const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { createAgentRuntime } = require('../host/agent/runtime');
const { ConfirmationStore } = require('../adapters/storage/confirmations/confirmation-store');
const { createCapabilityRuntime } = require('./capability-runtime');
const { createKnowledgeRuntime } = require('./knowledge-runtime');
const { createMcpPrototypeAdapter } = require('../adapters/messaging/mcp/prototype-adapter');

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
    const capabilityDependencies = options.capabilityDependencies || {};
    const resolveWritableConfigPath = capabilityDependencies.resolveWritableConfigPath
        || (() => CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS?.configFile || path.join(process.cwd(), 'config', 'config.json'));
    const buildDefaultConfigTemplate = capabilityDependencies.buildDefaultConfigTemplate || (() => '{}');
    const syncAutoRunnerWithConfig = capabilityDependencies.syncAutoRunnerWithConfig || (() => { });
    const resolveNaverAutoCategoryCatalog = capabilityDependencies.resolveNaverAutoCategoryCatalog || null;

    const knowledgeRuntime = createKnowledgeRuntime({ CONFIG, License, Logger: NullLogger, axios });
    const capabilityRegistry = createCapabilityRuntime({
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
