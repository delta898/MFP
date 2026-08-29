'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    inspectHostedDevelopmentReadiness,
    runCli
} = require('./hosted-development-readiness');

const READY_ENV = Object.freeze({
    BLOGGENIUS_ENV: 'development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME: 'BlogGenius Development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://development.example.invalid',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
    BLOGGENIUS_PRODUCTION_SUPABASE_URL: 'https://production.example.invalid'
});

test('development Supabase is not ready until its public connection contract is configured', () => {
    const result = inspectHostedDevelopmentReadiness({ env: {} });

    assert.equal(result.ready, false);
    assert.ok(result.project.missingSources.includes('BLOGGENIUS_ENV'));
    assert.ok(result.project.missingSources.includes('BLOGGENIUS_DEVELOPMENT_SUPABASE_URL'));
    assert.equal(result.edgeFunctionEnvironment.provisioningOwner, 'supabase_environment_provider');
});

test('provider-neutral development connection passes without infrastructure details or server secrets', () => {
    const result = inspectHostedDevelopmentReadiness({ env: READY_ENV });

    assert.equal(result.ready, true);
    assert.deepEqual(result.project.missingSources, []);
    assert.deepEqual(result.edgeFunctionEnvironment.requiredNames, [
        'BLOGGENIUS_ENV',
        'BLOGGENIUS_NOTIFICATION_MODE',
        'TRENDS_READ_TOKEN_SECRET'
    ]);
    assert.equal(result.safety.manualPublish, true);
    assert.equal(result.safety.automatedPublish, false);
    assert.equal(result.safety.livePublish, false);
    assert.equal(result.safety.livePayment, false);
});

test('production, non-HTTPS, and production-matching URLs fail closed', () => {
    const production = inspectHostedDevelopmentReadiness({
        env: { ...READY_ENV, BLOGGENIUS_ENV: 'production' }
    });
    const insecure = inspectHostedDevelopmentReadiness({
        env: { ...READY_ENV, BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'http://development.invalid' }
    });
    const sameTarget = inspectHostedDevelopmentReadiness({
        env: {
            ...READY_ENV,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: READY_ENV.BLOGGENIUS_PRODUCTION_SUPABASE_URL
        }
    });

    assert.ok(production.policyViolations.includes('environment_must_be_development'));
    assert.ok(insecure.policyViolations.includes('development_supabase_url_must_use_https'));
    assert.ok(sameTarget.policyViolations.includes('development_supabase_url_matches_production'));
});

test('readiness output never contains credentials or infrastructure implementation details', () => {
    const outcome = runCli({ argv: ['--json'], env: READY_ENV });
    const serialized = outcome.output;

    assert.equal(outcome.exitCode, 0);
    assert.doesNotMatch(serialized, /publishable-test-value/);
    assert.doesNotMatch(serialized, /SSH|Docker|Compose|functions\.env/i);
    assert.equal(Object.hasOwn(JSON.parse(serialized), 'env'), false);
});
