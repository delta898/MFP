'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    parseLocalSupabaseStatus,
    prepareLocalEnvironment,
    prepareDevelopmentEnvironment,
    prepareAppEnvironment
} = require('./app-environment-launcher');

const REPO_ROOT = path.resolve(__dirname, '..');

const DEVELOPMENT_MANIFEST = Object.freeze({
    target: 'development',
    project: Object.freeze({
        url_source: 'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL',
        production_url_source: 'BLOGGENIUS_PRODUCTION_SUPABASE_URL'
    }),
    connection: Object.freeze({
        required_sources: Object.freeze([
            'BLOGGENIUS_ENV',
            'BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME',
            'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL',
            'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY'
        ])
    }),
    edge_function_environment: Object.freeze([]),
    safety: Object.freeze({
        live_publish: false,
        live_payment: false,
        cron_activation: false,
        notification_modes: Object.freeze(['sink']),
        default_notification_mode: 'sink',
        paid_provider_smoke_test: false
    })
});

test('local status parser supports current publishable key output', () => {
    assert.deepEqual(parseLocalSupabaseStatus(JSON.stringify({
        API_URL: 'http://127.0.0.1:54321/',
        PUBLISHABLE_KEY: 'local-public-key'
    })), {
        url: 'http://127.0.0.1:54321',
        publishableKey: 'local-public-key'
    });
});

test('local app launcher starts Supabase and injects its discovered public connection', () => {
    const calls = [];
    const spawn = (command, args) => {
        calls.push([command, ...args]);
        if (args[0] === 'status') {
            return {
                status: 0,
                stdout: JSON.stringify({
                    API_URL: 'http://127.0.0.1:54321',
                    ANON_KEY: 'legacy-local-key'
                })
            };
        }
        return { status: 0, stdout: '' };
    };

    const env = prepareLocalEnvironment({
        repoRoot: '/repo',
        spawn,
        quiet: true,
        env: { BLOGGENIUS_ENV: 'development' }
    });

    assert.deepEqual(calls, [
        ['supabase', 'start', '--exclude', 'realtime,storage-api,imgproxy,studio'],
        ['supabase', 'status', '--output', 'json']
    ]);
    assert.equal(env.BLOGGENIUS_ENV, 'local');
    assert.equal(env.BLOGGENIUS_LOCAL_SUPABASE_URL, 'http://127.0.0.1:54321');
    assert.equal(env.BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY, 'legacy-local-key');
});

test('development app launcher reads the dedicated file and owns environment selection', () => {
    const fs = {
        existsSync(filePath) {
            assert.match(filePath, /[.]env[.]development$/);
            return true;
        },
        readFileSync() {
            return [
                'BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME="BlogGenius Development"',
                'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL=https://development.example.invalid',
                'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY=development-public-key'
            ].join('\n');
        }
    };

    const env = prepareDevelopmentEnvironment({
        repoRoot: '/repo',
        fs,
        manifest: DEVELOPMENT_MANIFEST,
        env: { BLOGGENIUS_ENV: 'local' }
    });

    assert.equal(env.BLOGGENIUS_ENV, 'development');
    assert.equal(
        env.BLOGGENIUS_DEVELOPMENT_SUPABASE_URL,
        'https://development.example.invalid'
    );
});

test('app launcher refuses production and unspecified targets', () => {
    assert.throws(
        () => prepareAppEnvironment('production'),
        /Unsupported app environment: production/
    );
    assert.throws(
        () => prepareAppEnvironment(''),
        /Unsupported app environment: \(missing\)/
    );
});

test('package scripts expose only the safe local and development launch shortcuts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');

    assert.equal(
        packageJson.scripts['app:local'],
        'node scripts/app-environment-launcher.js local'
    );
    assert.equal(
        packageJson.scripts['app:development'],
        'node scripts/app-environment-launcher.js development'
    );
    assert.equal(packageJson.scripts['env:status'], 'node scripts/environment-status.js');
    assert.equal(packageJson.scripts['app:production'], undefined);
    assert.match(gitignore, /^\.env\.development$/m);
});
