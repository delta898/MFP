function createAccountRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleAccountRoute(ctx = {}) {
        if (ctx.pathname !== '/api/v1/account/overview') return false;
        await controller.overview(ctx);
        return true;
    };
}

module.exports = {
    createAccountRouteHandler
};
