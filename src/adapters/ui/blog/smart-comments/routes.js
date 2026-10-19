function createSmartCommentsRouteHandler(deps = {}) {
    const { controller } = deps;
    return async function tryHandleSmartCommentsRoute(ctx = {}) {
        const { pathname } = ctx;
        if (pathname === '/api/v1/blog/naver-comment-draft/settings') return controller.settings(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/run') return controller.run(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/progress') return controller.progress(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/redraft') return controller.redraft(ctx);
        return false;
    };
}

module.exports = { createSmartCommentsRouteHandler };
