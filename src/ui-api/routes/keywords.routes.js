function createKeywordsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleKeywordsRoute(ctx = {}) {
        const handlers = {
            '/api/v1/keywords/status': controller.status,
            '/api/v1/keywords/analyze': controller.analyze,
            '/api/v1/keywords/suggest-titles': controller.suggestTitles,
            '/api/v1/keywords/pipeline': controller.pipeline,
            '/api/v1/blog/quick-publish/smart-suggestions': controller.quickPublishSuggestions
        };
        const handler = handlers[ctx.pathname];
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = {
    createKeywordsRouteHandler
};
