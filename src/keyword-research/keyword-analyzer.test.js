const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseCount,
    DEFAULT_CANDIDATE_LIMIT,
    normalizedKeyword,
    parseKeywords,
    validateRequest,
    competitionLevel,
    buildCandidate,
    compareCandidates,
    analyzeKeywords
} = require('./keyword-analyzer');

test('parseCount handles numbers, strings, commas, and masked values', () => {
    assert.deepEqual(parseCount(120), { count: 120, raw: '120' });
    assert.deepEqual(parseCount('1,500'), { count: 1500, raw: '1,500' });
    assert.deepEqual(parseCount('< 10'), { count: 5, raw: '< 10' });
    assert.deepEqual(parseCount(null), { count: null, raw: null });
    assert.deepEqual(parseCount('invalid'), { count: null, raw: 'invalid' });
});

test('parseKeywords parses comma strings, arrays, and JSON arrays', () => {
    assert.deepEqual(parseKeywords(['사과', '바나나']), ['사과', '바나나']);
    assert.deepEqual(parseKeywords('사과, 바나나, 사과'), ['사과', '바나나']);
    assert.deepEqual(parseKeywords('["사과", "바나나"]'), ['사과', '바나나']);
});

test('validateRequest validates keyword count, subject, and bounds', () => {
    assert.throws(() => validateRequest({ keywords: [], subject: '주제' }), /최소 1개의 키워드/);
    assert.throws(() => validateRequest({ keywords: ['1', '2', '3', '4'], subject: '주제' }), /최대 3개/);
    assert.throws(() => validateRequest({ keywords: ['1'], subject: '' }), /주제\(subject\)가 필요/);
    assert.doesNotThrow(() => validateRequest({ keywords: ['1'], subject: '유효 주제', related_limit: 20, candidate_limit: 30, min_search_volume: 300 }));
});

test('validateRequest accepts gateway-managed input and candidate limits', () => {
    assert.doesNotThrow(() => validateRequest({
        keywords: ['1', '2', '3', '4', '5'],
        subject: '주제',
        related_assist: true,
        related_limit: 12,
        candidate_limit: 12,
        min_search_volume: 300
    }, {
        maxInputCount: 5,
        maxRelatedCandidates: 12
    }));
});

test('competitionLevel calculates correct levels', () => {
    assert.equal(competitionLevel(0.5), '낮음');
    assert.equal(competitionLevel(3.2), '보통');
    assert.equal(competitionLevel(6.0), '높음');
});

test('buildCandidate and compareCandidates rank candidates deterministically', () => {
    const rowA = { relKeyword: '키워드A', monthlyPcQcCnt: '500', monthlyMobileQcCnt: '1500', compIdx: '높음' };
    const candA = buildCandidate(rowA, 1000, null, ['키워드A'], true, 300);

    assert.equal(candA.monthly_search_volume.total, 2000);
    assert.equal(candA.competition_strength.level, '낮음');
    assert.equal(candA.opportunity.monthly_searches_per_document, 2);
    assert.equal(candA.recommendation_eligibility.eligible, true);

    const rowB = { relKeyword: '키워드B', monthlyPcQcCnt: '50', monthlyMobileQcCnt: '50', compIdx: '낮음' };
    const candB = buildCandidate(rowB, 2000, null, ['키워드B'], true, 300);
    assert.equal(candB.recommendation_eligibility.eligible, false);

    const list = [candB, candA].sort(compareCandidates);
    assert.equal(list[0].keyword, '키워드A');
});

test('analyzeKeywords orchestrates search ad and blog search clients correctly', async () => {
    const mockSearchAdClient = {
        fetchKeywordRows: async (keyword) => {
            if (keyword === '제주 여행') {
                return [
                    { relKeyword: '제주 여행', monthlyPcQcCnt: '1000', monthlyMobileQcCnt: '4000', compIdx: '중간' },
                    { relKeyword: '제주도 맛집', monthlyPcQcCnt: '2000', monthlyMobileQcCnt: '8000', compIdx: '높음' }
                ];
            }
            return [];
        }
    };

    const mockBlogSearchClient = {
        fetchBlogTotal: async (keyword) => {
            if (keyword === '제주 여행') return { total: 5000, error: null };
            if (keyword === '제주도 맛집') return { total: 15000, error: null };
            return { total: 100, error: null };
        }
    };

    const result = await analyzeKeywords(
        {
            keywords: ['제주 여행'],
            subject: '제주도 3박 4일 여행 코스 추천',
            related_assist: true,
            min_search_volume: 300
        },
        {
            searchAdClient: mockSearchAdClient,
            blogSearchClient: mockBlogSearchClient
        }
    );

    assert.equal(result.subject, '제주도 3박 4일 여행 코스 추천');
    assert.equal(result.input_keywords.length, 1);
    assert.equal(result.input_keywords[0].keyword, '제주 여행');
    assert.equal(result.input_keywords[0].monthly_search_volume.total, 5000);
    assert.equal(result.related_candidates.length, 1);
    assert.equal(result.related_candidates[0].keyword, '제주도 맛집');
    assert.equal(result.related_candidates[0].monthly_search_volume.total, 10000);
});

test('analyzeKeywords shortlists eight eligible related keywords before blog lookups', async () => {
    const relatedRows = Array.from({ length: 10 }, (_, index) => ({
        relKeyword: `가전제품${index + 1}`,
        monthlyPcQcCnt: String(1000 - index * 10),
        monthlyMobileQcCnt: '1000',
        compIdx: '중간'
    }));
    relatedRows.push({
        relKeyword: '제주도 아이 여행',
        monthlyPcQcCnt: '200',
        monthlyMobileQcCnt: '200',
        compIdx: '낮음'
    });
    relatedRows.push({
        relKeyword: '제주도 저검색 후보',
        monthlyPcQcCnt: '50',
        monthlyMobileQcCnt: '50',
        compIdx: '낮음'
    });

    const blogLookups = [];
    const result = await analyzeKeywords({
        keywords: ['제주 여행'],
        subject: '아이와 함께하는 제주도 여행',
        related_assist: true,
        min_search_volume: 300
    }, {
        searchAdClient: {
            fetchKeywordRows: async () => [
                { relKeyword: '제주 여행', monthlyPcQcCnt: '500', monthlyMobileQcCnt: '1000', compIdx: '중간' },
                ...relatedRows
            ]
        },
        blogSearchClient: {
            fetchBlogTotal: async (keyword) => {
                blogLookups.push(keyword);
                return { total: 1000, error: null };
            }
        }
    });

    assert.equal(DEFAULT_CANDIDATE_LIMIT, 8);
    assert.equal(blogLookups.length, 9);
    assert.equal(result.related_candidates.length, 8);
    assert.ok(blogLookups.includes('제주도 아이 여행'));
    assert.ok(!blogLookups.includes('제주도 저검색 후보'));
});
