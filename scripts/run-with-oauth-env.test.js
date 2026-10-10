'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    loadOAuthEnvironmentFile,
    runWithOAuthEnvironment
} = require('./run-with-oauth-env');

test('external OAuth environment loader injects only the declared OAuth variables', () => {
    const fs = {
        existsSync: () => true,
        readFileSync: () => [
            'GOOGLE_OAUTH_CLIENT_ID="dev-google-id"',
            'GOOGLE_OAUTH_CLIENT_SECRET=dev-google-secret',
            'CLOUDFLARE_OAUTH_CLIENT_ID=dev-cloudflare-id',
            'CLOUDFLARE_OAUTH_SCOPES=workers-scripts.admin memberships.read',
            'BLOGGENIUS_ENV=production',
            'UNRELATED_VALUE=ignored'
        ].join('\n')
    };
    const env = loadOAuthEnvironmentFile('/repo/.env.oauth.dev', {
        GOOGLE_OAUTH_CLIENT_ID: 'stale-id',
        UNRELATED_VALUE: 'existing'
    }, fs);

    assert.equal(env.GOOGLE_OAUTH_CLIENT_ID, 'dev-google-id');
    assert.equal(env.GOOGLE_OAUTH_CLIENT_SECRET, 'dev-google-secret');
    assert.equal(env.CLOUDFLARE_OAUTH_CLIENT_ID, 'dev-cloudflare-id');
    assert.equal(env.CLOUDFLARE_OAUTH_SCOPES, 'workers-scripts.admin memberships.read');
    assert.equal(env.BLOGGENIUS_OAUTH_ENV, 'development');
    assert.equal(env.BLOGGENIUS_ENV, undefined);
    assert.equal(env.UNRELATED_VALUE, 'existing');
});

test('external OAuth runner passes configured environment to the selected command', () => {
    let invocation;
    const status = runWithOAuthEnvironment(
        ['development', '.env.oauth.dev', '--', 'npm', 'run', 'app:development'],
        {
            repoRoot: '/repo',
            env: { PATH: '/bin' },
            fs: {
                existsSync: (filePath) => filePath === '/repo/.env.oauth.dev',
                readFileSync: () => 'CLOUDFLARE_OAUTH_CLIENT_ID=dev-id'
            },
            spawn: (...args) => {
                invocation = args;
                return { status: 0 };
            }
        }
    );

    assert.equal(status, 0);
    assert.equal(invocation[0], 'npm');
    assert.deepEqual(invocation[1], ['run', 'app:development']);
    assert.equal(invocation[2].cwd, '/repo');
    assert.equal(invocation[2].env.CLOUDFLARE_OAUTH_CLIENT_ID, 'dev-id');
    assert.equal(invocation[2].env.BLOGGENIUS_OAUTH_ENV, 'development');
});

test('external OAuth runner tags Production values without loading a fixed file name', () => {
    const env = loadOAuthEnvironmentFile('/repo/operator-selected.env', {}, {
        existsSync: () => true,
        readFileSync: () => 'CLOUDFLARE_OAUTH_CLIENT_ID=prod-id'
    }, 'production');

    assert.equal(env.CLOUDFLARE_OAUTH_CLIENT_ID, 'prod-id');
    assert.equal(env.BLOGGENIUS_OAUTH_ENV, 'production');
});

test('external OAuth runner fails clearly when the file is missing', () => {
    assert.throws(() => loadOAuthEnvironmentFile('/repo/missing.env', {}, {
        existsSync: () => false
    }), /OAuth environment file not found/);
});
