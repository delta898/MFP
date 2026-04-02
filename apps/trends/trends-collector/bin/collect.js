#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');
const { loadEnvFiles } = require('../../shared/lib/load-env');
const {
    buildCollectedTrendPayload,
    createNaverTrendsCollector
} = require('../../../../shared/naver-trends-core');

const DEFAULT_BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const DEFAULT_SOURCE = 'naver_creator_advisor';
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../../../..');

loadEnvFiles({ baseDir: path.resolve(__dirname, '../..'), fileNames: ['.env'] });

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
        '',
        'Environment:',
        '  apps/trends/.env is loaded automatically.',
        '  If --date is omitted, TRENDS_TARGET_DATE is used when present.',
        '  If neither is set, the collector uses the provider default date.',
    ].join('\n');
}

function parseCollectorCliArgs(argv = process.argv.slice(2)) {
    const options = {
        help: false,
        date: ''
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
        dryRun: toBool(env.TRENDS_DRY_RUN, false)
    };
}

async function pushPayloadToApi(payload, config, logger) {
    if (config.dryRun) {
        logger.info('ℹ️ TRENDS_DRY_RUN=1 이므로 API 전송을 생략합니다.');
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
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
        'Content-Type': 'application/json'
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

async function runCollector(inputConfig = {}) {
    const logger = inputConfig.logger || createLogger();
    const cliOptions = inputConfig.cliOptions || {};
    const config = {
        ...resolveCollectorConfig(process.env, cliOptions),
        ...inputConfig
    };

    if (!config.naverId) {
        throw new Error('TRENDS_NAVER_ID 또는 NAVER_ID 가 필요합니다.');
    }

    const collector = createNaverTrendsCollector({
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
    const apiResult = await pushPayloadToApi(payload, config, logger);
    logger.info(`✅ collector 완료: ${formatApiResultSummary(apiResult)}`);
    return {
        payload,
        apiResult
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
    formatApiResultSummary,
    formatCollectorHelp,
    parseCollectorCliArgs,
    resolveCollectorConfig,
    runCollector
};
