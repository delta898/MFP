const test = require('node:test');
const assert = require('node:assert/strict');
const Constants = require('../constants');
const { getDefaultContentWritingProfile } = require('./writing-profile');
const {
    SHOPPING_PREVIEW_FIXTURE,
    trimPreviewSample,
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
        surface: { writing_mode: 'written', speech_level: 'polite', tone: 'calm', information_density: 'balanced' },
        settings: { length_preset: 'long', opening: 'contextual', development: 'explanatory', ending: 'judgment', heading_density: 'balanced' },
        structure: { opening_pattern: 'answer_first', section_flow: ['information'], paragraph_length: 'short', ending_pattern: 'short_summary' },
        voice: { sentence_rhythm: 'short', warmth: 'warm', vocabulary: 'everyday', rhetorical_devices: [] },
        avoid: [], summary: '짧은 문단과 일상적인 어휘를 사용하는 따뜻한 문체'
    };
    const result = buildBlogPreviewPrompt({ profile, strategy: 'discovery', topic: '같은 주제' }, { config: promptConfig, constants: Constants });
    assert.equal(result.kind, 'blog');
    assert.equal(result.strategy, 'discovery');
    assert.match(result.prompt, /약 2,200~2,800자/);
    assert.match(result.prompt, /분석된 참고 글의 세부 특징/);
    assert.match(result.prompt, /미리보기 출력 계약/);
    assert.match(result.prompt, /반드시 450~550자/);
    assert.match(result.prompt, /2~3개의 짧은 문단/);
    assert.match(result.prompt, /문단 사이는 반드시 빈 줄 하나/);
    assert.match(result.prompt, /이 짧은 샘플에는 대표 영역 1개/);
    assert.match(result.prompt, /\[\[IMAGE_0\\ntitle:/);
    assert.doesNotMatch(result.prompt, /정확히 5개 작성하세요/);
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
    assert.match(result.prompt, /2~3개의 짧은 문단/);
    assert.doesNotMatch(result.prompt, /대표 이미지 영역 1개/);
    assert.doesNotMatch(result.prompt, /쇼핑에 들어가면 안 되는/);
});

test('preview uses final settings even while optional reference input awaits analysis', () => {
    const profile = getDefaultContentWritingProfile();
    profile.channels.blog.style_references.sample_text = { value: '새 참고 글', status: 'pending' };

    const result = buildBlogPreviewPrompt({ profile, topic: '같은 주제' }, { config: promptConfig, constants: Constants });

    assert.equal(result.projection.channel.style_references.fingerprint, null);
    assert.match(result.prompt, /약 1,500~1,800자/);
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
    assert.equal(result.sample_length, 450);
    assert.equal(result.sample_length_status, 'recommended');
});

test('a moderately long preview is trimmed without a repair call', async () => {
    const calls = [];
    const service = createWritingProfilePreviewService({
        config: { ...promptConfig, BLOG_WRITING_STRATEGY: 'search' },
        constants: Constants,
        callWritingText: async (...args) => {
            calls.push(args);
            return previewResponse('가'.repeat(706));
        }
    });

    const result = await service({ kind: 'blog', profile: getDefaultContentWritingProfile() });

    assert.equal(calls.length, 1);
    assert.equal(result.sample.length, 600);
    assert.equal(result.sample.endsWith('…'), true);
    assert.equal(result.sample_length, 600);
    assert.equal(result.sample_length_status, 'trimmed');
    assert.equal(result.sample_truncated, true);
});

test('broken preview receives one bounded format repair attempt', async () => {
    const calls = [];
    const service = createWritingProfilePreviewService({
        config: { ...promptConfig, BLOG_WRITING_STRATEGY: 'search' },
        constants: Constants,
        callWritingText: async (prompt, retries, options) => {
            calls.push({ prompt, retries, options });
            return calls.length === 1 ? '{broken' : previewResponse('나'.repeat(500));
        }
    });
    const result = await service({ kind: 'blog', profile: getDefaultContentWritingProfile() });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].retries, 1);
    assert.equal(calls[1].options.usageLabel, '블로그 글쓰기 프로필 미리보기 형식 보정');
    assert.match(calls[1].prompt, /이전 응답 형식 보정/);
    assert.match(calls[1].prompt, /올바른 미리보기 JSON/);
    assert.equal(result.sample.length, 500);
});

test('preview response accepts short samples and trims long samples', () => {
    assert.equal(parsePreviewJson(previewResponse()).sample.length, 450);
    const short = parsePreviewJson(previewResponse('짧음'));
    assert.equal(short.sample, '짧음');
    assert.equal(short.sample_length_status, 'short');
    const long = parsePreviewJson(previewResponse('가'.repeat(706)));
    assert.equal(long.sample.length, 600);
    assert.equal(long.sample_length_status, 'trimmed');
    assert.equal(long.sample_truncated, true);
    assert.throws(
        () => parsePreviewJson(previewResponse('')),
        (error) => error.code === 'WRITING_PREVIEW_CONTRACT_MISMATCH' && /비어 있습니다/.test(error.message)
    );
});

test('long preview trimming prefers a useful sentence boundary', () => {
    const sample = `${'가'.repeat(430)}. ${'나'.repeat(300)}`;
    const result = trimPreviewSample(sample);
    assert.equal(result.truncated, true);
    assert.equal(result.value.length, 431);
    assert.equal(result.value.endsWith('.'), true);
});
