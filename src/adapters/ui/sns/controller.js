const { createControllerErrorResponder, sendMethodNotAllowed } = require('../controller-common');

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

        async handleWorkspaces({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.loadWorkspaceOptions(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_WORKSPACE_FAILED', 'Buffer 작업 공간을 불러오지 못했습니다.', error);
            }
        },

        async handleOptimize({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.optimize(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_AI_FAILED', 'SNS 글 AI 최적화에 실패했습니다.', error);
            }
        },

        async handleGenerateImage({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, service.startImageOperation(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_IMAGE_GENERATION_FAILED', 'SNS 이미지를 만들지 못했습니다.', error);
            }
        },

        async handleGetImageOperation({ requestId, method, pathname, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                const match = String(pathname || '').match(/^\/api\/v1\/social\/manual\/image-operations\/([^/]+)$/);
                if (!match) throw new Error('SNS 이미지 생성 작업 경로가 올바르지 않습니다.');
                return sendSuccess(res, requestId, service.getImageOperation(decodeURIComponent(match[1])));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_IMAGE_OPERATION_FAILED', 'SNS 이미지 생성 상태를 불러오지 못했습니다.', error);
            }
        },

        async handleCancelImageOperation({ requestId, method, pathname, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                const match = String(pathname || '').match(/^\/api\/v1\/social\/manual\/image-operations\/([^/]+)\/cancel$/);
                if (!match) throw new Error('SNS 이미지 생성 중지 경로가 올바르지 않습니다.');
                return sendSuccess(res, requestId, service.cancelImageOperation(decodeURIComponent(match[1])));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_IMAGE_OPERATION_CANCEL_FAILED', 'SNS 이미지 생성을 중지하지 못했습니다.', error);
            }
        },

        async handlePublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.publish({
                    ...(requestBody || {}),
                    requestId
                }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'MANUAL_SNS_PUBLISH_FAILED', 'SNS 즉시 발행에 실패했습니다.', error);
            }
        }
    };
}

module.exports = {
    createManualSnsController
};
