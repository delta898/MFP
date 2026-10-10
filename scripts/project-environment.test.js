'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_DEVELOPMENT_ENV_FILE,
    DEFAULT_PRODUCTION_ENV_FILE,
    DEFAULT_GOOGLE_OAUTH_ENV_FILE,
    parseEnvironmentFile,
    loadProjectEnvironment,
    loadDevelopmentEnvironment,
    loadProductionEnvironment,
    loadGoogleOauthEnvironment,
    loadDevelopmentDesktopOauthEnvironment
} = require('./project-environment');

test('project environment parser reads assignments without evaluating shell syntax', () => {
    const parsed = parseEnvironmentFile([
        '# comment',
        'BLOGGENIUS_ENV=development',
        'VALUE="literal ;; $(not-executed)"'
    ].join('\n'));

    assert.deepEqual(parsed, {
        BLOGGENIUS_ENV: 'development',
        VALUE: 'literal ;; $(not-executed)'
    });
});

test('project environment loader reads only the development-specific file by default', () => {
    const requestedPaths = [];
    const fs = {
        existsSync(filePath) {
            requestedPaths.push(filePath);
            return true;
        },
        readFileSync() {
            return 'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL=https://development.example.invalid';
        }
    };

    const loaded = loadProjectEnvironment({
        repoRoot: '/repo',
        fs,
        env: { EXISTING_VALUE: 'kept' }
    });

    assert.equal(requestedPaths[0], `/repo/${DEFAULT_DEVELOPMENT_ENV_FILE}`);
    assert.equal(
        loaded.BLOGGENIUS_DEVELOPMENT_SUPABASE_URL,
        'https://development.example.invalid'
    );
    assert.equal(loaded.EXISTING_VALUE, 'kept');
});

test('development loader selects development regardless of ambient environment', () => {
    const loaded = loadDevelopmentEnvironment({
        repoRoot: '/repo',
        fs: { existsSync: () => false },
        env: { BLOGGENIUS_ENV: 'local' }
    });

    assert.equal(loaded.BLOGGENIUS_ENV, 'development');
});

test('production loader reads its dedicated file and owns environment selection', () => {
    const requestedPaths = [];
    const loaded = loadProductionEnvironment({
        repoRoot: '/repo',
        fs: {
            existsSync(filePath) {
                requestedPaths.push(filePath);
                return true;
            },
            readFileSync() {
                return 'BLOGGENIUS_PRODUCTION_SUPABASE_URL=https://production.example.invalid';
            }
        },
        env: { BLOGGENIUS_ENV: 'development' }
    });

    assert.equal(requestedPaths[0], `/repo/${DEFAULT_PRODUCTION_ENV_FILE}`);
    assert.equal(loaded.BLOGGENIUS_ENV, 'production');
    assert.equal(
        loaded.BLOGGENIUS_PRODUCTION_SUPABASE_URL,
        'https://production.example.invalid'
    );
});

test('development desktop OAuth loader reads its allowed keys and preserves ambient overrides', () => {
    const requestedPaths = [];
    const loaded = loadDevelopmentDesktopOauthEnvironment({
        repoRoot: '/repo',
        fs: {
            existsSync(filePath) {
                requestedPaths.push(filePath);
                return true;
            },
            readFileSync() {
                return [
                    'GOOGLE_OAUTH_CLIENT_ID=file-client-id',
                    'GOOGLE_OAUTH_CLIENT_SECRET=file-client-secret',
                    'CLOUDFLARE_OAUTH_CLIENT_ID=file-cloudflare-id',
                    'CLOUDFLARE_OAUTH_SCOPES=memberships.read workers-scripts.admin',
                    'BLOGGENIUS_ENV=production',
                    'BLOGGENIUS_LOCAL_SUPABASE_URL=https://should-not-load.invalid'
                ].join('\n');
            }
        },
        env: {
            BLOGGENIUS_ENV: 'local',
            GOOGLE_OAUTH_CLIENT_ID: 'ambient-client-id',
            CLOUDFLARE_OAUTH_SCOPES: 'memberships.read workers-scripts.write'
        }
    });

    assert.equal(requestedPaths[0], `/repo/${DEFAULT_GOOGLE_OAUTH_ENV_FILE}`);
    assert.equal(loaded.BLOGGENIUS_ENV, 'local');
    assert.equal(loaded.GOOGLE_OAUTH_CLIENT_ID, 'ambient-client-id');
    assert.equal(loaded.GOOGLE_OAUTH_CLIENT_SECRET, 'file-client-secret');
    assert.equal(loaded.CLOUDFLARE_OAUTH_CLIENT_ID, 'file-cloudflare-id');
    assert.equal(loaded.CLOUDFLARE_OAUTH_SCOPES, 'memberships.read workers-scripts.write');
    assert.equal(loaded.BLOGGENIUS_LOCAL_SUPABASE_URL, undefined);
});

test('Google OAuth loader does not load Cloudflare OAuth settings from the shared file', () => {
    const loaded = loadGoogleOauthEnvironment({
        repoRoot: '/repo',
        fs: {
            existsSync: () => true,
            readFileSync: () => [
                'GOOGLE_OAUTH_CLIENT_ID=google-id',
                'CLOUDFLARE_OAUTH_CLIENT_ID=cloudflare-id',
                'CLOUDFLARE_OAUTH_SCOPES=workers-scripts.admin'
            ].join('\n')
        },
        env: {}
    });

    assert.equal(loaded.GOOGLE_OAUTH_CLIENT_ID, 'google-id');
    assert.equal(loaded.CLOUDFLARE_OAUTH_CLIENT_ID, undefined);
    assert.equal(loaded.CLOUDFLARE_OAUTH_SCOPES, undefined);
});
