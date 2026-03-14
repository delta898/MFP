const Logger = require('../logger');
const CONFIG = require('../config-loader');
const { startHttpMcpServer, resolveRemoteMcpConfig } = require('./http-server');
const { ensureRuntimeRemoteMcpConfig } = require('./remote-config');
const { recordDashboardActivity } = require('../activity/dashboard-activity-store');

let activeRemoteService = null;

function buildRemoteServiceOptions(overrides = {}) {
    ensureRuntimeRemoteMcpConfig(CONFIG, overrides);
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
    recordDashboardActivity({
        category: 'system',
        type: 'mcp_remote_stopped',
        title: 'MCP 서버 중지',
        detail: instance.endpoint || `${instance.host}:${instance.port}${instance.path || '/mcp'}`
    });
    return true;
}

async function startRemoteMcpService(overrides = {}) {
    const options = buildRemoteServiceOptions(overrides);
    if (!options.enabled) {
        await stopRemoteMcpService();
        Logger.info('MCP remote service is disabled by configuration.');
        recordDashboardActivity({
            category: 'system',
            type: 'mcp_remote_disabled',
            title: 'MCP 서버 비활성화',
            detail: '설정에 따라 원격 MCP 서버를 실행하지 않습니다.'
        });
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

    let server;
    try {
        server = await startHttpMcpServer({
            ...options,
            logger: Logger
        });
    } catch (error) {
        recordDashboardActivity({
            category: 'system',
            type: 'mcp_remote_start_failed',
            level: 'error',
            title: 'MCP 서버 시작 실패',
            detail: error.message || '원격 MCP 서버를 시작하지 못했습니다.'
        });
        throw error;
    }

    activeRemoteService = {
        ...server,
        authMode: options.authMode,
        authToken: options.authToken,
        allowedOrigins: options.allowedOrigins
    };

    recordDashboardActivity({
        category: 'system',
        type: 'mcp_remote_started',
        title: 'MCP 서버 시작',
        detail: activeRemoteService.endpoint
    });

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
