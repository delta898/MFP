const { ensureMethod } = require('./route-common');

function createTrendsRouteHandler(deps = {}) {
    const {
        Utils,
        ensureSheetsReadyForUi,
        parseIntSafe,
        normalizeSortDir,
        executeTrendCollectAction,
        executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction,
        sendSuccess,
        sendError
    } = deps;

    return async function tryHandleTrendsRoute(ctx = {}) {
        const { requestId, method, pathname, searchParams, requestBody, res } = ctx;

        if (pathname === '/api/v1/trends/collect') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            const result = await executeTrendCollectAction(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'TRENDS_COLLECT_FAILED', result.message || '트렌드 수집에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/trends/items') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            try {
                await ensureSheetsReadyForUi();
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            const result = await Utils.readGoogleSheetTrendsAll({ status, q, limit, offset, sortBy, sortDir });
            return sendSuccess(res, requestId, result);
        }

        if (pathname === '/api/v1/keywords/items') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            try {
                await ensureSheetsReadyForUi();
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const result = await Utils.readGoogleSheetKeywordsAll({ status, q, limit, offset });
            return sendSuccess(res, requestId, result);
        }

        if (pathname === '/api/v1/trends/to-topics') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            const result = await executeTrendsToTopicsAction(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'TRENDS_TO_TOPICS_FAILED', result.message || 'trends→topics 처리에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/keywords/to-topics') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            const result = await executeKeywordsToTopicsAction(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'KEYWORDS_TO_TOPICS_FAILED', result.message || 'keywords→topics 처리에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        return false;
    };
}

module.exports = {
    createTrendsRouteHandler
};

