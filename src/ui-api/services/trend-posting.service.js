const { createApiError } = require('../errors');
const { createAccessTokenCache } = require('../../trend-posting/access-token-cache');
const { aggregateTrendKeywords, resolveTrendPostingFilters } = require('../../trend-posting/query');
const {
    DEFAULT_TRENDS_API_BASE_URL,
    createTrendPostingRemoteClient
} = require('../../trend-posting/remote-client');

function createTrendPostingService(deps = {}) {
    const License = deps.License;
    const Logger = deps.Logger || console;
    if (!License || typeof License.issueTrendsAccessToken !== 'function') {
        throw new Error('License.issueTrendsAccessToken is required');
    }

    const tokenCache = deps.tokenCache || createAccessTokenCache({
        issueToken: () => License.issueTrendsAccessToken()
    });
    const remoteClient = deps.remoteClient || createTrendPostingRemoteClient({
        axios: deps.axios,
        tokenCache,
        baseUrl: deps.baseUrl || DEFAULT_TRENDS_API_BASE_URL
    });

    function translateError(error, fallbackCode, fallbackMessage) {
        if (error?.apiCode) throw error;
        if (error?.code === 'LICENSE_NOT_ACTIVE') {
            throw createApiError(401, error.code, error.message || '유효한 라이선스가 필요합니다.');
        }
        if (error?.code === 'TRENDS_TOKEN_ISSUE_FAILED') {
            throw createApiError(503, error.code, error.message || '트렌드 접근 권한을 확인하지 못했습니다.');
        }
        if (error?.code === 'TRENDS_REMOTE_RATE_LIMITED') {
            throw createApiError(429, error.code, '트렌드 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
        }
        if (error?.code === 'TRENDS_REMOTE_UNAUTHORIZED') {
            throw createApiError(401, error.code, '트렌드 조회 인증이 만료되었습니다. 다시 시도해 주세요.');
        }
        Logger.warn?.(`[TrendPosting] ${fallbackCode}: ${String(error?.message || error)}`);
        throw createApiError(502, fallbackCode, fallbackMessage);
    }

    return {
        async getMeta() {
            try {
                const result = await remoteClient.getMeta();
                if (!result?.success) throw new Error(result?.message || 'invalid trends metadata');
                return {
                    categories: Array.isArray(result.categories) ? result.categories.map(String).filter(Boolean) : [],
                    availableDates: Array.isArray(result.availableDates) ? result.availableDates.map(String).filter(Boolean) : [],
                    dateRange: {
                        min: String(result?.dateRange?.min || ''),
                        max: String(result?.dateRange?.max || '')
                    }
                };
            } catch (error) {
                return translateError(error, 'TREND_POSTING_META_FAILED', '트렌드 조회 정보를 불러오지 못했습니다.');
            }
        },

        async getKeywords({ searchParams } = {}) {
            let filters;
            try {
                filters = resolveTrendPostingFilters(searchParams);
            } catch (error) {
                throw createApiError(400, 'TREND_POSTING_FILTER_INVALID', error.message);
            }

            try {
                const result = await remoteClient.getRows(filters);
                if (!result?.success || !Array.isArray(result.items)) {
                    throw new Error(result?.message || 'invalid trends response');
                }
                if (result.items.length >= 5000) {
                    throw createApiError(
                        400,
                        'TREND_POSTING_QUERY_TOO_BROAD',
                        '조회 결과가 너무 많습니다. 기간이나 주제를 줄여 주세요.'
                    );
                }
                const items = aggregateTrendKeywords(result.items);
                return {
                    filters,
                    rawCount: result.items.length,
                    count: items.length,
                    items
                };
            } catch (error) {
                return translateError(error, 'TREND_POSTING_KEYWORDS_FAILED', '트렌드 키워드를 불러오지 못했습니다.');
            }
        },

        clearAccessToken() {
            tokenCache.clear();
        }
    };
}

module.exports = {
    createTrendPostingService
};
