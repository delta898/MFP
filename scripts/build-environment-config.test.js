'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createBuildEnvironmentConfig,
    serializeBuildEnvironmentConfig,
    validateBuildEnvironmentConfig
} = require('./build-environment-config');

test('production build config requires an explicit remote HTTPS endpoint', () => {
    const config = createBuildEnvironmentConfig({
        environment: 'production',
        supabaseUrl: 'https://production-project.supabase.co',
        publishableKey: 'publishable-key'
    });

    assert.equal(config.BLOGGENIUS_ENV, 'production');
    assert.equal(config.SUPABASE_PUBLISHABLE_KEY, 'publishable-key');
    assert.throws(() => createBuildEnvironmentConfig({
        environment: 'production',
        supabaseUrl: 'http://127.0.0.1:54321',
        publishableKey: 'local-key'
    }), /hosted_requires_remote_https/);
});

test('build validation refuses a target mismatch', () => {
    assert.throws(() => validateBuildEnvironmentConfig({
        BLOGGENIUS_ENV: 'development',
        SUPABASE_URL: 'https://development-project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'development-key'
    }, 'production'), /Build environment mismatch/);
});

test('serialized build config contains the selected environment and no legacy names', () => {
    const serialized = serializeBuildEnvironmentConfig(createBuildEnvironmentConfig({
        environment: 'development',
        supabaseUrl: 'https://development-project.supabase.co',
        publishableKey: 'development-key'
    }));

    assert.match(serialized, /BLOGGENIUS_ENV/);
    assert.match(serialized, /SUPABASE_PUBLISHABLE_KEY/);
    assert.doesNotMatch(serialized, /LICENSE_CHK_/);
});
