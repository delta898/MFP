const http = require('http');
const crypto = require('crypto');

const CONFIG = require('../config-loader');
const Logger = require('../logger');
const { createMcpPrototypeRuntime } = require('./runtime-factory');
const { ensureRuntimeRemoteMcpConfig } = require('./remote-config');
const {
    SUPPORTED_PROTOCOL_VERSION,
    createServerState,
    buildJsonRpcError,
    handleProtocolMessage
} = require('./protocol');

const DEFAULT_HTTP_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 4578;
const DEFAULT_HTTP_PATH = '/mcp';
const SESSION_HEADER = 'mcp-session-id';
const PROTOCOL_HEADER = 'mcp-protocol-version';
const JSON_RPC_CONTENT_TYPE = 'application/json; charset=utf-8';
const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';
const ACCEPTED_PROTOCOL_VERSIONS = new Set([
    '2025-03-26',
    SUPPORTED_PROTOCOL_VERSION,
    '2025-11-25'
]);

function normalizeBoolean(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['0', 'false', 'off', 'no', 'disabled'].includes(raw)) return false;
    if (['1', 'true', 'on', 'yes', 'enabled'].includes(raw)) return true;
    return defaultValue;
}

function normalizePort(value, fallback = DEFAULT_HTTP_PORT) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) return fallback;
    return parsed;
}

function normalizePathname(value = DEFAULT_HTTP_PATH) {
    const raw = String(value || DEFAULT_HTTP_PATH).trim() || DEFAULT_HTTP_PATH;
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function normalizeAllowedOrigins(value = []) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}

function normalizeAuthMode(mode = '', authToken = '') {
    const raw = String(mode || '').trim().toLowerCase();
    if (raw === 'bearer') return 'bearer';
    if (raw === 'none') return 'none';
    return authToken ? 'bearer' : 'none';
}

function isLoopbackHostname(hostname = '') {
    const normalized = String(hostname || '').trim().toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function parseOriginHostname(origin = '') {
    try {
        return new URL(origin).hostname;
    } catch (_error) {
        return '';
    }
}

function parseRequestHostname(request = {}) {
    const hostHeader = String(request.headers?.host || '').trim();
    if (!hostHeader) return '';
    if (hostHeader.startsWith('[')) {
        const match = hostHeader.match(/^\[([^\]]+)\]/);
        return String(match?.[1] || '').trim().toLowerCase();
    }
    return hostHeader.split(':')[0].trim().toLowerCase();
}

function resolveRemoteMcpConfig(overrides = {}) {
    const runtimeConfig = ensureRuntimeRemoteMcpConfig(CONFIG, {
        enabled: overrides.enabled,
        host: overrides.host || process.env.MCP_REMOTE_HOST,
        port: overrides.port || process.env.MCP_REMOTE_PORT,
        path: overrides.path || process.env.MCP_REMOTE_PATH,
        authMode: overrides.authMode,
        authToken: overrides.authToken || process.env.MCP_REMOTE_AUTH_TOKEN
    });

    return {
        enabled: normalizeBoolean(runtimeConfig.enabled, true),
        host: String(runtimeConfig.host || DEFAULT_HTTP_HOST).trim() || DEFAULT_HTTP_HOST,
        port: normalizePort(runtimeConfig.port, DEFAULT_HTTP_PORT),
        path: normalizePathname(runtimeConfig.path || DEFAULT_HTTP_PATH),
        authMode: normalizeAuthMode(runtimeConfig.authMode, runtimeConfig.authToken),
        authToken: String(runtimeConfig.authToken || '').trim(),
        allowedOrigins: normalizeAllowedOrigins(overrides.allowedOrigins ?? CONFIG.mcp?.remote?.allowed_origins),
        debug: normalizeBoolean(overrides.debug ?? process.env.DEBUG_MCP, false)
    };
}

function buildTraceWriter(options = {}) {
    const debugEnabled = options.debug === true;
    const logger = options.logger || Logger;

    return function traceMcp(label, payload = {}) {
        if (!debugEnabled) return;
        const serialized = (() => {
            try {
                return JSON.stringify(payload);
            } catch (_error) {
                return String(payload);
            }
        })();

        if (logger && typeof logger.debug === 'function') {
            logger.debug(`[mcp:http:${label}] ${serialized}`);
            return;
        }
        console.error(`[mcp:http:${label}] ${serialized}`);
    };
}

function writeJson(res, statusCode, payload = null, headers = {}) {
    const responseHeaders = {
        ...headers
    };

    if (payload !== null) {
        responseHeaders['Content-Type'] = JSON_RPC_CONTENT_TYPE;
    }

    res.writeHead(statusCode, responseHeaders);
    if (payload === null) {
        res.end();
        return;
    }

    res.end(JSON.stringify(payload));
}

