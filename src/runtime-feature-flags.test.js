const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getEnableRelatedPostsAutoLink,
    isCommandEnabled,
    parseMaxPosts
} = require('./runtime-feature-flags');

test('controlled license features fail closed when missing', () => {
    assert.equal(isCommandEnabled({}, 'batch'), false);
    assert.equal(isCommandEnabled({}, 'trends'), false);
    assert.equal(isCommandEnabled({}, 'shopping'), false);
    assert.equal(getEnableRelatedPostsAutoLink({}), false);
});

test('local automatic publish limits remain ordinary numeric settings', () => {
    assert.equal(parseMaxPosts('5', 1), 5);
    assert.equal(parseMaxPosts('', 2), 2);
});
