const crypto = require('crypto');

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
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return fallback;
    return parsed;
}

function normalizeRemoteMcpPath(input, fallback = DEFAULT_REMOTE_MCP_PATH) {
    const raw = String(input || '').trim();
    if (!raw) return fallback;
    const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
    return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed;
}

function normalizeRemoteMcpAuthMode(input, fallback = DEFAULT_REMOTE_MCP_AUTH_MODE) {
    const raw = String(input || '').trim().toLowerCase();
    if (raw === 'none') return 'none';
    if (raw === 'bearer') return 'bearer';
    return fallback;
}

function generateRemoteMcpBearerToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function ensureRuntimeRemoteMcpConfig(config = {}, overrides = {}) {
    const currentRemote = config.mcp?.remote && typeof config.mcp.remote === 'object'
        ? config.mcp.remote
        : {};
    const currentAuth = currentRemote.auth && typeof currentRemote.auth === 'object'
        ? currentRemote.auth
        : {};

    const enabled = normalizeBoolean(
        overrides.enabled ?? config.MCP_REMOTE_ENABLED ?? currentRemote.enabled,
        DEFAULT_REMOTE_MCP_ENABLED
    );
    const host = normalizeRemoteMcpHost(
        overrides.host ?? config.MCP_REMOTE_HOST ?? currentRemote.host,
        DEFAULT_REMOTE_MCP_HOST
    );
    const port = normalizeRemoteMcpPort(
        overrides.port ?? config.MCP_REMOTE_PORT ?? currentRemote.port,
        DEFAULT_REMOTE_MCP_PORT
    );
    const path = normalizeRemoteMcpPath(
        overrides.path ?? config.MCP_REMOTE_PATH ?? currentRemote.path,
        DEFAULT_REMOTE_MCP_PATH
    );
    let authToken = String(
        overrides.authToken ?? config.MCP_REMOTE_AUTH_TOKEN ?? currentAuth.bearer_token ?? ''
    ).trim();
    const explicitAuthMode = normalizeRemoteMcpAuthMode(
        overrides.authMode ?? config.MCP_REMOTE_AUTH_MODE ?? currentAuth.mode,
        ''
    );
    if (explicitAuthMode === 'none' && overrides.authToken === undefined) {
        authToken = '';
    }
    let generatedToken = false;
    if (!authToken && explicitAuthMode !== 'none' && overrides.generateTokenIfMissing === true) {
        authToken = generateRemoteMcpBearerToken();
        generatedToken = true;
    }
    const authMode = authToken ? DEFAULT_REMOTE_MCP_AUTH_MODE : 'none';

    if (!config.mcp || typeof config.mcp !== 'object') config.mcp = {};
    if (!config.mcp.remote || typeof config.mcp.remote !== 'object') config.mcp.remote = {};
    if (!config.mcp.remote.auth || typeof config.mcp.remote.auth !== 'object') config.mcp.remote.auth = {};

    config.mcp.remote.enabled = enabled;
    config.mcp.remote.host = host;
    config.mcp.remote.port = port;
    config.mcp.remote.path = path;
    config.mcp.remote.auth.bearer_token = authToken;
    if ('mode' in config.mcp.remote.auth) {
        delete config.mcp.remote.auth.mode;
    }

    config.MCP_REMOTE_ENABLED = enabled;
    config.MCP_REMOTE_HOST = host;
    config.MCP_REMOTE_PORT = port;
    config.MCP_REMOTE_PATH = path;
    config.MCP_REMOTE_AUTH_MODE = authMode;
    config.MCP_REMOTE_AUTH_TOKEN = authToken;

    return {
        enabled,
        host,
        port,
        path,
        authMode,
        authToken,
        generatedToken
    };
}

module.exports = {
    DEFAULT_REMOTE_MCP_ENABLED,
    DEFAULT_REMOTE_MCP_AUTH_MODE,
    DEFAULT_REMOTE_MCP_HOST,
    DEFAULT_REMOTE_MCP_PATH,
    DEFAULT_REMOTE_MCP_PORT,
    ensureRuntimeRemoteMcpConfig,
    generateRemoteMcpBearerToken,
    normalizeRemoteMcpAuthMode,
    normalizeRemoteMcpHost,
    normalizeRemoteMcpPath,
    normalizeRemoteMcpPort
};
