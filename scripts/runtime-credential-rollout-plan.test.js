'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    inspectRolloutInputs,
    buildRolloutPlan,
    formatRolloutPlan
} = require('./runtime-credential-rollout-plan');

const REPO_ROOT = path.resolve(__dirname, '..');
const READY_ENV = Object.freeze({
    BLOGGENIUS_ENV: 'development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME: 'BlogGenius Development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF: 'development-project-ref',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://development.example.invalid',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
    BLOGGENIUS_PRODUCTION_SUPABASE_URL: 'https://production.example.invalid'
});

test('runtime credential rollout manifest owns exact migration and Function inputs', () => {
    const inspected = inspectRolloutInputs({ repoRoot: REPO_ROOT });
    assert.equal(inspected.valid, true);
    assert.deepEqual(inspected.manifest.migrations, [
        '202608290000_add_blog_reference_gateway.sql',
        '202608290010_add_shopping_product_gateway.sql',
        '202608290020_harden_public_runtime_config.sql'
    ]);
    assert.deepEqual(
        inspected.manifest.edge_functions.map((item) => ({ name: item.name, verify_jwt: item.verify_jwt })),
        [{ name: 'knowledge-gateway', verify_jwt: true }]
    );
    assert.equal(inspected.manifest.production_mutation_allowed, false);
    assert.deepEqual(inspected.manifest.ordered_phases, [
        'preflight',
        'database_dry_run',
        'database_migrate',
        'function_deploy',
        'safe_http_smoke',
        'semantic_provider_smoke',
        'development_evidence',
        'dev_push'
    ]);
});

test('feature branch can inspect rollout but only dev can become ready', () => {
    const featurePlan = buildRolloutPlan({
        repoRoot: REPO_ROOT,
        env: READY_ENV,
        branch: 'feature/runtime-credential-security-06-integration'
    });
    const devPlan = buildRolloutPlan({ repoRoot: REPO_ROOT, env: READY_ENV, branch: 'dev' });

    assert.equal(featurePlan.allowed, false);
    assert.ok(featurePlan.preflights.every((item) => item.reasons.includes('branch_target_denied')));
    assert.equal(devPlan.allowed, true);
    assert.equal(devPlan.remoteMutationsExecuted, false);
    assert.equal(devPlan.productionMutationAllowed, false);
});

test('rollout plan is provider-neutral, dry-runs DB first, and never contains secret values', () => {
    const plan = buildRolloutPlan({ repoRoot: REPO_ROOT, env: READY_ENV, branch: 'dev' });
    const output = formatRolloutPlan(plan);
    const serialized = JSON.stringify(plan);
    const hostedManifest = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'supabase/hosted-development-manifest.json'),
        'utf8'
    ));
    const naverSecret = hostedManifest.edge_function_environment.find(
        (item) => item.name === 'NAVER_CLIENT_SECRET'
    );

    assert.match(output, /db push --dry-run/);
    assert.match(output, /functions deploy knowledge-gateway/);
    assert.doesNotMatch(output, /db reset|secrets set|production-project/i);
    assert.doesNotMatch(serialized, /service_role|client-secret-value|ssh|compose/i);
    assert.deepEqual(naverSecret.required_for_features, ['blog_reference', 'shopping_product', 'news']);
});
