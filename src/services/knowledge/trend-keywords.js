'use strict';

const crypto = require('node:crypto');

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
            id: stableKeywordId(groupKey), keyword, categories: new Set(), latestRow: null
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
            if (a.latestTrendDate !== b.latestTrendDate) return b.latestTrendDate.localeCompare(a.latestTrendDate);
            const riseDiff = riseSortValue(b.change) - riseSortValue(a.change);
            if (riseDiff !== 0) return riseDiff;
            if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
            return a.keyword.localeCompare(b.keyword, 'ko');
        });
}

module.exports = { aggregateTrendKeywords };
