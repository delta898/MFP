function createRecommendationCenterRouteHandler(deps = {}) {
    const { controller } = deps;
    return async function tryHandleRecommendationCenterRoute(ctx = {}) {
        const handlers = {
            '/api/v1/recommendations': controller.list,
            '/api/v1/recommendations/discover': controller.discover,
            '/api/v1/recommendations/interaction': controller.interaction,
            '/api/v1/recommendations/confirmation': controller.confirmation
        };
        const handler = handlers[ctx.pathname];
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = { createRecommendationCenterRouteHandler };
