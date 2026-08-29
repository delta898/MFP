'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    parseLocalSupabaseStatus,
    prepareLocalEnvironment,
    prepareDevelopmentEnvironment,
    prepareAppEnvironment
} = require('./app-environment-launcher');

const REPO_ROOT = path.resolve(__dirname, '..');

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

test('local status parser supports current publishable key output', () => {
    assert.deepEqual(parseLocalSupabaseStatus(JSON.stringify({
        API_URL: 'http://127.0.0.1:54321/',
        PUBLISHABLE_KEY: 'local-public-key'
    })), {
        url: 'http://127.0.0.1:54321',
        publishableKey: 'local-public-key'
    });
});

test('local app launcher starts Supabase and injects its discovered public connection', () => {
    const calls = [];
    const spawn = (command, args) => {
        calls.push([command, ...args]);
        if (args[0] === 'status') {
            return {
                status: 0,
                stdout: JSON.stringify({
                    API_URL: 'http://127.0.0.1:54321',
                    ANON_KEY: 'legacy-local-key'
                })
            };
        }
        return { status: 0, stdout: '' };
    };

    const env = prepareLocalEnvironment({
        repoRoot: '/repo',
        spawn,
        quiet: true,
        fs: {
            existsSync: (filePath) => /[.]env[.]oauth$/.test(filePath),
            readFileSync: () => [
                'GOOGLE_OAUTH_CLIENT_ID=local-google-id',
                'GOOGLE_OAUTH_CLIENT_SECRET=local-google-secret'
            ].join('\n')
        },
        env: { BLOGGENIUS_ENV: 'development' }
    });

    assert.deepEqual(calls, [
        ['supabase', 'start', '--exclude', 'realtime,storage-api,imgproxy,studio'],
        ['supabase', 'status', '--output', 'json']
    ]);
    assert.equal(env.BLOGGENIUS_ENV, 'local');
    assert.equal(env.BLOGGENIUS_RUNTIME_ROOT, path.resolve('/repo'));
    assert.equal(env.BLOGGENIUS_LOCAL_SUPABASE_URL, 'http://127.0.0.1:54321');
    assert.equal(env.BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY, 'legacy-local-key');
    assert.equal(env.BLOGGENIUS_LOCAL_TRENDS_API_URL, 'http://127.0.0.1:4581');
    assert.equal(env.GOOGLE_OAUTH_CLIENT_ID, 'local-google-id');
    assert.equal(env.GOOGLE_OAUTH_CLIENT_SECRET, 'local-google-secret');
});

test('development app launcher reads the dedicated file and owns environment selection', () => {
    const requestedPaths = [];
    const fs = {
        existsSync(filePath) {
            requestedPaths.push(filePath);
            return /[.]env[.](development|oauth)$/.test(filePath);
        },
        readFileSync(filePath) {
            if (/[.]env[.]oauth$/.test(filePath)) {
                return [
                    'GOOGLE_OAUTH_CLIENT_ID=development-google-id',
                    'GOOGLE_OAUTH_CLIENT_SECRET=development-google-secret'
                ].join('\n');
            }
            return [
                'BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME="BlogGenius Development"',
                'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL=https://development.example.invalid',
                'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY=development-public-key'
            ].join('\n');
        }
    };

    const env = prepareDevelopmentEnvironment({
        repoRoot: '/repo',
        fs,
        manifest: DEVELOPMENT_MANIFEST,
        env: { BLOGGENIUS_ENV: 'local' }
    });

    assert.equal(env.BLOGGENIUS_ENV, 'development');
    assert.equal(env.BLOGGENIUS_RUNTIME_ROOT, path.resolve('/repo'));
    assert.equal(
        env.BLOGGENIUS_DEVELOPMENT_SUPABASE_URL,
        'https://development.example.invalid'
    );
    assert.equal(env.GOOGLE_OAUTH_CLIENT_ID, 'development-google-id');
    assert.equal(env.GOOGLE_OAUTH_CLIENT_SECRET, 'development-google-secret');
    assert.equal(requestedPaths.some((value) => /[.]env[.]development$/.test(value)), true);
    assert.equal(requestedPaths.some((value) => /[.]env[.]oauth$/.test(value)), true);
});

