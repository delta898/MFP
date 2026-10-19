function createBlogAutoRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleBlogAutoRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/auto/status') {
            await controller.getStatus(ctx);
            return true;
        }
        if (pathname === '/api/v1/auto/collect/sns/run') {
            await controller.runCollectSns(ctx);
            return true;
        }
        if (pathname === '/api/v1/auto/publish/sns/run') {
            await controller.runPublishSns(ctx);
            return true;
        }
        if (pathname === '/api/v1/auto/publish/run') {
            await controller.runAutoPublish(ctx);
            return true;
        }
        if (pathname === '/api/v1/auto/publish/start') {
            await controller.startAutoPublish(ctx);
            return true;
        }
        return false;
    };
}

module.exports = { createBlogAutoRouteHandler };
