const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { inspectDevelopmentDeployment, readManifest } = require('./trends-development-preflight');

const REPO_ROOT = path.resolve(__dirname, '..');

function validEnvironment() {
    return {
        TRENDS_ENV: 'development',
        TRENDS_SUPABASE_TARGET_ENV: 'development',
        SUPABASE_URL: 'https://development-project.supabase.co',
        SUPABASE_SECRET_KEY: 's'.repeat(32),
        TRENDS_API_TOKEN: 'a'.repeat(32),
        TRENDS_READ_TOKEN_SECRET: 'r'.repeat(32),
        TRENDS_API_BASE_URL: 'https://trendapi-dev.hangadac.com',
        TRENDS_READ_TOKEN_ISSUER: 'bloggenius-development',
        TRENDS_READ_TOKEN_AUDIENCE: 'trends-api-development',
        TRENDS_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
        TRENDS_PRODUCTION_API_BASE_URL: 'https://trendapi.hangadac.com'
    };
}

test('development deployment manifest fixes the approved isolated topology', () => {
    const manifest = readManifest(REPO_ROOT);
    assert.equal(manifest.environment, 'development');
    assert.equal(manifest.service.public_base_url, 'https://trendapi-dev.hangadac.com');
    assert.equal(manifest.service.container_port, 4581);
    assert.equal(manifest.deployment_policy.ingress_owner, 'external_server_routing');
    assert.equal(manifest.service.container_name, 'bloggenius-trends-api-development');
    assert.equal(manifest.deployment_policy.production_service_mutation_allowed, false);
    assert.equal(manifest.deployment_policy.initial_collection, 'one_time_manual');
});

test('development preflight accepts the approved topology without exposing secrets', () => {
    const result = inspectDevelopmentDeployment({ repoRoot: REPO_ROOT, env: validEnvironment() });
    assert.equal(result.ready, true);
    assert.equal(result.deployment.hostname, 'trendapi-dev.hangadac.com');
    assert.equal(result.deployment.containerPort, 4581);
    assert.doesNotMatch(JSON.stringify(result), /s{24}|a{24}|r{24}/);
});

test('development preflight rejects Production targets and token contract drift', () => {
    const productionDrift = inspectDevelopmentDeployment({
        repoRoot: REPO_ROOT,
        env: { ...validEnvironment(), SUPABASE_URL: 'https://production-project.supabase.co' }
    });
    assert.equal(productionDrift.ready, false);
    assert.match(productionDrift.failures[0], /must not use the known Production target/);

    const tokenDrift = inspectDevelopmentDeployment({
        repoRoot: REPO_ROOT,
        env: { ...validEnvironment(), TRENDS_READ_TOKEN_AUDIENCE: 'trends-api' }
    });
    assert.equal(tokenDrift.ready, false);
    assert.deepEqual(tokenDrift.failures, ['token_audience_mismatch']);
});

test('Development Compose leaves host routing and TLS to external infrastructure', () => {
    const compose = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'trends', 'compose.development.yml'), 'utf8');
    assert.match(compose, /container_name: bloggenius-trends-api-development/);
    assert.match(compose, /expose:\s*\n\s*- "4581"/);
    assert.doesNotMatch(compose, /(?:ports:|host\.docker\.internal|caddy)/i);
    assert.match(compose, /TRENDS_DEVELOPMENT_RUNTIME_ENV_FILE:\?TRENDS_DEVELOPMENT_RUNTIME_ENV_FILE is required/);
    assert.match(compose, /TRENDS_API_BASE_URL: https:\/\/trendapi-dev\.hangadac\.com/);
    assert.doesNotMatch(compose, /(?:sb_secret_|service_role|eyJ[A-Za-z0-9_-]+)/);
});
