#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const axios = require('axios');
const { randomUUID } = require('crypto');
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
const DEFAULT_SWIPE_DELAY_MS = 400;
const DEFAULT_EXPECTED_CATEGORIES = 32;
const DEFAULT_KEYWORDS_PER_CATEGORY = 20;
const DEFAULT_MAX_RETRIES = 3;

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
        '      --headed         Show the browser window (default: headless)',
        '      --headless       Hide the browser window',
        '      --swipe-delay-ms <ms>',
        `                       Wait after each swipe (default: ${DEFAULT_SWIPE_DELAY_MS})`,
        '      --max-retries <count>',
        `                       Retry incomplete scans (default: ${DEFAULT_MAX_RETRIES})`,
        '      --expected-categories <count>',
        `                       Expected non-demographic categories (default: ${DEFAULT_EXPECTED_CATEGORIES})`,
        '      --keywords-per-category <count>',
        `                       Expected unique keywords per category (default: ${DEFAULT_KEYWORDS_PER_CATEGORY})`,
        '',
        'Environment:',
        '  TRENDS_ENV=local|development|production is required.',
        '  apps/trends/trends-collector/config/.env.trends-collector.<environment> is loaded when present.',
        '  If --date is omitted, TRENDS_TARGET_DATE is used when present.',
        '  If neither is set, the collector uses the provider default date.',
        '  Production defaults to interactive confirmation and requires a TTY.',
        '  TRENDS_SWIPE_DELAY_MS, TRENDS_MAX_RETRIES, TRENDS_EXPECTED_CATEGORIES,',
        '  and TRENDS_KEYWORDS_PER_CATEGORY can set the same defaults for cron.',
    ].join('\n');
}

function parseCollectorCliArgs(argv = process.argv.slice(2)) {
    const options = {
        help: false,
        date: '',
        dryRun: false,
        confirmProduction: false,
        headless: null,
        swipeDelayMs: null,
        maxRetries: null,
        expectedCategories: null,
        keywordsPerCategory: null
    };

    const integerOption = (value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
        const normalized = String(value || '').trim();
        if (!/^\d+$/.test(normalized)) {
            throw new Error(`${name} 옵션에는 정수 값이 필요합니다.`);
        }
        const parsed = Number(normalized);
        if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
            throw new Error(`${name} 옵션의 값은 ${min}~${max} 범위의 정수여야 합니다.`);
        }
        return parsed;
    };

    const valueOptions = new Map([
        ['--swipe-delay-ms', { key: 'swipeDelayMs', min: 0, max: 60000 }],
        ['--max-retries', { key: 'maxRetries', min: 0, max: 20 }],
        ['--expected-categories', { key: 'expectedCategories', min: 1, max: 500 }],
        ['--keywords-per-category', { key: 'keywordsPerCategory', min: 1, max: 500 }]
    ]);

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

        if (argument === '--headed' || argument === '--headless') {
            const headless = argument === '--headless';
            if (options.headless !== null && options.headless !== headless) {
                throw new Error('--headed 와 --headless 는 함께 사용할 수 없습니다.');
            }
            options.headless = headless;
            continue;
        }

        const separatorIndex = argument.indexOf('=');
        const optionName = separatorIndex >= 0 ? argument.slice(0, separatorIndex) : argument;
        const optionSpec = valueOptions.get(optionName);
        if (optionSpec) {
            const rawValue = separatorIndex >= 0
                ? argument.slice(separatorIndex + 1)
                : String(argv[index + 1] || '').trim();
            if (!rawValue) throw new Error(`${optionName} 옵션에는 값이 필요합니다.`);
            options[optionSpec.key] = integerOption(rawValue, optionName, optionSpec);
            if (separatorIndex < 0) index += 1;
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
        headless: typeof cliOptions.headless === 'boolean'
            ? cliOptions.headless
            : toBool(env.TRENDS_HEADLESS, true),
        swipeDelayMs: resolveIntegerSetting(cliOptions.swipeDelayMs, env.TRENDS_SWIPE_DELAY_MS, DEFAULT_SWIPE_DELAY_MS, 'TRENDS_SWIPE_DELAY_MS', 0, 60000),
        maxRetries: resolveIntegerSetting(cliOptions.maxRetries, env.TRENDS_MAX_RETRIES, DEFAULT_MAX_RETRIES, 'TRENDS_MAX_RETRIES', 0, 20),
        expectedCategories: resolveIntegerSetting(cliOptions.expectedCategories, env.TRENDS_EXPECTED_CATEGORIES, DEFAULT_EXPECTED_CATEGORIES, 'TRENDS_EXPECTED_CATEGORIES', 1, 500),
        keywordsPerCategory: resolveIntegerSetting(cliOptions.keywordsPerCategory, env.TRENDS_KEYWORDS_PER_CATEGORY, DEFAULT_KEYWORDS_PER_CATEGORY, 'TRENDS_KEYWORDS_PER_CATEGORY', 1, 500),
        apiHost,
        apiPort,
        apiBaseUrl,
        apiToken: String(env.TRENDS_API_TOKEN || '').trim(),
        source: String(env.TRENDS_SOURCE || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE,
        dryRun: cliOptions.dryRun === true || toBool(env.TRENDS_DRY_RUN, false)
    };
}

