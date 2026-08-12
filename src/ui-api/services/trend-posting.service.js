const { createApiError } = require('../errors');
const { createAccessTokenCache } = require('../../trend-posting/access-token-cache');
const { aggregateTrendKeywords, resolveTrendPostingFilters } = require('../../trend-posting/query');
const {
    DEFAULT_TRENDS_API_BASE_URL,
    createTrendPostingRemoteClient
} = require('../../trend-posting/remote-client');

function createTrendPostingService(deps = {}) {
    const License = deps.License;
    const Utils = deps.Utils;
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

    function isValidYmd(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }

    function normalizeTopicKey(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
    }

    function parseTopicCreatedAt(value) {
        const text = String(value || '').trim();
        if (!text) return NaN;
        const kstMatch = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
        return Date.parse(kstMatch ? `${kstMatch[1]}T${kstMatch[2]}+09:00` : text);
    }

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

        async getRecentTopicKeywords({ searchParams } = {}) {
            if (!Utils || typeof Utils.readGoogleSheetTopicsAll !== 'function') {
                throw createApiError(500, 'TREND_POSTING_TOPIC_STORE_UNAVAILABLE', '글감 저장소를 사용할 수 없습니다.');
            }
            const requestedDays = Number.parseInt(searchParams?.get?.('days') || '15', 10);
            const days = Number.isInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 365
                ? requestedDays
                : 15;
            if (typeof License.checkLicenseStatus !== 'function') {
                throw createApiError(500, 'TREND_POSTING_LICENSE_CHECK_UNAVAILABLE', '라이선스 상태를 확인할 수 없습니다.');
            }

            const licenseStatus = await License.checkLicenseStatus();
            if (!licenseStatus?.success) {
                throw createApiError(401, 'LICENSE_NOT_ACTIVE', licenseStatus?.message || '유효한 라이선스가 필요합니다.');
            }
            const result = await Utils.readGoogleSheetTopicsAll({
                limit: 100000,
                offset: 0,
                sortBy: 'rowNumber',
                sortDir: 'desc'
            });
            const cutoffMs = Date.now() - (days * 86400000);
            const keys = new Set();
            for (const topic of Array.isArray(result?.items) ? result.items : []) {
                const createdAtMs = parseTopicCreatedAt(topic?.created_at);
                if (!Number.isFinite(createdAtMs) || createdAtMs < cutoffMs) continue;
                const values = [topic?.subject, ...(Array.isArray(topic?.keywords) ? topic.keywords : [])];
                values.map(normalizeTopicKey).filter(Boolean).forEach((value) => keys.add(value));
            }
            return {
                days,
                count: keys.size,
                keywords: Array.from(keys)
            };
        },

        async saveTopic({ body } = {}) {
            const keyword = String(body?.keyword || '').replace(/\s+/g, ' ').trim();
            const trendDate = String(body?.trendDate || '').trim();
            if (!keyword) {
                throw createApiError(400, 'TREND_POSTING_TOPIC_INVALID', '저장할 트렌드 키워드가 필요합니다.');
            }
            if (!isValidYmd(trendDate)) {
                throw createApiError(400, 'TREND_POSTING_TOPIC_INVALID', '트렌드 날짜가 올바르지 않습니다.');
            }
            if (!Utils || typeof Utils.appendGoogleSheetTopics !== 'function') {
                throw createApiError(500, 'TREND_POSTING_TOPIC_STORE_UNAVAILABLE', '글감 저장소를 사용할 수 없습니다.');
            }
            if (typeof License.checkLicenseStatus !== 'function') {
                throw createApiError(500, 'TREND_POSTING_LICENSE_CHECK_UNAVAILABLE', '라이선스 상태를 확인할 수 없습니다.');
            }

            try {
                const licenseStatus = await License.checkLicenseStatus();
                if (!licenseStatus?.success) {
                    throw createApiError(401, 'LICENSE_NOT_ACTIVE', licenseStatus?.message || '유효한 라이선스가 필요합니다.');
                }
                const appendResult = await Utils.appendGoogleSheetTopics([{
                    subject: keyword,
                    keywords: [keyword],
                    source: 'naver_trend',
                    trendDate,
                    status: '대기'
                }], {
                    defaultStatus: '대기',
                    postAppendDelayMs: 0
                });
                if (!appendResult?.success) {
                    throw createApiError(
                        502,
                        'TREND_POSTING_TOPIC_SAVE_FAILED',
                        String(appendResult?.message || 'Google Spreadsheet topics 행을 추가하지 못했습니다.')
                    );
                }
                return {
                    keyword,
                    trendDate,
                    source: 'naver_trend',
                    status: '대기',
                    rowNumber: Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] ?? null : null,
                    rowIndex: Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] ?? null : null
                };
            } catch (error) {
                if (error?.apiCode) throw error;
                Logger.warn?.(`[TrendPosting] TREND_POSTING_TOPIC_SAVE_FAILED: ${String(error?.message || error)}`);
                const detail = String(error?.message || '').trim();
                throw createApiError(
                    502,
                    'TREND_POSTING_TOPIC_SAVE_FAILED',
                    detail ? `글감 저장에 실패했습니다: ${detail}` : '글감을 저장하지 못했습니다.'
                );
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
