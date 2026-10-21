'use strict';

const path = require('path');
const { createAgentControlPlane } = require('./agent-control-plane');
const { createMcpAgentActionAdapter } = require('../adapters/messaging/mcp/agent-action-adapter');
const GoogleSheets = require('../adapters/storage/google-sheets/operations');

function createMcpAgentRuntime(options = {}) {
    const confirmationPersistPath = options.confirmationPersistPath
        || process.env.MCP_CONFIRMATION_STORE_PATH
        || path.resolve(__dirname, '..', '..', '.tmp', 'mcp-confirmations.json');
    if (!options.GoogleSheets && !options.capabilityDependencies?.GoogleSheets) {
        GoogleSheets.configureRuntime({ config: options.config || {} });
    }
    const controlPlane = createAgentControlPlane({
        ...options,
        GoogleSheets: options.GoogleSheets || options.capabilityDependencies?.GoogleSheets || GoogleSheets,
        confirmationPersistPath
    });
    const adapter = createMcpAgentActionAdapter(controlPlane);
    return { ...controlPlane, adapter };
}

module.exports = { createMcpAgentRuntime };
