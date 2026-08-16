const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createTopicRecommendationsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async list({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                const limit = Number(searchParams?.get('limit') || 3);
                const refresh = searchParams?.get('refresh') === '1';
                const query = String(searchParams?.get('query') || '').trim();
                return sendSuccess(res, requestId, await service.getRecommendations({ limit, refresh, query, requestId }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'TOPIC_RECOMMENDATIONS_FAILED', '글감 추천을 불러오지 못했습니다.', error);
            }
        },

        async outcome({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.recordOutcome(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'TOPIC_RECOMMENDATION_OUTCOME_FAILED', '추천 반응을 저장하지 못했습니다.', error, 400);
            }
        }
    };
}

module.exports = {
    createTopicRecommendationsController
};
