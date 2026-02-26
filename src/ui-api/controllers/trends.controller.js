const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createTrendsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async collectTrends({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.collectTrends(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'TRENDS_COLLECT_FAILED', '트렌드 수집에 실패했습니다.', e);
            }
        },

        async trendsItems({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getTrendsItems({ searchParams }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'TRENDS_ITEMS_READ_FAILED', '트렌드 목록 조회에 실패했습니다.', e);
            }
        },

        async keywordsItems({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getKeywordsItems({ searchParams }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'KEYWORDS_ITEMS_READ_FAILED', '키워드 목록 조회에 실패했습니다.', e);
            }
        },

        async trendsToTopics({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.trendsToTopics(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'TRENDS_TO_TOPICS_FAILED', 'trends→topics 처리에 실패했습니다.', e);
            }
        },

        async keywordsToTopics({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.keywordsToTopics(requestBody || {}));
            } catch (e) {
                return toErrorResponse(res, requestId, 'KEYWORDS_TO_TOPICS_FAILED', 'keywords→topics 처리에 실패했습니다.', e);
            }
        }
    };
}

module.exports = {
    createTrendsController
};
