function createTrendPostingRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleTrendPostingRoute(ctx = {}) {
        if (ctx.pathname === '/api/v1/trend-posting/meta') return controller.meta(ctx);
        if (ctx.pathname === '/api/v1/trend-posting/keywords') return controller.keywords(ctx);
        return false;
    };
}

module.exports = {
    createTrendPostingRouteHandler
};
