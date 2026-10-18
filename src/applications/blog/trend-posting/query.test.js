const test = require('node:test');
const assert = require('node:assert/strict');

const {
    aggregateTrendKeywords,
    normalizeCategories,
    resolveTrendPostingFilters
} = require('./query');

test('normalizeCategories accepts repeated and comma-separated category values', () => {
    const params = new URLSearchParams([
        ['categories[]', '맛집'],
        ['category[]', '국내여행'],
        ['categories', '맛집,IT·컴퓨터']
    ]);

    assert.deepEqual(normalizeCategories(params), ['맛집', '국내여행', 'IT·컴퓨터']);
});

test('resolveTrendPostingFilters validates required categories and date range', () => {
    assert.deepEqual(resolveTrendPostingFilters(new URLSearchParams({
        categories: '맛집,국내여행',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-11'
    })), {
        categories: ['맛집', '국내여행'],
        dateFrom: '2026-08-05',
        dateTo: '2026-08-11'
    });

    assert.throws(
        () => resolveTrendPostingFilters(new URLSearchParams({
            categories: '맛집',
            dateFrom: '2026-08-11',
            dateTo: '2026-08-10'
        })),
        /dateFrom must be earlier/
    );
});

test('resolveTrendPostingFilters rejects ranges above the query boundary', () => {
    assert.throws(
        () => resolveTrendPostingFilters(new URLSearchParams({
            categories: '맛집',
            dateFrom: '2026-07-01',
            dateTo: '2026-08-11'
        })),
        /date range cannot exceed 31 days/
    );
});

test('resolveTrendPostingFilters limits discovery to five categories', () => {
    assert.throws(
        () => resolveTrendPostingFilters(new URLSearchParams({
            categories: '1,2,3,4,5,6',
            dateFrom: '2026-08-11',
            dateTo: '2026-08-11'
        })),
        /categories cannot exceed 5/
    );
});

test('aggregateTrendKeywords merges normalized keywords and keeps newest row metadata', () => {
    const items = aggregateTrendKeywords([
        {
            keyword: '성수  맛집',
            category: '맛집',
            trend_date: '2026-08-10',
            change_raw: '▲ 10',
            change_type: 'up',
            change_amount: 10,
            display_order: 2
        },
        {
            keyword: '성수 맛집',
            category: '국내여행',
            trend_date: '2026-08-11',
            change_raw: '▲ 48',
            change_type: 'up',
            change_amount: 48,
            display_order: 3
        },
        {
            keyword: '가을 전시',
            category: '공연·전시',
            trend_date: '2026-08-11',
            change_raw: 'NEW',
            change_type: 'new',
            change_amount: null,
            display_order: 1
        }
    ]);

    assert.equal(items.length, 2);
    assert.equal(items[0].keyword, '성수 맛집');
    assert.deepEqual(items[0].categories, ['국내여행', '맛집']);
    assert.equal(items[0].latestTrendDate, '2026-08-11');
    assert.deepEqual(items[0].change, { raw: '▲ 48', type: 'up', amount: 48 });
    assert.equal(items[1].change.type, 'new');
    assert.match(items[0].id, /^[a-f0-9]{20}$/);
});
