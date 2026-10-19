function createSurfaceContentRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleSurfaceContentRoute(ctx = {}) {
        const handlers = {
            '/api/v1/surface-content/sidebar': controller.sidebar,
            '/api/v1/surface-content/dashboard': controller.dashboard,
            '/api/v1/surface-content/account': controller.account,
            '/api/v1/surface-content/help': controller.help
        };
        const handler = handlers[ctx.pathname];
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = {
    createSurfaceContentRouteHandler
};
