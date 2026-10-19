function createBlogAutoController(deps = {}) {
    const { service, sendSuccess, sendError, Logger } = deps;

    return {
        async getStatus({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            return sendSuccess(res, requestId, await service.getStatus());
        },

        async runCollectSns({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const result = await service.runCollectSns();
            if (!result?.success) {
                return sendError(res, requestId, Number(result?.statusCode || 400), result?.code || 'SNS_DISCOVERY_FAILED', result?.message || 'SNS RSS 확인에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async runPublishSns({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const result = await service.runPublishSns();
            if (!result?.success) {
                return sendError(res, requestId, Number(result?.statusCode || 400), result?.code || 'SNS_DISTRIBUTION_FAILED', result?.message || 'SNS 원문 글 발행에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async runAutoPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const result = await service.runAutoPublish({ requestBody });
            if (!result?.success) {
                return sendError(res, requestId, 400, 'PUBLISH_AUTO_FAILED', result?.message || '발행 처리에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async startAutoPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const result = await service.startAutoPublish({ requestBody });
            if (!result?.success) {
                return sendError(res, requestId, Number(result?.statusCode || 400), result?.code || 'PUBLISH_AUTO_START_FAILED', result?.message || '발행 작업 시작에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        }
    };
}

module.exports = { createBlogAutoController };
