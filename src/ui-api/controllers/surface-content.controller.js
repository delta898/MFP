const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createSurfaceContentController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async sidebar({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getSidebar());
            } catch (error) {
                return toErrorResponse(
                    res,
                    requestId,
                    'SURFACE_CONTENT_FAILED',
                    '동적 콘텐츠를 불러오지 못했습니다.',
                    error
                );
            }
        },

        async dashboard({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getDashboard());
            } catch (error) {
                return toErrorResponse(
                    res,
                    requestId,
                    'SURFACE_CONTENT_FAILED',
                    '동적 콘텐츠를 불러오지 못했습니다.',
                    error
                );
            }
        },

        async account({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getAccount());
            } catch (error) {
                return toErrorResponse(
                    res,
                    requestId,
                    'SURFACE_CONTENT_FAILED',
                    '동적 콘텐츠를 불러오지 못했습니다.',
                    error
                );
            }
        },

        async help({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.getHelp());
            } catch (error) {
                return toErrorResponse(
                    res,
                    requestId,
                    'SURFACE_CONTENT_FAILED',
                    '도움말 콘텐츠를 불러오지 못했습니다.',
                    error
                );
            }
        }
    };
}

module.exports = {
    createSurfaceContentController
};