function resolveIntegerSetting(cliValue, envValue, fallback, name, min, max) {
    if (cliValue !== null && cliValue !== undefined) return cliValue;
    if (envValue === undefined || String(envValue).trim() === '') return fallback;
    const normalized = String(envValue).trim();
    const parsed = Number(normalized);
    if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} 값은 ${min}~${max} 범위의 정수여야 합니다.`);
    }
    return parsed;
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

async function signalCollectionComplete(payload, completeness, config, logger = console) {
    if (config.dryRun) return { skipped: true, reason: 'dry_run' };
    if (config.environment !== 'development') {
        return { skipped: true, reason: 'newsletter_not_enabled_for_environment' };
    }
    if (!completeness?.complete) throw new Error('불완전한 수집 결과는 뉴스레터 완료 신호를 보낼 수 없습니다.');
    if (!config.apiBaseUrl || !config.apiToken || !config.environment) {
        throw new Error('수집 완료 신호에는 환경별 Trends API 주소, 내부 토큰, 환경 값이 필요합니다.');
    }

    const signal = {
        environment: config.environment,
        trendDate: payload.trendDate,
        signalId: randomUUID(),
        source: config.source,
        expectedCategories: completeness.expectedCategories,
        itemsPerCategory: completeness.keywordsPerCategory,
        itemCount: completeness.actualTotal
    };
    try {
        const response = await axios.post(
            `${config.apiBaseUrl.replace(/\/+$/, '')}/internal/newsletter/collection-complete`,
            signal,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Trends-Environment': config.environment,
                    Authorization: `Bearer ${config.apiToken}`
                },
                timeout: 15000
            }
        );
        logger.info(`✅ newsletter 수집 완료 신호 전달: trendDate=${payload.trendDate || '-'}, workflow=${response?.data?.workflowId || 'accepted'}, duplicate=${Boolean(response?.data?.duplicate)}`);
        return response.data;
    } catch (error) {
        const apiStatus = error?.response?.status;
        const apiMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message;
        throw new Error(apiStatus ? `Newsletter signal API ${apiStatus}: ${apiMessage}` : `Newsletter signal failed: ${apiMessage}`);
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

function analyzeCollectionCompleteness(keywords = [], options = {}) {
    const expectedCategories = Number(options.expectedCategories || DEFAULT_EXPECTED_CATEGORIES);
    const keywordsPerCategory = Number(options.keywordsPerCategory || DEFAULT_KEYWORDS_PER_CATEGORY);
    const categories = new Map();
    for (const item of Array.isArray(keywords) ? keywords : []) {
        const category = String(item?.category || '').trim();
        const keyword = String(item?.keyword || '').trim();
        if (!category || !keyword) continue;
        if (!categories.has(category)) categories.set(category, new Set());
        categories.get(category).add(keyword);
    }

    const categoryCounts = [...categories.entries()].map(([category, values]) => ({
        category,
        count: values.size
    }));
    const totalKeywords = categoryCounts.reduce((sum, entry) => sum + entry.count, 0);
    const expectedTotal = expectedCategories * keywordsPerCategory;
    const incompleteCategories = categoryCounts.filter((entry) => entry.count !== keywordsPerCategory);
    const missingCategories = Math.max(0, expectedCategories - categoryCounts.length);
    return {
        complete: categoryCounts.length === expectedCategories
            && totalKeywords === expectedTotal
            && incompleteCategories.length === 0,
        expectedCategories,
        actualCategories: categoryCounts.length,
        missingCategories,
        keywordsPerCategory,
        expectedTotal,
        actualTotal: totalKeywords,
        incompleteCategories
    };
}

function formatCompletenessSummary(completeness) {
    const parts = [
        `categories=${completeness.actualCategories}/${completeness.expectedCategories}`,
        `keywords=${completeness.actualTotal}/${completeness.expectedTotal}`
    ];
    if (completeness.incompleteCategories.length > 0) {
        parts.push(`shortCategories=${completeness.incompleteCategories.map((item) => `${item.category}:${item.count}/${completeness.keywordsPerCategory}`).join('|')}`);
    }
    return parts.join(', ');
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

    logger.info(`⚙️ 수집 옵션: headless=${config.headless}, swipeDelayMs=${config.swipeDelayMs}, maxRetries=${config.maxRetries}, expected=${config.expectedCategories}x${config.keywordsPerCategory}`);

    const collector = inputConfig.collector || createNaverTrendsCollector({
        launchBrowser: (options = {}) => launchBrowser({ ...options, logger }),
        persistAuthSessionState,
        logger,
        config: {
            NAVER_ID: config.naverId,
            AUTH_FILE_PATH: config.authPath,
            ROOT_DIR: config.rootDir,
            HEADLESS: config.headless,
            SWIPE_DELAY_MS: config.swipeDelayMs
        }
    });

    const fetchOptions = {
        date: config.date || undefined,
        headless: config.headless,
        swipeDelayMs: config.swipeDelayMs,
        naverId: config.naverId,
        authPath: config.authPath,
        rootDir: config.rootDir
    };
    let result = await collector.fetchTrends(fetchOptions);
    let completeness = analyzeCollectionCompleteness(result?.keywords, config);
    logger.info(`🔎 수집 완전성 확인 (시도=1/${config.maxRetries + 1}, ${formatCompletenessSummary(completeness)})`);

    for (let retry = 1; !completeness.complete && retry <= config.maxRetries; retry += 1) {
        logger.warn(`⚠️ 수집 결과가 예상보다 적어 전체 카테고리를 다시 확인합니다. (${retry}/${config.maxRetries}, ${formatCompletenessSummary(completeness)})`);
        // Each retry is a clean, full scan. Never combine rows from separate
        // swipes because their category order and ranking may differ.
        result = await collector.fetchTrends(fetchOptions);
        completeness = analyzeCollectionCompleteness(result.keywords, config);
        logger.info(`🔎 재수집 결과 확인 (시도=${retry + 1}/${config.maxRetries + 1}, ${formatCompletenessSummary(completeness)})`);
    }

    if (!completeness.complete && executionMode !== 'dry-run') {
        throw new Error(`트렌드 수집 결과가 불완전하여 API 반영을 중단합니다. ${formatCompletenessSummary(completeness)}`);
    }
    if (!completeness.complete) {
        logger.warn(`⚠️ dry-run 결과가 불완전합니다. API 전송은 하지 않습니다. ${formatCompletenessSummary(completeness)}`);
    }

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
        return { payload, apiResult, executionMode, completeness };
    }

    if (executionMode === 'interactive') {
        const confirm = inputConfig.confirmProduction || promptForProductionConfirmation;
        const approved = await confirm(payload);
        if (!approved) {
            const apiResult = { success: true, cancelled: true, accepted: 0 };
            logger.info('ℹ️ 사용자가 Production 반영을 취소했습니다. API 전송 없이 종료합니다.');
            return { payload, apiResult, executionMode, completeness };
        }
    }

    if (config.environment === 'production') {
        authorizeProductionWrite(config, inputConfig.env || process.env);
        await verifyCollectorApiEnvironment({ ...config, dryRun: false }, logger);
    }
    const apiResult = await pushPayloadToApi(payload, { ...config, dryRun: false }, logger);
    let newsletterSignal;
    try {
        newsletterSignal = await signalCollectionComplete(payload, completeness, config, logger);
    } catch (error) {
        newsletterSignal = { sent: false, error: error.message };
        logger.warn(`⚠️ newsletter 신호 실패: trendDate=${payload.trendDate || '-'}, error=${error.message}. 트렌드 수집은 정상 저장되었으며 다음 날짜 수집을 계속합니다.`);
    }
    logger.info(`✅ collector 완료: ${formatApiResultSummary(apiResult)}`);
    return {
        payload,
        apiResult,
        newsletterSignal,
        executionMode,
        completeness
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
    analyzeCollectionCompleteness,
    formatApiResultSummary,
    formatCompletenessSummary,
    formatCollectorHelp,
    parseCollectorCliArgs,
    prepareCollectorRuntime,
    promptForProductionConfirmation,
    pushPayloadToApi,
    signalCollectionComplete,
    resolveCollectorConfig,
    resolveCollectorExecutionMode,
    runCollector,
    verifyCollectorApiEnvironment
};
