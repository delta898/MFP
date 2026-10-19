const { ensureRuntimeRemoteMcpConfig } = require('../configuration/mcp-remote-config');
const { normalizeBoolean, resolveRemoteMcpConfiguration } = require('../../services/mcp/remote-configuration');

let activeRemoteService = null;
let dependencies = { config: {}, logger: console };

function configureRemoteMcpService(options = {}) {
    dependencies = {
        config: options.config || {},
        logger: options.logger || console,
        startServer: options.startServer,
        createServices: options.createServices
    };
}

function buildRemoteServiceOptions(overrides = {}) {
    ensureRuntimeRemoteMcpConfig(dependencies.config, overrides);
    const config = resolveRemoteMcpConfiguration(dependencies.config, {
        enabled: overrides.enabled,
        host: overrides.host || process.env.MCP_REMOTE_HOST,
        port: overrides.port || process.env.MCP_REMOTE_PORT,
        path: overrides.path || process.env.MCP_REMOTE_PATH,
        authMode: overrides.authMode,
        authToken: overrides.authToken || process.env.MCP_REMOTE_AUTH_TOKEN
    });
    const allowedOrigins = dependencies.config.mcp?.remote?.allowed_origins;
    return {
        enabled: config.enabled !== false,
        host: config.host,
        port: config.port,
        path: config.path,
        authMode: config.authMode,
        authToken: config.authToken,
        allowedOrigins: Array.isArray(allowedOrigins) ? allowedOrigins.map((value) => String(value || '').trim()).filter(Boolean) : [],
        debug: normalizeBoolean(overrides.debug ?? process.env.DEBUG_MCP, false)
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
    dependencies.logger.info('MCP remote service stopped.');
    return true;
}

async function startRemoteMcpService(overrides = {}) {
    const options = buildRemoteServiceOptions(overrides);
    if (!options.enabled) {
        await stopRemoteMcpService();
        dependencies.logger.info('MCP remote service is disabled by configuration.');
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

    if (typeof dependencies.startServer !== 'function') {
        throw new Error('Remote MCP service requires a composed HTTP transport adapter.');
    }
    const server = await dependencies.startServer({
        ...options,
        services: dependencies.createServices?.(dependencies.config),
        config: dependencies.config,
        logger: dependencies.logger
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
    configureRemoteMcpService,
    buildRemoteServiceOptions,
    getRemoteServiceStatus,
    startRemoteMcpService,
    stopRemoteMcpService,
    restartRemoteMcpService
};
