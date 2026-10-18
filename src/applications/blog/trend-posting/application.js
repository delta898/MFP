const { aggregateTrendKeywords, resolveTrendPostingFilters } = require('./query');

function createApplicationError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

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

function createBlogTrendPostingApplication(deps = {}) {
    const remoteClient = deps.remoteClient;
    const topicStore = deps.topicStore;
    const license = deps.license;
    const logger = deps.logger || console;
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();

    async function requireActiveLicense() {
        if (typeof license?.checkStatus !== 'function') throw createApplicationError('TREND_POSTING_LICENSE_CHECK_UNAVAILABLE', '라이선스 상태를 확인할 수 없습니다.');
        const result = await license.checkStatus();
        if (!result?.success) {
            const error = createApplicationError(result?.code || 'LICENSE_NOT_ACTIVE', result?.message || '유효한 라이선스가 필요합니다.');
            error.status = 401;
            throw error;
        }
    }

    return {
        async getMeta() {
            const result = await remoteClient.getMeta();
            if (!result?.success) throw createApplicationError('TREND_POSTING_META_INVALID', result?.message || '트렌드 조회 응답이 올바르지 않습니다.');
            return {
                categories: Array.isArray(result.categories) ? result.categories.map(String).filter(Boolean) : [],
                availableDates: Array.isArray(result.availableDates) ? result.availableDates.map(String).filter(Boolean) : [],
                dateRange: { min: String(result?.dateRange?.min || ''), max: String(result?.dateRange?.max || '') }
            };
        },

        async getKeywords({ searchParams } = {}) {
            let filters;
            try {
                filters = resolveTrendPostingFilters(searchParams);
            } catch (error) {
                throw createApplicationError('TREND_POSTING_FILTER_INVALID', error.message);
            }
            const result = await remoteClient.getRows(filters);
            if (!result?.success || !Array.isArray(result.items)) throw createApplicationError('TREND_POSTING_RESPONSE_INVALID', result?.message || '트렌드 조회 응답이 올바르지 않습니다.');
            if (result.items.length >= 5000) throw createApplicationError('TREND_POSTING_QUERY_TOO_BROAD', '조회 결과가 너무 많습니다. 기간이나 주제를 줄여 주세요.');
            const items = aggregateTrendKeywords(result.items);
            return { filters, rawCount: result.items.length, count: items.length, items };
        },

        async getRecentTopicKeywords({ searchParams } = {}) {
            if (typeof topicStore?.listAll !== 'function') throw createApplicationError('TREND_POSTING_TOPIC_STORE_UNAVAILABLE', '글감 저장소를 사용할 수 없습니다.');
            const requestedDays = Number.parseInt(searchParams?.get?.('days') || '15', 10);
            const days = Number.isInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 365 ? requestedDays : 15;
            await requireActiveLicense();
            const result = await topicStore.listAll({ limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'desc' });
            const cutoffMs = now() - (days * 86400000);
            const keys = new Set();
            for (const topic of Array.isArray(result?.items) ? result.items : []) {
                const createdAtMs = parseTopicCreatedAt(topic?.created_at);
                if (!Number.isFinite(createdAtMs) || createdAtMs < cutoffMs) continue;
                [topic?.subject, ...(Array.isArray(topic?.keywords) ? topic.keywords : [])].map(normalizeTopicKey).filter(Boolean).forEach((value) => keys.add(value));
            }
            return { days, count: keys.size, keywords: Array.from(keys) };
        },

        async saveTopic({ body } = {}) {
            const keyword = String(body?.keyword || '').replace(/\s+/g, ' ').trim();
            const trendDate = String(body?.trendDate || '').trim();
            if (!keyword) throw createApplicationError('TREND_POSTING_TOPIC_INVALID', '저장할 트렌드 키워드가 필요합니다.');
            if (!isValidYmd(trendDate)) throw createApplicationError('TREND_POSTING_TOPIC_INVALID', '트렌드 날짜가 올바르지 않습니다.');
            if (typeof topicStore?.append !== 'function') throw createApplicationError('TREND_POSTING_TOPIC_STORE_UNAVAILABLE', '글감 저장소를 사용할 수 없습니다.');
            await requireActiveLicense();
            try {
                const result = await topicStore.append([{
                    subject: keyword, keywords: [keyword], source: 'naver_trend', trendDate, status: '대기'
                }], { defaultStatus: '대기', postAppendDelayMs: 0 });
                if (!result?.success) throw createApplicationError('TREND_POSTING_TOPIC_SAVE_FAILED', String(result?.message || 'Google Spreadsheet topics 행을 추가하지 못했습니다.'));
                return {
                    keyword, trendDate, source: 'naver_trend', status: '대기',
                    rowNumber: Array.isArray(result.rowNumbers) ? result.rowNumbers[0] ?? null : null,
                    rowIndex: Array.isArray(result.rowIndices) ? result.rowIndices[0] ?? null : null
                };
            } catch (error) {
                logger.warn?.(`[TrendPosting] TREND_POSTING_TOPIC_SAVE_FAILED: ${String(error?.message || error)}`);
                if (error?.code === 'TREND_POSTING_TOPIC_SAVE_FAILED') throw error;
                const detail = String(error?.message || '').trim();
                throw createApplicationError('TREND_POSTING_TOPIC_SAVE_FAILED', detail ? `글감 저장에 실패했습니다: ${detail}` : '글감을 저장하지 못했습니다.');
            }
        }
    };
}

module.exports = { createBlogTrendPostingApplication };
