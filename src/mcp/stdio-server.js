const readline = require('readline');

function redirectConsoleToStderr() {
    const originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
    };

    function writeToStderr(args = []) {
        const line = args.map((item) => {
            if (typeof item === 'string') return item;
            try {
                return JSON.stringify(item);
            } catch (_error) {
                return String(item);
            }
        }).join(' ');
        process.stderr.write(`${line}\n`);
    }

    console.log = (...args) => writeToStderr(args);
    console.info = (...args) => writeToStderr(args);
    console.warn = (...args) => writeToStderr(args);
    console.error = (...args) => writeToStderr(args);
    console.debug = (...args) => writeToStderr(args);

    return originalConsole;
}

redirectConsoleToStderr();

const pkg = require('../../package.json');
const { createMcpPrototypeRuntime } = require('./runtime-factory');
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

async function handleRequest(message = {}, runtimeState = {}, services = {}) {
    const payload = await handleProtocolMessage(message, runtimeState, services, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSION,
        serverInfo: {
            name: 'naver-auto-blog-mcp-prototype',
            version: pkg.version
        }
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
            await handleRequest(message, runtimeState, services);
        } catch (error) {
            writeError(buildJsonRpcError(message?.id, -32000, error.message || 'Unhandled server error.'));
        }
    });

    reader.on('close', () => {
        process.exit(0);
    });
}

if (require.main === module) {
    startServer().catch((error) => {
        writeError(buildJsonRpcError(null, -32000, error.message || 'Failed to start MCP server.'));
        process.exit(1);
    });
}

module.exports = {
    startServer,
    handleRequest,
    buildToolResultPayload,
    SUPPORTED_PROTOCOL_VERSION
};
