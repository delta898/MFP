'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    inspectLocalEnvironment,
    inspectDevelopmentEnvironment,
    formatEnvironmentStatus
} = require('./environment-status');

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
        manual_publish: true,
        automated_publish: false,
        live_publish: false,
        live_payment: false,
        cron_activation: false,
        notification_modes: Object.freeze(['sink']),
        default_notification_mode: 'sink',
        paid_provider_smoke_test: false
    })
});

test('environment status reports a running local endpoint without exposing its key', () => {
    const local = inspectLocalEnvironment({
        repoRoot: '/repo',
        spawn() {
            return {
                status: 0,
                stdout: JSON.stringify({
                    API_URL: 'http://127.0.0.1:54321',
                    PUBLISHABLE_KEY: 'must-not-be-returned'
                })
            };
        }
    });

    assert.deepEqual(local, {
        ready: true,
        state: 'running',
        host: '127.0.0.1:54321'
    });
    assert.doesNotMatch(JSON.stringify(local), /must-not-be-returned/);
});

test('environment status treats a stopped local stack as an ordinary state', () => {
    const local = inspectLocalEnvironment({
        repoRoot: '/repo',
        spawn: () => ({ status: 1, stdout: '', stderr: 'not running' })
    });

    assert.equal(local.ready, false);
    assert.equal(local.state, 'stopped');
});

test('environment status bounds a slow local CLI check', () => {
    const local = inspectLocalEnvironment({
        repoRoot: '/repo',
        localTimeoutMs: 25,
        spawn(_command, _args, options) {
            assert.equal(options.timeout, 25);
            return { status: null, error: { code: 'ETIMEDOUT' } };
        }
    });

    assert.equal(local.ready, false);
    assert.equal(local.state, 'status_timeout');
});

test('environment status reads development configuration from the dedicated file', () => {
    const fs = {
        existsSync: () => true,
        readFileSync: () => [
            'BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME="BlogGenius Development"',
            'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL=https://development.example.invalid',
            'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY=public-key'
        ].join('\n')
    };
    const development = inspectDevelopmentEnvironment({
        repoRoot: '/repo',
        fs,
        manifest: DEVELOPMENT_MANIFEST,
        env: {}
    });

    assert.equal(development.ready, true);
    assert.equal(development.host, 'development.example.invalid');
});

test('formatted status explains availability and explicit launch selection', () => {
    const output = formatEnvironmentStatus({
        local: { ready: false, state: 'stopped', host: '' },
        development: {
            ready: true,
            state: 'configured',
            host: 'development.example.invalid',
            missingSources: [],
            policyViolations: []
        },
        production: { ready: false, state: 'release_only' }
    });

    assert.match(output, /Local: 중지됨/);
    assert.match(output, /npm run app:local/);
    assert.match(output, /Development: 설정 완료/);
    assert.match(output, /Production: 개발 명령으로 선택할 수 없음/);
    assert.match(output, /앱 실행 명령으로 선택/);
});
