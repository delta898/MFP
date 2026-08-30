#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { spawnSync } = require('node:child_process');
const {
    loadGoogleOauthEnvironment,
    loadProductionEnvironment,
    parseEnvironmentFile
} = require('./project-environment');
const {
    resolveRuntimeEnvironmentProfile
} = require('../src/environment/runtime-profile');

const PRODUCTION_ENV_FILE = '.env.production';
const ALLOWED_BRANCH_PATTERN = /^(?:main|release\/.+)$/;
const FORBIDDEN_PRODUCTION_FILE_KEYS = Object.freeze([
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD',
    'BLOGGENIUS_PRODUCTION_SUPABASE_DB_URL',
    'TRENDS_API_TOKEN',
    'TRENDS_READ_TOKEN_SECRET'
]);

function normalizeText(value) {
    return String(value || '').trim();
}

function formatProductionLauncherHelp() {
    return [
        'Usage:',
        '  ./run_production.sh',
        '  npm run app:production',
        '',
        'Runs BlogGenius source against explicit Production public endpoints.',
        'Only main and release/* branches are allowed.',
        'The launcher prints safe target hosts and requires exact PRODUCTION confirmation.',
        'This does not build or validate a packaged application.'
    ].join('\n');
}

function resolveCurrentBranch(repoRoot, spawn = spawnSync) {
    const result = spawn('git', ['branch', '--show-current'], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error('현재 Git branch를 확인하지 못했습니다.');
    }
    const branch = normalizeText(result.stdout);
    if (!branch) throw new Error('Detached HEAD에서는 Production source run을 실행할 수 없습니다.');
    return branch;
}

function assertProductionSourceBranch(branch) {
    const normalized = normalizeText(branch);
    if (!ALLOWED_BRANCH_PATTERN.test(normalized)) {
        throw new Error(
            `Production source run은 main 또는 release/* branch에서만 허용됩니다. 현재 branch: ${normalized || '(unknown)'}`
        );
    }
    return normalized;
}

function prepareProductionSourceEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const fsImpl = options.fs || fs;
    const branch = assertProductionSourceBranch(
        options.branch || resolveCurrentBranch(repoRoot, options.spawn || spawnSync)
    );
    const environmentPath = path.join(repoRoot, PRODUCTION_ENV_FILE);
    if (!fsImpl.existsSync(environmentPath)) {
        throw new Error(`${PRODUCTION_ENV_FILE} 파일이 필요합니다. .env.production.sample을 복사해 설정하세요.`);
    }
    const productionFileValues = parseEnvironmentFile(
        fsImpl.readFileSync(environmentPath, 'utf8')
    );
    const forbiddenKeys = FORBIDDEN_PRODUCTION_FILE_KEYS.filter(
        (key) => normalizeText(productionFileValues[key])
    );
    if (forbiddenKeys.length > 0) {
        throw new Error(
            `${PRODUCTION_ENV_FILE}에는 server-only secret을 둘 수 없습니다: ${forbiddenKeys.join(', ')}`
        );
    }

    const productionEnv = loadProductionEnvironment({
        repoRoot,
        fs: fsImpl,
        env: options.env || process.env
    });
    const env = loadGoogleOauthEnvironment({
        repoRoot,
        fs: fsImpl,
        env: productionEnv
    });
    const profile = resolveRuntimeEnvironmentProfile({ env, buildConfig: {} });

    if (
        profile.environment !== 'production'
        || profile.status !== 'ready'
        || profile.configured !== true
    ) {
        throw new Error(`Production runtime profile이 준비되지 않았습니다: ${profile.reason || profile.status}`);
    }
    if (!profile.trendsApi?.configured) {
        throw new Error(`Production Trends API가 준비되지 않았습니다: ${profile.trendsApi?.reason || 'not_configured'}`);
    }
    if (!normalizeText(env.GOOGLE_OAUTH_CLIENT_ID) || !normalizeText(env.GOOGLE_OAUTH_CLIENT_SECRET)) {
        throw new Error('Google Desktop OAuth 설정이 필요합니다. .env.oauth을 확인하세요.');
    }

    const projectName = normalizeText(env.BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME);
    const projectRef = normalizeText(env.BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF);
    if (!projectName || !projectRef) {
        throw new Error('Production Supabase project name과 project ref가 필요합니다.');
    }
    const supabaseHost = normalizeText(profile.supabase?.endpointHost).toLowerCase();
    if (supabaseHost.endsWith('.supabase.co') && supabaseHost.split('.')[0] !== projectRef.toLowerCase()) {
        throw new Error('Production Supabase project ref와 URL host가 일치하지 않습니다.');
    }

    return Object.freeze({
        branch,
        projectName,
        projectRef,
        profile,
        env: Object.freeze({
            ...env,
            BLOGGENIUS_ENV: 'production',
            BLOGGENIUS_RUNTIME_ROOT: repoRoot
        })
    });
}

