const test = require('node:test');
const assert = require('node:assert/strict');

const {
    REQUIRED_LICENSE_FEATURE_KEYS,
    validateLicenseFeaturePolicy
} = require('./license-feature-policy');

test('license feature policy accepts required booleans and ignores legacy keys', () => {
    const result = validateLicenseFeaturePolicy({
        cmd_batch: true,
        cmd_trends: false,
        cmd_shopping: false,
        enable_related_posts_auto_link: true,
        cmd_pub: true,
        image_generation: false,
        max_blog_posts_per_run: 3,
        enable_trends_date_override: false
    });

    assert.equal(result.success, true);
    assert.deepEqual(Object.keys(result.features), REQUIRED_LICENSE_FEATURE_KEYS);
    assert.deepEqual(result.features, {
        cmd_batch: true,
        cmd_trends: false,
        cmd_shopping: false,
        enable_related_posts_auto_link: true
    });
});

test('license feature policy rejects missing or non-boolean required values', () => {
    const result = validateLicenseFeaturePolicy({
        cmd_batch: true,
        cmd_trends: 'true',
        cmd_shopping: false
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'LICENSE_FEATURE_POLICY_INVALID');
    assert.match(result.message, /cmd_trends must be boolean/);
    assert.match(result.message, /enable_related_posts_auto_link is required/);
});