function applyCorsHeaders(request, responseHeaders, config) {
    const origin = String(request.headers?.origin || '').trim();
    if (!origin) return responseHeaders;
    if (!isAllowedOrigin(origin, request, config)) {
        return responseHeaders;
    }

    responseHeaders['Access-Control-Allow-Origin'] = origin;
    responseHeaders.Vary = responseHeaders.Vary ? `${responseHeaders.Vary}, Origin` : 'Origin';
    responseHeaders['Access-Control-Allow-Headers'] = [
        'Content-Type',
        'Accept',
        'Authorization',
        PROTOCOL_HEADER,
        SESSION_HEADER
    ].join(', ');
    responseHeaders['Access-Control-Allow-Methods'] = 'POST, DELETE, OPTIONS';
    return responseHeaders;
}

function isAllowedOrigin(origin = '', request = {}, config = {}) {
    if (!origin) return true;

    const configuredOrigins = Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [];
    if (configuredOrigins.includes(origin)) return true;

    const originHostname = parseOriginHostname(origin);
    if (!originHostname) return false;
    if (isLoopbackHostname(originHostname)) return true;

    const requestHostname = parseRequestHostname(request);
    return Boolean(requestHostname && requestHostname === originHostname);
}

function readJsonBody(req, limitBytes = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];

        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limitBytes) {
                reject(new Error('요청 본문이 너무 큽니다.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8').trim();
                if (!raw) {
                    reject(new Error('JSON 본문이 비어 있습니다.'));
                    return;
                }
                resolve(JSON.parse(raw));
            } catch (_error) {
                reject(new Error('JSON 본문 파싱에 실패했습니다.'));
            }
        });

        req.on('error', reject);
    });
}

function extractBearerToken(request = {}) {
    const raw = String(request.headers?.authorization || '').trim();
    const match = raw.match(/^Bearer\s+(.+)$/i);
    return String(match?.[1] || '').trim();
}

function validateProtocolVersion(request = {}) {
    const raw = String(request.headers?.[PROTOCOL_HEADER] || '').trim();
    if (!raw) {
        return { ok: true, requestedVersion: '' };
    }
    if (ACCEPTED_PROTOCOL_VERSIONS.has(raw)) {
        return { ok: true, requestedVersion: raw };
    }
    return {
        ok: false,
        requestedVersion: raw,
        message: `Unsupported MCP protocol version: ${raw}`
    };
}

function createSessionStore() {
    const sessions = new Map();

    function createSession() {
        const sessionId = crypto.randomUUID();
        const state = createServerState();
        const session = {
            id: sessionId,
            state,
            callContext: {
                user_id: `mcp-http:${sessionId}`,
                conversation_id: `mcp:http:${sessionId}`
            }
        };
        sessions.set(sessionId, session);
        return session;
    }

    return {
        createSession,
        getSession(sessionId = '') {
            return sessions.get(String(sessionId || '').trim()) || null;
        },
        deleteSession(sessionId = '') {
            return sessions.delete(String(sessionId || '').trim());
        }
    };
}

function resolveSession(request = {}, sessionStore) {
    const sessionId = String(request.headers?.[SESSION_HEADER] || '').trim();
    if (!sessionId) {
        return { ok: false, code: 400, payload: buildJsonRpcError(null, -32001, 'Missing MCP session id.') };
    }

    const session = sessionStore.getSession(sessionId);
    if (!session) {
        return { ok: false, code: 404, payload: buildJsonRpcError(null, -32001, 'Unknown MCP session id.') };
    }

    return { ok: true, session };
}

function buildBaseResponseHeaders(request, config, extraHeaders = {}) {
    const headers = {
        Allow: 'POST, DELETE, OPTIONS',
        [PROTOCOL_HEADER]: SUPPORTED_PROTOCOL_VERSION,
        ...extraHeaders
    };
    return applyCorsHeaders(request, headers, config);
}

