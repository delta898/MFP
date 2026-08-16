const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordResearchService } = require('./index');

function createGatewayStub() {
    return {
        fetchSearchAdCandidates: async () => [{
            keyword: '경주국립박물관',
            rows: [
                { relKeyword: '경주국립박물관', monthlyPcQcCnt: '1840', monthlyMobileQcCnt: '18500' },
                { relKeyword: '경주여행코스', monthlyPcQcCnt: '1270', monthlyMobileQcCnt: '4320' }
            ]
        }],
        fetchWeeklyDocuments: async () => [
            { keyword: '경주국립박물관', result: { count: 16, status: 'complete', capped: false } },
            { keyword: '경주여행코스', result: { count: 263, status: 'complete', capped: false } }
        ]
    };
}

test('BlogGenius combines gateway observations without selecting a representative keyword', async () => {
    const service = createKeywordResearchService({
        CONFIG: { LICENSE_CHK_URL: 'https://example.supabase.co', LICENSE_CHK_KEY: 'publishable-key' },
        supabaseClient: createGatewayStub()
    });

    const analysis = await service.analyze({
        subject: '경주 국립박물관 신라미술관 관람 팁',
        keywords: ['경주국립박물관'],
        related_assist: true
    });

    assert.equal(analysis.input_keywords[0].weekly_new_blog_documents.count, 16);
    assert.equal(analysis.related_candidates.length, 1);
    assert.equal(analysis.related_candidates[0].keyword, '경주여행코스');
    assert.equal(Object.hasOwn(analysis, 'selected_keyword'), false);
});

test('title generation uses the first input keyword without requesting keyword analysis', async () => {
    let analysisRequested = false;
    const service = createKeywordResearchService({
        CONFIG: { LICENSE_CHK_URL: 'https://example.supabase.co', LICENSE_CHK_KEY: 'publishable-key' },
        supabaseClient: {
            fetchSearchAdCandidates: async () => {
                analysisRequested = true;
                return [];
            }
        },
        titleGenerator: {
            suggestTitles: async (input) => ({
                titles: [{ title: `${input.keyword} 기본 제목` }],
                title_mode: input.title_mode
            })
        }
    });

    const result = await service.researchAndSuggestTitles({
        subject: '제주 여행',
        keywords: ['제주 여행']
    });
    assert.equal(result.input_keyword, '제주 여행');
    assert.equal(result.analysis, null);
    assert.equal(analysisRequested, false);
});
