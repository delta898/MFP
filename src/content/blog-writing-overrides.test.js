const test = require('node:test');
const assert = require('node:assert/strict');
const { getDefaultContentWritingProfile } = require('./writing-profile');
const { projectWritingProfile } = require('./writing-profile-projection');
const {
    normalizeBlogWritingOverrides,
    validateBlogWritingOverrides,
    applyBlogWritingOverridesToProjection
} = require('./blog-writing-overrides');

test('normalizes only the four allowed per-post composition overrides', () => {
    assert.deepEqual(normalizeBlogWritingOverrides({
        length: 'LONG', opening: 'direct', development: 'comparison', ending: 'next_step', tone: 'vivid'
    }), {
        length: 'long', opening: 'direct', development: 'comparison', ending: 'next_step'
    });
});

test('rejects unsupported fields and invalid values at the topic boundary', () => {
    const result = validateBlogWritingOverrides({ length: 'endless', tone: 'vivid' });
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.map((item) => item.code), [
        'WRITING_OVERRIDE_VALUE_INVALID',
        'WRITING_OVERRIDE_FIELD_UNSUPPORTED'
    ]);
});

test('applies partial overrides without mutating the global projection', () => {
    const original = projectWritingProfile(getDefaultContentWritingProfile(), { kind: 'blog' });
    const before = JSON.stringify(original);
    const result = applyBlogWritingOverridesToProjection(original, { length: 'long', ending: 'summary' });
    assert.equal(result.projection.channel.length.preset, 'long');
    assert.equal(result.projection.channel.structure.ending, 'summary');
    assert.equal(result.projection.channel.structure.opening, original.channel.structure.opening);
    assert.equal(JSON.stringify(original), before);
});
