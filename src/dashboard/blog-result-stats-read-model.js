const { classifyBlogPublishResultEvent } = require('../memory/blog-publish-result');

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildKoreanPeriodBoundaries(nowValue = new Date()) {
    const now = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue);
    if (Number.isNaN(now.getTime())) throw new Error('유효한 기준 시간이 필요합니다.');
    const shifted = new Date(now.getTime() + KST_OFFSET_MS);
    const dayStartUtc = Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate()
    ) - KST_OFFSET_MS;
    const koreanWeekday = shifted.getUTCDay();
    const daysSinceMonday = (koreanWeekday + 6) % 7;
    const weekStartUtc = dayStartUtc - (daysSinceMonday * DAY_MS);

    return {
        today: {
            from: new Date(dayStartUtc).toISOString(),
            to: new Date(dayStartUtc + DAY_MS).toISOString()
        },
        week: {
            from: new Date(weekStartUtc).toISOString(),
            to: new Date(weekStartUtc + (7 * DAY_MS)).toISOString()
        },
        month: {
            from: new Date(dayStartUtc - (29 * DAY_MS)).toISOString(),
            to: new Date(dayStartUtc + DAY_MS).toISOString()
        }
    };
}

function countPeriod(results, period) {
    const fromMs = Date.parse(period.from);
    const toMs = Date.parse(period.to);
    const selected = results.filter((result) => {
        const timestamp = Date.parse(result.timestamp || '');
        return Number.isFinite(timestamp) && timestamp >= fromMs && timestamp < toMs;
    });
    return {
        from: period.from,
        to: period.to,
        processed_count: selected.length,
        published_count: selected.filter((result) => result.publicly_published).length
    };
}

function buildDailySeries(results, period) {
    const fromMs = Date.parse(period.from);
    return Array.from({ length: 30 }, (_unused, index) => {
        const startMs = fromMs + (index * DAY_MS);
        const endMs = startMs + DAY_MS;
        const selected = results.filter((result) => {
            const timestamp = Date.parse(result.timestamp || '');
            return Number.isFinite(timestamp) && timestamp >= startMs && timestamp < endMs;
        });
        return {
            date: new Date(startMs + KST_OFFSET_MS).toISOString().slice(0, 10),
            processed_count: selected.length,
            published_count: selected.filter((result) => result.publicly_published).length
        };
    });
}

function buildDashboardBlogResultStats(input = {}) {
    const generatedAt = toIso(input.generatedAt || input.generated_at || new Date());
    if (!generatedAt) throw new Error('유효한 생성 시간이 필요합니다.');
    const available = input.available !== false;
    const periods = buildKoreanPeriodBoundaries(generatedAt);
    const seen = new Set();
    const results = (Array.isArray(input.events) ? input.events : [])
        .map(classifyBlogPublishResultEvent)
        .filter(Boolean)
        .filter((result) => {
            const key = result.id || [result.operation_id, result.platform, result.post_status, result.timestamp].join(':');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((left, right) => Date.parse(right.timestamp || 0) - Date.parse(left.timestamp || 0));

    return {
        schema_version: 1,
        generated_at: generatedAt,
        timezone: 'Asia/Seoul',
        available,
        periods: {
            today: countPeriod(results, periods.today),
            week: countPeriod(results, periods.week),
            month: countPeriod(results, periods.month)
        },
        daily_series: buildDailySeries(results, periods.month),
        recent_results: results.slice(0, 5).map((result) => ({
            id: result.id,
            occurred_at: toIso(result.timestamp),
            subject: result.subject,
            platform: result.platform,
            post_status: result.post_status,
            result_url: result.result_ref || null
        }))
    };
}

module.exports = {
    buildKoreanPeriodBoundaries,
    buildDailySeries,
    buildDashboardBlogResultStats
};
