const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createSessionLicenseController(deps = {}) {
    const { service, sendSuccess, sendError, logger } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async licenseStatus({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                const data = await service.getLicenseStatus({ quietRaw: searchParams.get('quiet') });
                return sendSuccess(res, requestId, data);
            } catch (e) {
                return toErrorResponse(res, requestId, 'LICENSE_STATUS_FAILED', '라이선스 상태 조회에 실패했습니다.', e);
            }
        },

        async capabilities({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                const data = await service.getCapabilities({ quietRaw: searchParams.get('quiet') });
                return sendSuccess(res, requestId, data);
            } catch (e) {
                return toErrorResponse(res, requestId, 'CAPABILITY_RESOLVE_FAILED', '권한 정보 조회에 실패했습니다.', e);
            }
        },

        async naverSession({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getNaverSession());
            } catch (e) {
                return toErrorResponse(res, requestId, 'NAVER_SESSION_CHECK_FAILED', '네이버 세션 확인에 실패했습니다.', e);
            }
        },

        async naverLoginStatus({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getNaverLoginStatus());
            } catch (e) {
                return toErrorResponse(res, requestId, 'NAVER_LOGIN_STATUS_FAILED', '네이버 로그인 상태 조회에 실패했습니다.', e);
            }
        },

        async naverLoginStart({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                logger.info('🔐 [UI] 네이버 로그인 시작 요청 수신');
                const data = await service.startNaverLogin();
                return sendSuccess(res, requestId, data, 202);
            } catch (e) {
                return toErrorResponse(res, requestId, 'NAVER_LOGIN_START_FAILED', '네이버 로그인 시작에 실패했습니다.', e);
            }
        }
    };
}

module.exports = {
    createSessionLicenseController
};
