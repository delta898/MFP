const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createCardNewsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async sources({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.listSources());
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_SOURCES_FAILED', '블로그 글 목록을 불러오지 못했습니다.', error);
            }
        },

        async preview({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.previewSource(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_SOURCE_PREVIEW_FAILED', '원문 미리보기를 만들지 못했습니다.', error);
            }
        },

        async projects({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    return sendSuccess(res, requestId, service.listProjects());
                } catch (error) {
                    return toErrorResponse(res, requestId, 'CARD_NEWS_PROJECT_LIST_FAILED', '카드뉴스 프로젝트 목록을 불러오지 못했습니다.', error);
                }
            }
            if (method === 'POST') {
                try {
                    return sendSuccess(res, requestId, await service.createProject(requestBody || {}), 201);
                } catch (error) {
                    return toErrorResponse(res, requestId, 'CARD_NEWS_PROJECT_CREATE_FAILED', '카드뉴스 프로젝트를 만들지 못했습니다.', error);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        }
    };
}

module.exports = { createCardNewsController };
