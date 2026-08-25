const test = require('node:test');
const assert = require('node:assert/strict');

const Constants = require('../constants');
const { buildBlogSystemPrompt, resolvePromptPaths } = require('./blog-prompt');

const promptConfig = {
    BLOG_PROMPT_CONTRACT_PATH: Constants.BLOG_PROMPT_CONTRACT_FILE,
    BLOG_PROMPT_COMMON_PATH: Constants.BLOG_PROMPT_COMMON_FILE,
    BLOG_PROMPT_SEARCH_PATH: Constants.BLOG_PROMPT_SEARCH_FILE,
    BLOG_PROMPT_DISCOVERY_PATH: Constants.BLOG_PROMPT_DISCOVERY_FILE
};

test('search and discovery prompts share the output and image contracts', () => {
    const searchPrompt = buildBlogSystemPrompt({
        strategy: 'search',
        config: promptConfig,
        constants: Constants
    });
    const discoveryPrompt = buildBlogSystemPrompt({
        strategy: 'discovery',
        config: promptConfig,
        constants: Constants
    });

    for (const prompt of [searchPrompt, discoveryPrompt]) {
        assert.match(prompt, /순수 JSON 문자열만 출력/);
        assert.match(prompt, /"title"/);
        assert.match(prompt, /"keywords"/);
        assert.match(prompt, /"hashtags"/);
        assert.match(prompt, /"content"/);
        assert.match(prompt, /\[\[IMAGE_N/);
        assert.match(prompt, /4:3 AR/);
        assert.doesNotMatch(prompt, /분량은 1500~1800자/);
        assert.doesNotMatch(prompt, /이미지 블록은 4~5개/);
    }
});

test('each strategy selects only its own writing rules', () => {
    const searchPrompt = buildBlogSystemPrompt({
        strategy: 'search',
        config: promptConfig,
        constants: Constants
    });
    const discoveryPrompt = buildBlogSystemPrompt({
        strategy: 'discovery',
        config: promptConfig,
        constants: Constants
    });

    assert.match(searchPrompt, /전략: 검색 중심/);
    assert.match(searchPrompt, /검색 의도/);
    assert.doesNotMatch(searchPrompt, /전략: 발견 중심/);

    assert.match(discoveryPrompt, /전략: 발견 중심 \(피드\)/);
    assert.match(discoveryPrompt, /피드에서 우연히/);
    assert.doesNotMatch(discoveryPrompt, /전략: 검색 중심/);
    assert.doesNotMatch(discoveryPrompt, /제목 앞 10자|5~10회/);
    assert.doesNotMatch(discoveryPrompt, /네이버|워드프레스/);
});

test('invalid strategies safely select the search prompt', () => {
    const paths = resolvePromptPaths({
        strategy: 'invalid',
        config: promptConfig,
        constants: Constants
    });

    assert.equal(paths.normalizedStrategy, 'search');
    assert.equal(paths.strategyPath, Constants.BLOG_PROMPT_SEARCH_FILE);
});

test('missing prompt files fail with a clear contract error', () => {
    assert.throws(
        () => buildBlogSystemPrompt({
            strategy: 'search',
            config: {
                BLOG_PROMPT_COMMON_PATH: '/missing/common.md',
                BLOG_PROMPT_SEARCH_PATH: '/missing/search.md'
            },
            constants: {},
            fileSystem: {
                existsSync: () => false,
                readFileSync: () => ''
            }
        }),
        /블로그 출력·사실성 계약 프롬프트 파일이 없습니다/
    );
});
