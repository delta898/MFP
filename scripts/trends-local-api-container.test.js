const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    createRuntimeEnvironmentSource,
    ensureLocalSecretFiles,
    parseLocalSupabaseAdminConnection,
    prepareLocalRuntimeEnvironment,
    runLocalTrendsApiContainer
} = require('./trends-local-api-container');

test('Local Trends container resolves the current local Supabase secret without exposing hosted targets', () => {
    const connection = parseLocalSupabaseAdminConnection(JSON.stringify({
        API_URL: 'http://127.0.0.1:54321',
        SECRET_KEY: 'current-local-secret',
        SERVICE_ROLE_KEY: 'legacy-local-secret'
    }));

    assert.equal(connection.apiUrl, 'http://127.0.0.1:54321');
    assert.equal(connection.secretKey, 'current-local-secret');
    assert.throws(() => parseLocalSupabaseAdminConnection(JSON.stringify({
        API_URL: 'https://production.supabase.co',
        SECRET_KEY: 'wrong-target'
    })), /non-local/);
});

test('runtime environment replaces stale admin keys while preserving operator config', () => {
    const source = createRuntimeEnvironmentSource([
        'TRENDS_API_TOKEN=collector-token',
        'SUPABASE_SECRET_KEY=stale-secret',
        'SUPABASE_SERVICE_ROLE_KEY=legacy-secret'
    ].join('\n'), { secretKey: 'current-secret' }, [
        'TRENDS_READ_TOKEN_SECRET=read-secret',
        'TRENDS_READ_TOKEN_ISSUER=bloggenius-local',
        'TRENDS_READ_TOKEN_AUDIENCE=trends-api-local'
    ].join('\n'));

    assert.match(source, /TRENDS_API_TOKEN=collector-token/);
    assert.match(source, /SUPABASE_SECRET_KEY="current-secret"/);
    assert.match(source, /TRENDS_READ_TOKEN_SECRET="read-secret"/);
    assert.match(source, /TRENDS_READ_TOKEN_ISSUER="bloggenius-local"/);
    assert.match(source, /TRENDS_READ_TOKEN_AUDIENCE="trends-api-local"/);
    assert.doesNotMatch(source, /stale-secret|legacy-secret/);
});

