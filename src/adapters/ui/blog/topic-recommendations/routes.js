function createTopicRecommendationsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleTopicRecommendationsRoute(ctx = {}) {
        const handlers = {
            '/api/v1/blog/topic-recommendations': controller.list,
            '/api/v1/blog/topic-recommendations/outcome': controller.outcome
        };
        const handler = handlers[ctx.pathname];
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = {
    createTopicRecommendationsRouteHandler
};
