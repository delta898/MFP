const readline = require('readline');

const pkg = require('../../package.json');
const { createMcpPrototypeRuntime } = require('./runtime-factory');

const SUPPORTED_PROTOCOL_VERSION = '2025-11-05';

function createServerState() {
    return {
        initialized: false
    };
}

function writeMessage(message = {}) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeResponse(id, result) {
    writeMessage({
        jsonrpc: '2.0',
        id,
        result
    });
}

function writeError(id, code, message, data = undefined) {
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

    writeMessage(payload);
}

function buildToolResultPayload(result = {}) {
    const ok = result?.ok !== false;
    const summary = ok
        ? `Tool completed: ${result.status || 'ok'}`
        : `Tool failed: ${Array.isArray(result?.errors) ? result.errors.join('; ') : (result?.message || 'error')}`;

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

async function handleRequest(message = {}, runtimeState = {}, services = {}) {
    const { adapter } = services;
    const id = message.id;
    const method = String(message.method || '').trim();
    const params = message.params && typeof message.params === 'object' ? message.params : {};

    if (Array.isArray(message)) {
        writeError(id, -32600, 'Batch requests are not supported.');
        return;
    }

    if (!method) {
        writeError(id, -32600, 'Missing method.');
        return;
    }

    if (method === 'initialize') {
        runtimeState.initialized = true;
        const requestedVersion = String(params.protocolVersion || '').trim();
        writeResponse(id, {
            protocolVersion: requestedVersion || SUPPORTED_PROTOCOL_VERSION,
            capabilities: {
                tools: {
                    listChanged: false
                }
            },
            serverInfo: {
                name: 'naver-auto-blog-mcp-prototype',
                version: pkg.version
            }
        });
        return;
    }

    if (method === 'notifications/initialized') {
        runtimeState.initialized = true;
        return;
    }

    if (method === 'ping') {
        writeResponse(id, {});
        return;
    }

    if (!runtimeState.initialized) {
        writeError(id, -32002, 'Server not initialized.');
        return;
    }

    if (method === 'tools/list') {
        writeResponse(id, {
            tools: adapter.listTools()
        });
        return;
    }

    if (method === 'tools/call') {
        try {
            const result = await adapter.callTool({
                name: params.name,
                arguments: params.arguments || {}
            });
            writeResponse(id, buildToolResultPayload(result));
        } catch (error) {
            writeError(id, -32000, error.message || 'Tool call failed.');
        }
        return;
    }

    writeError(id, -32601, `Method not found: ${method}`);
}

async function startServer() {
    const services = createMcpPrototypeRuntime();
    const runtimeState = createServerState();
    const reader = readline.createInterface({
        input: process.stdin,
        crlfDelay: Infinity
    });

    reader.on('line', async (line) => {
        const raw = String(line || '').trim();
        if (!raw) return;

        let message = null;
        try {
            message = JSON.parse(raw);
        } catch (error) {
            writeError(null, -32700, 'Parse error.', { detail: error.message });
            return;
        }

        try {
            await handleRequest(message, runtimeState, services);
        } catch (error) {
            writeError(message?.id, -32000, error.message || 'Unhandled server error.');
        }
    });

    reader.on('close', () => {
        process.exit(0);
    });
}

if (require.main === module) {
    startServer().catch((error) => {
        writeError(null, -32000, error.message || 'Failed to start MCP server.');
        process.exit(1);
    });
}

module.exports = {
    startServer,
    handleRequest,
    buildToolResultPayload,
    SUPPORTED_PROTOCOL_VERSION
};
