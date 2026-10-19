'use strict';

function parseIntSafe(input, fallback = null, min = null) {
    const parsed = parseInt(input, 10);
    if (Number.isNaN(parsed)) return fallback;
    if (min !== null && parsed < min) return fallback;
    return parsed;
}

function parseBoolQuery(input) {
    const value = String(input || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(value);
}

function normalizeSortDir(input, fallback = 'desc') {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'desc') return 'desc';
    if (value === 'asc') return 'asc';
    return fallback;
}

module.exports = { parseIntSafe, parseBoolQuery, normalizeSortDir };
