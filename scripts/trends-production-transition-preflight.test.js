const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    inspectProductionTransition,
    loadProductionRuntimeEnvironment,
    readManifest,
    runCli
} = require('./trends-production-transition-preflight');

const REPO_ROOT = path.resolve(__dirname, '..');

function validEnvironment() {
    return {
        TRENDS_ENV: 'production',
        TRENDS_SUPABASE_TARGET_ENV: 'production',
        SUPABASE_URL: 'https://production-project.supabase.co',
        SUPABASE_SECRET_KEY: 's'.repeat(32),
        TRENDS_API_TOKEN: 'a'.repeat(32),
        TRENDS_READ_TOKEN_SECRET: 'r'.repeat(32),
        TRENDS_API_BASE_URL: 'https://trendapi.hangadac.com',
        TRENDS_DEVELOPMENT_SUPABASE_URL: 'https://development-project.supabase.co',
        TRENDS_DEVELOPMENT_API_BASE_URL: 'https://trendapi-dev.hangadac.com',
        TRENDS_READ_TOKEN_ISSUER: 'bloggenius-license',
        TRENDS_READ_TOKEN_AUDIENCE: 'trends-api'
    };
}

test('Production manifest fixes a parallel candidate and rollback topology', () => {
    const manifest = readManifest(REPO_ROOT);
    assert.equal(manifest.environment, 'production');
    assert.equal(manifest.service.public_base_url, 'https://trendapi.hangadac.com');
    assert.equal(manifest.service.container_port, 4581);
    assert.equal(manifest.service.candidate_host_port, 4583);
    assert.equal(manifest.service.legacy_host_port, 4581);
    assert.equal(manifest.transition_policy.candidate_runs_in_parallel, true);
    assert.equal(manifest.transition_policy.traffic_cutover_requires_explicit_approval, true);
    assert.equal(manifest.transition_policy.legacy_service_removal_requires_explicit_approval, true);
});

test('Production preflight accepts the approved topology without exposing secrets', () => {
    const result = inspectProductionTransition({ repoRoot: REPO_ROOT, env: validEnvironment() });
    const output = runCli({
        repoRoot: REPO_ROOT,
        env: validEnvironment(),
        argv: []
    }).output;

    assert.equal(result.ready, true);
    assert.equal(result.preparationOnly, true);
    assert.equal(result.deployment.candidateHostPort, 4583);
    assert.equal(result.transition.rollbackUpstreamPort, 4581);
    assert.doesNotMatch(JSON.stringify(result), /s{24}|a{24}|r{24}/);
    assert.doesNotMatch(output, /s{24}|a{24}|r{24}/);
    assert.match(output, /Side effects: none/);
});

test('Production preflight owns one ignored runtime file and fixes topology', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-production-preflight-'));
    const envDirectory = path.join(
        repoRoot, 'apps', 'trends', 'trends-api', 'deployment', 'production'
    );
    fs.mkdirSync(envDirectory, { recursive: true });
    fs.writeFileSync(path.join(envDirectory, '.env.trends-api.production'), [
        'SUPABASE_URL=https://production-project.supabase.co',
        'SUPABASE_SECRET_KEY=' + 's'.repeat(32),
        'TRENDS_API_TOKEN=' + 'a'.repeat(32),
        'TRENDS_READ_TOKEN_SECRET=' + 'r'.repeat(32),
        ''
    ].join('\n'));

    try {
        const env = loadProductionRuntimeEnvironment(repoRoot, {
            env: { TRENDS_API_BASE_URL: 'https://wrong.example' }
        });
        assert.equal(env.TRENDS_ENV, 'production');
        assert.equal(env.TRENDS_API_BASE_URL, 'https://trendapi.hangadac.com');
        assert.equal(env.SUPABASE_URL, 'https://production-project.supabase.co');
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('Production preflight rejects Development Supabase and placeholder secrets', () => {
    const wrongDatabase = inspectProductionTransition({
        repoRoot: REPO_ROOT,
        env: {
            ...validEnvironment(),
            SUPABASE_URL: 'https://development-project.supabase.co'
        }
    });
    assert.equal(wrongDatabase.ready, false);
    assert.match(wrongDatabase.failures[0], /must not use the known Development target/);

    const placeholder = inspectProductionTransition({
        repoRoot: REPO_ROOT,
        env: { ...validEnvironment(), TRENDS_API_TOKEN: 'replace-with-production-token' }
    });
    assert.equal(placeholder.ready, false);
    assert.ok(placeholder.failures.includes('trends_api_token_not_configured'));
});

test('Production preflight preserves a short legacy ingest token with an explicit rotation warning', () => {
    const result = inspectProductionTransition({
        repoRoot: REPO_ROOT,
        env: { ...validEnvironment(), TRENDS_API_TOKEN: 'legacy-token-123' }
    });
    const output = runCli({
        repoRoot: REPO_ROOT,
        env: { ...validEnvironment(), TRENDS_API_TOKEN: 'legacy-token-123' },
        argv: []
    }).output;

    assert.equal(result.ready, true);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.warnings, ['trends_api_token_rotation_recommended']);
    assert.match(output, /READY FOR CANDIDATE VALIDATION/);
    assert.match(output, /trends_api_token_rotation_recommended/);
    assert.doesNotMatch(output, /legacy-token-123/);
});

test('Production Compose publishes only the parallel candidate port and contains no secret', () => {
    const compose = fs.readFileSync(
        path.join(
            REPO_ROOT, 'apps', 'trends', 'trends-api', 'deployment', 'production', 'compose.yml'
        ),
        'utf8'
    );
    assert.match(compose, /container_name: bloggenius-trends-api-production/);
    assert.match(compose, /image: bloggenius\/trends-api:production/);
    assert.match(compose, /ports:\s*\n\s*- "4583:4581"/);
    assert.doesNotMatch(compose, /"4581:4581"/);
    assert.match(compose, /TRENDS_ENV: production/);
    assert.match(compose, /TRENDS_SUPABASE_TARGET_ENV: production/);
    assert.doesNotMatch(compose, /(?:sb_secret_|service_role|eyJ[A-Za-z0-9_-]+)/);
});
