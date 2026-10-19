const { aggregateTrendKeywords } = require('../../../services/knowledge/trend-keywords');

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

module.exports = {
    MAX_CATEGORY_COUNT,
    MAX_DATE_RANGE_DAYS,
    normalizeCategories,
    resolveTrendPostingFilters
};
