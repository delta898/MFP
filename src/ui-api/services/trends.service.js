const { createApiError } = require('../errors');

function createTrendsService(deps = {}) {
    const {
        Utils,
        ensureSheetsReadyForUi,
        parseIntSafe,
        normalizeSortDir,
        executeTrendCollectAction,
        executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction
    } = deps;

    return {
        async collectTrends(requestBody = {}) {
            const result = await executeTrendCollectAction(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'TRENDS_COLLECT_FAILED', result.message || '트렌드 수집에 실패했습니다.');
            }
            return result.data;
        },

        async getTrendsItems({ searchParams }) {
            await ensureSheetsReadyForUi();
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            return Utils.readGoogleSheetTrendsAll({ status, q, limit, offset, sortBy, sortDir });
        },

        async getKeywordsItems({ searchParams }) {
            await ensureSheetsReadyForUi();
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            return Utils.readGoogleSheetKeywordsAll({ status, q, limit, offset });
        },

        async trendsToTopics(requestBody = {}) {
            const result = await executeTrendsToTopicsAction(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'TRENDS_TO_TOPICS_FAILED', result.message || 'trends→topics 처리에 실패했습니다.');
            }
            return result.data;
        },

        async keywordsToTopics(requestBody = {}) {
            const result = await executeKeywordsToTopicsAction(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'KEYWORDS_TO_TOPICS_FAILED', result.message || 'keywords→topics 처리에 실패했습니다.');
            }
            return result.data;
        }
    };
}

module.exports = {
    createTrendsService
};

