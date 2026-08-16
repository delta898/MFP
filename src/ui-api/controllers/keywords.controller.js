const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createKeywordsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async status({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getStatus());
            } catch (error) {
                return toErrorResponse(res, requestId, 'KEYWORD_STATUS_FAILED', '키워드 서비스 상태를 확인하지 못했습니다.', error);
            }
        },

        async analyze({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.analyzeKeywords(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'KEYWORD_ANALYSIS_FAILED', '키워드 분석을 처리하지 못했습니다.', error, 400);
            }
        },

        async suggestTitles({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.suggestTitles(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'KEYWORD_TITLE_SUGGESTION_FAILED', '제목 추천을 처리하지 못했습니다.', error, 400);
            }
        },

        async pipeline({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.researchPipeline(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'KEYWORD_PIPELINE_FAILED', '키워드 및 제목 추천 파이프라인 처리에 실패했습니다.', error, 400);
            }
        }
    };
}

module.exports = {
    createKeywordsController
};
