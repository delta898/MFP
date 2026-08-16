const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeTitleMode,
    normalizeTitleKeywords,
    buildTitlePrompt,
    parseTitleResponse,
    createTitleGenerator
} = require('./title-generator');

test('normalizeTitleMode defaults to balanced', () => {
    assert.equal(normalizeTitleMode('search'), 'search');
    assert.equal(normalizeTitleMode('discovery'), 'discovery');
    assert.equal(normalizeTitleMode('invalid'), 'balanced');
    assert.equal(normalizeTitleMode(null), 'balanced');
});

test('normalizeTitleKeywords deduplicates and limits title context to three keywords', () => {
    assert.deepEqual(
        normalizeTitleKeywords(['아이폰17, 아이폰 17', '애플 신제품', '아이폰 루머', '추가 키워드']),
        ['아이폰17', '애플 신제품', '아이폰 루머']
    );
});

test('buildTitlePrompt constructs structured prompt with guidelines', () => {
    const prompt = buildTitlePrompt({
        keyword: '구글 애널리틱스 설정',
        subject: 'GA4 초보자 설치 가이드',
        titleMode: 'search'
    });

    assert.ok(prompt.includes('구글 애널리틱스 설정'));
    assert.ok(prompt.includes('GA4 초보자 설치 가이드'));
    assert.ok(prompt.includes('검색 의도형'));
    assert.ok(prompt.includes('상황 공감형'));
    assert.ok(prompt.includes('구체 범위형'));
});

test('buildTitlePrompt keeps one primary keyword and treats other selected keywords as optional context', () => {
    const prompt = buildTitlePrompt({
        keywords: ['아이폰17', '애플 신제품', '아이폰 루머'],
        subject: '아이폰17 출시일과 스펙 변화'
    });

    assert.match(prompt, /핵심 키워드: 아이폰17/);
    assert.match(prompt, /함께 고려할 키워드: 애플 신제품, 아이폰 루머/);
    assert.match(prompt, /억지로 모두 넣지 말고/);
});

test('parseTitleResponse parses JSON response with roles and tradeoffs', () => {
    const rawJson = JSON.stringify({
        titles: [
            {
                role: '검색 의도형',
                title: '구글 애널리틱스 설정 방법과 GA4 초기 세팅 5분 완성',
                seo_reason: '핵심 키워드 전면 배치',
                click_reason: '빠른 세팅 소요 시간 제시',
                tradeoff: '초보자에게는 다소 일반적일 수 있음'
            },
            {
                role: '상황 공감형',
                title: 'GA4 데이터 수집이 막막할 때? 구글 애널리틱스 설정 핵심 가이드',
                seo_reason: '문제 상황 검색자 타겟',
                click_reason: '답답함 해소 약속',
                tradeoff: '즉각적인 빠른 답보다는 가이드 성격'
            }
        ]
    });

    const parsed = parseTitleResponse(rawJson);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].role, '검색 의도형');
    assert.equal(parsed[0].title, '구글 애널리틱스 설정 방법과 GA4 초기 세팅 5분 완성');
    assert.equal(parsed[0].seo_reason, '핵심 키워드 전면 배치');
    assert.equal(parsed[0].click_reason, '빠른 세팅 소요 시간 제시');
    assert.equal(parsed[0].tradeoff, '초보자에게는 다소 일반적일 수 있음');
});

test('parseTitleResponse handles code fences and numbered fallback', () => {
    const fencedJson = '```json\n{"titles":[{"title":"제목1"}]}\n```';
    assert.equal(parseTitleResponse(fencedJson)[0].title, '제목1');

    const numberedList = '1. 첫 번째 제목\n2. 두 번째 제목';
    const parsed = parseTitleResponse(numberedList);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].title, '첫 번째 제목');
    assert.equal(parsed[1].title, '두 번째 제목');
});

test('createTitleGenerator requests concise structured output and returns at most three titles', async () => {
    let receivedRetries = null;
    let receivedOptions = null;
    const mockUtils = {
        callChatText: async (prompt, retries, options) => {
            receivedRetries = retries;
            receivedOptions = options;
            return JSON.stringify({
                titles: [
                    {
                        role: '검색 의도형',
                        title: '테스트 생성된 완벽한 제목',
                        seo_reason: '좋음',
                        click_reason: '클릭유도',
                        tradeoff: '약간 김'
                    },
                    { role: '상황 공감형', title: '두 번째 제목' },
                    { role: '구체 범위형', title: '세 번째 제목' },
                    { role: '추가 제목', title: '네 번째 제목' }
                ]
            });
        }
    };

    const generator = createTitleGenerator({ Utils: mockUtils });
    const result = await generator.suggestTitles({
        keywords: ['테스트 키워드', '보조 키워드'],
        subject: '테스트 주제'
    });

    assert.equal(result.success, true);
    assert.equal(result.titles.length, 3);
    assert.equal(result.titles[0].title, '테스트 생성된 완벽한 제목');
    assert.equal(receivedRetries, 2);
    assert.deepEqual(result.keywords, ['테스트 키워드', '보조 키워드']);
    assert.equal(receivedOptions.maxTokens, 1024);
    assert.equal(receivedOptions.reasoningEffort, 'minimal');
    assert.equal(receivedOptions.responseMimeType, 'application/json');
    assert.equal(receivedOptions.responseJsonSchema.properties.titles.maxItems, 3);
});
