function createBlogAutoRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleBlogAutoRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/auto/status') {
            await controller.getStatus(ctx);
            return true;
        }

        if (pathname === '/api/v1/blog/auto/categories') {
            await controller.getCategories(ctx);
            return true;
        }

        if (pathname === '/api/v1/auto/start') {
            await controller.startAuto(ctx);
            return true;
        }

        if (pathname === '/api/v1/auto/stop') {
            await controller.stopAuto(ctx);
            return true;
        }

        if (pathname === '/api/v1/blog/auto/run-manual') {
            await controller.runManual(ctx);
            return true;
        }

        if (pathname === '/api/v1/auto/collect/trends/run') {
            await controller.runCollectTrends(ctx);
            return true;
        }

        if (pathname === '/api/v1/auto/collect/rss/run') {
            await controller.runCollectRss(ctx);
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

module.exports = {
    createBlogAutoRouteHandler
};
