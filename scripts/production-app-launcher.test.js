'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    assertProductionSourceBranch,
    formatProductionLauncherHelp,
    formatProductionSourceDiagnostic,
    launchProductionSource,
    prepareProductionSourceEnvironment
} = require('./production-app-launcher');

const REPO_ROOT = path.resolve(__dirname, '..');

function createEnvironmentFs(options = {}) {
    const production = options.production || [
        'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME="BlogGenius Production"',
        'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF=productionref',
        'BLOGGENIUS_PRODUCTION_SUPABASE_URL=https://productionref.supabase.co',
        'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY=production-public-key',
        'BLOGGENIUS_PRODUCTION_TRENDS_API_URL=https://trendapi.example.com'
    ].join('\n');
    return {
        existsSync(filePath) {
            if (/[.]env[.]production$/.test(filePath)) return options.productionExists !== false;
            return false;
        },
        readFileSync(filePath) {
            if (/[.]env[.]production$/.test(filePath)) return production;
            throw new Error(`unexpected read: ${filePath}`);
        }
    };
}

function productionOAuthEnvironment() {
    return {
        BLOGGENIUS_OAUTH_ENV: 'production',
        GOOGLE_OAUTH_CLIENT_ID: 'production-google-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'production-google-secret',
        CLOUDFLARE_OAUTH_CLIENT_ID: 'production-cloudflare-id',
        CLOUDFLARE_OAUTH_SCOPES: 'memberships.read workers-scripts.admin'
    };
}

test('Production source launcher accepts only main and non-empty release branches', () => {
    assert.equal(assertProductionSourceBranch('main'), 'main');
    assert.equal(assertProductionSourceBranch('release/v0.4.0'), 'release/v0.4.0');
    assert.throws(() => assertProductionSourceBranch('dev'), /main 또는 release/);
    assert.throws(() => assertProductionSourceBranch('release/'), /main 또는 release/);
    assert.throws(() => assertProductionSourceBranch('feature/test'), /main 또는 release/);
});

test('Production source environment loads only explicit public targets and shared OAuth config', () => {
    const prepared = prepareProductionSourceEnvironment({
        repoRoot: '/repo',
        branch: 'main',
        fs: createEnvironmentFs(),
        env: productionOAuthEnvironment()
    });

    assert.equal(prepared.branch, 'main');
    assert.equal(prepared.projectName, 'BlogGenius Production');
    assert.equal(prepared.projectRef, 'productionref');
    assert.equal(prepared.profile.environment, 'production');
    assert.equal(prepared.profile.supabase.endpointHost, 'productionref.supabase.co');
    assert.equal(prepared.profile.trendsApi.endpointHost, 'trendapi.example.com');
    assert.equal(prepared.env.BLOGGENIUS_RUNTIME_ROOT, undefined);
    assert.equal(prepared.env.GOOGLE_OAUTH_CLIENT_ID, 'production-google-id');
    assert.equal(prepared.env.GOOGLE_OAUTH_CLIENT_SECRET, 'production-google-secret');
    assert.equal(prepared.env.CLOUDFLARE_OAUTH_CLIENT_ID, 'production-cloudflare-id');
    assert.equal(prepared.env.CLOUDFLARE_OAUTH_SCOPES, 'memberships.read workers-scripts.admin');
    assert.equal(prepared.env.BLOGGENIUS_OAUTH_ENV, 'production');
});