function createHttpMcpHandler(options = {}) {
    const config = resolveRemoteMcpConfig(options.config || options);
    const services = options.services || createMcpPrototypeRuntime();
    const sessionStore = createSessionStore();
    const traceMcp = buildTraceWriter({
        debug: config.debug || options.debug === true,
        logger: options.logger || Logger
    });

    async function handleMcpRequest(req, res) {
        const method = String(req.method || 'GET').toUpperCase();
        const url = new URL(String(req.url || config.path), 'http://127.0.0.1');
        if (url.pathname !== config.path) {
            return false;
        }

        const origin = String(req.headers?.origin || '').trim();
        if (origin && !isAllowedOrigin(origin, req, config)) {
            writeJson(res, 403, buildJsonRpcError(null, -32003, 'Origin not allowed.'), buildBaseResponseHeaders(req, config));
            return true;
        }

        if (method === 'OPTIONS') {
            writeJson(res, 204, null, buildBaseResponseHeaders(req, config));
            return true;
        }

        if (config.authMode === 'bearer') {
            const token = extractBearerToken(req);
            if (!token || token !== config.authToken) {
                writeJson(res, 401, buildJsonRpcError(null, -32003, 'Unauthorized.'), buildBaseResponseHeaders(req, config, {
                    'WWW-Authenticate': 'Bearer realm="bloggenius-mcp"'
                }));
                return true;
            }
        }

        if (method === 'DELETE') {
            const resolved = resolveSession(req, sessionStore);
            if (!resolved.ok) {
                writeJson(res, resolved.code, resolved.payload, buildBaseResponseHeaders(req, config));
                return true;
            }

            sessionStore.deleteSession(resolved.session.id);
            writeJson(res, 204, null, buildBaseResponseHeaders(req, config));
            return true;
        }

        if (method !== 'POST') {
            writeJson(res, 405, buildJsonRpcError(null, -32601, 'Method not allowed.'), buildBaseResponseHeaders(req, config));
            return true;
        }

        const protocolCheck = validateProtocolVersion(req);
        if (!protocolCheck.ok) {
            writeJson(res, 400, buildJsonRpcError(null, -32000, protocolCheck.message), buildBaseResponseHeaders(req, config));
            return true;
        }

        const acceptHeader = String(req.headers?.accept || '').trim();
        if (acceptHeader && !acceptHeader.includes('application/json') && !acceptHeader.includes(EVENT_STREAM_CONTENT_TYPE) && acceptHeader !== '*/*') {
            writeJson(res, 406, buildJsonRpcError(null, -32000, 'Accept header must allow application/json.'), buildBaseResponseHeaders(req, config));
            return true;
        }

        let message;
        try {
            message = await readJsonBody(req);
        } catch (error) {
            writeJson(res, 400, buildJsonRpcError(null, -32700, error.message), buildBaseResponseHeaders(req, config));
            return true;
        }

        traceMcp('request', {
            method,
            path: config.path,
            session: req.headers?.[SESSION_HEADER] || '',
            body: message
        });

        let session = null;
        let responseHeaders = buildBaseResponseHeaders(req, config);

        const rpcMethod = String(message?.method || '').trim();
        if (rpcMethod === 'initialize') {
            session = createSessionStoreSession(sessionStore, req);
            responseHeaders[SESSION_HEADER] = session.id;
        } else {
            const resolved = resolveSession(req, sessionStore);
            if (!resolved.ok) {
                writeJson(res, resolved.code, resolved.payload, responseHeaders);
                return true;
            }
            session = resolved.session;
            responseHeaders[SESSION_HEADER] = session.id;
        }

        const payload = await handleProtocolMessage(message, session.state, services, {
            protocolVersion: protocolCheck.requestedVersion || SUPPORTED_PROTOCOL_VERSION,
            callContext: session.callContext
        });

        traceMcp('response', {
            session: session.id,
            body: payload
        });

        if (payload === null) {
            writeJson(res, 202, null, responseHeaders);
            return true;
        }

        writeJson(res, 200, payload, responseHeaders);
        return true;
    }

    return {
        config,
        services,
        sessionStore,
        async handle(req, res) {
            try {
                return await handleMcpRequest(req, res);
            } catch (error) {
                const headers = buildBaseResponseHeaders(req, config);
                writeJson(res, 500, buildJsonRpcError(null, -32000, error.message || 'Unhandled MCP HTTP server error.'), headers);
                return true;
            }
        }
    };
}

function createSessionStoreSession(sessionStore) {
    return sessionStore.createSession();
}

async function startHttpMcpServer(options = {}) {
    const logger = options.logger || Logger;
    const handler = createHttpMcpHandler(options);
    const host = handler.config.host || DEFAULT_HTTP_HOST;
    const port = normalizePort(options.port ?? handler.config.port, handler.config.port);

    const server = http.createServer(async (req, res) => {
        const handled = await handler.handle(req, res);
        if (!handled) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });

    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : port;
    const originHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    const endpoint = `http://${originHost}:${resolvedPort}${handler.config.path}`;

    if (logger && typeof logger.info === 'function') {
        logger.info(`MCP HTTP server listening at ${endpoint}`);
    }

    return {
        server,
        host,
        port: resolvedPort,
        path: handler.config.path,
        endpoint,
        close() {
            return new Promise((resolveClose) => {
                server.close(() => resolveClose());
            });
        }
    };
}

if (require.main === module) {
    startHttpMcpServer().catch((error) => {
        Logger.error(`Failed to start MCP HTTP server: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_HTTP_HOST,
    DEFAULT_HTTP_PATH,
    DEFAULT_HTTP_PORT,
    SESSION_HEADER,
    PROTOCOL_HEADER,
    createHttpMcpHandler,
    resolveRemoteMcpConfig,
    startHttpMcpServer
};
