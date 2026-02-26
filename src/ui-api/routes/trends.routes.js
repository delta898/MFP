function createTrendsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleTrendsRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/trends/collect') return controller.collectTrends(ctx);
        if (pathname === '/api/v1/trends/items') return controller.trendsItems(ctx);
        if (pathname === '/api/v1/keywords/items') return controller.keywordsItems(ctx);
        if (pathname === '/api/v1/trends/to-topics') return controller.trendsToTopics(ctx);
        if (pathname === '/api/v1/keywords/to-topics') return controller.keywordsToTopics(ctx);

        return false;
    };
}

module.exports = {
    createTrendsRouteHandler
};