test('Production source environment fails closed for missing, mixed, or secret-bearing config', () => {
    assert.throws(
        () => prepareProductionSourceEnvironment({
            repoRoot: '/repo',
            branch: 'main',
            fs: createEnvironmentFs({ productionExists: false }),
            env: {}
        }),
        /\.env\.production 파일이 필요/
    );
    assert.throws(
        () => prepareProductionSourceEnvironment({
            repoRoot: '/repo',
            branch: 'main',
            fs: createEnvironmentFs(),
            env: {}
        }),
        /Google Desktop OAuth 환경변수가 필요/
    );
    assert.throws(
        () => prepareProductionSourceEnvironment({
            repoRoot: '/repo',
            branch: 'main',
            fs: createEnvironmentFs(),
            env: {
                ...productionOAuthEnvironment(),
                BLOGGENIUS_OAUTH_ENV: 'development'
            }
        }),
        /Production OAuth 설정이 전달되지 않았습니다/
    );
    assert.throws(
        () => prepareProductionSourceEnvironment({
            repoRoot: '/repo',
            branch: 'main',
            fs: createEnvironmentFs({
                production: [
                    'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME=Production',
                    'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF=expectedref',
                    'BLOGGENIUS_PRODUCTION_SUPABASE_URL=https://differentref.supabase.co',
                    'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY=public-key',
                    'BLOGGENIUS_PRODUCTION_TRENDS_API_URL=https://trendapi.example.com'
                ].join('\n')
            }),
            env: productionOAuthEnvironment()
        }),
        /project ref와 URL host가 일치하지 않습니다/
    );
    assert.throws(
        () => prepareProductionSourceEnvironment({
            repoRoot: '/repo',
            branch: 'main',
            fs: createEnvironmentFs({
                production: [
                    'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME=Production',
                    'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF=productionref',
                    'BLOGGENIUS_PRODUCTION_SUPABASE_URL=https://productionref.supabase.co',
                    'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY=public-key',
                    'BLOGGENIUS_PRODUCTION_TRENDS_API_URL=https://trendapi.example.com',
                    'SUPABASE_SECRET_KEY=must-not-be-here'
                ].join('\n')
            }),
            env: {}
        }),
        /server-only secret.*SUPABASE_SECRET_KEY/
    );
});

test('Production diagnostic exposes target identity but never credentials', () => {
    const prepared = prepareProductionSourceEnvironment({
        repoRoot: '/repo',
        branch: 'release/v0.4.0',
        fs: createEnvironmentFs(),
        env: productionOAuthEnvironment()
    });
    const output = formatProductionSourceDiagnostic(prepared);

    assert.match(output, /release\/v0\.4\.0/);
    assert.match(output, /productionref\.supabase\.co/);
    assert.match(output, /trendapi\.example\.com/);
    assert.match(output, /automated publish/);
    assert.doesNotMatch(output, /production-public-key|production-google-secret/);
});

test('Production source launch cancellation stops before Electron', async () => {
    const calls = [];
    let output = '';
    const status = await launchProductionSource({
        repoRoot: '/repo',
        branch: 'main',
        fs: createEnvironmentFs(),
        env: productionOAuthEnvironment(),
        output: { write(value) { output += value; } },
        confirm: async () => false,
        spawn: (...args) => {
            calls.push(args);
            return { status: 0 };
        }
    });

    assert.equal(status, 0);
    assert.equal(calls.length, 0);
    assert.match(output, /Production source run을 취소/);
});

test('Production source launch starts Electron only after explicit confirmation', async () => {
    const calls = [];
    const status = await launchProductionSource({
        repoRoot: '/repo',
        branch: 'main',
        fs: createEnvironmentFs(),
        env: productionOAuthEnvironment(),
        output: { write() {} },
        confirm: async () => true,
        electronCli: '/electron/cli.js',
        spawn: (command, args, options) => {
            calls.push({ command, args, options });
            return { status: 0 };
        }
    });

    assert.equal(status, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, process.execPath);
    assert.deepEqual(calls[0].args, ['/electron/cli.js', '.']);
    assert.equal(calls[0].options.env.BLOGGENIUS_ENV, 'production');
    assert.equal(calls[0].options.env.BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY, 'production-public-key');
});

test('Production launcher help and repository contract remain safe without configuration', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    const shell = fs.readFileSync(path.join(REPO_ROOT, 'run_production.sh'), 'utf8');
    const sample = fs.readFileSync(path.join(REPO_ROOT, '.env.production.sample'), 'utf8');
    const help = formatProductionLauncherHelp();

    assert.match(help, /main and release\/\*/);
    assert.equal(packageJson.scripts['app:production'], 'node scripts/production-app-launcher.js');
    assert.match(gitignore, /^\.env\.production$/m);
    assert.match(shell, /run-with-oauth-env[.]js production/);
    assert.match(shell, /\.env[.]oauth[.]prod/);
    assert.match(sample, /BLOGGENIUS_PRODUCTION_TRENDS_API_URL="https:\/\/trendapi\.bloggenius\.kr"/);
    assert.doesNotMatch(sample, /SUPABASE_(?:SECRET|SERVICE_ROLE)|TRENDS_(?:API_TOKEN|READ_TOKEN_SECRET)=/);
});
