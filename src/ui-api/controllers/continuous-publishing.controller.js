const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createContinuousPublishingController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async topics({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.captureTopic(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'TOPIC_CAPTURE_FAILED', '글감 저장에 실패했습니다.', error);
            }
        },

        async queue({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getReadyQueue({ searchParams }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CONTINUOUS_QUEUE_READ_FAILED', '발행 대기열을 불러오지 못했습니다.', error);
            }
        }
    };
}

module.exports = {
    createContinuousPublishingController
};