function formatProductionSourceDiagnostic(prepared = {}) {
    const profile = prepared.profile || {};
    return [
        'BlogGenius Production source preflight',
        `Branch: ${prepared.branch || '(unknown)'}`,
        `Supabase project: ${prepared.projectName || '(unknown)'} (${prepared.projectRef || '(unknown)'})`,
        `Supabase host: ${profile.supabase?.endpointHost || '(unconfigured)'}`,
        `Trends API host: ${profile.trendsApi?.endpointHost || '(unconfigured)'}`,
        'Live effects: manual publish, automated publish, payment, and notifications are enabled.',
        'Secret values are never printed.'
    ].join('\n');
}

async function promptForProductionSourceLaunch(options = {}) {
    const input = options.input || process.stdin;
    const output = options.output || process.stdout;
    const rl = readline.createInterface({ input, output });
    try {
        const answer = await rl.question(
            '\n⚠️ 실제 Production 기능을 소스에서 실행하려면 PRODUCTION을 입력하세요: '
        );
        return normalizeText(answer) === 'PRODUCTION';
    } finally {
        rl.close();
    }
}

async function launchProductionSource(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const spawn = options.spawn || spawnSync;
    const prepared = prepareProductionSourceEnvironment({ ...options, repoRoot, spawn });
    const input = options.input || process.stdin;
    const output = options.output || process.stdout;
    output.write(`${formatProductionSourceDiagnostic(prepared)}\n`);

    const confirm = options.confirm || promptForProductionSourceLaunch;
    if (!options.confirm && !(input.isTTY && output.isTTY)) {
        throw new Error('Production source run 확인에는 대화형 터미널(TTY)이 필요합니다.');
    }
    if (!await confirm({ input, output })) {
        output.write('Production source run을 취소했습니다.\n');
        return 0;
    }

    const electronCli = options.electronCli || require.resolve('electron/cli.js');
    output.write('Starting BlogGenius in production environment from source...\n');
    const result = spawn(process.execPath, [electronCli, '.'], {
        cwd: repoRoot,
        env: prepared.env,
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
}

async function runCli(argv = process.argv.slice(2)) {
    if (argv.includes('-h') || argv.includes('--help') || argv.includes('help')) {
        process.stdout.write(`${formatProductionLauncherHelp()}\n`);
        return 0;
    }
    if (argv.length > 0) throw new Error(`알 수 없는 Production launcher 옵션입니다: ${argv[0]}`);
    return launchProductionSource();
}

if (require.main === module) {
    runCli().then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`BlogGenius Production source launch failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    ALLOWED_BRANCH_PATTERN,
    FORBIDDEN_PRODUCTION_FILE_KEYS,
    PRODUCTION_ENV_FILE,
    assertProductionSourceBranch,
    formatProductionLauncherHelp,
    formatProductionSourceDiagnostic,
    launchProductionSource,
    prepareProductionSourceEnvironment,
    promptForProductionSourceLaunch,
    resolveCurrentBranch,
    runCli
};
