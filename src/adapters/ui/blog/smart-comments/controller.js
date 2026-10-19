const { createControllerErrorResponder, sendMethodNotAllowed } = require('../../controller-common');

function createSmartCommentsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async settings({ requestId, method, requestBody, res }) {
            try {
                if (method === 'GET') return sendSuccess(res, requestId, await service.getSettings());
                if (method === 'POST') return sendSuccess(res, requestId, await service.saveSettings(requestBody || {}));
                return sendMethodNotAllowed(sendError, res, requestId);
            } catch (error) {
                const saving = method === 'POST';
                return toErrorResponse(res, requestId,
                    saving ? 'NAVER_COMMENT_DRAFT_SETTINGS_SAVE_FAILED' : 'NAVER_COMMENT_DRAFT_SETTINGS_READ_FAILED',
                    saving ? '스마트 댓글 설정 저장에 실패했습니다.' : '스마트 댓글 설정 조회에 실패했습니다.', error);
            }
        },
        async run({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try { return sendSuccess(res, requestId, await service.run(requestBody || {})); }
            catch (error) { return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_RUN_FAILED', '스마트 댓글 실행에 실패했습니다.', error); }
        },
        async progress({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try { return sendSuccess(res, requestId, await service.getProgress()); }
            catch (error) { return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_PROGRESS_FAILED', '스마트 댓글 진행 상태 조회에 실패했습니다.', error); }
        },
        async redraft({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try { return sendSuccess(res, requestId, await service.redraft(requestBody || {})); }
            catch (error) { return toErrorResponse(res, requestId, 'NAVER_COMMENT_DRAFT_REDRAFT_FAILED', '댓글 초안 다시 생성에 실패했습니다.', error); }
        }
    };
}

module.exports = { createSmartCommentsController };
