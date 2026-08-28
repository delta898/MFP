'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function inspectConfiguration(envPatch = {}) {
    const env = { ...process.env };
    delete env.GOOGLE_OAUTH_CLIENT_ID;
    delete env.GOOGLE_OAUTH_CLIENT_SECRET;
    Object.assign(env, {
        BLOGGENIUS_ENV: 'local',
        BLOGGENIUS_RUNTIME_ROOT: REPO_ROOT,
        BLOGGENIUS_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
        BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY: 'local-public-key'
    }, envPatch);
    const result = spawnSync(process.execPath, ['-e', [
        "const oauth = require('./src/google-oauth');",
        'process.stdout.write(JSON.stringify(oauth.getConfigurationStatus()));'
    ].join(' ')], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('Google OAuth configuration is read from the direct application environment', () => {
    assert.deepEqual(inspectConfiguration({
        GOOGLE_OAUTH_CLIENT_ID: 'desktop-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'desktop-client-secret'
    }), {
        configured: true,
        missing: []
    });
});

test('Google OAuth configuration reports missing app inputs without contacting Runtime Config', () => {
    const status = inspectConfiguration();
    assert.equal(status.configured, false);
    assert.deepEqual(status.missing, ['client_id', 'client_secret']);
});

test('Google OAuth consumers never fetch app credentials from Runtime Config', () => {
    const configLoader = fs.readFileSync(path.join(REPO_ROOT, 'src/config-loader.js'), 'utf8');
    const runtimeConfig = fs.readFileSync(path.join(REPO_ROOT, 'src/runtime-config.js'), 'utf8');
    const utils = fs.readFileSync(path.join(REPO_ROOT, 'src/utils.js'), 'utf8');
    const contentService = fs.readFileSync(
        path.join(REPO_ROOT, 'src/ui-api/services/content.service.js'),
        'utf8'
    );

    assert.doesNotMatch(runtimeConfig, /google_oauth_client_(id|secret)/i);
    assert.doesNotMatch(runtimeConfig, /ensureGoogleOauthClientConfig/);
    assert.doesNotMatch(utils, /ensureGoogleOauthClientConfig/);
    assert.doesNotMatch(contentService, /ensureGoogleOauthClientConfig/);
    assert.match(
        configLoader,
        /IS_PACKAGED\s*\?\s*internalSecrets[.]GOOGLE_OAUTH_CLIENT_ID\s*:\s*''/
    );
    assert.match(
        configLoader,
        /IS_PACKAGED\s*\?\s*internalSecrets[.]GOOGLE_OAUTH_CLIENT_SECRET\s*:\s*''/
    );
});
