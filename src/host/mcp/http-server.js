'use strict';

async function main() {
    const CONFIG = require('../configuration/runtime-config');
    const Logger = require('../../utilities/logging/logger');
    const { createLicensingRuntime } = require('../../composition/licensing');
    const { License } = createLicensingRuntime({ config: CONFIG });
    const { createMcpPrototypeRuntime } = require('../../composition/mcp-runtime');
    const { startHttpMcpServer } = require('../../adapters/messaging/mcp/server/http-server');
    Logger.configureRuntime({ logLevel: CONFIG.LOG_LEVEL, rootDir: CONFIG.ROOT_DIR });
    return startHttpMcpServer({
        config: CONFIG,
        logger: Logger,
        services: createMcpPrototypeRuntime({ config: CONFIG, License })
    });
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Failed to start MCP HTTP server: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { main };
