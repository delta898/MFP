const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createManualSnsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async handleConfig({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, service.getComposerConfig());
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_CONFIG_FAILED', '수동 SNS 설정을 불러오지 못했습니다.', error);
            }
        },

        async handlePublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.publish(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_PUBLISH_FAILED', 'SNS 즉시 발행에 실패했습니다.', error);
            }
        }
    };
}

module.exports = {
    createManualSnsController
};
