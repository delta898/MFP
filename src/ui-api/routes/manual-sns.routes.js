function createManualSnsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleManualSnsRoute(ctx = {}) {
        if (ctx.pathname === '/api/v1/social/manual/config') {
            await controller.handleConfig(ctx);
            return true;
        }
        if (ctx.pathname === '/api/v1/social/manual/publish') {
            await controller.handlePublish(ctx);
            return true;
        }
        return false;
    };
}

module.exports = {
    createManualSnsRouteHandler
};
