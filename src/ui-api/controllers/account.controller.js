const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createAccountController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async overview({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                const quietRaw = searchParams?.get('quiet');
                const forceRaw = searchParams?.get('force');
                return sendSuccess(res, requestId, await service.getOverview({
                    quiet: quietRaw == null ? true : String(quietRaw).trim() !== '0',
                    force: forceRaw != null && String(forceRaw).trim() !== '0'
                }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'ACCOUNT_OVERVIEW_FAILED', '계정 및 구독 정보를 불러오지 못했습니다.', error);
            }
        }
    };
}

module.exports = {
    createAccountController
};
