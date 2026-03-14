const pkg = require('../../package.json');

const SUPPORTED_PROTOCOL_VERSION = '2025-11-05';

function createServerState() {
    return {
        initialized: false
    };
}

function buildJsonRpcResponse(id, result) {
    return {
        jsonrpc: '2.0',
        id,
        result
    };
}

function buildJsonRpcError(id, code, message, data = undefined) {
    const payload = {
        jsonrpc: '2.0',
        id: id === undefined ? null : id,
        error: {
            code,
            message
        }
    };

    if (data !== undefined) {
        payload.error.data = data;
    }

    return payload;
}

function buildToolResultPayload(result = {}) {
    const ok = result?.ok !== false;
    const summary = (() => {
        if (ok && result?.status === 'needs_clarification') {
            return String(result?.message || 'More information is needed before execution.').trim();
        }
        if (ok) {
            return `Tool completed: ${result.status || 'ok'}`;
        }
        return `Tool failed: ${Array.isArray(result?.errors) ? result.errors.join('; ') : (result?.message || 'error')}`;
    })();

    return {
        content: [
            {
                type: 'text',
                text: summary
            }
        ],
        structuredContent: result,
        isError: !ok
    };
}

function resolveServerInfo(options = {}) {
    const serverInfo = options.serverInfo && typeof options.serverInfo === 'object'
        ? options.serverInfo
        : {};

    return {
        name: String(serverInfo.name || 'naver-auto-blog-mcp-prototype').trim() || 'naver-auto-blog-mcp-prototype',
        version: String(serverInfo.version || pkg.version).trim() || pkg.version
    };
}

function buildInitializeResult(params = {}, options = {}) {
    const requestedVersion = String(params.protocolVersion || '').trim();

    return {
        protocolVersion: requestedVersion || String(options.protocolVersion || SUPPORTED_PROTOCOL_VERSION),
        capabilities: {
            tools: {
                listChanged: false
            }
        },
        serverInfo: resolveServerInfo(options)
    };
}

function buildNotificationResult() {
    return null;
}

function buildNotificationSafeError(id, code, message, data = undefined) {
    if (id === undefined) {
        return buildNotificationResult();
    }
    return buildJsonRpcError(id, code, message, data);
}

async function handleProtocolMessage(message = {}, runtimeState = {}, services = {}, options = {}) {
    const { adapter } = services;
    const id = message?.id;
    const method = String(message?.method || '').trim();
    const params = message?.params && typeof message.params === 'object' ? message.params : {};

    if (Array.isArray(message)) {
        return buildNotificationSafeError(id, -32600, 'Batch requests are not supported.');
    }

    if (!method) {
        return buildNotificationSafeError(id, -32600, 'Missing method.');
    }

    if (method === 'initialize') {
        runtimeState.initialized = true;
        return buildJsonRpcResponse(id, buildInitializeResult(params, options));
    }

    if (method === 'notifications/initialized') {
        runtimeState.initialized = true;
        return buildNotificationResult();
    }

    if (method === 'ping') {
        if (id === undefined) return buildNotificationResult();
        return buildJsonRpcResponse(id, {});
    }

    if (!runtimeState.initialized) {
        return buildNotificationSafeError(id, -32002, 'Server not initialized.');
    }

    if (method === 'tools/list') {
        if (id === undefined) return buildNotificationResult();
        return buildJsonRpcResponse(id, {
            tools: adapter.listTools()
        });
    }

    if (method === 'tools/call') {
        if (id === undefined) {
            return buildNotificationResult();
        }

        try {
            const result = await adapter.callTool({
                name: params.name,
                arguments: params.arguments || {}
            }, options.callContext || {});
            return buildJsonRpcResponse(id, buildToolResultPayload(result));
        } catch (error) {
            return buildJsonRpcError(id, -32000, error.message || 'Tool call failed.');
        }
    }

    return buildNotificationSafeError(id, -32601, `Method not found: ${method}`);
}

module.exports = {
    SUPPORTED_PROTOCOL_VERSION,
    createServerState,
    buildJsonRpcResponse,
    buildJsonRpcError,
    buildToolResultPayload,
    handleProtocolMessage
};
