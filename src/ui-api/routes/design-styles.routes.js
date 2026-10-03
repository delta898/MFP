'use strict';

const { isLoopbackRequest } = require('./site-hosting-site.routes');

function createDesignStylesRouteHandler(deps = {}) {
    const { catalog, sendSuccess, sendError } = deps;
    return async function tryHandleDesignStylesRoute(ctx = {}) {
        if (ctx.pathname !== '/api/v1/settings/design-styles') return false;
        const { method, requestId, res } = ctx;
        if (method !== 'GET') return false;
        if (!isLoopbackRequest(ctx)) {
            await sendError(res, requestId, 403, 'LOCAL_DESIGN_STYLE_CATALOG_REQUIRED', '외모 설정은 BlogGenius에서만 사용할 수 있습니다.');
            return true;
        }
        try {
            await sendSuccess(res, requestId, await catalog.list());
        } catch (error) {
            await sendError(
                res,
                requestId,
                Number.isInteger(error?.status) ? error.status : 502,
                error?.code || 'BLOGGENIUS_UI_STYLE_CATALOG_UNAVAILABLE',
                error?.message || 'UI Style 목록을 불러오지 못했습니다.'
            );
        }
        return true;
    };
}

module.exports = { createDesignStylesRouteHandler };