test('Local secrets are generated once in their owner files and legacy signing secrets migrate', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-secrets-test-'));
    const collectorDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    const functionsDirectory = path.join(repoRoot, 'supabase', 'functions');
    fs.mkdirSync(collectorDirectory, { recursive: true });
    fs.mkdirSync(functionsDirectory, { recursive: true });
    const collectorPath = path.join(collectorDirectory, '.env.trends-collector.local');
    const functionsPath = path.join(functionsDirectory, '.env');
    fs.writeFileSync(`${collectorPath}.sample`, 'TRENDS_API_TOKEN=\n');
    fs.writeFileSync(`${functionsPath}.sample`, 'TRENDS_READ_TOKEN_SECRET=\n');
    fs.writeFileSync(collectorPath, [
        'TRENDS_API_TOKEN=',
        'SUPABASE_URL=http://127.0.0.1:54321',
        'SUPABASE_SECRET_KEY=obsolete-admin-secret',
        'SUPABASE_SERVICE_ROLE_KEY=obsolete-service-role',
        'TRENDS_SUPABASE_TARGET_ENV=local',
        'TRENDS_API_HOST=127.0.0.1',
        'TRENDS_API_PORT=4581',
        'TRENDS_READ_TOKEN_SECRET=already-configured',
        'TRENDS_READ_TOKEN_ISSUER=legacy-issuer',
        'TRENDS_READ_TOKEN_AUDIENCE=legacy-audience'
    ].join('\n'));
    fs.writeFileSync(functionsPath, 'TRENDS_READ_TOKEN_SECRET=\n');

    try {
        const first = ensureLocalSecretFiles({ repoRoot,
            randomBytes: () => Buffer.alloc(32, 7)
        });
        const firstCollectorSource = fs.readFileSync(collectorPath, 'utf8');
        const firstFunctionsSource = fs.readFileSync(functionsPath, 'utf8');
        const second = ensureLocalSecretFiles({ repoRoot,
            randomBytes: () => Buffer.alloc(32, 8)
        });
        const secondCollectorSource = fs.readFileSync(collectorPath, 'utf8');
        const secondFunctionsSource = fs.readFileSync(functionsPath, 'utf8');

        assert.deepEqual(first.generatedKeys, ['TRENDS_API_TOKEN']);
        assert.deepEqual(second.generatedKeys, []);
        assert.equal(first.migratedSigningSecret, true);
        assert.equal(first.requiresFunctionRuntimeRestart, true);
        assert.equal(second.requiresFunctionRuntimeRestart, false);
        assert.match(firstCollectorSource, /TRENDS_API_TOKEN=070707/);
        assert.doesNotMatch(firstCollectorSource, /SUPABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
        assert.doesNotMatch(firstCollectorSource, /TRENDS_SUPABASE_TARGET_ENV/);
        assert.doesNotMatch(firstCollectorSource, /TRENDS_API_HOST|TRENDS_API_PORT/);
        assert.doesNotMatch(firstCollectorSource, /TRENDS_READ_TOKEN_SECRET/);
        assert.doesNotMatch(firstCollectorSource, /TRENDS_READ_TOKEN_ISSUER|TRENDS_READ_TOKEN_AUDIENCE/);
        assert.match(firstFunctionsSource, /TRENDS_READ_TOKEN_SECRET=already-configured/);
        assert.equal(secondCollectorSource, firstCollectorSource);
        assert.equal(secondFunctionsSource, firstFunctionsSource);
        assert.equal(fs.statSync(collectorPath).mode & 0o777, 0o600);
        assert.equal(fs.statSync(functionsPath).mode & 0o777, 0o600);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('new Local Functions secret files request one runtime restart', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-new-functions-env-'));
    const collectorDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    const functionsDirectory = path.join(repoRoot, 'supabase', 'functions');
    fs.mkdirSync(collectorDirectory, { recursive: true });
    fs.mkdirSync(functionsDirectory, { recursive: true });
    fs.writeFileSync(path.join(collectorDirectory, '.env.trends-collector.local.sample'), 'TRENDS_API_TOKEN=\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env.sample'), 'TRENDS_READ_TOKEN_SECRET=\n');

    try {
        const result = ensureLocalSecretFiles({
            repoRoot,
            randomBytes: () => Buffer.alloc(32, 9)
        });

        assert.equal(result.requiresFunctionRuntimeRestart, true);
        assert.deepEqual(result.generatedKeys, ['TRENDS_API_TOKEN', 'TRENDS_READ_TOKEN_SECRET']);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('Local Trends container uses a permission-limited temporary env file and removes it', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-container-test-'));
    const envDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    const functionsDirectory = path.join(repoRoot, 'supabase', 'functions');
    fs.mkdirSync(envDirectory, { recursive: true });
    fs.mkdirSync(functionsDirectory, { recursive: true });
    fs.writeFileSync(path.join(envDirectory, '.env.trends-collector.local'), 'TRENDS_API_TOKEN=test-token\n');
    fs.writeFileSync(path.join(envDirectory, '.env.trends-collector.local.sample'), 'TRENDS_API_TOKEN=\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env'), 'TRENDS_READ_TOKEN_SECRET=test-read-secret\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env.sample'), 'TRENDS_READ_TOKEN_SECRET=\n');
    let runtimeEnvPath = '';
    const calls = [];
    const spawn = (command, args, options) => {
        calls.push({ command, args });
        if (command === 'supabase') {
            return {
                status: 0,
                stdout: JSON.stringify({
                    API_URL: 'http://127.0.0.1:54321',
                    SECRET_KEY: 'temporary-local-secret'
                })
            };
        }
        runtimeEnvPath = options.env.TRENDS_LOCAL_RUNTIME_ENV_FILE;
        assert.equal(fs.statSync(runtimeEnvPath).mode & 0o777, 0o600);
        const runtimeSource = fs.readFileSync(runtimeEnvPath, 'utf8');
        assert.match(runtimeSource, /SUPABASE_SECRET_KEY="temporary-local-secret"/);
        assert.match(runtimeSource, /TRENDS_READ_TOKEN_SECRET="test-read-secret"/);
        return { status: 0 };
    };

    try {
        assert.equal(runLocalTrendsApiContainer({ repoRoot, spawn }), 0);
        assert.deepEqual(calls.map(({ command }) => command), ['supabase', 'docker']);
        assert.ok(calls[1].args.includes('apps/trends/trends-api/deployment/local/compose.yml'));
        assert.equal(calls[1].args.includes('--detach'), false);
        assert.equal(fs.existsSync(runtimeEnvPath), false);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('detached Local Trends startup waits for a healthy API container', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-detached-test-'));
    const collectorDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    const functionsDirectory = path.join(repoRoot, 'supabase', 'functions');
    fs.mkdirSync(collectorDirectory, { recursive: true });
    fs.mkdirSync(functionsDirectory, { recursive: true });
    fs.writeFileSync(path.join(collectorDirectory, '.env.trends-collector.local'), 'TRENDS_API_TOKEN=test-token\n');
    fs.writeFileSync(path.join(collectorDirectory, '.env.trends-collector.local.sample'), 'TRENDS_API_TOKEN=\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env'), 'TRENDS_READ_TOKEN_SECRET=test-read-secret\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env.sample'), 'TRENDS_READ_TOKEN_SECRET=\n');
    const calls = [];
    const spawn = (command, args) => {
        calls.push({ command, args });
        if (command === 'supabase') {
            return { status: 0, stdout: JSON.stringify({ API_URL: 'http://127.0.0.1:54321', SECRET_KEY: 'local-secret' }) };
        }
        return { status: 0 };
    };

    try {
        assert.equal(runLocalTrendsApiContainer({ repoRoot, spawn, detached: true }), 0);
        assert.deepEqual(calls.map(({ command }) => command), ['supabase', 'docker']);
        assert.ok(calls[1].args.includes('--detach'));
        assert.ok(calls[1].args.includes('--wait'));
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('runtime environment preparation can be reused by container smoke verification', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-runtime-test-'));
    const envDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    const functionsDirectory = path.join(repoRoot, 'supabase', 'functions');
    fs.mkdirSync(envDirectory, { recursive: true });
    fs.mkdirSync(functionsDirectory, { recursive: true });
    fs.writeFileSync(path.join(envDirectory, '.env.trends-collector.local'), 'TRENDS_API_TOKEN=test-token\n');
    fs.writeFileSync(path.join(envDirectory, '.env.trends-collector.local.sample'), 'TRENDS_API_TOKEN=\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env'), 'TRENDS_READ_TOKEN_SECRET=test-read-secret\n');
    fs.writeFileSync(path.join(functionsDirectory, '.env.sample'), 'TRENDS_READ_TOKEN_SECRET=\n');
    const spawn = () => ({
        status: 0,
        stdout: JSON.stringify({
            API_URL: 'http://127.0.0.1:54321',
            SECRET_KEY: 'temporary-local-secret'
        })
    });

    const runtime = prepareLocalRuntimeEnvironment({ repoRoot, spawn, env: { SAFE: 'yes' } });
    try {
        assert.equal(runtime.env.SAFE, 'yes');
        assert.equal(runtime.env.TRENDS_LOCAL_RUNTIME_ENV_FILE, runtime.path);
        assert.equal(fs.existsSync(runtime.path), true);
    } finally {
        runtime.cleanup();
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
    assert.equal(fs.existsSync(runtime.path), false);
});
