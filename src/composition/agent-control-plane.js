'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createAgentRuntime } = require('../host/agent/runtime');
const { ConfirmationStore } = require('../adapters/storage/confirmations/confirmation-store');
const { createCapabilityRuntime } = require('./capability-runtime');
const { createKnowledgeRuntime } = require('./knowledge-runtime');
const { createAiModelConfiguration } = require('./ai-model-configuration');
const { createMemoryRetrievalService } = require('../services/memory/retrieval-service');
const { getAgentEventStore } = require('../host/memory/runtime');

function createAgentControlPlane(options = {}) {
    const CONFIG = options.config || {};
    const License = options.License;
    if (!License) throw new Error('Agent control plane requires an injected licensing port.');
    const Logger = options.Logger || console;
    const dependencies = options.capabilityDependencies || {};
    const eventStore = options.eventStore === undefined
        ? getAgentEventStore({ baseDir: CONFIG.ROOT_DIR })
        : options.eventStore;
    const resolveWritableConfigPath = dependencies.resolveWritableConfigPath
        || (() => CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS?.configFile || path.join(process.cwd(), 'config', 'config.json'));

    const knowledgeRuntime = createKnowledgeRuntime({ CONFIG, License, Logger, axios });
    const capabilityRegistry = createCapabilityRuntime({
        ...knowledgeRuntime,
        fs,
        path,
        axios,
        Logger,
        CONFIG,
        License,
        GoogleSheets: options.GoogleSheets || dependencies.GoogleSheets || null,
        eventStore,
        resolveWritableConfigPath,
        buildDefaultConfigTemplate: dependencies.buildDefaultConfigTemplate || (() => '{}'),
        syncAutoRunnerWithConfig: dependencies.syncAutoRunnerWithConfig || (() => { }),
        resolveNaverAutoCategoryCatalog: dependencies.resolveNaverAutoCategoryCatalog || null,
        modelConfiguration: dependencies.modelConfiguration || createAiModelConfiguration(),
        agentActionProviders: dependencies.agentActionProviders
    });
    const confirmationStore = options.confirmationStore || new ConfirmationStore({
        ...(options.confirmationPersistPath ? { persistPath: options.confirmationPersistPath } : {})
    });
    const runtime = createAgentRuntime({ capabilityRegistry, confirmationStore, eventStore, CONFIG, Logger });
    const retrieval = createMemoryRetrievalService({ eventStore, confirmationStore });

    return { capabilityRegistry, confirmationStore, eventStore, retrieval, runtime };
}

module.exports = { createAgentControlPlane };
