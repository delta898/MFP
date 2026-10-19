'use strict';

function redirectConsoleToStderr() {
    const write = (args = []) => {
        const line = args.map((item) => {
            if (typeof item === 'string') return item;
            try { return JSON.stringify(item); }
            catch (_error) { return String(item); }
        }).join(' ');
        process.stderr.write(`${line}\n`);
    };
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = (...args) => write(args);
}

async function main() {
    redirectConsoleToStderr();
    const pkg = require('../../../package.json');
    const CONFIG = require('../configuration/runtime-config');
    const { createLicensingRuntime } = require('../../composition/licensing');
    const { License } = createLicensingRuntime({ config: CONFIG });
    const { createMcpPrototypeRuntime } = require('../../composition/mcp-runtime');
    const { startServer } = require('../../adapters/messaging/mcp/server/stdio-server');
    return startServer({
        services: createMcpPrototypeRuntime({ config: CONFIG, License }),
        serverInfo: { name: 'naver-auto-blog-mcp-prototype', version: pkg.version }
    });
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: error.message || 'Failed to start MCP server.' } })}\n`);
        process.exit(1);
    });
}

module.exports = { main, redirectConsoleToStderr };
