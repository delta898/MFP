const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = __dirname;
const TRENDS_ROOT = path.resolve(API_ROOT, '..');
const REPO_ROOT = path.resolve(API_ROOT, '..', '..', '..');

function read(relativePath) {
    return fs.readFileSync(path.resolve(API_ROOT, relativePath), 'utf8');
}

test('Trends API image uses Node 24, a locked dependency set, and a non-root runtime', () => {
    const dockerfile = read('Dockerfile');
    const packageJson = JSON.parse(read('package.json'));
    const packageLock = JSON.parse(read('package-lock.json'));

    assert.match(dockerfile, /^FROM node:24-bookworm-slim AS runtime/m);
    assert.match(dockerfile, /^WORKDIR \/app$/m);
    assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
    assert.match(dockerfile, /apps\/trends\/trends-api\/src \/app\/apps\/trends\/trends-api\/src/);
    assert.match(dockerfile, /apps\/trends\/shared \/app\/apps\/trends\/shared/);
    assert.match(dockerfile, /^WORKDIR \/app\/apps\/trends\/trends-api$/m);
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /^HEALTHCHECK /m);
    assert.equal(packageJson.dependencies['@supabase/supabase-js'], '2.39.0');
    assert.equal(packageJson.dependencies['moment-timezone'], '0.6.0');
    assert.equal(packageLock.packages[''].dependencies['@supabase/supabase-js'], '2.39.0');
    assert.equal(packageLock.packages[''].dependencies['moment-timezone'], '0.6.0');
});

test('Trends API image build never copies environment or secret-bearing operator files', () => {
    const dockerfile = read('Dockerfile');
    const dockerignore = read('Dockerfile.dockerignore');

    assert.doesNotMatch(dockerfile, /COPY[^\n]*(?:\.env|config\/|secret)/i);
    assert.doesNotMatch(dockerfile, /\b(?:ARG|ENV)\s+(?:SUPABASE_SECRET_KEY|TRENDS_API_TOKEN|TRENDS_READ_TOKEN_SECRET)\b/);
    assert.match(dockerignore, /^\*\*$/m);
    assert.doesNotMatch(dockerignore, /!.*\.env/);
});

test('Local Compose injects runtime config and exposes API only on loopback', () => {
    const compose = fs.readFileSync(path.join(TRENDS_ROOT, 'compose.local.yml'), 'utf8');

    assert.match(compose, /env_file:\s*\n\s*- \$\{TRENDS_LOCAL_RUNTIME_ENV_FILE:-\.env\.local\}/);
    assert.match(compose, /SUPABASE_URL: http:\/\/host\.docker\.internal:54321/);
    assert.match(compose, /"127\.0\.0\.1:4581:4581"/);
    assert.match(compose, /read_only: true/);
    assert.match(compose, /- ALL/);
    assert.match(compose, /no-new-privileges:true/);
    assert.doesNotMatch(compose, /(?:sb_secret_|service_role|eyJ[A-Za-z0-9_-]+)/);
});

test('Local Supabase exposes the backend-only Trends schema through PostgREST', () => {
    const config = fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8');
    const hardening = fs.readFileSync(
        path.join(REPO_ROOT, 'supabase', 'migrations', '202608270017_harden_trends_access.sql'),
        'utf8'
    );

    assert.match(config, /schemas = \["public", "graphql_public", "trends"\]/);
    assert.match(hardening, /revoke all on all tables in schema trends from anon, authenticated/i);
});
