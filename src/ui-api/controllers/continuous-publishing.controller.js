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
        },

        async updateTopic({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.updateReadyTopic(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'QUEUE_PLAN_UPDATE_FAILED', '발행 계획을 수정하지 못했습니다.', error);
            }
        },

        async removeFromQueue({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.removeReadyTopic(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'QUEUE_REMOVE_FAILED', '대기열에서 글감을 빼지 못했습니다.', error);
            }
        },

        async startRunner({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, service.startNextReadyTopic(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CONTINUOUS_RUNNER_START_FAILED', '다음 글감 실행을 시작하지 못했습니다.', error);
            }
        },

        async runnerStatus({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, service.getRunnerStatus());
            } catch (error) {
                return toErrorResponse(res, requestId, 'CONTINUOUS_RUNNER_STATUS_FAILED', '연속 발행 상태를 불러오지 못했습니다.', error);
            }
        }
    };
}

module.exports = {
    createContinuousPublishingController
};
