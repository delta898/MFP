const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    assertTrendsEnvironment,
    formatTrendsEnvironmentDiagnostic,
    loadTrendsEnvironment,
    resolveEnvironmentFile,
    toSafeTrendsEnvironmentDiagnostic
} = require('./environment-profile');

test('trends environment contract accepts only explicit canonical names', () => {
    assert.equal(assertTrendsEnvironment('local'), 'local');
    assert.equal(assertTrendsEnvironment('development'), 'development');
    assert.equal(assertTrendsEnvironment('production'), 'production');
    assert.throws(() => assertTrendsEnvironment(''), /TRENDS_ENV is required/);
    assert.throws(() => assertTrendsEnvironment('dev'), /unsupported TRENDS_ENV/);
    assert.throws(() => assertTrendsEnvironment('prod'), /unsupported TRENDS_ENV/);
});

test('environment file defaults to the selected conventional file', () => {
    const resolved = resolveEnvironmentFile({ environment: 'development', baseDir: '/tmp/trends' });
    assert.equal(resolved.path, path.join('/tmp/trends', '.env.development'));
    assert.equal(resolved.required, false);
});

test('explicit environment file must be absolute', () => {
    assert.throws(() => resolveEnvironmentFile({
        environment: 'development',
        envFile: '.env.development'
    }), /must be an absolute path/);
});

test('loads only the selected environment file and preserves process values', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-env-'));
    try {
        fs.writeFileSync(path.join(tempDir, '.env.development'), [
            'TRENDS_ENV=development',
            'SUPABASE_URL=https://development.example',
            'TRENDS_API_TOKEN=file-secret',
            ''
        ].join('\n'));
        fs.writeFileSync(path.join(tempDir, '.env.production'), [
            'TRENDS_ENV=production',
            'SUPABASE_URL=https://production.example',
            ''
        ].join('\n'));

        const env = {
            TRENDS_ENV: 'development',
            TRENDS_API_TOKEN: 'process-secret'
        };
        const profile = loadTrendsEnvironment({ baseDir: tempDir, env });

        assert.equal(env.SUPABASE_URL, 'https://development.example');
        assert.equal(env.TRENDS_API_TOKEN, 'process-secret');
        assert.equal(profile.environment, 'development');
        assert.equal(profile.configFileName, '.env.development');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('never loads the legacy shared .env implicitly', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-env-legacy-'));
    try {
        fs.writeFileSync(path.join(tempDir, '.env'), [
            'SUPABASE_URL=https://must-not-load.example',
            'TRENDS_API_TOKEN=must-not-load',
            ''
        ].join('\n'));
        const env = { TRENDS_ENV: 'local' };
        const profile = loadTrendsEnvironment({ baseDir: tempDir, env });

        assert.equal(env.SUPABASE_URL, undefined);
        assert.equal(env.TRENDS_API_TOKEN, undefined);
        assert.equal(profile.configSource, 'process_environment');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('rejects a selected environment and file declaration mismatch', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-env-mismatch-'));
    try {
        fs.writeFileSync(path.join(tempDir, '.env.development'), [
            'TRENDS_ENV=production',
            'SUPABASE_URL=https://production.example',
            ''
        ].join('\n'));
        assert.throws(() => loadTrendsEnvironment({
            baseDir: tempDir,
            env: { TRENDS_ENV: 'development' }
        }), /environment file mismatch/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('requires an explicitly selected file to exist', () => {
    assert.throws(() => loadTrendsEnvironment({
        baseDir: '/tmp',
        env: {
            TRENDS_ENV: 'local',
            TRENDS_ENV_FILE: '/tmp/missing-trends-environment-file'
        }
    }), /does not exist/);
});

test('safe diagnostics never expose environment values or secret contents', () => {
    const profile = loadTrendsEnvironment({
        baseDir: '/tmp/nonexistent-trends-dir',
        env: {
            TRENDS_ENV: 'local',
            TRENDS_API_TOKEN: 'must-not-escape',
            SUPABASE_SECRET_KEY: 'must-not-escape-either'
        }
    });
    const diagnostic = toSafeTrendsEnvironmentDiagnostic(profile);
    const output = formatTrendsEnvironmentDiagnostic(profile);

    assert.deepEqual(diagnostic, {
        environment: 'local',
        configured: true,
        configSource: 'process_environment',
        configFileLoaded: false,
        configFileName: ''
    });
    assert.doesNotMatch(JSON.stringify(diagnostic), /must-not-escape/);
    assert.doesNotMatch(output, /must-not-escape/);
});
