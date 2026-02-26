function createSettingsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleSettingsRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/settings/major') {
            await controller.handleMajor(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/advanced') {
            await controller.handleAdvanced(ctx);
            return true;
        }

        return false;
    };
}

module.exports = {
    createSettingsRouteHandler
};
