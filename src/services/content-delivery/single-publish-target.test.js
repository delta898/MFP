const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePublishTargets, requireSinglePublishTarget } = require('./single-publish-target');

test('normalizes one supported publish target while retaining the array storage contract', () => {
    assert.deepEqual(normalizePublishTargets(['NAVER', 'naver', 'other']), ['naver']);
    assert.deepEqual(requireSinglePublishTarget('wordpress'), ['wordpress']);
});

test('rejects missing and multiple publish targets without silently choosing one', () => {
    assert.throws(() => requireSinglePublishTarget([]), (error) => error.code === 'PUBLISH_TARGET_REQUIRED');
    assert.throws(
        () => requireSinglePublishTarget(['naver', 'wordpress']),
        (error) => error.code === 'MULTIPLE_PUBLISH_TARGETS'
    );
    assert.deepEqual(requireSinglePublishTarget([], { required: false }), []);
});
