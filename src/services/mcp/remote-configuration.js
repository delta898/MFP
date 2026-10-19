'use strict';

const DEFAULT_REMOTE_MCP_ENABLED = false;
const DEFAULT_REMOTE_MCP_HOST = '127.0.0.1';
const DEFAULT_REMOTE_MCP_PORT = 4578;
const DEFAULT_REMOTE_MCP_PATH = '/mcp';
const DEFAULT_REMOTE_MCP_AUTH_MODE = 'bearer';

function normalizeBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
    return fallback;
}

function normalizeRemoteMcpHost(input, fallback = DEFAULT_REMOTE_MCP_HOST) {
    const raw = String(input || '').trim();
    if (!raw) return fallback;
    if (raw.toLowerCase() === 'localhost') return '127.0.0.1';
    if (raw === '0.0.0.0' || raw === '127.0.0.1') return raw;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return raw;
    return fallback;
}

function normalizeRemoteMcpPort(input, fallback = DEFAULT_REMOTE_MCP_PORT) {
    const parsed = parseInt(String(input || ''), 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function normalizeRemoteMcpPath(input, fallback = DEFAULT_REMOTE_MCP_PATH) {
    const raw = String(input || '').trim();
    if (!raw) return fallback;
    const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
    return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed;
}

function normalizeRemoteMcpAuthMode(input, fallback = DEFAULT_REMOTE_MCP_AUTH_MODE) {
    const raw = String(input || '').trim().toLowerCase();
    return raw === 'none' || raw === 'bearer' ? raw : fallback;
}

function resolveRemoteMcpConfiguration(config = {}, overrides = {}) {
    const remote = config.mcp?.remote && typeof config.mcp.remote === 'object' ? config.mcp.remote : {};
    const auth = remote.auth && typeof remote.auth === 'object' ? remote.auth : {};
    const enabled = normalizeBoolean(overrides.enabled ?? config.MCP_REMOTE_ENABLED ?? remote.enabled, DEFAULT_REMOTE_MCP_ENABLED);
    const host = normalizeRemoteMcpHost(overrides.host ?? config.MCP_REMOTE_HOST ?? remote.host);
    const port = normalizeRemoteMcpPort(overrides.port ?? config.MCP_REMOTE_PORT ?? remote.port);
    const path = normalizeRemoteMcpPath(overrides.path ?? config.MCP_REMOTE_PATH ?? remote.path);
    let authToken = String(overrides.authToken ?? config.MCP_REMOTE_AUTH_TOKEN ?? auth.bearer_token ?? '').trim();
    const explicitAuthMode = normalizeRemoteMcpAuthMode(overrides.authMode ?? config.MCP_REMOTE_AUTH_MODE ?? auth.mode, '');
    if (explicitAuthMode === 'none' && overrides.authToken === undefined) authToken = '';
    const authMode = authToken ? DEFAULT_REMOTE_MCP_AUTH_MODE : 'none';
    return { enabled, host, port, path, authMode, authToken, explicitAuthMode };
}

module.exports = {
    DEFAULT_REMOTE_MCP_ENABLED,
    DEFAULT_REMOTE_MCP_AUTH_MODE,
    DEFAULT_REMOTE_MCP_HOST,
    DEFAULT_REMOTE_MCP_PATH,
    DEFAULT_REMOTE_MCP_PORT,
    normalizeBoolean,
    normalizeRemoteMcpAuthMode,
    normalizeRemoteMcpHost,
    normalizeRemoteMcpPath,
    normalizeRemoteMcpPort,
    resolveRemoteMcpConfiguration
};
