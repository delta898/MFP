const { createApiError } = require('../../adapters/ui/errors');

function createTrendsService(deps = {}) {
    const {
        Utils,
        GoogleSheets,
        Logger,
        ensureSheetsReadyForUi,
        parseIntSafe,
        normalizeSortDir,
        executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction
    } = deps;

    return {
        async getTrendsItems({ searchParams }) {
            await ensureSheetsReadyForUi();
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            return GoogleSheets.readGoogleSheetTrendsAll({ status, q, limit, offset, sortBy, sortDir });
        },

        async getKeywordsItems({ searchParams }) {
            await ensureSheetsReadyForUi();
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            return GoogleSheets.readGoogleSheetKeywordsAll({ status, q, limit, offset });
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