test('development runtime root makes config loading prefer the project over Electron userData', () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-runtime-root-'));
    const electronUserData = path.join(runtimeRoot, 'electron-user-data');
    const configDir = path.join(runtimeRoot, 'config');
    const configPath = path.join(configDir, 'config.json');
    const localLicensePath = path.join(configDir, 'license.local.key');
    const productionLicensePath = path.join(configDir, 'license.key');
    const sample = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'config', 'config.json.sample'), 'utf8')
    );
    sample.general.listen_port = 49123;

    try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(electronUserData, { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(sample), 'utf8');
        fs.writeFileSync(localLicensePath, 'local-license\n', 'utf8');
        fs.writeFileSync(productionLicensePath, 'production-license\n', 'utf8');

        const loaderPath = path.join(REPO_ROOT, 'src', 'config-loader.js');
        const result = spawnSync(process.execPath, [
            '-e',
            `const config = require(${JSON.stringify(loaderPath)}); process.stdout.write(JSON.stringify({ root: config.ROOT_DIR, source: config.CONFIG_SOURCE_PATH, port: config.LISTEN_PORT, license: config.LICENSE_KEY, licensePath: config.LICENSE_KEY_FILE_PATH }));`
        ], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                BLOGGENIUS_ENV: 'local',
                BLOGGENIUS_RUNTIME_ROOT: runtimeRoot,
                BLOGGENIUS_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
                BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY: 'local-public-key',
                LICENSE_KEY: 'production-environment-license',
                BLOG_GENIUS_USER_DATA: electronUserData
            },
            encoding: 'utf8'
        });

        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
            root: runtimeRoot,
            source: configPath,
            port: 49123,
            license: 'local-license',
            licensePath: localLicensePath
        });
    } finally {
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
});

test('development config uses its own per-device license file', () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-development-license-'));
    const configDir = path.join(runtimeRoot, 'config');
    const configPath = path.join(configDir, 'config.json');
    const developmentLicensePath = path.join(configDir, 'license.development.key');
    const sample = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'config', 'config.json.sample'), 'utf8')
    );

    try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(sample), 'utf8');
        fs.writeFileSync(developmentLicensePath, 'development-license\n', 'utf8');
        fs.writeFileSync(path.join(configDir, 'license.key'), 'production-license\n', 'utf8');

        const loaderPath = path.join(REPO_ROOT, 'src', 'config-loader.js');
        const result = spawnSync(process.execPath, [
            '-e',
            `const config = require(${JSON.stringify(loaderPath)}); process.stdout.write(JSON.stringify({ license: config.LICENSE_KEY, licensePath: config.LICENSE_KEY_FILE_PATH }));`
        ], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                BLOGGENIUS_ENV: 'development',
                BLOGGENIUS_RUNTIME_ROOT: runtimeRoot,
                BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://development.example.invalid',
                BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: 'development-public-key',
                LICENSE_KEY: 'production-environment-license'
            },
            encoding: 'utf8'
        });

        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
            license: 'development-license',
            licensePath: developmentLicensePath
        });
    } finally {
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
});

test('app launcher refuses production and unspecified targets', () => {
    assert.throws(
        () => prepareAppEnvironment('production'),
        /Unsupported app environment: production/
    );
    assert.throws(
        () => prepareAppEnvironment(''),
        /Unsupported app environment: \(missing\)/
    );
});

test('package scripts expose only the safe local and development launch shortcuts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');

    assert.equal(
        packageJson.scripts['app:local'],
        'node scripts/app-environment-launcher.js local'
    );
    assert.equal(
        packageJson.scripts['app:development'],
        'node scripts/app-environment-launcher.js development'
    );
    assert.equal(packageJson.scripts['env:status'], 'node scripts/environment-status.js');
    assert.equal(packageJson.scripts['app:production'], undefined);
    assert.match(gitignore, /^\.env\.development$/m);
    assert.match(gitignore, /^\.env\.oauth$/m);
});
