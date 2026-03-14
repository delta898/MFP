const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createContentController(deps = {}) {
    const { service, sendSuccess, sendError, logger } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async shoppingImageSave({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.saveShoppingImage(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_IMAGE_SAVE_FAILED', '쇼핑 이미지 저장에 실패했습니다.', e);
            }
        },

        async shoppingImagePreview({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                const data = await service.getShoppingImagePreview({
                    slotRaw: searchParams.get('slot'),
                    sourceRaw: searchParams.get('source')
                });
                if (data?.binary) {
                    res.writeHead(200, {
                        'Content-Type': data.contentType || 'application/octet-stream',
                        'Cache-Control': 'no-store'
                    });
                    res.end(data.body);
                    return true;
                }
                return sendSuccess(res, requestId, data || {});
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_IMAGE_PREVIEW_FAILED', '쇼핑 이미지 미리보기에 실패했습니다.', e);
            }
        },

        async googleOauthStatus({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getGoogleOauthStatus());
            } catch (e) {
                return toErrorResponse(res, requestId, 'GOOGLE_OAUTH_STATUS_ERROR', 'Google 연결 상태 조회에 실패했습니다.', e);
            }
        },

        async googleOauthStart({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.startGoogleOauth());
            } catch (e) {
                return toErrorResponse(res, requestId, 'GOOGLE_OAUTH_START_FAILED', 'Google 연결 시작에 실패했습니다.', e);
            }
        },

        async googleOauthDisconnect({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.disconnectGoogleOauth());
            } catch (e) {
                return toErrorResponse(res, requestId, 'GOOGLE_OAUTH_DISCONNECT_FAILED', 'Google 연결 해제에 실패했습니다.', e);
            }
        },

        async googleOauthTest({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.testGoogleOauthConnection());
            } catch (e) {
                return toErrorResponse(res, requestId, 'GOOGLE_OAUTH_TEST_FAILED', 'Google 연결 테스트에 실패했습니다.', e);
            }
        },

        async naverCommentDraftSettings({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    return sendSuccess(res, requestId, await service.getNaverCommentDraftSettings());
                } catch (e) {
                    return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_SETTINGS_READ_FAILED', '스마트 댓글 설정 조회에 실패했습니다.', e);
                }
            }
            if (method === 'POST') {
                try {
                    return sendSuccess(res, requestId, await service.saveNaverCommentDraftSettings(requestBody || {}));
                } catch (e) {
                    return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_SETTINGS_SAVE_FAILED', '스마트 댓글 설정 저장에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async naverCommentDraftRun({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.runNaverCommentDraft(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_RUN_FAILED', '스마트 댓글 실행에 실패했습니다.', e);
            }
        },

        async naverCommentDraftRedraft({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.redraftNaverCommentDraft(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_REDRAFT_FAILED', '댓글 초안 다시 생성에 실패했습니다.', e);
            }
        },

        async blogQuickPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.blogQuickPublish(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'QUICK_PUBLISH_FAILED', '빠른발행 요청에 실패했습니다.', e);
            }
        },

        async localMarkdownPreview({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.previewLocalMarkdown(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'LOCAL_MARKDOWN_PREVIEW_FAILED', '원고 미리보기에 실패했습니다.', e);
            }
        },

        async localMarkdownPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.localMarkdownPublish(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'LOCAL_MARKDOWN_PUBLISH_FAILED', '원고 포스팅 실행에 실패했습니다.', e);
            }
        },

        async shoppingQuickPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.shoppingQuickPublish(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_QUICK_PUBLISH_FAILED', '쇼핑 빠른발행 요청에 실패했습니다.', e);
            }
        },

        async shoppingPreview({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.shoppingPreview({ urlRaw: searchParams.get('url') }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_PREVIEW_FAILED', '쇼핑 미리보기에 실패했습니다.', e);
            }
        },

        async blogTopics({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getBlogTopics({ searchParams }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'BLOG_TOPICS_READ_FAILED', '토픽 목록 조회에 실패했습니다.', e);
            }
        },

        async shoppingItems({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getShoppingItems({ searchParams }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_ITEMS_READ_FAILED', '쇼핑 목록 조회에 실패했습니다.', e);
            }
        },

        async blogAction({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.runBlogAction(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'BLOG_ACTION_FAILED', '블로그 작업 요청에 실패했습니다.', e);
            }
        },

        async shoppingAction({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.runShoppingAction(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_ACTION_FAILED', '쇼핑 작업 요청에 실패했습니다.', e);
            }
        },

        async shoppingAutoRunManual({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                logger.info('🚀 [UI][SHOPPING_AUTO] 수동 실행 요청 수신');
                const data = await service.runShoppingAutoManual(requestBody || {});
                const summary = data?.summary || {};
                logger.info(`✅ [UI][SHOPPING_AUTO] 수동 실행 완료 (shopping: ${Number(summary?.shoppingSuccess || 0)}/${Number(summary?.shoppingAttempted || 0)})`);
                return sendSuccess(res, requestId, data);
            } catch (e) {
                logger.warn(`⚠️ [UI][SHOPPING_AUTO] 수동 실행 실패: ${e?.message || e?.apiCode || 'unknown'}`);
                return toErrorResponse(res, requestId, 'SHOPPING_AUTO_MANUAL_FAILED', '쇼핑 자동발행 수동 실행에 실패했습니다.', e);
            }
        },

        async shoppingRowUpdate({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.updateShoppingRow(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_ROW_UPDATE_FAILED', '쇼핑 행 수정에 실패했습니다.', e);
            }
        },

        async blogTopicUpdate({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.updateBlogTopic(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'TOPIC_UPDATE_FAILED', '토픽 수정에 실패했습니다.', e);
            }
        },
        async blogTopicsDelete({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.deleteBlogTopics(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'TOPICS_DELETE_FAILED', '토픽 삭제에 실패했습니다.', e);
            }
        },
        async shoppingTopicsDelete({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.deleteShoppingTopics(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHOPPING_DELETE_FAILED', '쇼핑 데이터 삭제에 실패했습니다.', e);
            }
        },

        async wordpressCategories({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getWordPressCategories());
            } catch (e) {
                return toErrorResponse(res, requestId, 'WP_CATEGORIES_FETCH_FAILED', '워드프레스 카테고리 목록 조회에 실패했습니다.', e);
            }
        }
    };
}

module.exports = {
    createContentController
};
