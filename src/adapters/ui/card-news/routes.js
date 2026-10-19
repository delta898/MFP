function createCardNewsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleCardNewsRoute(ctx = {}) {
        const handlers = {
            '/api/v1/card-news/image-models': controller.imageModels,
            '/api/v1/card-news/sources': controller.sources,
            '/api/v1/card-news/managed': controller.managed,
            '/api/v1/card-news/signature-policy': controller.signaturePolicy,
            '/api/v1/card-news/source-preview': controller.preview,
            '/api/v1/card-news/generations': controller.generate,
            '/api/v1/card-news/composition-operations': controller.startCompositionOperation,
            '/api/v1/card-news/images/generate': controller.generateImages,
            '/api/v1/card-news/image-operations': controller.startImageOperation,
            '/api/v1/card-news/images/import': controller.importImage,
            '/api/v1/card-news/zip/preview': controller.previewZip,
            '/api/v1/card-news/zip/import': controller.importZip,
            '/api/v1/card-news/publishing/config': controller.publishingConfig,
            '/api/v1/card-news/publishing/publish': controller.publish,
            '/api/v1/card-news/projects': controller.projects
        };
        const pathname = String(ctx.pathname || '');
        let handler = handlers[ctx.pathname];
        if (pathname.startsWith('/api/v1/card-news/assets/')) handler = controller.asset;
        else if (pathname.startsWith('/api/v1/card-news/exports/')) handler = controller.exportBundle;
        else if (/^\/api\/v1\/card-news\/generations\/[^/]+$/.test(pathname)) handler = controller.generation;
        else if (/^\/api\/v1\/card-news\/composition-operations\/[^/]+\/cancel$/.test(pathname)) handler = controller.cancelCompositionOperation;
        else if (/^\/api\/v1\/card-news\/composition-operations\/[^/]+$/.test(pathname)) handler = controller.compositionOperation;
        else if (/^\/api\/v1\/card-news\/image-operations\/[^/]+\/cancel$/.test(pathname)) handler = controller.cancelImageOperation;
        else if (/^\/api\/v1\/card-news\/image-operations\/[^/]+$/.test(pathname)) handler = controller.imageOperation;
        if (!handler) return false;
        await handler(ctx);
        return true;
    };
}

module.exports = { createCardNewsRouteHandler };
