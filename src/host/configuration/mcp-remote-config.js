'use strict';

const crypto = require('crypto');
const remoteConfiguration = require('../../services/mcp/remote-configuration');

function generateRemoteMcpBearerToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function ensureRuntimeRemoteMcpConfig(config = {}, overrides = {}) {
    const resolved = remoteConfiguration.resolveRemoteMcpConfiguration(config, overrides);
    let authToken = resolved.authToken;
    let generatedToken = false;
    if (!authToken && resolved.explicitAuthMode !== 'none' && overrides.generateTokenIfMissing === true) {
        authToken = generateRemoteMcpBearerToken();
        generatedToken = true;
    }
    const authMode = authToken ? remoteConfiguration.DEFAULT_REMOTE_MCP_AUTH_MODE : 'none';

    if (!config.mcp || typeof config.mcp !== 'object') config.mcp = {};
    if (!config.mcp.remote || typeof config.mcp.remote !== 'object') config.mcp.remote = {};
    if (!config.mcp.remote.auth || typeof config.mcp.remote.auth !== 'object') config.mcp.remote.auth = {};
    Object.assign(config.mcp.remote, {
        enabled: resolved.enabled,
        host: resolved.host,
        port: resolved.port,
        path: resolved.path
    });
    config.mcp.remote.auth.bearer_token = authToken;
    delete config.mcp.remote.auth.mode;

    Object.assign(config, {
        MCP_REMOTE_ENABLED: resolved.enabled,
        MCP_REMOTE_HOST: resolved.host,
        MCP_REMOTE_PORT: resolved.port,
        MCP_REMOTE_PATH: resolved.path,
        MCP_REMOTE_AUTH_MODE: authMode,
        MCP_REMOTE_AUTH_TOKEN: authToken
    });

    const { explicitAuthMode, ...result } = resolved;
    return { ...result, authMode, authToken, generatedToken };
}

module.exports = {
    ...remoteConfiguration,
    ensureRuntimeRemoteMcpConfig,
    generateRemoteMcpBearerToken
};
