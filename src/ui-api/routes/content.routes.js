function createContentRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleContentRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/blog/manuscript-drafts/folder') return controller.manuscriptDraftCreateFolder(ctx);
        if (pathname === '/api/v1/blog/manuscript-drafts/paste') return controller.manuscriptDraftCreatePaste(ctx);
        if (pathname === '/api/v1/blog/manuscript-drafts/ai') return controller.manuscriptDraftCreateAi(ctx);
        const manuscriptBulkImageMatch = pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/images\/(generate-missing)$/);
        if (manuscriptBulkImageMatch) {
            return controller.manuscriptDraftMutation({ ...ctx, draftId: decodeURIComponent(manuscriptBulkImageMatch[1]), action: manuscriptBulkImageMatch[2] });
        }
        const manuscriptImageMatch = pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/images\/([^/]+)$/);
        if (manuscriptImageMatch) {
            return controller.manuscriptDraftImage({ ...ctx, draftId: decodeURIComponent(manuscriptImageMatch[1]), slotId: decodeURIComponent(manuscriptImageMatch[2]) });
        }
        const manuscriptSlotActionMatch = pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/image-slots\/([^/]+)\/(import|generate|exclude|restore)$/);
        if (manuscriptSlotActionMatch) {
            return controller.manuscriptDraftMutation({
                ...ctx,
                draftId: decodeURIComponent(manuscriptSlotActionMatch[1]),
                slotId: decodeURIComponent(manuscriptSlotActionMatch[2]),
                action: manuscriptSlotActionMatch[3]
            });
        }
        const manuscriptActionMatch = pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/(settings|markdown|publish)$/);
        if (manuscriptActionMatch) {
            return controller.manuscriptDraftMutation({ ...ctx, draftId: decodeURIComponent(manuscriptActionMatch[1]), action: manuscriptActionMatch[2] });
        }
        const manuscriptDraftMatch = pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)$/);
        if (manuscriptDraftMatch) return controller.manuscriptDraftGet({ ...ctx, draftId: decodeURIComponent(manuscriptDraftMatch[1]) });

        if (pathname === '/api/v1/settings/shopping-image') return controller.shoppingImageSave(ctx);
        if (pathname === '/api/v1/settings/shopping-image/preview') return controller.shoppingImagePreview(ctx);
        if (pathname === '/api/v1/google-oauth/status') return controller.googleOauthStatus(ctx);
        if (pathname === '/api/v1/google-oauth/start') return controller.googleOauthStart(ctx);
        if (pathname === '/api/v1/google-oauth/disconnect') return controller.googleOauthDisconnect(ctx);
        if (pathname === '/api/v1/google-oauth/test') return controller.googleOauthTest(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/settings') return controller.naverCommentDraftSettings(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/run') return controller.naverCommentDraftRun(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/progress') return controller.naverCommentDraftProgress(ctx);
        if (pathname === '/api/v1/blog/naver-comment-draft/redraft') return controller.naverCommentDraftRedraft(ctx);
        if (pathname === '/api/v1/blog/quick-publish') return controller.blogQuickPublish(ctx);
        if (pathname === '/api/v1/blog/quick-preview/publish') return controller.blogQuickPreviewPublish(ctx);
        if (pathname === '/api/v1/blog/quick-preview/image') return controller.blogQuickPreviewImage(ctx);
        if (pathname === '/api/v1/blog/local-markdown/preview') return controller.localMarkdownPreview(ctx);
        if (pathname === '/api/v1/blog/local-markdown/publish') return controller.localMarkdownPublish(ctx);
        if (pathname === '/api/v1/shopping/quick-publish') return controller.shoppingQuickPublish(ctx);
        if (pathname === '/api/v1/shopping/preview') return controller.shoppingPreview(ctx);
        if (pathname === '/api/v1/blog/topics') return controller.blogTopics(ctx);
        if (pathname === '/api/v1/shopping/items') return controller.shoppingItems(ctx);
        if (pathname === '/api/v1/blog/action') return controller.blogAction(ctx);
        if (pathname === '/api/v1/shopping/action') return controller.shoppingAction(ctx);
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
