const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildQuickPublishSuggestionResponse,
    createQuickPublishSuggestionService,
    normalizeQuickPublishInput
} = require('./quick-publish-suggestion');

test('normalizeQuickPublishInput resolves subject, keywords, and title mode', () => {
    const input = normalizeQuickPublishInput({
        subject: ' 블로그 자동화 시작법 ',
        keywords: '블로그 자동화, 네이버 블로그 자동화',
        instruction: '초보자 친화',
        writingStrategy: 'discovery'
    });

    assert.equal(input.subject, '블로그 자동화 시작법');
    assert.deepEqual(input.keywords, ['블로그 자동화', '네이버 블로그 자동화']);
    assert.equal(input.instruction, '초보자 친화');
    assert.equal(input.title_mode, 'discovery');
});

test('normalizeQuickPublishInput falls back from keyword to subject', () => {
    const input = normalizeQuickPublishInput({ keywords: 'AI 글쓰기' });

    assert.equal(input.subject, 'AI 글쓰기');
    assert.deepEqual(input.keywords, ['AI 글쓰기']);
});

test('buildQuickPublishSuggestionResponse returns reviewable apply payloads', () => {
    const response = buildQuickPublishSuggestionResponse(
        {
            subject: '블로그 자동화 시작법',
            keywords: ['블로그 자동화'],
            instruction: '초보자 친화',
            title_mode: 'search'
        },
        {
            subject: '블로그 자동화 시작법',
            input_keyword: '네이버 블로그 자동화',
            analysis: {
                input_keywords: [],
                related_candidates: [{
                    keyword: '네이버 블로그 자동화',
                    monthly_search_volume: { total: 1200, pc: 200, mobile: 1000 },
                    estimated_weekly_search_volume: 270.97,
                    weekly_new_blog_documents: { count: 12, status: 'complete', capped: false },
                    competition_strength: { level: '낮음' },
                    opportunity: { estimated_weekly_searches_per_new_document: 22.58 }
                }]
            },
            titles: [{
                role: '검색 의도형',
                title: '네이버 블로그 자동화 시작 전 확인할 기본 설정',
                seo_reason: '핵심 키워드를 자연스럽게 포함합니다.',
                click_reason: '초보자의 실행 의도를 잡습니다.',
                tradeoff: '구체 설정 내용이 본문에 있어야 합니다.'
            }]
        }
    );

    assert.equal(response.mode, 'review');
    assert.equal(response.suggestions.length, 1);
    assert.equal(response.suggestions[0].keyword, '네이버 블로그 자동화');
    assert.equal(response.suggestions[0].metrics.weekly_new_blog_documents.count, 12);
    assert.equal(response.suggestions[0].title_candidates.length, 1);
    assert.equal(response.suggestions[0].title_candidates[0].apply_payload.subject, '네이버 블로그 자동화 시작 전 확인할 기본 설정');
    assert.deepEqual(response.suggestions[0].title_candidates[0].apply_payload.keywords, ['네이버 블로그 자동화']);
    assert.equal(response.fallback.apply_payload.subject, '블로그 자동화 시작법');
});

test('createQuickPublishSuggestionService delegates to keyword pipeline', async () => {
    const calls = [];
    const service = createQuickPublishSuggestionService({
        keywordResearchService: {
            async researchAndSuggestTitles(input) {
                calls.push(input);
                return {
                    subject: input.subject,
                    input_keyword: 'AI 블로그 글쓰기',
                    titles: [{
                        role: '구체 범위형',
                        title: 'AI 블로그 글쓰기 초보자가 먼저 정할 것'
                    }]
                };
            }
        }
    });

    const result = await service.suggest({
        subject: 'AI로 블로그 글 쓰기',
        keywords: 'AI 글쓰기',
        writingStrategy: 'search'
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].keywords, ['AI 글쓰기']);
    assert.equal(calls[0].title_mode, 'search');
    assert.equal(result.suggestions[0].title_candidates[0].title, 'AI 블로그 글쓰기 초보자가 먼저 정할 것');
});
