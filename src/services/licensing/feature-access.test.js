const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getEnableRelatedPostsAutoLink,
    getEnableSnsDistribution,
    isCommandEnabled
} = require('./feature-access');

test('controlled license features fail closed when missing', () => {
    assert.equal(isCommandEnabled({}, 'batch'), false);
    assert.equal(isCommandEnabled({}, 'trends'), false);
    assert.equal(isCommandEnabled({}, 'shopping'), false);
    assert.equal(getEnableRelatedPostsAutoLink({}), false);
    assert.equal(getEnableSnsDistribution({}), false);
});

test('SNS distribution entitlement reads only its capability value', () => {
    assert.equal(getEnableSnsDistribution({ enable_sns_distribution: true }), true);
    assert.equal(getEnableSnsDistribution({ enable_sns_distribution: false }), false);
    assert.equal(getEnableSnsDistribution({ plan_code: 'pro' }), false);
});
