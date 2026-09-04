function createCardNewsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleCardNewsRoute(ctx = {}) {
        const handlers = {
            '/api/v1/card-news/sources': controller.sources,
            '/api/v1/card-news/source-preview': controller.preview,
            '/api/v1/card-news/projects': controller.projects
        };
        const handler = handlers[ctx.pathname];
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = { createCardNewsRouteHandler };
