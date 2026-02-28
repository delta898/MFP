function createSystemRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleSystemRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/health') return controller.health(ctx);
        if (pathname === '/api/v1/system/update/check') return controller.updateCheck(ctx);
        if (pathname === '/api/v1/system/update/apply') return controller.updateApply(ctx);
        if (pathname === '/api/v1/system/update/restart') return controller.updateRestart(ctx);
        if (pathname === '/api/v1/system/restart') return controller.systemRestart(ctx);
        if (pathname === '/api/v1/system/stop') return controller.systemStop(ctx);
        if (pathname === '/api/v1/dashboard/summary') return controller.dashboardSummary(ctx);
        if (pathname === '/api/v1/dashboard/logs') return controller.dashboardLogs(ctx);
        if (pathname === '/api/v1/dashboard/external-content') return controller.dashboardExternalContent(ctx);
        if (pathname === '/api/v1/logs/files') return controller.logsFiles(ctx);
        if (pathname === '/api/v1/logs/read') return controller.logsRead(ctx);
        if (pathname === '/api/v1/config/status') return controller.configStatus(ctx);
        if (pathname === '/api/v1/sheets/ensure') return controller.sheetsEnsure(ctx);

        return false;
    };
}

module.exports = {
    createSystemRouteHandler
};
