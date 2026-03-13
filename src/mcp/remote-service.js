const Logger = require('../logger');
const { startHttpMcpServer, resolveRemoteMcpConfig } = require('./http-server');

let activeRemoteService = null;

function buildRemoteServiceOptions(overrides = {}) {
    const config = resolveRemoteMcpConfig(overrides);
    return {
        enabled: config.enabled !== false,
        host: config.host,
        port: config.port,
        path: config.path,
        authMode: config.authMode,
        authToken: config.authToken,
        allowedOrigins: config.allowedOrigins,
        debug: config.debug
    };
}

function getRemoteServiceStatus() {
    if (!activeRemoteService) {
        return {
            running: false,
            enabled: false
        };
    }

    return {
        running: true,
        enabled: true,
        host: activeRemoteService.host,
        port: activeRemoteService.port,
        path: activeRemoteService.path,
        endpoint: activeRemoteService.endpoint
    };
}

async function stopRemoteMcpService() {
    if (!activeRemoteService) return false;

    const instance = activeRemoteService;
    activeRemoteService = null;
    await instance.close();
    Logger.info('MCP remote service stopped.');
    return true;
}

async function startRemoteMcpService(overrides = {}) {
    const options = buildRemoteServiceOptions(overrides);
    if (!options.enabled) {
        await stopRemoteMcpService();
        Logger.info('MCP remote service is disabled by configuration.');
        return {
            enabled: false,
            running: false
        };
    }

    if (activeRemoteService) {
        const sameBinding =
            activeRemoteService.host === options.host &&
            activeRemoteService.port === options.port &&
            activeRemoteService.path === options.path;
        const sameAuth =
            activeRemoteService.authMode === options.authMode &&
            activeRemoteService.authToken === options.authToken;
        const sameOrigins = JSON.stringify(activeRemoteService.allowedOrigins || []) === JSON.stringify(options.allowedOrigins || []);

        if (sameBinding && sameAuth && sameOrigins) {
            return {
                enabled: true,
                running: true,
                host: activeRemoteService.host,
                port: activeRemoteService.port,
                path: activeRemoteService.path,
                endpoint: activeRemoteService.endpoint
            };
        }

        await stopRemoteMcpService();
    }

    const server = await startHttpMcpServer({
        ...options,
        logger: Logger
    });

    activeRemoteService = {
        ...server,
        authMode: options.authMode,
        authToken: options.authToken,
        allowedOrigins: options.allowedOrigins
    };

    return {
        enabled: true,
        running: true,
        host: activeRemoteService.host,
        port: activeRemoteService.port,
        path: activeRemoteService.path,
        endpoint: activeRemoteService.endpoint
    };
}

async function restartRemoteMcpService(overrides = {}) {
    await stopRemoteMcpService();
    return startRemoteMcpService(overrides);
}

module.exports = {
    buildRemoteServiceOptions,
    getRemoteServiceStatus,
    startRemoteMcpService,
    stopRemoteMcpService,
    restartRemoteMcpService
};
