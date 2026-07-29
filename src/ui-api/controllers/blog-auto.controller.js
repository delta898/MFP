function createBlogAutoController(deps = {}) {
    const { service, sendSuccess, sendError, Logger, validators } = deps;

    return {
        async getStatus({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const data = await service.getStatus();
            return sendSuccess(res, requestId, data);
        },

        async getCategories({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            try {
                const force = validators.parseForceQuery(searchParams.get('force'));
                const data = await service.getCategories({ force });
                return sendSuccess(res, requestId, data);
            } catch (e) {
                if (validators.isValidationError(e)) {
                    return sendError(
                        res,
                        requestId,
                        Number(e?.statusCode || 400),
                        e?.code || 'VALIDATION_ERROR',
                        e?.message || '요청 값 검증에 실패했습니다.'
                    );
                }
                return sendError(
                    res,
                    requestId,
                    400,
                    'SHEETS_NOT_READY',
                    e?.message || '필수 시트 준비에 실패했습니다.'
                );
            }
        },

        async runManual({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`🧭 [UI][AUTO] API 진입 확인 (${method} /api/v1/blog/auto/run-manual)`);
            let validatedBody;
            try {
                validatedBody = validators.validateBlogAutoManualRunPayload(requestBody);
            } catch (e) {
                if (validators.isValidationError(e)) {
                    return sendError(
                        res,
                        requestId,
                        Number(e?.statusCode || 400),
                        e?.code || 'VALIDATION_ERROR',
                        e?.message || '요청 값 검증에 실패했습니다.'
                    );
                }
                throw e;
            }

            const result = await service.runManual({ requestBody: validatedBody });
            if (!result?.success) {
                return sendError(
                    res,
                    requestId,
                    Number(result?.statusCode || 400),
                    result?.code || 'AUTO_MANUAL_RUN_FAILED',
                    result?.message || '자동발행 수동 실행에 실패했습니다.'
                );
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async startAuto({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const result = await service.startAuto();
            return sendError(
                res,
                requestId,
                Number(result?.statusCode || 409),
                result?.code || 'AUTO_POC_ONLY',
                result?.message || '현재 Auto Mode는 PoC 단계입니다.'
            );
        },

        async stopAuto({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            const result = await service.stopAuto();
            return sendError(
                res,
                requestId,
                Number(result?.statusCode || 409),
                result?.code || 'AUTO_POC_ONLY',
                result?.message || '현재 Auto Mode는 PoC 단계입니다.'
            );
        },

        async runCollectTrends({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`[UI][AUTO] API 진입: 트렌드 수동 수집 (/api/v1/auto/collect/trends/run)`);
            const result = await service.runCollectTrends({ requestBody });
            if (!result?.success) {
                return sendError(res, requestId, 400, 'COLLECT_TRENDS_FAILED', result?.message || '트렌드 수집에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async runCollectRss({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`[UI][AUTO] API 진입: RSS 수동 수집 (/api/v1/auto/collect/rss/run)`);
            const result = await service.runCollectRss({ requestBody });
            if (!result?.success) {
                return sendError(res, requestId, 400, 'COLLECT_RSS_FAILED', result?.message || 'RSS 수집에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async runCollectSns({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`[UI][AUTO] API 진입: SNS RSS 수동 확인 (/api/v1/auto/collect/sns/run)`);
            const result = await service.runCollectSns();
            if (!result?.success) {
                return sendError(
                    res,
                    requestId,
                    Number(result?.statusCode || 400),
                    result?.code || 'SNS_DISCOVERY_FAILED',
                    result?.message || 'SNS RSS 확인에 실패했습니다.'
                );
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async runPublishSns({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`[UI][AUTO] API 진입: SNS 원문 글 수동 발행 (/api/v1/auto/publish/sns/run)`);
            const result = await service.runPublishSns();
            if (!result?.success) {
                return sendError(
                    res,
                    requestId,
                    Number(result?.statusCode || 400),
                    result?.code || 'SNS_DISTRIBUTION_FAILED',
                    result?.message || 'SNS 원문 글 발행에 실패했습니다.'
                );
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async runAutoPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`[UI][AUTO] API 진입: 자동발행 수동 1회 실행 (/api/v1/auto/publish/run)`);
            const result = await service.runAutoPublish({ requestBody });
            if (!result?.success) {
                return sendError(res, requestId, 400, 'PUBLISH_AUTO_FAILED', result?.message || '자동 발행 처리에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result?.data || {});
        },

        async startAutoPublish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }
            Logger.info(`[UI][AUTO] API 진입: 자동발행 비동기 시작 (/api/v1/auto/publish/start)`);
            const result = await service.startAutoPublish({ requestBody });
            if (!result?.success) {
                return sendError(
                    res,
                    requestId,
                    Number(result?.statusCode || 400),
                    result?.code || 'PUBLISH_AUTO_START_FAILED',
                    result?.message || '자동 발행 시작에 실패했습니다.'
                );
            }
            return sendSuccess(res, requestId, result?.data || {});
        }
    };
}

module.exports = {
    createBlogAutoController
};
