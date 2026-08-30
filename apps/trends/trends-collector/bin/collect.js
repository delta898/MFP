#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const axios = require('axios');
const { chromium } = require('playwright');
const {
    formatTrendsEnvironmentDiagnostic,
    loadTrendsEnvironment
} = require('../../shared/lib/environment-profile');
const {
    formatRuntimeTargetDiagnostic,
    resolveCollectorRuntimeGuard
} = require('../../shared/lib/runtime-target-guard');
const {
    buildCollectedTrendPayload,
    createNaverTrendsCollector
} = require('../../../../shared/naver-trends-core');

const DEFAULT_BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const DEFAULT_SOURCE = 'naver_creator_advisor';
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../../../..');

function createLogger() {
    return {
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args),
        debug: (...args) => {
            if (process.env.DEBUG_TRENDS_COLLECTOR === '1') {
                console.debug(...args);
            }
        }
    };
}

function formatCollectorHelp() {
    return [
        'Usage:',
        '  node bin/trends-collector [options]',
        '  npm run trends:collector -- [options]',
        '',
        'Options:',
        '  -h, --help           Show this help message',
        '  -d, --date <value>   Collect trends for a specific date',
        '                       Supported: YYYY-MM-DD, YYYYMMDD, yesterday, 어제, -1d, -3d',
        '      --dry-run        Collect and summarize without writing to the API',
        '      --confirm-production',
        '                       Write to Production without an interactive prompt',
        '',
        'Environment:',
        '  TRENDS_ENV=local|development|production is required.',
        '  apps/trends/trends-collector/config/.env.trends-collector.<environment> is loaded when present.',
        '  If --date is omitted, TRENDS_TARGET_DATE is used when present.',
        '  If neither is set, the collector uses the provider default date.',
        '  Production defaults to interactive confirmation and requires a TTY.',
    ].join('\n');
}

function parseCollectorCliArgs(argv = process.argv.slice(2)) {
    const options = {
        help: false,
        date: '',
        dryRun: false,
        confirmProduction: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = String(argv[index] || '').trim();
        if (!argument) continue;

        if (argument === '-h' || argument === '--help') {
            options.help = true;
            continue;
        }

        if (argument === '-d' || argument === '--date') {
            const nextValue = String(argv[index + 1] || '').trim();
            if (!nextValue) {
                throw new Error(`${argument} 옵션에는 날짜 값이 필요합니다.`);
            }
            options.date = nextValue;
            index += 1;
            continue;
        }

        if (argument.startsWith('--date=')) {
            const value = argument.slice('--date='.length).trim();
            if (!value) {
                throw new Error('--date 옵션에는 날짜 값이 필요합니다.');
            }
            options.date = value;
            continue;
        }

        if (argument === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        if (argument === '--confirm-production') {
            options.confirmProduction = true;
            continue;
        }

        throw new Error(`알 수 없는 collector 옵션입니다: ${argument}`);
    }

    return options;
}

function toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return fallback;
}

function normalizeWindowSize(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return null;
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return {
        width: Number(match[1]),
        height: Number(match[2])
    };
}

async function launchBrowser(options = {}) {
    const logger = options.logger || createLogger();
    const headless = typeof options.headless === 'boolean' ? options.headless : true;
    const args = Array.isArray(options.args) && options.args.length > 0 ? options.args.slice() : DEFAULT_BROWSER_ARGS.slice();
    const windowSize = normalizeWindowSize(process.env.TRENDS_BROWSER_WINDOW_SIZE);
    if (windowSize) {
        args.push(`--window-size=${windowSize.width},${windowSize.height}`);
    }

    const preferredChannel = String(
        options.channel
        || process.env.TRENDS_BROWSER_CHANNEL
        || process.env.BROWSER_CHANNEL
        || 'chrome'
    ).trim() || 'chrome';
    const channelsToTry = preferredChannel === 'chrome'
        ? ['chrome', 'msedge', 'chromium']
        : [preferredChannel, 'chrome', 'chromium'];

    for (let index = 0; index < channelsToTry.length; index += 1) {
        const channel = channelsToTry[index];
        try {
            return await chromium.launch({
                headless,
                channel,
                args
            });
        } catch (error) {
            if (index === channelsToTry.length - 1) {
                throw new Error(`collector browser launch failed: ${error.message}`);
            }
            logger.warn(`⚠️ collector browser channel fallback: ${channel} 실패, 다음 채널 시도`);
        }
    }

    throw new Error('collector browser launch failed');
}

