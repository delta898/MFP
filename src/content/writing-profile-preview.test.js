const test = require('node:test');
const assert = require('node:assert/strict');
const Constants = require('../constants');
const { getDefaultContentWritingProfile } = require('./writing-profile');
const {
    SHOPPING_PREVIEW_FIXTURE,
    parsePreviewJson,
    buildBlogPreviewPrompt,
    buildShoppingPreviewPrompt,
    createWritingProfilePreviewService
} = require('./writing-profile-preview');

const promptConfig = {
    BLOG_PROMPT_CONTRACT_PATH: Constants.BLOG_PROMPT_CONTRACT_FILE,
    BLOG_PROMPT_SEARCH_PATH: Constants.BLOG_PROMPT_SEARCH_FILE,
    BLOG_PROMPT_DISCOVERY_PATH: Constants.BLOG_PROMPT_DISCOVERY_FILE
};

function previewResponse(sample = '가'.repeat(450)) {
    return JSON.stringify({
        outline: {
            opening: '독자의 상황을 짚고 주제를 소개',
            sections: [{ heading: '첫 번째 기준', role: '핵심 판단 기준 설명' }],
            ending: '실천 가능한 다음 행동 제안'
        },
        sample
    });
}

test('blog preview reuses normalized blog projection and excludes raw style sources', () => {
    const profile = getDefaultContentWritingProfile();
    profile.channels.blog.length.preset = 'long';
    profile.channels.blog.style_references.sample_text = { value: '원문 비밀 문장', status: 'analyzed' };
    profile.channels.blog.style_references.fingerprint = {
        structure: { opening_pattern: 'answer_first', section_flow: ['information'], paragraph_length: 'short', ending_pattern: 'short_summary' },
        voice: { sentence_rhythm: 'short', warmth: 'warm', vocabulary: 'everyday', rhetorical_devices: [] },
        avoid: [], summary: '짧은 문단과 일상적인 어휘를 사용하는 따뜻한 문체'
    };
    const result = buildBlogPreviewPrompt({ profile, strategy: 'discovery', topic: '같은 주제' }, { config: promptConfig, constants: Constants });
    assert.equal(result.kind, 'blog');
    assert.equal(result.strategy, 'discovery');
    assert.match(result.prompt, /약 2,200~2,800자/);
    assert.match(result.prompt, /분석된 블로그 참고 문체/);
    assert.match(result.prompt, /미리보기 출력 계약/);
    assert.match(result.prompt, /반드시 450~550자/);
    assert.doesNotMatch(result.prompt, /원문 비밀 문장/);
    assert.doesNotMatch(result.prompt, /순수 JSON 문자열만 출력/);
});

test('shopping preview uses fixed synthetic facts and cannot access blog-only profile fields', () => {
    const profile = getDefaultContentWritingProfile();
    profile.common.voice.tone = 'calm';
    profile.channels.blog.author_context = '쇼핑에 들어가면 안 되는 배경';
    profile.channels.blog.additional_instruction = '쇼핑에 들어가면 안 되는 블로그 지침';
    profile.channels.shopping.additional_instruction = '배송 조건을 먼저 설명';
    const result = buildShoppingPreviewPrompt({ profile, strategy: 'search' });
    assert.equal(result.topic, SHOPPING_PREVIEW_FIXTURE.title);
    assert.match(result.prompt, /배송 조건을 먼저 설명/);
    assert.match(result.prompt, /59000/);
    assert.match(result.prompt, /Synthetic Official Product Data/);
    assert.doesNotMatch(result.prompt, /쇼핑에 들어가면 안 되는/);
});

test('valid preview calls the writing model once with kind-specific usage and never persists', async () => {
    const calls = [];
    const service = createWritingProfilePreviewService({
        config: { ...promptConfig, BLOG_WRITING_STRATEGY: 'search' },
        constants: Constants,
        callWritingText: async (prompt, retries, options) => {
            calls.push({ prompt, retries, options });
            return previewResponse();
        }
    });
    const result = await service({ kind: 'blog', topic: '동일 주제', profile: getDefaultContentWritingProfile() });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].retries, 1);
    assert.equal(calls[0].options.usageLabel, '블로그 글쓰기 프로필 미리보기');
    assert.equal(calls[0].options.reasoningEffort, 'minimal');
    assert.equal(calls[0].options.maxTokens, undefined);
    assert.deepEqual(calls[0].options.responseJsonSchema.required, ['outline', 'sample']);
    assert.deepEqual(calls[0].options.responseJsonSchema.properties.outline.required, ['opening', 'sections', 'ending']);
    assert.equal(result.sample.length, 450);
});

test('invalid preview receives one bounded format repair attempt', async () => {
    const calls = [];
    const service = createWritingProfilePreviewService({
        config: { ...promptConfig, BLOG_WRITING_STRATEGY: 'search' },
        constants: Constants,
        callWritingText: async (prompt, retries, options) => {
            calls.push({ prompt, retries, options });
            return calls.length === 1 ? previewResponse('짧음') : previewResponse('나'.repeat(500));
        }
    });
    const result = await service({ kind: 'blog', profile: getDefaultContentWritingProfile() });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].retries, 1);
    assert.equal(calls[1].options.usageLabel, '블로그 글쓰기 프로필 미리보기 형식 보정');
    assert.match(calls[1].prompt, /이전 응답 형식 보정/);
    assert.match(calls[1].prompt, /미리보기 샘플이 2자로 반환/);
    assert.equal(result.sample.length, 500);
});

test('preview response enforces outline and 400 to 600 character sample', () => {
    assert.equal(parsePreviewJson(previewResponse()).sample.length, 450);
    assert.throws(
        () => parsePreviewJson(previewResponse('짧음')),
        (error) => error.code === 'WRITING_PREVIEW_CONTRACT_MISMATCH' && /2자로 반환/.test(error.message)
    );
});
