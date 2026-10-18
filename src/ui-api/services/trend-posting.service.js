const { createApiError } = require('../errors');

function toApiError(error, fallbackCode, fallbackMessage, logger) {
    if (error?.apiCode) throw error;
    const code = String(error?.code || '');
    const known = {
        LICENSE_NOT_ACTIVE: [401, '유효한 라이선스가 필요합니다.'],
        TRENDS_TOKEN_ISSUE_FAILED: [503, '트렌드 접근 권한을 확인하지 못했습니다.'],
        TRENDS_API_NOT_CONFIGURED: [503, '현재 환경의 트렌드 서버가 설정되지 않았습니다.'],
        TRENDS_REMOTE_RATE_LIMITED: [429, '트렌드 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.'],
        TRENDS_REMOTE_UNAUTHORIZED: [401, '트렌드 조회 인증이 만료되었습니다. 다시 시도해 주세요.'],
        TREND_POSTING_FILTER_INVALID: [400, error?.message || '조회 조건을 확인해 주세요.'],
        TREND_POSTING_QUERY_TOO_BROAD: [400, error?.message || '조회 범위를 줄여 주세요.'],
        TREND_POSTING_TOPIC_INVALID: [400, error?.message || '저장할 글감 정보를 확인해 주세요.'],
        TREND_POSTING_TOPIC_STORE_UNAVAILABLE: [500, error?.message || '글감 저장소를 사용할 수 없습니다.'],
        TREND_POSTING_LICENSE_CHECK_UNAVAILABLE: [500, error?.message || '라이선스 상태를 확인할 수 없습니다.'],
        TREND_POSTING_TOPIC_SAVE_FAILED: [502, error?.message || '글감을 저장하지 못했습니다.']
    };
    const mapped = known[code];
    if (mapped) throw createApiError(mapped[0], code, mapped[1]);
    logger?.warn?.(`[TrendPosting] ${fallbackCode}: ${String(error?.message || error)}`);
    throw createApiError(502, fallbackCode, fallbackMessage);
}

function createTrendPostingService(deps = {}) {
    const application = deps.application;
    const logger = deps.Logger || console;
    if (!application) throw new Error('Blog Trend Posting Application is required');
    return {
        async getMeta() {
            try { return await application.getMeta(); }
            catch (error) { return toApiError(error, 'TREND_POSTING_META_FAILED', '트렌드 조회 정보를 불러오지 못했습니다.', logger); }
        },
        async getKeywords(options) {
            try { return await application.getKeywords(options); }
            catch (error) { return toApiError(error, 'TREND_POSTING_KEYWORDS_FAILED', '트렌드 키워드를 불러오지 못했습니다.', logger); }
        },
        async getRecentTopicKeywords(options) {
            try { return await application.getRecentTopicKeywords(options); }
            catch (error) { return toApiError(error, 'TREND_POSTING_RECENT_TOPICS_FAILED', '최근 저장 글감을 불러오지 못했습니다.', logger); }
        },
        async saveTopic(options) {
            try { return await application.saveTopic(options); }
            catch (error) { return toApiError(error, 'TREND_POSTING_TOPIC_SAVE_FAILED', '글감을 저장하지 못했습니다.', logger); }
        },
        clearAccessToken: deps.clearAccessToken || (() => {})
    };
}

module.exports = { createTrendPostingService };
