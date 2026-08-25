const test = require('node:test');
const assert = require('node:assert/strict');

const { getDefaultContentWritingProfile } = require('./writing-profile');
const { projectWritingProfile } = require('./writing-profile-projection');
const {
    buildShoppingWritingProfilePrompt,
    buildShoppingWritingProfilePromptFromProjection
} = require('./shopping-writing-profile-prompt');

test('shopping profile prompt includes common and shopping instructions without blog fields', () => {
    const profile = getDefaultContentWritingProfile();
    profile.common.voice.tone = 'vivid';
    profile.common.voice.information_density = 'dense';
    profile.common.style_instruction = '짧은 문단으로 쉽게 설명하세요.';
    profile.channels.shopping.additional_instruction = '배송 조건과 설치 여부를 먼저 설명하세요.';
    profile.channels.blog.length.preset = 'long';
    profile.channels.blog.author_context = '육아 블로거';
    profile.channels.blog.additional_instruction = '블로그 전용 지침';
    profile.channels.blog.style_references.sample_text.value = '참고 원문';

    const prompt = buildShoppingWritingProfilePrompt(profile);
    assert.match(prompt, /선택된 쇼핑 글쓰기 프로필/);
    assert.match(prompt, /어조는 생동감 있게/);
    assert.match(prompt, /정보 밀도는 촘촘하게/);
    assert.match(prompt, /짧은 문단으로 쉽게/);
    assert.match(prompt, /배송 조건과 설치 여부를 먼저/);
    assert.match(prompt, /상품 사실.*근거로 사용하지 마세요/);
    assert.doesNotMatch(prompt, /2,200~2,800자/);
    assert.doesNotMatch(prompt, /육아 블로거|블로그 전용 지침|참고 원문/);
});

test('shopping prompt builder accepts only a shopping projection', () => {
    const profile = getDefaultContentWritingProfile();
    const shoppingProjection = projectWritingProfile(profile, { kind: 'shopping' });
    assert.match(buildShoppingWritingProfilePromptFromProjection(shoppingProjection), /쇼핑 구성 정책/);

    const blogProjection = projectWritingProfile(profile, { kind: 'blog' });
    assert.throws(
        () => buildShoppingWritingProfilePromptFromProjection(blogProjection),
        (error) => error.code === 'INVALID_SHOPPING_WRITING_PROFILE_PROJECTION'
    );
});
