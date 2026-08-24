const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createRecommendationCenterController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });
    return {
        async list({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.list({
                    limit: searchParams?.get('limit'),
                    refresh: searchParams?.get('refresh') === '1'
                }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'RECOMMENDATION_LIST_FAILED', '추천을 불러오지 못했습니다.', error);
            }
        },
        async interaction({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.interact(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'RECOMMENDATION_INTERACTION_FAILED', '추천 동작을 처리하지 못했습니다.', error);
            }
        },
        async discover({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.discover(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'RECOMMENDATION_DISCOVERY_FAILED', '새로운 발견을 준비하지 못했습니다.', error);
            }
        },
        async confirmation({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.decide(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'RECOMMENDATION_CONFIRMATION_FAILED', '추천 실행 확인을 처리하지 못했습니다.', error);
            }
        }
    };
}

module.exports = { createRecommendationCenterController };
