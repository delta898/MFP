'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../../');

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
        "const config = require('./src/host/configuration/runtime-config');",
        "const oauth = require('./src/adapters/google/auth/google-oauth');",
        'oauth.configureRuntime({ config });',
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

test('default Google OAuth authorization is limited to drive.file', () => {
    const env = { ...process.env };
    Object.assign(env, {
        BLOGGENIUS_ENV: 'local',
        BLOGGENIUS_RUNTIME_ROOT: REPO_ROOT,
        GOOGLE_OAUTH_CLIENT_ID: 'desktop-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'desktop-client-secret',
        GOOGLE_OAUTH_TOKENS_JSON_PATH: path.join(os.tmpdir(), 'google-default-scope-test-tokens.json')
    });
    const result = spawnSync(process.execPath, ['-e', [
        "const config = require('./src/host/configuration/runtime-config');",
        "const oauth = require('./src/adapters/google/auth/google-oauth');",
        'oauth.configureRuntime({ config });',
        "process.stdout.write(oauth.buildAuthUrl({ redirectUri: 'http://127.0.0.1:43127/callback' }).authUrl);"
    ].join(' ')], { cwd: REPO_ROOT, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const url = new URL(result.stdout);
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
    assert.doesNotMatch(url.searchParams.get('scope'), /spreadsheets/);
});

test('Picker OAuth requests only drive.file and enables spreadsheet selection', () => {
    const env = { ...process.env };
    Object.assign(env, {
        BLOGGENIUS_ENV: 'local',
        BLOGGENIUS_RUNTIME_ROOT: REPO_ROOT,
        GOOGLE_OAUTH_CLIENT_ID: 'desktop-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'desktop-client-secret',
        GOOGLE_OAUTH_TOKENS_JSON_PATH: path.join(os.tmpdir(), 'google-picker-test-tokens.json')
    });
    const result = spawnSync(process.execPath, ['-e', [
        "const config = require('./src/host/configuration/runtime-config');",
        "const oauth = require('./src/adapters/google/auth/google-oauth');",
        'oauth.configureRuntime({ config });',
        "const auth = oauth.buildAuthUrl({ redirectUri: 'http://127.0.0.1:43127/callback', scopes: ['https://www.googleapis.com/auth/drive.file'], picker: true, includeGrantedScopes: false });",
        'process.stdout.write(auth.authUrl);'
    ].join(' ')], { cwd: REPO_ROOT, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const url = new URL(result.stdout);
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
    assert.equal(url.searchParams.get('include_granted_scopes'), null);
    assert.equal(url.searchParams.get('trigger_onepick'), 'true');
    assert.equal(url.searchParams.get('mimetypes'), 'application/vnd.google-apps.spreadsheet');
});

test('Google OAuth consumers never fetch app credentials from Runtime Config', () => {
    const hostRuntimeConfig = fs.readFileSync(path.join(REPO_ROOT, 'src/host/configuration/runtime-config.js'), 'utf8');
    const contentService = fs.readFileSync(
        path.join(REPO_ROOT, 'src/adapters/ui/content/content-api/service.js'),
        'utf8'
    );

    assert.doesNotMatch(contentService, /ensureGoogleOauthClientConfig/);
    assert.match(hostRuntimeConfig, /resolveOAuthApplicationConfig\(/);
    assert.match(hostRuntimeConfig, /runtimeEnv:\s*process[.]env/);
    assert.match(hostRuntimeConfig, /buildConfig:\s*internalSecrets/);
    assert.doesNotMatch(hostRuntimeConfig, /ensureGoogleOauthClientConfig/);
});
