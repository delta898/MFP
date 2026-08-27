'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, formatPlan } = require('./hosted-development-plan');

const READY_ENV = Object.freeze({
    BLOGGENIUS_ENV: 'development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME: 'BlogGenius Development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://development.example.invalid',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
    BLOGGENIUS_PRODUCTION_SUPABASE_URL: 'https://production.example.invalid'
});

test('feature branch can inspect handoff artifacts but cannot target development Supabase', () => {
    const plan = buildPlan({
        env: READY_ENV,
        branch: 'feature/development-environment-05-hosted-development'
    });

    assert.equal(plan.readiness.ready, true);
    assert.equal(plan.allowed, false);
    assert.equal(plan.executionOwner, 'supabase_environment_provider');
    assert.ok(plan.steps.every((step) => step.preflight.reasons.includes('branch_target_denied')));
});

test('dev branch produces a provider-neutral handoff without remote execution details', () => {
    const plan = buildPlan({ env: READY_ENV, branch: 'dev' });
    const output = formatPlan(plan);

    assert.equal(plan.allowed, true);
    assert.ok(plan.steps.every((step) => step.preflight.projectIdentity.mode === 'explicit_supabase_url'));
    assert.match(output, /Execution owner: Supabase environment provider/);
    assert.match(output, /BlogGenius remote mutations: none/);
    assert.doesNotMatch(output, /SSH|Docker|Compose|functions\.env/i);
    assert.doesNotMatch(JSON.stringify(plan), /ssh_host|remote_root|container|compose/i);
});
