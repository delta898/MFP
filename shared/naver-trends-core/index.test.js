const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCollectedTrendPayload,
    normalizeCollectedTrendItem,
    resolveTrendDateInput
} = require('./index');

test('buildCollectedTrendPayload normalizes source, timestamps, and valid items only', () => {
    const payload = buildCollectedTrendPayload({
        date: '2026-04-01',
        keywords: [
            { category: '맛집', keyword: '성수 맛집', changeRaw: '▲ 48', displayOrder: 3 },
            { category: ' ', keyword: '무효', changeRaw: '▲ 1' },
            { category: '여행', keyword: '제주 여행', changeRaw: '-' }
        ]
    }, {
        source: 'naver_trends',
        collectedAt: '2026-04-02T01:02:03+09:00'
    });

    assert.equal(payload.source, 'naver_trends');
    assert.equal(payload.trendDate, '2026-04-01');
    assert.equal(payload.collectedAt, '2026-04-01T16:02:03.000Z');
    assert.equal(payload.itemCount, 2);
    assert.deepEqual(payload.items, [
        {
            category: '맛집',
            keyword: '성수 맛집',
            variation: '+48',
            changeRaw: '▲ 48',
            changeType: 'up',
            changeAmount: 48,
            displayOrder: 3
        },
        {
            category: '여행',
            keyword: '제주 여행',
            variation: '-',
            changeRaw: '-',
            changeType: 'steady',
            changeAmount: null,
            displayOrder: 3
        }
    ]);
});

test('resolveTrendDateInput accepts explicit ymd and compact ymd forms', () => {
    assert.equal(resolveTrendDateInput('2026-04-02'), '2026-04-02');
    assert.equal(resolveTrendDateInput('20260402'), '2026-04-02');
});

test('normalizeCollectedTrendItem preserves signed variation for app consumers and raw change fields for API consumers', () => {
    const up = normalizeCollectedTrendItem({ category: '맛집', keyword: '버거킹 와퍼', changeRaw: '▲ 48' }, 0);
    const down = normalizeCollectedTrendItem({ category: '맛집', keyword: '맘스터치 후떡죽', variation: '-3' }, 1);
    const latest = normalizeCollectedTrendItem({ category: '맛집', keyword: '마산 통술집', changeRaw: 'new' }, 2);

    assert.deepEqual(up, {
        category: '맛집',
        keyword: '버거킹 와퍼',
        variation: '+48',
        changeRaw: '▲ 48',
        changeType: 'up',
        changeAmount: 48,
        displayOrder: 1
    });
    assert.equal(down.changeRaw, '▼ 3');
    assert.equal(down.variation, '-3');
    assert.equal(latest.changeType, 'new');
    assert.equal(latest.changeAmount, null);
});
