const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordResearchService } = require('./index');

function localClients() {
    return {
        searchAdClient: { isConfigured: () => false, fetchKeywordRows: async () => [] },
        blogSearchClient: { isConfigured: () => false, fetchBlogTotal: async () => ({ total: null, error: null }) }
    };
}

test('Supabase transport uses server analysis and local title generation', async () => {
    const service = createKeywordResearchService({
        ...localClients(),
        transport: 'supabase_function',
        supabaseClient: {
            analyze: async () => ({
                selected_keyword: '제주 가족 여행',
                input_keywords: [],
                related_candidates: []
            })
        },
        titleGenerator: {
            suggestTitles: async (input) => ({
                titles: [{ title: `${input.keyword} 완벽 가이드` }],
                title_mode: input.title_mode
            })
        }
    });

    const result = await service.researchAndSuggestTitles({
        subject: '제주 여행',
        keywords: ['제주 여행']
    });
    assert.equal(result.selected_keyword, '제주 가족 여행');
    assert.equal(result.titles[0].title, '제주 가족 여행 완벽 가이드');
    assert.equal(result.analysis_note, null);
});

test('Supabase analysis failure falls back to title generation with the input keyword', async () => {
    const service = createKeywordResearchService({
        ...localClients(),
        transport: 'supabase_function',
        Logger: { warn() {} },
        supabaseClient: {
            analyze: async () => {
                throw new Error('검색량 지표를 불러오지 못했습니다. 입력한 키워드로 제목을 추천합니다.');
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
    assert.equal(result.selected_keyword, '제주 여행');
    assert.match(result.analysis_note, /검색량 지표/);
    assert.equal(result.titles[0].title, '제주 여행 기본 제목');
});
