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
    const selected = selectPeriodResults(results, period);
    return {
        from: period.from,
        to: period.to,
        processed_count: selected.length,
        published_count: selected.filter((result) => result.publicly_published).length
    };
}

function selectPeriodResults(results, period) {
    const fromMs = Date.parse(period.from);
    const toMs = Date.parse(period.to);
    return results.filter((result) => {
        const timestamp = Date.parse(result.timestamp || '');
        return Number.isFinite(timestamp) && timestamp >= fromMs && timestamp < toMs;
    });
}

function buildDailySeries(results, period, dayCount) {
    const fromMs = Date.parse(period.from);
    return Array.from({ length: dayCount }, (_unused, index) => {
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

function normalizeExternalUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
        return parsed.toString();
    } catch (_ignore) {
        return null;
    }
}

function toResultItem(result, platformHomeUrls = {}) {
    const resultUrl = normalizeExternalUrl(result.result_ref);
    const platformHomeUrl = normalizeExternalUrl(platformHomeUrls?.[result.platform]);
    const isDraft = result.post_status === 'draft';
    const navigableResultUrl = isDraft ? null : resultUrl;
    return {
        id: result.id,
        occurred_at: toIso(result.timestamp),
        subject: result.subject,
        platform: result.platform,
        post_status: result.post_status,
        result_url: navigableResultUrl,
        navigation_url: navigableResultUrl || platformHomeUrl,
        navigation_kind: navigableResultUrl ? 'result' : (platformHomeUrl ? 'platform_home' : null)
    };
}

function buildPeriodResult(results, period, options = {}) {
    const selected = selectPeriodResults(results, period);
    return {
        ...countPeriod(results, period),
        daily_series: options.dayCount
            ? buildDailySeries(selected, period, options.dayCount)
            : [],
        recent_results: selected.slice(0, 5).map((result) => toResultItem(result, options.platformHomeUrls))
    };
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
        schema_version: 2,
        generated_at: generatedAt,
        timezone: 'Asia/Seoul',
        available,
        periods: {
            today: buildPeriodResult(results, periods.today, {
                platformHomeUrls: input.platformHomeUrls
            }),
            week: buildPeriodResult(results, periods.week, {
                dayCount: 7,
                platformHomeUrls: input.platformHomeUrls
            }),
            month: buildPeriodResult(results, periods.month, {
                dayCount: 30,
                platformHomeUrls: input.platformHomeUrls
            })
        }
    };
}

module.exports = {
    buildKoreanPeriodBoundaries,
    buildDailySeries,
    buildDashboardBlogResultStats
};
