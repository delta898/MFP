const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildKeywordAnalysis,
    collectWeeklyDocumentKeywords,
    prepareKeywordPlan
} = require('./keyword-metrics-engine');

function rows(...items) {
    return items.map(([relKeyword, pc, mobile]) => ({
        relKeyword,
        monthlyPcQcCnt: String(pc),
        monthlyMobileQcCnt: String(mobile)
    }));
}

test('related candidates are kept without semantic filtering and low-volume inputs are measured', () => {
    const plan = prepareKeywordPlan({
        subject: '서현역 회식 장소 추천',
        keywords: ['서현역고기집'],
        rowsByKeyword: new Map([['서현역고기집', rows(
            ['서현역고기집', 5, 5],
            ['강남회식장소추천', 40, 40],
            ['서현역맛집', 100, 900]
        )]])
    });

    assert.deepEqual(plan.relatedRows.map((item) => item.row.relKeyword), ['강남회식장소추천', '서현역맛집']);
    assert.deepEqual(collectWeeklyDocumentKeywords(plan), ['서현역고기집', '강남회식장소추천', '서현역맛집']);
});

test('input keywords retain input order while related keywords are sorted only by measured opportunity', () => {
    const plan = prepareKeywordPlan({
        subject: '경주 국립박물관 관람 팁',
        keywords: ['경주국립박물관', '신라미술관'],
        rowsByKeyword: new Map([['경주국립박물관', rows(
            ['경주국립박물관', 1840, 18500],
            ['경주국립박물관추천', 40, 100],
            ['경주여행코스', 40, 100]
        )], ['신라미술관', rows(['신라미술관', 10, 20])]])
    });
    const analysis = buildKeywordAnalysis({
        plan,
        weeklyDocuments: new Map([
            ['경주국립박물관', { count: 16 }],
            ['신라미술관', { count: 3 }],
            ['경주국립박물관추천', { count: 120 }],
            ['경주여행코스', { count: 5 }]
        ])
    });

    assert.deepEqual(analysis.input_keywords.map((item) => item.keyword), ['경주국립박물관', '신라미술관']);
    assert.deepEqual(analysis.related_candidates.map((item) => item.keyword), ['경주여행코스', '경주국립박물관추천']);
    assert.equal(Object.hasOwn(analysis, 'selected_keyword'), false);
});

test('capped weekly documents expose an opportunity upper bound without claiming an exact score', () => {
    const plan = prepareKeywordPlan({
        subject: '검색 경쟁 확인',
        keywords: ['테스트키워드'],
        rowsByKeyword: new Map([['테스트키워드', rows(['테스트키워드', 1550, 1550])]])
    });
    const analysis = buildKeywordAnalysis({
        plan,
        weeklyDocuments: new Map([[
            '테스트키워드',
            { count: 300, status: 'lower_bound', capped: true, pages_fetched: 3 }
        ]])
    });

    const candidate = analysis.input_keywords[0];
    assert.equal(candidate.estimated_weekly_search_volume, 700);
    assert.deepEqual(candidate.opportunity, {
        status: 'upper_bound',
        estimated_weekly_searches_per_new_document: null,
        max_estimated_weekly_searches_per_new_document: 2.333333
    });
});
