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
        }
    };
}

module.exports = {
    createBlogAutoController
};
