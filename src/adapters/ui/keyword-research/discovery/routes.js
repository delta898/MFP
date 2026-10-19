function createKeywordDiscoveryRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleKeywordDiscoveryRoute(ctx = {}) {
        if (ctx.pathname !== '/api/v1/blog/keyword-discovery') return false;
        await controller.explore(ctx);
        return true;
    };
}

module.exports = {
    createKeywordDiscoveryRouteHandler
};
