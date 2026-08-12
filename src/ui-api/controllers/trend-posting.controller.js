const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createTrendPostingController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async meta({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getMeta());
            } catch (error) {
                return toErrorResponse(res, requestId, 'TREND_POSTING_META_FAILED', '트렌드 조회 정보를 불러오지 못했습니다.', error);
            }
        },

        async keywords({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getKeywords({ searchParams }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'TREND_POSTING_KEYWORDS_FAILED', '트렌드 키워드를 불러오지 못했습니다.', error);
            }
        },

        async recentTopics({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getRecentTopicKeywords({ searchParams }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'TREND_POSTING_RECENT_TOPICS_FAILED', '최근 저장 글감을 불러오지 못했습니다.', error);
            }
        },

        async saveTopic({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.saveTopic({ body: requestBody || {} }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'TREND_POSTING_TOPIC_SAVE_FAILED', '글감을 저장하지 못했습니다.', error);
            }
        }
    };
}

module.exports = {
    createTrendPostingController
};
