function createContentRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleContentRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/settings/shopping-image') return controller.shoppingImageSave(ctx);
        if (pathname === '/api/v1/settings/shopping-image/preview') return controller.shoppingImagePreview(ctx);
        if (pathname === '/api/v1/google-oauth/status') return controller.googleOauthStatus(ctx);
        if (pathname === '/api/v1/google-oauth/start') return controller.googleOauthStart(ctx);
        if (pathname === '/api/v1/google-oauth/disconnect') return controller.googleOauthDisconnect(ctx);
        if (pathname === '/api/v1/google-oauth/test') return controller.googleOauthTest(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/settings') return controller.naverCommentDraftSettings(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/run') return controller.naverCommentDraftRun(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/redraft') return controller.naverCommentDraftRedraft(ctx);
        if (pathname === '/api/v1/blog/quick-publish') return controller.blogQuickPublish(ctx);
        if (pathname === '/api/v1/blog/local-markdown/select') return controller.localMarkdownSelect(ctx);
        if (pathname === '/api/v1/blog/local-markdown/preview') return controller.localMarkdownPreview(ctx);
        if (pathname === '/api/v1/blog/local-markdown/image') return controller.localMarkdownImagePreview(ctx);
        if (pathname === '/api/v1/shopping/quick-publish') return controller.shoppingQuickPublish(ctx);
        if (pathname === '/api/v1/shopping/preview') return controller.shoppingPreview(ctx);
        if (pathname === '/api/v1/blog/topics') return controller.blogTopics(ctx);
        if (pathname === '/api/v1/shopping/items') return controller.shoppingItems(ctx);
        if (pathname === '/api/v1/blog/action') return controller.blogAction(ctx);
        if (pathname === '/api/v1/shopping/action') return controller.shoppingAction(ctx);
        if (pathname === '/api/v1/shopping/auto/run-manual') return controller.shoppingAutoRunManual(ctx);
        if (pathname === '/api/v1/shopping/row/update') return controller.shoppingRowUpdate(ctx);
        if (pathname === '/api/v1/shopping/topics/delete') return controller.shoppingTopicsDelete(ctx);
        if (pathname === '/api/v1/blog/topic/update') return controller.blogTopicUpdate(ctx);
        if (pathname === '/api/v1/blog/topics/delete') return controller.blogTopicsDelete(ctx);
        if (pathname === '/api/v1/wordpress/categories') return controller.wordpressCategories(ctx);

        return false;
    };
}

module.exports = {
    createContentRouteHandler
};
