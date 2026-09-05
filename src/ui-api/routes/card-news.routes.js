function createCardNewsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleCardNewsRoute(ctx = {}) {
        const handlers = {
            '/api/v1/card-news/sources': controller.sources,
            '/api/v1/card-news/managed': controller.managed,
            '/api/v1/card-news/source-preview': controller.preview,
            '/api/v1/card-news/generations': controller.generate,
            '/api/v1/card-news/images/generate': controller.generateImages,
            '/api/v1/card-news/images/import': controller.importImage,
            '/api/v1/card-news/zip/preview': controller.previewZip,
            '/api/v1/card-news/zip/import': controller.importZip,
            '/api/v1/card-news/publishing/config': controller.publishingConfig,
            '/api/v1/card-news/publishing/publish': controller.publish,
            '/api/v1/card-news/projects': controller.projects
        };
        const pathname = String(ctx.pathname || '');
        const handler = pathname.startsWith('/api/v1/card-news/assets/')
            ? controller.asset
            : (pathname.startsWith('/api/v1/card-news/exports/')
                ? controller.exportBundle
                : (/^\/api\/v1\/card-news\/generations\/[^/]+$/.test(pathname) ? controller.generation : handlers[ctx.pathname]));
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = { createCardNewsRouteHandler };
