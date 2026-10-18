const crypto = require('crypto');

const MAX_CATEGORY_COUNT = 5;
const MAX_DATE_RANGE_DAYS = 31;

function normalizeYmd(value, fieldName) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error(`${fieldName} must be YYYY-MM-DD`);
    }
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        throw new Error(`${fieldName} must be a valid date`);
    }
    return text;
}

function normalizeCategories(searchParams) {
    const params = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(searchParams || '');
    const values = [
        ...params.getAll('categories[]'),
        ...params.getAll('category[]'),
        ...params.getAll('categories').flatMap((value) => String(value || '').split(','))
    ];
    const categories = Array.from(new Set(values
        .map((value) => String(value || '').trim())
        .filter(Boolean)));

    if (categories.length === 0) {
        throw new Error('at least one category is required');
    }
    if (categories.length > MAX_CATEGORY_COUNT) {
        throw new Error(`categories cannot exceed ${MAX_CATEGORY_COUNT}`);
    }
    return categories;
}

function countInclusiveDays(dateFrom, dateTo) {
    const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
    const to = Date.parse(`${dateTo}T00:00:00.000Z`);
    return Math.floor((to - from) / 86400000) + 1;
}

function resolveTrendPostingFilters(searchParams) {
    const params = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(searchParams || '');
    const categories = normalizeCategories(params);
    const dateFrom = normalizeYmd(params.get('dateFrom') || params.get('date_from'), 'dateFrom');
    const dateTo = normalizeYmd(params.get('dateTo') || params.get('date_to'), 'dateTo');

    if (dateFrom > dateTo) {
        throw new Error('dateFrom must be earlier than or equal to dateTo');
    }
    if (countInclusiveDays(dateFrom, dateTo) > MAX_DATE_RANGE_DAYS) {
        throw new Error(`date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
    }

    return {
        categories,
        dateFrom,
        dateTo
    };
}

function normalizeKeyword(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function keywordGroupKey(value) {
    return normalizeKeyword(value).toLocaleLowerCase('ko-KR');
}

function stableKeywordId(groupKey) {
    return crypto.createHash('sha256').update(groupKey).digest('hex').slice(0, 20);
}

function normalizeDisplayOrder(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
}

function normalizeChange(row = {}) {
    const type = ['up', 'down', 'new', 'steady'].includes(String(row.change_type || '').trim())
        ? String(row.change_type).trim()
        : 'steady';
    const amountValue = row.change_amount === null || row.change_amount === undefined
        ? null
        : Number(row.change_amount);
    return {
        raw: String(row.change_raw || '-').trim() || '-',
        type,
        amount: Number.isFinite(amountValue) ? amountValue : null
    };
}

function isPreferredLatestRow(candidate, current) {
    if (!current) return true;
    const candidateDate = String(candidate.trend_date || '');
    const currentDate = String(current.trend_date || '');
    if (candidateDate !== currentDate) return candidateDate > currentDate;
    return normalizeDisplayOrder(candidate.display_order) < normalizeDisplayOrder(current.display_order);
}

function riseSortValue(change = {}) {
    return change.type === 'up' && Number.isFinite(change.amount) ? change.amount : -1;
}

function aggregateTrendKeywords(rows = []) {
    const groups = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        const keyword = normalizeKeyword(row?.keyword);
        const category = String(row?.category || '').trim();
        const trendDate = String(row?.trend_date || '').trim();
        if (!keyword || !category || !/^\d{4}-\d{2}-\d{2}$/.test(trendDate)) continue;

        const groupKey = keywordGroupKey(keyword);
        const group = groups.get(groupKey) || {
            id: stableKeywordId(groupKey),
            keyword,
            categories: new Set(),
            latestRow: null
        };
        group.categories.add(category);
        if (isPreferredLatestRow(row, group.latestRow)) {
            group.keyword = keyword;
            group.latestRow = row;
        }
        groups.set(groupKey, group);
    }

    return Array.from(groups.values())
        .map((group) => ({
            id: group.id,
            keyword: group.keyword,
            categories: Array.from(group.categories).sort((a, b) => a.localeCompare(b, 'ko')),
            latestTrendDate: String(group.latestRow.trend_date),
            change: normalizeChange(group.latestRow),
            displayOrder: normalizeDisplayOrder(group.latestRow.display_order)
        }))
        .sort((a, b) => {
            if (a.latestTrendDate !== b.latestTrendDate) {
                return b.latestTrendDate.localeCompare(a.latestTrendDate);
            }
            const riseDiff = riseSortValue(b.change) - riseSortValue(a.change);
            if (riseDiff !== 0) return riseDiff;
            if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
            return a.keyword.localeCompare(b.keyword, 'ko');
        });
}

module.exports = {
    MAX_CATEGORY_COUNT,
    MAX_DATE_RANGE_DAYS,
    aggregateTrendKeywords,
    normalizeCategories,
    resolveTrendPostingFilters
};
