function createSurfaceContentRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleSurfaceContentRoute(ctx = {}) {
        if (ctx.pathname !== '/api/v1/surface-content/sidebar') return false;
        await controller.sidebar(ctx);
        return true;
    };
}

module.exports = {
    createSurfaceContentRouteHandler
};
