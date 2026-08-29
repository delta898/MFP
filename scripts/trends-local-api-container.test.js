const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    createRuntimeEnvironmentSource,
    ensureLocalSharedSecrets,
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
    ].join('\n'), { secretKey: 'current-secret' });

    assert.match(source, /TRENDS_API_TOKEN=collector-token/);
    assert.match(source, /SUPABASE_SECRET_KEY="current-secret"/);
    assert.doesNotMatch(source, /stale-secret|legacy-secret/);
});

test('missing Local API secrets are generated once in the ignored per-machine environment file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-secrets-test-'));
    const filePath = path.join(directory, '.env.trends-collector.local');
    fs.writeFileSync(filePath, [
        'TRENDS_API_TOKEN=',
        'TRENDS_READ_TOKEN_SECRET=already-configured'
    ].join('\n'));

    try {
        const first = ensureLocalSharedSecrets(filePath, {
            randomBytes: () => Buffer.alloc(32, 7)
        });
        const firstSource = fs.readFileSync(filePath, 'utf8');
        const second = ensureLocalSharedSecrets(filePath, {
            randomBytes: () => Buffer.alloc(32, 8)
        });
        const secondSource = fs.readFileSync(filePath, 'utf8');

        assert.deepEqual(first.generatedKeys, ['TRENDS_API_TOKEN']);
        assert.deepEqual(second.generatedKeys, []);
        assert.match(firstSource, /TRENDS_API_TOKEN=070707/);
        assert.match(firstSource, /TRENDS_READ_TOKEN_SECRET=already-configured/);
        assert.equal(secondSource, firstSource);
        assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('Local Trends container uses a permission-limited temporary env file and removes it', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-container-test-'));
    const envDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    fs.mkdirSync(envDirectory, { recursive: true });
    fs.writeFileSync(path.join(envDirectory, '.env.trends-collector.local'), 'TRENDS_API_TOKEN=test-token\n');
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
        return { status: 0 };
    };

    try {
        assert.equal(runLocalTrendsApiContainer({ repoRoot, spawn }), 0);
        assert.deepEqual(calls.map(({ command }) => command), ['supabase', 'docker']);
        assert.ok(calls[1].args.includes('apps/trends/trends-api/deployment/local/compose.yml'));
        assert.equal(fs.existsSync(runtimeEnvPath), false);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('runtime environment preparation can be reused by container smoke verification', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-runtime-test-'));
    const envDirectory = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config');
    fs.mkdirSync(envDirectory, { recursive: true });
    fs.writeFileSync(path.join(envDirectory, '.env.trends-collector.local'), 'TRENDS_API_TOKEN=test-token\n');
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
