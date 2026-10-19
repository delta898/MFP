const readline = require('readline');
const {
    SUPPORTED_PROTOCOL_VERSION,
    createServerState,
    buildJsonRpcError,
    buildToolResultPayload,
    handleProtocolMessage
} = require('./protocol');
const DEBUG_MCP = String(process.env.DEBUG_MCP || '').trim() === '1';

function traceMcp(label, payload = {}) {
    if (!DEBUG_MCP) return;
    try {
        process.stderr.write(`[mcp:${label}] ${JSON.stringify(payload)}\n`);
    } catch (_error) {
        process.stderr.write(`[mcp:${label}] ${String(payload)}\n`);
    }
}

function writeMessage(message = {}) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeResponse(payload) {
    traceMcp('response', payload);
    writeMessage(payload);
}

function writeError(payload) {
    traceMcp('error', payload);
    writeMessage(payload);
}

async function handleRequest(message = {}, runtimeState = {}, services = {}, serverInfo = {}) {
    const payload = await handleProtocolMessage(message, runtimeState, services, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSION,
        serverInfo
    });

    if (!payload) {
        return;
    }

    if (payload.error) {
        writeError(payload);
        return;
    }

    writeResponse(payload);
}

async function startServer(options = {}) {
    const services = options.services;
    if (!services?.adapter) throw new Error('stdio MCP adapter requires composed runtime services.');
    const runtimeState = createServerState();
    const reader = readline.createInterface({
        input: process.stdin,
        crlfDelay: Infinity
    });

    reader.on('line', async (line) => {
        const raw = String(line || '').trim();
        if (!raw) return;
        traceMcp('request.raw', raw);

        let message = null;
        try {
            message = JSON.parse(raw);
        } catch (error) {
            writeError(buildJsonRpcError(null, -32700, 'Parse error.', { detail: error.message }));
            return;
        }
        traceMcp('request', message);

        try {
            await handleRequest(message, runtimeState, services, options.serverInfo);
        } catch (error) {
            writeError(buildJsonRpcError(message?.id, -32000, error.message || 'Unhandled server error.'));
        }
    });

    reader.on('close', () => {
        process.exit(0);
    });
}

module.exports = {
    startServer,
    handleRequest,
    buildToolResultPayload,
    SUPPORTED_PROTOCOL_VERSION
};