async function persistAuthSessionState(context, options = {}) {
    const authPath = String(options.authPath || '').trim();
    if (!context || !authPath) return false;
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    await context.storageState({ path: authPath });
    return true;
}

function resolveCollectorConfig(env = process.env, cliOptions = {}) {
    const rootDir = DEFAULT_REPO_ROOT;
    const apiHost = String(env.TRENDS_API_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const apiPort = Math.max(1, parseInt(String(env.TRENDS_API_PORT || '4581').trim(), 10) || 4581);
    const apiBaseUrl = String(env.TRENDS_API_BASE_URL || `http://${apiHost}:${apiPort}`).trim();
    const authPathValue = String(env.TRENDS_AUTH_FILE_PATH || './config/naver_auth.json').trim() || './config/naver_auth.json';
    return {
        environment: String(env.TRENDS_ENV || '').trim().toLowerCase(),
        rootDir,
        naverId: String(env.TRENDS_NAVER_ID || env.NAVER_ID || '').trim(),
        authPath: path.isAbsolute(authPathValue) ? authPathValue : path.resolve(rootDir, authPathValue),
        date: String(cliOptions.date || env.TRENDS_TARGET_DATE || env.TREND_DATE || '').trim(),
        headless: toBool(env.TRENDS_HEADLESS, true),
        apiHost,
        apiPort,
        apiBaseUrl,
        apiToken: String(env.TRENDS_API_TOKEN || '').trim(),
        source: String(env.TRENDS_SOURCE || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE,
        dryRun: cliOptions.dryRun === true || toBool(env.TRENDS_DRY_RUN, false)
    };
}

function resolveCollectorExecutionMode(environment, cliOptions = {}, options = {}) {
    const selectedEnvironment = String(environment || '').trim().toLowerCase();
    if (cliOptions.dryRun && cliOptions.confirmProduction) {
        throw new Error('--dry-run 과 --confirm-production 은 함께 사용할 수 없습니다.');
    }
    if (selectedEnvironment !== 'production') {
        if (cliOptions.confirmProduction) {
            throw new Error('--confirm-production 은 Production 환경에서만 사용할 수 있습니다.');
        }
        return cliOptions.dryRun ? 'dry-run' : 'direct';
    }
    if (cliOptions.dryRun) return 'dry-run';
    if (cliOptions.confirmProduction) return 'confirmed';
    if (options.isTTY !== true) {
        throw new Error(
            'Production interactive 수집에는 TTY가 필요합니다. 자동화는 --dry-run 또는 --confirm-production 을 명시하세요.'
        );
    }
    return 'interactive';
}

async function promptForProductionConfirmation(payload, options = {}) {
    const input = options.input || process.stdin;
    const output = options.output || process.stdout;
    const rl = readline.createInterface({ input, output });
    try {
        const answer = await rl.question(
            `\n⚠️ Production에 trendDate=${payload.trendDate || '-'}, items=${payload.itemCount}를 반영하려면 PRODUCTION을 입력하세요: `
        );
        return String(answer || '').trim() === 'PRODUCTION';
    } finally {
        rl.close();
    }
}

function authorizeProductionWrite(config, env = process.env) {
    if (config.environment !== 'production') return null;
    return resolveCollectorRuntimeGuard({
        environment: 'production',
        env: {
            ...env,
            TRENDS_ENV: 'production',
            TRENDS_API_TARGET_ENV: 'production',
            TRENDS_API_BASE_URL: config.apiBaseUrl,
            TRENDS_API_TOKEN: config.apiToken,
            TRENDS_DRY_RUN: 'false',
            TRENDS_ALLOW_PRODUCTION_WRITE: 'true'
        }
    });
}

async function verifyCollectorApiEnvironment(config, logger = console) {
    if (config.dryRun) return { skipped: true, environment: config.environment };
    const response = await axios.get(`${config.apiBaseUrl.replace(/\/+$/, '')}/health`, {
        timeout: 10000
    });
    const actualEnvironment = String(response?.data?.environment || '').trim().toLowerCase();
    if (!actualEnvironment || actualEnvironment !== config.environment) {
        throw new Error(
            `Trends API environment mismatch: expected=${config.environment || 'unselected'}, actual=${actualEnvironment || 'unknown'}`
        );
    }
    logger.info(`✅ Trends API target 확인: environment=${actualEnvironment}`);
    return response.data;
}

async function pushPayloadToApi(payload, config, logger) {
    if (config.dryRun) {
        logger.info('ℹ️ TRENDS_DRY_RUN=1 이므로 API 전송을 생략합니다.');
        if (config.printDryRunPayload !== false) {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        }
        return {
            success: true,
            dryRun: true,
            accepted: payload.itemCount
        };
    }

    if (!config.apiBaseUrl) {
        throw new Error('TRENDS_API_BASE_URL 이 비어 있습니다.');
    }

    const headers = {
        'Content-Type': 'application/json',
        'X-Trends-Environment': config.environment
    };
    if (config.apiToken) {
        headers.Authorization = `Bearer ${config.apiToken}`;
    }

    try {
        const response = await axios.post(
            `${config.apiBaseUrl.replace(/\/+$/, '')}/internal/ingest/naver-trends`,
            payload,
            {
                headers,
                timeout: 120000
            }
        );

        return response.data;
    } catch (error) {
        const apiStatus = error?.response?.status;
        const apiMessage = error?.response?.data?.message
            || error?.response?.data?.error
            || error?.message;
        throw new Error(apiStatus ? `API ${apiStatus}: ${apiMessage}` : apiMessage);
    }
}

function formatApiResultSummary(apiResult = {}) {
    const parts = [];
    if (Number.isFinite(apiResult.accepted)) parts.push(`accepted=${apiResult.accepted}`);
    if (Number.isFinite(apiResult.uniqueRows)) parts.push(`uniqueRows=${apiResult.uniqueRows}`);
    if (Number.isFinite(apiResult.inserted)) parts.push(`inserted=${apiResult.inserted}`);
    if (Number.isFinite(apiResult.updated)) parts.push(`updated=${apiResult.updated}`);
    if (Number.isFinite(apiResult.duplicatesCollapsed)) parts.push(`duplicatesCollapsed=${apiResult.duplicatesCollapsed}`);
    if (apiResult.trendDate) parts.push(`trendDate=${apiResult.trendDate}`);
    if (parts.length > 0) return parts.join(', ');
    return JSON.stringify(apiResult);
}

function prepareCollectorRuntime(env = process.env, logger = console, cliOptions = {}) {
    const profile = loadTrendsEnvironment({
        baseDir: path.resolve(__dirname, '../config'),
        env
    });
    logger.info(formatTrendsEnvironmentDiagnostic(profile));
    const guardEnv = profile.environment === 'production'
        ? { ...env, TRENDS_DRY_RUN: 'true' }
        : { ...env, ...(cliOptions.dryRun ? { TRENDS_DRY_RUN: 'true' } : {}) };
    const targets = resolveCollectorRuntimeGuard({ environment: profile.environment, env: guardEnv });
    logger.info(formatRuntimeTargetDiagnostic(targets));
    return Object.freeze({ environment: profile, targets });
}

async function runCollector(inputConfig = {}) {
    const logger = inputConfig.logger || createLogger();
    const cliOptions = inputConfig.cliOptions || {};
    const config = {
        ...resolveCollectorConfig(process.env, cliOptions),
        ...inputConfig
    };
    const executionMode = resolveCollectorExecutionMode(config.environment, cliOptions, {
        isTTY: inputConfig.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY)
    });

    if (!config.naverId) {
        throw new Error('TRENDS_NAVER_ID 또는 NAVER_ID 가 필요합니다.');
    }
    if (executionMode === 'direct') {
        await verifyCollectorApiEnvironment(config, logger);
    }

    const collector = inputConfig.collector || createNaverTrendsCollector({
        launchBrowser: (options = {}) => launchBrowser({ ...options, logger }),
        persistAuthSessionState,
        logger,
        config: {
            NAVER_ID: config.naverId,
            AUTH_FILE_PATH: config.authPath,
            ROOT_DIR: config.rootDir,
            HEADLESS: config.headless
        }
    });

    const result = await collector.fetchTrends({
        date: config.date || undefined,
        headless: config.headless,
        naverId: config.naverId,
        authPath: config.authPath,
        rootDir: config.rootDir
    });
    const payload = buildCollectedTrendPayload(result, {
        source: config.source
    });

    logger.info(`📦 수집 payload 준비 완료: trendDate=${payload.trendDate || '-'}, items=${payload.itemCount}`);
    if (executionMode === 'dry-run') {
        const apiResult = await pushPayloadToApi(payload, {
            ...config,
            dryRun: true,
            printDryRunPayload: config.printDryRunPayload ?? config.environment !== 'production'
        }, logger);
        logger.info(`✅ collector dry-run 완료: ${formatApiResultSummary(apiResult)}`);
        return { payload, apiResult, executionMode };
    }

    if (executionMode === 'interactive') {
        const confirm = inputConfig.confirmProduction || promptForProductionConfirmation;
        const approved = await confirm(payload);
        if (!approved) {
            const apiResult = { success: true, cancelled: true, accepted: 0 };
            logger.info('ℹ️ 사용자가 Production 반영을 취소했습니다. API 전송 없이 종료합니다.');
            return { payload, apiResult, executionMode };
        }
    }

    if (config.environment === 'production') {
        authorizeProductionWrite(config, inputConfig.env || process.env);
        await verifyCollectorApiEnvironment({ ...config, dryRun: false }, logger);
    }
    const apiResult = await pushPayloadToApi(payload, { ...config, dryRun: false }, logger);
    logger.info(`✅ collector 완료: ${formatApiResultSummary(apiResult)}`);
    return {
        payload,
        apiResult,
        executionMode
    };
}

if (require.main === module) {
    let cliOptions;
    try {
        cliOptions = parseCollectorCliArgs(process.argv.slice(2));
        if (cliOptions.help) {
            process.stdout.write(`${formatCollectorHelp()}\n`);
            process.exit(0);
        }
        prepareCollectorRuntime(process.env, console, cliOptions);
    } catch (error) {
        console.error(`❌ trends collector failed: ${error.message}`);
        console.error('ℹ️ 사용법은 "node bin/trends-collector --help" 로 확인할 수 있습니다.');
        process.exit(1);
    }

    runCollector({ cliOptions }).catch((error) => {
        console.error(`❌ trends collector failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    createLogger,
    authorizeProductionWrite,
    formatApiResultSummary,
    formatCollectorHelp,
    parseCollectorCliArgs,
    prepareCollectorRuntime,
    promptForProductionConfirmation,
    pushPayloadToApi,
    resolveCollectorConfig,
    resolveCollectorExecutionMode,
    runCollector,
    verifyCollectorApiEnvironment
};
