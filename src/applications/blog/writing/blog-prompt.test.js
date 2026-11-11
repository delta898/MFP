const test = require('node:test');
const assert = require('node:assert/strict');

const BlogPromptPaths = require('./prompts/paths');
const { buildBlogSystemPrompt, resolvePromptPaths } = require('./blog-prompt');

const promptConfig = {
    BLOG_PROMPT_CONTRACT_PATH: BlogPromptPaths.BLOG_PROMPT_CONTRACT_FILE,
    BLOG_PROMPT_COMMON_PATH: BlogPromptPaths.BLOG_PROMPT_COMMON_FILE,
    BLOG_PROMPT_SEARCH_PATH: BlogPromptPaths.BLOG_PROMPT_SEARCH_FILE,
    BLOG_PROMPT_DISCOVERY_PATH: BlogPromptPaths.BLOG_PROMPT_DISCOVERY_FILE
};

test('search and discovery prompts share the output and image contracts', () => {
    const searchPrompt = buildBlogSystemPrompt({
        strategy: 'search',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });
    const discoveryPrompt = buildBlogSystemPrompt({
        strategy: 'discovery',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });

    for (const prompt of [searchPrompt, discoveryPrompt]) {
        assert.match(prompt, /순수 JSON 문자열만 출력/);
        assert.match(prompt, /"title"/);
        assert.match(prompt, /"keywords"/);
        assert.match(prompt, /"hashtags"/);
        assert.match(prompt, /"content"/);
        assert.match(prompt, /\[\[IMAGE_N/);
        assert.match(prompt, /4:3 AR/);
        assert.match(prompt, /본문 문단 바로 뒤에 이미지 블록.*빈 줄을 넣지 말고, 문단 다음 줄에서 이미지 블록을 시작/);
        assert.match(prompt, /IMAGE 블록 다음에는 빈 줄 하나/);
        assert.doesNotMatch(prompt, /분량은 1500~1800자/);
        assert.doesNotMatch(prompt, /이미지 블록은 4~5개/);
    }
});

test('each strategy selects only its own writing rules', () => {
    const searchPrompt = buildBlogSystemPrompt({
        strategy: 'search',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });
    const discoveryPrompt = buildBlogSystemPrompt({
        strategy: 'discovery',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });

    assert.match(searchPrompt, /전략: 검색 중심/);
    assert.match(searchPrompt, /검색 의도/);
    assert.match(searchPrompt, /문장을 여는 방식은 프로필의 도입 규칙/);
    assert.match(searchPrompt, /본문 전체에서는 4회를 넘기지 마세요/);
    assert.match(searchPrompt, /하위 질문, 대상명, 조건, 장단점/);
    assert.match(searchPrompt, /keywords는 핵심 키워드를 첫 항목/);
    assert.match(searchPrompt, /Requested Final Title이 있으면.*제목을 바꾸지 마세요/);
    assert.match(searchPrompt, /정보 완결성이 횟수보다 우선/);
    assert.doesNotMatch(searchPrompt, /content 전체에서 약 4~5회/);
    assert.doesNotMatch(searchPrompt, /전략: 발견 중심/);

    assert.match(discoveryPrompt, /전략: 발견 중심 \(피드\)/);
    assert.match(discoveryPrompt, /피드에서 우연히/);
    assert.doesNotMatch(discoveryPrompt, /전략: 검색 중심/);
    assert.match(discoveryPrompt, /문장을 여는 방식은 프로필의 도입 규칙/);
    assert.doesNotMatch(discoveryPrompt, /본문 전체에서는 4회를 넘기지/);
    assert.doesNotMatch(discoveryPrompt, /content 전체에서 약 4~5회/);
    assert.doesNotMatch(discoveryPrompt, /유사·서브 키워드 중 2~4개/);
    assert.doesNotMatch(discoveryPrompt, /제목 앞 10자|5~10회/);
    assert.doesNotMatch(discoveryPrompt, /네이버|워드프레스/);
});

test('both strategies create an honest curiosity gap and require the body to close it', () => {
    const searchPrompt = buildBlogSystemPrompt({
        strategy: 'search',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });
    const discoveryPrompt = buildBlogSystemPrompt({
        strategy: 'discovery',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });

    for (const prompt of [searchPrompt, discoveryPrompt]) {
        assert.match(prompt, /정직한 호기심 간극/);
        assert.match(prompt, /이유·결과·판단/);
        assert.match(prompt, /반드시 회수/);
        assert.match(prompt, /`이것`/);
        assert.match(prompt, /본문에 없는 경험, 수치|본문에 근거/);
    }

    assert.match(searchPrompt, /메인 키워드 또는 대상 식별 단서/);
    assert.match(searchPrompt, /검색 질문의 답 전체를 제목에 적기보다/);
    assert.match(discoveryPrompt, /무엇에 관한 글인지조차 알 수 없게 전부 감추지는 마세요/);
    assert.match(discoveryPrompt, /다음 내용을 확인해야 의미가 완성되는 열린 고리/);
});

test('invalid strategies safely select the search prompt', () => {
    const paths = resolvePromptPaths({
        strategy: 'invalid',
        config: promptConfig,
        promptPaths: BlogPromptPaths
    });

    assert.equal(paths.normalizedStrategy, 'search');
    assert.equal(paths.strategyPath, BlogPromptPaths.BLOG_PROMPT_SEARCH_FILE);
});

test('missing prompt files fail with a clear contract error', () => {
    assert.throws(
        () => buildBlogSystemPrompt({
            strategy: 'search',
            config: {
                BLOG_PROMPT_COMMON_PATH: '/missing/common.md',
                BLOG_PROMPT_SEARCH_PATH: '/missing/search.md'
            },
            promptPaths: {},
            fileSystem: {
                existsSync: () => false,
                readFileSync: () => ''
            }
        }),
        /블로그 출력·사실성 계약 프롬프트 파일이 없습니다/
    );
});
