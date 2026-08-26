const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeBlogImageMode,
    parseBlogImageMode,
    includesBlogImagePrompts,
    generatesBlogImages,
    stripBlogImagePromptBlocks
} = require('./blog-image-mode');

test('blog image mode has three explicit outcomes and preserves the legacy boolean boundary', () => {
    assert.equal(parseBlogImageMode('generate'), 'generate');
    assert.equal(parseBlogImageMode('prompt_only'), 'prompt_only');
    assert.equal(parseBlogImageMode('none'), 'none');
    assert.equal(normalizeBlogImageMode('', { legacyGenerate: true }), 'generate');
    assert.equal(normalizeBlogImageMode('', { legacyGenerate: false }), 'prompt_only');
    assert.equal(generatesBlogImages('generate'), true);
    assert.equal(generatesBlogImages('prompt_only'), false);
    assert.equal(includesBlogImagePrompts('none'), false);
    assert.throws(() => parseBlogImageMode('unknown'), (error) => error.code === 'INVALID_BLOG_IMAGE_MODE');
});

test('no-image mode removes multiline and legacy inline prompt blocks', () => {
    const content = [
        '첫 문단',
        '[[IMAGE_0\ntitle: 첫 이미지\nprompt: prompt\n]]',
        '둘째 문단 [[IMAGE_1: inline prompt]]',
        '마지막 문단'
    ].join('\n\n');
    const stripped = stripBlogImagePromptBlocks(content);
    assert.doesNotMatch(stripped, /IMAGE_/);
    assert.match(stripped, /첫 문단\n\n둘째 문단/);
    assert.match(stripped, /마지막 문단/);
});
