const fs = require('fs');
const path = require('path');
const http = require('http');
const { version: APP_VERSION } = require('../package.json');
const License = require('./license');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { checkAuthSessionValid } = require('./auth-session');
const Utils = require('./utils');
const Core = require('./core');
const BrowserLauncher = require('./browser-launcher');
const TrendManager = require('./trend-manager');
const ShoppingManager = require('./shopping-manager');

const DEFAULT_PORT = 4577;
const blogRuntimeLogs = new Map();
const shoppingRuntimeLogs = new Map();
const ALLOWED_TYPING_SPEEDS = ['QUICK', 'FAST', 'NORMAL', 'HUMAN'];
const naverLoginState = {
    status: 'idle', // idle | running | success | failed
    message: '',
    startedAt: null,
    finishedAt: null,
    detectedBy: '',
    error: ''
};

function setBlogRuntimeLog(rowIndex, message) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    blogRuntimeLogs.set(rowIndex, {
        message: String(message || '').trim()
    });
}

function clearBlogRuntimeLog(rowIndex) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    blogRuntimeLogs.delete(rowIndex);
}

function clearAllBlogRuntimeLogs() {
    blogRuntimeLogs.clear();
}

function getBlogRuntimeLogMap() {
    const map = new Map();
    for (const [rowIndex, log] of blogRuntimeLogs.entries()) {
        map.set(rowIndex, String(log?.message || ''));
    }
    return map;
}

function setShoppingRuntimeLog(rowIndex, message) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    shoppingRuntimeLogs.set(rowIndex, {
        message: String(message || '').trim()
    });
}

function clearAllShoppingRuntimeLogs() {
    shoppingRuntimeLogs.clear();
}

function getShoppingRuntimeLogMap() {
    const map = new Map();
    for (const [rowIndex, log] of shoppingRuntimeLogs.entries()) {
        map.set(rowIndex, String(log?.message || ''));
    }
    return map;
}

function setNaverLoginState(patch = {}) {
    Object.assign(naverLoginState, patch);
}

function getNaverLoginStatus() {
    const startedAtMs = naverLoginState.startedAt ? new Date(naverLoginState.startedAt).getTime() : null;
    const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
    return {
        status: naverLoginState.status,
        message: naverLoginState.message,
        startedAt: naverLoginState.startedAt,
        finishedAt: naverLoginState.finishedAt,
        detectedBy: naverLoginState.detectedBy,
        error: naverLoginState.error,
        isRunning: naverLoginState.status === 'running',
        elapsedSeconds
    };
}

function resolveUiRoot() {
    const candidates = [
        path.join(process.cwd(), 'ui'),
        path.join(__dirname, '..', 'ui')
    ];

    for (const dir of candidates) {
        try {
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                return dir;
            }
        } catch (e) { }
    }
    return null;
}

function jsonMeta(requestId) {
    return {
        requestId,
        timestamp: new Date().toISOString()
    };
}

function sendJson(res, requestId, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
        ...payload,
        meta: jsonMeta(requestId)
    }));
}

function sendSuccess(res, requestId, data, statusCode = 200) {
    sendJson(res, requestId, statusCode, { success: true, data, error: null });
}

function sendError(res, requestId, statusCode, code, message) {
    sendJson(res, requestId, statusCode, {
        success: false,
        data: null,
        error: { code, message: String(message || '요청 처리 중 오류가 발생했습니다.') }
    });
}

function toFeatureMap(rawFeatures) {
    return (rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures))
        ? rawFeatures
        : {};
}

function getFeatureInt(features, key, fallback = null) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const num = parseInt(map[key], 10);
    if (Number.isNaN(num) || num < 0) return fallback;
    return num;
}

function getFeatureBool(features, key, fallback = true) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const value = map[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'off'].includes(v)) return false;
    }
    return fallback;
}

function isCommandEnabled(features, command) {
    const keyMap = {
        pub: 'cmd_pub',
        batch: 'cmd_batch',
        trends: 'cmd_trends',
        shopping: 'cmd_shopping'
    };
    const key = keyMap[command];
    if (!key) return true;
    return getFeatureBool(features, key, true);
}

function parseMaxPosts(value, fallback = 3) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return fallback;
    return parsed;
}

function resolveMaxBlogPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_BLOG_POSTS_PER_RUN, 3);
}

function resolveMaxShoppingPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_SHOPPING_POSTS_PER_RUN, 3);
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
}

function sanitizePathname(pathname) {
    const safe = String(pathname || '/').split('?')[0].split('#')[0];
    const normalized = path.normalize(safe).replace(/^(\.\.[/\\])+/, '');
    return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

function createRequestId() {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBool(input, fallback = false) {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input !== 0;
    if (typeof input === 'string') {
        const v = input.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
    }
    return fallback;
}

function normalizeKeywords(input) {
    if (Array.isArray(input)) {
        return input.map(v => String(v || '').trim()).filter(Boolean);
    }
    return String(input || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function normalizePublishMode(input) {
    const mode = String(input || '').trim().toLowerCase();
    if (mode === 'append_and_publish') return 'append_and_publish';
    return 'append_only';
}

function parseIntSafe(input, fallback = null, min = null) {
    const parsed = parseInt(input, 10);
    if (Number.isNaN(parsed)) return fallback;
    if (min !== null && parsed < min) return fallback;
    return parsed;
}

function parseBoolQuery(input) {
    const value = String(input || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(value);
}

function normalizeSortDir(input, fallback = 'desc') {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'desc') return 'desc';
    if (value === 'asc') return 'asc';
    return fallback;
}

function compareSortValues(a, b) {
    const aNull = a === null || a === undefined || a === '';
    const bNull = b === null || b === undefined || b === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;

    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
}

function getTopicSortValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return Number(item.rowNumber || 0);
    if (key === 'subject') return String(item.subject || '');
    if (key === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
    if (key === 'instruction') return String(item.content_guide?.additional_instructions || '');
    if (key === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
    if (key === 'imageGeneration') return item.image_options?.generate === true ? 1 : 0;
    if (key === 'externalReference') return item.use_external_ref === true ? 1 : 0;
    if (key === 'runtimeLog') return String(item.runtimeLog || '');
    if (key === 'status') return String(item.status || '');
    return Number(item.rowNumber || 0);
}

function sortTopicItems(items, sortBy = 'rowNumber', sortDir = 'desc') {
    const key = String(sortBy || 'rowNumber').trim();
    const direction = String(sortDir || 'desc').trim().toLowerCase() === 'desc' ? -1 : 1;
    const source = Array.isArray(items) ? items : [];
    return source
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const cmp = compareSortValues(getTopicSortValue(a.item, key), getTopicSortValue(b.item, key));
            if (cmp !== 0) return cmp * direction;
            return a.index - b.index;
        })
        .map(v => v.item);
}

function getShoppingSortValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return Number(item.rowNumber || 0);
    if (key === 'product') return String(item.product || '');
    if (key === 'shortUrl') return String(item.shortUrl || '');
    if (key === 'runtimeLog') return String(item.runtimeLog || '');
    if (key === 'status') return String(item.status || '');
    if (key === 'publishedAt') return String(item.publishedAt || '');
    return Number(item.rowNumber || 0);
}

function sortShoppingItems(items, sortBy = 'rowNumber', sortDir = 'desc') {
    const key = String(sortBy || 'rowNumber').trim();
    const direction = String(sortDir || 'desc').trim().toLowerCase() === 'desc' ? -1 : 1;
    const source = Array.isArray(items) ? items : [];
    return source
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const cmp = compareSortValues(getShoppingSortValue(a.item, key), getShoppingSortValue(b.item, key));
            if (cmp !== 0) return cmp * direction;
            return a.index - b.index;
        })
        .map(v => v.item);
}

function resolveConfigPaths() {
    const rootConfig = path.join(process.cwd(), 'config', 'config.txt');
    const rootSample = path.join(process.cwd(), 'config', 'config.txt.sample');
    const execDir = path.dirname(process.execPath || process.cwd());
    const execConfig = path.join(execDir, 'config', 'config.txt');
    const execSample = path.join(execDir, 'config', 'config.txt.sample');

    return {
        rootConfig,
        rootSample,
        execConfig,
        execSample
    };
}

function resolveReadableConfigSource() {
    const paths = resolveConfigPaths();
    if (fs.existsSync(paths.rootConfig)) return { path: paths.rootConfig, sourceType: 'config' };
    if (fs.existsSync(paths.execConfig)) return { path: paths.execConfig, sourceType: 'config' };
    if (fs.existsSync(paths.rootSample)) return { path: paths.rootSample, sourceType: 'sample' };
    if (fs.existsSync(paths.execSample)) return { path: paths.execSample, sourceType: 'sample' };
    throw new Error('설정 파일(config.txt/config.txt.sample)을 찾을 수 없습니다.');
}

function resolveWritableConfigPath() {
    const paths = resolveConfigPaths();
    if (fs.existsSync(paths.rootConfig)) return paths.rootConfig;
    if (fs.existsSync(paths.execConfig)) return paths.execConfig;
    if (fs.existsSync(paths.rootSample)) return paths.rootConfig;
    if (fs.existsSync(paths.execSample)) return paths.execConfig;
    return paths.rootConfig;
}

function readConfigRaw(configSource) {
    if (!configSource?.path || !fs.existsSync(configSource.path)) {
        throw new Error(`설정 파일을 찾을 수 없습니다: ${configSource?.path || '(unknown)'}`);
    }
    return fs.readFileSync(configSource.path, 'utf-8');
}

function tryResolveReadableConfigSource() {
    try {
        return resolveReadableConfigSource();
    } catch (e) {
        return null;
    }
}

function buildDefaultConfigTemplate() {
    return [
        '# BlogGenius config (auto-generated)',
        'NAVER_ID = ',
        'GEMINI_API_KEY = ',
        'GOOGLE_AUTH_JSON = ./config/service_account.json',
        'GOOGLE_SHEET_ID = ',
        'HEADLESS = false',
        'TYPING_SPEED = FAST',
        ''
    ].join('\n');
}

function parseConfigValue(raw, key) {
    const lines = String(raw || '').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [left, ...rest] = trimmed.split('=');
        if (String(left || '').trim() !== key) continue;
        const joined = rest.join('=');
        const value = joined.includes('#') ? joined.split('#')[0] : joined;
        return String(value || '').trim();
    }
    return '';
}

function parseConfigBool(rawValue, fallback = false) {
    const value = String(rawValue || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(value)) return true;
    if (['false', '0', 'no', 'off'].includes(value)) return false;
    return fallback;
}

function normalizeTypingSpeed(input, fallback = 'NORMAL') {
    const value = String(input || '').trim().toUpperCase();
    return ALLOWED_TYPING_SPEEDS.includes(value) ? value : fallback;
}

function applyConfigUpdates(raw, updates = {}) {
    const nextUpdates = { ...updates };
    const lines = String(raw || '').split(/\r?\n/);
    const pendingKeys = new Set(Object.keys(nextUpdates));
    const nextLines = lines.map((line) => {
        if (/^\s*#/.test(line) || !line.includes('=')) return line;
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
        if (!match) return line;
        const key = match[1];
        if (!pendingKeys.has(key)) return line;
        pendingKeys.delete(key);
        const indent = (line.match(/^\s*/) || [''])[0];
        return `${indent}${key} = ${nextUpdates[key]}`;
    });

    if (pendingKeys.size > 0) {
        if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
            nextLines.push('');
        }
        for (const key of pendingKeys) {
            nextLines.push(`${key} = ${nextUpdates[key]}`);
        }
    }

    return nextLines.join('\n');
}

function buildMajorSettings(raw, configSource) {
    const fallbackTyping = normalizeTypingSpeed(CONFIG.TYPING_SPEED, 'NORMAL');
    const naverId = parseConfigValue(raw, 'NAVER_ID') || String(CONFIG.NAVER_ID || '');
    const geminiApiKey = parseConfigValue(raw, 'GEMINI_API_KEY') || String(CONFIG.GEMINI_API_KEY || '');
    const googleSheetId = parseConfigValue(raw, 'GOOGLE_SHEET_ID') || String(CONFIG.GOOGLE_SHEET_ID || '');
    const headlessRaw = parseConfigValue(raw, 'HEADLESS');
    const typingRaw = parseConfigValue(raw, 'TYPING_SPEED');
    const headless = parseConfigBool(headlessRaw, Boolean(CONFIG.HEADLESS));
    const typingSpeed = normalizeTypingSpeed(typingRaw, fallbackTyping);

    return {
        configPath: configSource?.path || '',
        configSourceType: configSource?.sourceType || 'config',
        fields: {
            NAVER_ID: naverId,
            GEMINI_API_KEY: geminiApiKey,
            GOOGLE_SHEET_ID: googleSheetId,
            HEADLESS: headless,
            TYPING_SPEED: typingSpeed
        },
        typingSpeedOptions: ALLOWED_TYPING_SPEEDS
    };
}

function applyRuntimeConfigFromMajor(fields = {}) {
    const naverId = String(fields.NAVER_ID || '').trim();
    const geminiApiKey = String(fields.GEMINI_API_KEY || '').trim();
    const googleSheetId = String(fields.GOOGLE_SHEET_ID || '').trim();
    const headless = Boolean(fields.HEADLESS);
    const typingSpeed = normalizeTypingSpeed(fields.TYPING_SPEED, 'NORMAL');

    CONFIG.NAVER_ID = naverId;
    CONFIG.GEMINI_API_KEY = geminiApiKey;
    CONFIG.GOOGLE_SHEET_ID = googleSheetId;
    CONFIG.HEADLESS = headless;
    CONFIG.TYPING_SPEED = typingSpeed;
    CONFIG.TYPING = CONFIG.TYPING_PRESETS?.[typingSpeed] || CONFIG.TYPING;
    CONFIG.WRITE_URL = `https://blog.naver.com/${naverId}/postwrite`;
}

function parseMajorFieldsFromRequest(requestBody = {}) {
    const naverId = String(requestBody.NAVER_ID || '').trim();
    const geminiApiKey = String(requestBody.GEMINI_API_KEY || '').trim();
    const googleSheetId = String(requestBody.GOOGLE_SHEET_ID || '').trim();
    const headless = normalizeBool(requestBody.HEADLESS, false);
    const typingSpeed = normalizeTypingSpeed(requestBody.TYPING_SPEED, 'NORMAL');
    return {
        NAVER_ID: naverId,
        GEMINI_API_KEY: geminiApiKey,
        GOOGLE_SHEET_ID: googleSheetId,
        HEADLESS: headless,
        TYPING_SPEED: typingSpeed
    };
}

function isNaverLoginCompletedUrl(urlLike) {
    const urlStr = String(urlLike || '');
    return /naver\.com/i.test(urlStr) && !/nid\.naver\.com|nidlogin\.login/i.test(urlStr);
}

async function waitForNaverLoginCompleted(page, context, timeoutMs = 300000) {
    const start = Date.now();
    const pollIntervalMs = 500;

    const samePageWait = page.waitForURL(url => isNaverLoginCompletedUrl(url), { timeout: timeoutMs })
        .then(() => 'same-page-url')
        .catch(() => null);

    const pollWait = (async () => {
        while (Date.now() - start < timeoutMs) {
            for (const p of context.pages()) {
                try {
                    if (isNaverLoginCompletedUrl(p.url())) {
                        return 'any-page-url';
                    }
                } catch (e) { }
            }

            try {
                const cookies = await context.cookies([
                    'https://www.naver.com',
                    'https://naver.com',
                    'https://nid.naver.com'
                ]);
                const hasAuthCookie = cookies.some(c =>
                    c && (c.name === 'NID_AUT' || c.name === 'NID_SES')
                );
                if (hasAuthCookie) {
                    return 'auth-cookie';
                }
            } catch (e) { }

            await Utils.sleep(pollIntervalMs);
        }
        return null;
    })();

    const reason = await Promise.race([samePageWait, pollWait]);
    if (!reason) {
        throw new Error('네이버 로그인 완료를 확인하지 못했습니다. 다시 시도해 주세요.');
    }
    return reason;
}

async function closeBrowserResources(context, browser) {
    try { if (context) await context.close(); } catch (e) { }
    try { if (browser) await browser.close(); } catch (e) { }
}

async function runNaverLoginFlowForUi() {
    let browser = null;
    let context = null;
    try {
        Logger.info('🔐 [UI] 네이버 로그인 프로세스 시작');
        setNaverLoginState({
            status: 'running',
            message: '브라우저 실행 중...',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            detectedBy: '',
            error: ''
        });

        browser = await BrowserLauncher.launchBrowser({ headless: false });
        Logger.info('🔐 [UI] 로그인 브라우저 실행 완료');
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        setNaverLoginState({
            status: 'running',
            message: '로그인 페이지를 여는 중...'
        });
        await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

        setNaverLoginState({
            status: 'running',
            message: '브라우저에서 로그인 후 완료를 기다리는 중...'
        });
        const detectedBy = await waitForNaverLoginCompleted(page, context, 300000);
        Logger.info(`✅ [UI] 네이버 로그인 완료 감지 (${detectedBy})`);

        const authPath = CONFIG.AUTH_FILE_PATH;
        fs.mkdirSync(path.dirname(authPath), { recursive: true });
        await context.storageState({ path: authPath });
        Logger.info(`✅ [UI] 로그인 인증 저장 완료: ${authPath}`);

        setNaverLoginState({
            status: 'success',
            message: `로그인 완료 및 인증 저장됨 (${authPath})`,
            finishedAt: new Date().toISOString(),
            detectedBy,
            error: ''
        });
    } catch (e) {
        Logger.error(`❌ [UI] 네이버 로그인 실패: ${e.message}`);
        setNaverLoginState({
            status: 'failed',
            message: '로그인 실패',
            finishedAt: new Date().toISOString(),
            error: String(e?.message || 'unknown error')
        });
    } finally {
        await closeBrowserResources(context, browser);
    }
}

async function executeQuickPublish(requestBody) {
    const subject = String(requestBody?.subject || '').trim();
    const keywords = normalizeKeywords(requestBody?.keywords);
    const instruction = String(requestBody?.instruction || '').trim();
    const externalReference = normalizeBool(requestBody?.externalReference, true);
    const imageGenerationRequested = normalizeBool(requestBody?.imageGeneration, false);
    const referenceUrl = String(requestBody?.referenceUrl || '').trim();
    const publishMode = normalizePublishMode(requestBody?.publishMode);

    if (!subject) {
        return { success: false, code: 'INVALID_SUBJECT', message: 'Subject는 필수입니다.' };
    }

    if (referenceUrl && !/^https?:\/\//i.test(referenceUrl)) {
        return { success: false, code: 'INVALID_REFERENCE_URL', message: '참고 URL 형식이 올바르지 않습니다. (http/https)' };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }

    const features = toFeatureMap(precheck.features);
    if (publishMode === 'append_and_publish' && !isCommandEnabled(features, 'batch')) {
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 즉시 발행 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
    }

    const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);
    const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
    const imageGenerationFinal = imageGenerationRequested && imageGenerationEnabledByPlan;

    await Utils.ensureAllSheetsExist();

    const appendStatus = publishMode === 'append_and_publish' ? '블로그 발행 준비 완료' : '대기';
    const appendResult = await Utils.appendGoogleSheetTopics([{
        subject,
        keywords,
        content_guide: {
            additional_instructions: instruction,
            reference_urls: referenceUrl ? [referenceUrl] : []
        },
        use_external_ref: externalReference,
        image_options: {
            generate: imageGenerationFinal,
            count: 4
        },
        status: appendStatus
    }], {
        defaultStatus: appendStatus
    });

    if (!appendResult?.success) {
        return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 시트 추가에 실패했습니다.' };
    }

    const rowNumber = Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] : null;
    const rowIndex = Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] : null;

    if (publishMode === 'append_only') {
        return {
            success: true,
            data: {
                mode: publishMode,
                sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                rowNumber,
                rowIndex,
                status: appendStatus
            }
        };
    }

    const session = await checkAuthSessionValid();
    if (!session.ok) {
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const topicData = {
        rowIndex: Number.isInteger(rowIndex) ? rowIndex : 0,
        subject,
        keywords,
        content_guide: {
            additional_instructions: instruction,
            reference_urls: referenceUrl ? [referenceUrl] : []
        },
        use_external_ref: externalReference,
        image_options: {
            generate: imageGenerationFinal,
            count: 4
        },
        status: '블로그 발행 준비 완료'
    };

    try {
        const result = await Core.generateContent(topicData, null, {
            enableRelatedPostsAutoLink
        });
        await Core.prepareImages(result.targetDir, topicData, {
            imageGenerationEnabled: imageGenerationFinal
        });

        const verify = await License.verifyLicense();
        if (!verify.success) {
            if (Number.isInteger(rowIndex)) {
                await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '라이선스 부족으로 발행 보류');
            }
            return {
                success: false,
                code: 'LICENSE_VERIFY_FAILED',
                message: verify.message
            };
        }

        if (Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '발행 시작');
        }

        await Core.publishToBlog(result.targetDir);

        if (Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 완료', '발행 완료');
        }

        return {
            success: true,
            data: {
                mode: publishMode,
                sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                rowNumber,
                rowIndex,
                status: '블로그 발행 완료',
                targetDir: result.targetDir
            }
        };
    } catch (e) {
        if (Number.isInteger(rowIndex)) {
            await Utils.updateGoogleSheetStatus(rowIndex, '실패', e.message);
        }
        return {
            success: false,
            code: 'QUICK_PUBLISH_FAILED',
            message: e.message
        };
    }
}

async function executeShoppingQuickPublish(requestBody = {}) {
    const shortUrl = String(requestBody?.shortUrl || requestBody?.url || '').trim();
    const product = String(requestBody?.product || '').trim();
    const publishMode = normalizePublishMode(requestBody?.publishMode);

    if (!shortUrl) {
        return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL은 필수입니다.' };
    }
    if (!/^https?:\/\//i.test(shortUrl)) {
        return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL 형식이 올바르지 않습니다. (http/https)' };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }
    const features = toFeatureMap(precheck.features);
    if (publishMode === 'append_and_publish' && !isCommandEnabled(features, 'shopping')) {
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)' };
    }

    await Utils.ensureAllSheetsExist();
    const appendStatus = publishMode === 'append_and_publish' ? '발행 준비 완료' : '준비';
    const appendResult = await Utils.appendGoogleSheetShopping([{
        shortUrl,
        product,
        status: appendStatus
    }], {
        defaultStatus: appendStatus
    });

    if (!appendResult?.success) {
        return {
            success: false,
            code: 'SHOPPING_APPEND_FAILED',
            message: appendResult?.message || 'shopping 시트 추가에 실패했습니다.'
        };
    }

    const rowNumber = Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] : null;
    const rowIndex = Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] : null;

    if (publishMode === 'append_only') {
        return {
            success: true,
            data: {
                mode: publishMode,
                sheet: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping',
                rowNumber,
                rowIndex,
                status: appendStatus
            }
        };
    }

    if (!Number.isInteger(rowIndex)) {
        return {
            success: false,
            code: 'SHOPPING_APPEND_ROW_INDEX_MISSING',
            message: '추가된 행 인덱스를 확인하지 못했습니다.'
        };
    }

    const session = await checkAuthSessionValid();
    if (!session.ok) {
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const result = await executeShoppingRowAction(
        { rowIndex },
        { enableRelatedPostsAutoLink: getFeatureBool(features, 'enable_related_posts_auto_link', true) }
    );

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        data: {
            mode: publishMode,
            sheet: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping',
            rowNumber,
            rowIndex,
            ...(result.data || {})
        }
    };
}

async function executeBlogRowAction(requestBody, options = {}) {
    const action = String(requestBody?.action || '').trim().toLowerCase();
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const emitProgress = (message) => {
        if (!onProgress) return;
        try {
            onProgress(String(message || ''));
        } catch (e) { }
    };

    if (!['gen', 'batch'].includes(action)) {
        return { success: false, code: 'INVALID_ACTION', message: '지원하지 않는 action입니다. (gen|batch)' };
    }
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const topics = await Utils.readGoogleSheetTopicsAll({ limit: 100000, offset: 0 });
    const topicData = (topics.items || []).find(item => item.rowIndex === rowIndex);
    if (!topicData) {
        return { success: false, code: 'TOPIC_NOT_FOUND', message: `대상 rowIndex(${rowIndex})를 찾지 못했습니다.` };
    }

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }
    const features = toFeatureMap(precheck.features);
    const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
    const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);

    const topicPayload = {
        rowIndex: topicData.rowIndex,
        subject: topicData.subject,
        keywords: topicData.keywords || [],
        content_guide: {
            additional_instructions: topicData.content_guide?.additional_instructions || '',
            reference_urls: topicData.content_guide?.reference_urls || []
        },
        use_external_ref: topicData.use_external_ref === true,
        image_options: {
            generate: topicData.image_options?.generate === true,
            count: parseIntSafe(topicData.image_options?.count, 4, 1) || 4
        },
        status: topicData.status
    };

    const imageGenerationFinal = imageGenerationEnabledByPlan && topicPayload.image_options.generate;

    try {
        // action=batch(발행)은 생성/이미지 준비 전에 세션을 먼저 확인해
        // 불필요한 대기/비용이 발생하지 않도록 한다.
        if (action === 'batch') {
            const session = await checkAuthSessionValid();
            if (!session.ok) {
                await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '네이버 세션 만료');
                return {
                    success: false,
                    code: 'NAVER_SESSION_INVALID',
                    message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
                };
            }
        }

        emitProgress('콘텐츠 생성 중...');
        const result = await Core.generateContent(topicPayload, null, {
            enableRelatedPostsAutoLink
        });
        emitProgress('이미지 준비 중...');
        await Core.prepareImages(result.targetDir, topicPayload, {
            imageGenerationEnabled: imageGenerationFinal
        });

        if (action === 'gen') {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', `생성 완료: ${path.basename(result.targetDir)}`);
            return {
                success: true,
                data: {
                    action,
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    status: '블로그 발행 준비 완료',
                    targetDir: result.targetDir
                }
            };
        }

        // action=batch (단건 생성+발행)
        if (!isCommandEnabled(features, 'batch')) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '플랜 정책으로 발행 불가(cmd_batch=false)');
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
        }

        emitProgress('라이선스 확인 중...');
        const verify = await License.verifyLicense();
        if (!verify.success) {
            await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '라이선스 부족으로 발행 보류');
            return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
        }

        await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '발행 시작');
        emitProgress('블로그 발행 중...');
        await Core.publishToBlog(result.targetDir);
        emitProgress('시트 상태 반영 중...');
        await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 완료', '발행 완료');

        return {
            success: true,
            data: {
                action,
                rowIndex,
                rowNumber: rowIndex + 2,
                status: '블로그 발행 완료',
                targetDir: result.targetDir
            }
        };
    } catch (e) {
        await Utils.updateGoogleSheetStatus(rowIndex, '실패', e.message);
        return { success: false, code: 'BLOG_ACTION_FAILED', message: e.message };
    }
}

async function executeBlogBatchRowsAction(requestBody) {
    const rawRowIndices = Array.isArray(requestBody?.rowIndices) ? requestBody.rowIndices : [];
    const rowIndices = Array.from(new Set(
        rawRowIndices
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));

    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: 'rowIndices는 0 이상의 정수 배열이어야 합니다.' };
    }

    // 새 배치 요청 시작 시 이전 런타임 로그를 정리한다.
    clearAllBlogRuntimeLogs();

    rowIndices.forEach((rowIndex) => {
        setBlogRuntimeLog(rowIndex, '요청 접수');
    });

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, `중단: ${precheck.message || '라이선스 확인 실패'}`);
        });
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }

    const features = toFeatureMap(precheck.features);
    if (!isCommandEnabled(features, 'batch')) {
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, '중단: 현재 플랜에서 batch 사용 불가');
        });
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
    }

    // 배치 시작 전에 세션을 1차 확인해, 로그인 만료/미로그인 상태를 즉시 안내한다.
    const initialSession = await checkAuthSessionValid();
    if (!initialSession.ok) {
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, '중단: 네이버 로그인 세션이 유효하지 않습니다.');
        });
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const featureMax = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
    const effectiveMax = featureMax === 0 ? rowIndices.length : Math.max(1, featureMax);
    const targetRowIndices = rowIndices.slice(0, effectiveMax);
    const skippedByLimit = rowIndices.slice(effectiveMax);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    targetRowIndices.forEach((rowIndex, i) => {
        setBlogRuntimeLog(rowIndex, `대기열 등록 (${i + 1}/${targetRowIndices.length})`);
    });

    for (let i = 0; i < targetRowIndices.length; i += 1) {
        const rowIndex = targetRowIndices[i];
        setBlogRuntimeLog(rowIndex, `처리 시작 (${i + 1}/${targetRowIndices.length})`);
        const result = await executeBlogRowAction(
            { action: 'batch', rowIndex },
            {
                onProgress: (message) => setBlogRuntimeLog(rowIndex, message)
            }
        );
        if (result.success) {
            successCount += 1;
            results.push({
                rowIndex,
                success: true,
                data: result.data
            });
            setBlogRuntimeLog(rowIndex, '완료');
            continue;
        }

        failCount += 1;
        setBlogRuntimeLog(rowIndex, `실패: ${result.message || 'unknown error'}`);
        results.push({
            rowIndex,
            success: false,
            code: result.code || 'BLOG_ACTION_FAILED',
            message: result.message || '블로그 발행 처리에 실패했습니다.'
        });

        const shouldStop = ['LICENSE_VERIFY_FAILED', 'LICENSE_STATUS_FAILED', 'NAVER_SESSION_INVALID'].includes(result.code);
        if (shouldStop) {
            const remaining = targetRowIndices.slice(i + 1);
            for (const restRowIndex of remaining) {
                setBlogRuntimeLog(restRowIndex, '중단: 이전 치명 오류로 실행 중단');
                results.push({
                    rowIndex: restRowIndex,
                    success: false,
                    code: 'SKIPPED_AFTER_FATAL_ERROR',
                    message: '이전 치명 오류로 인해 실행이 중단되었습니다.'
                });
            }
            break;
        }
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            attemptedCount: targetRowIndices.length,
            successCount,
            failCount,
            maxPerRun: effectiveMax,
            skippedByLimit,
            results
        }
    };
}

async function executeShoppingRowAction(requestBody, options = {}) {
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const progress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const report = (message) => {
        if (progress) progress(String(message || '').trim());
    };

    try {
        const shoppingResult = await Utils.readGoogleSheetShoppingAll({ limit: 100000, offset: 0 });
        const allItems = Array.isArray(shoppingResult.items) ? shoppingResult.items : [];
        const target = allItems.find(item => item.rowIndex === rowIndex);
        if (!target) {
            return { success: false, code: 'SHOPPING_ROW_NOT_FOUND', message: `shopping row(${rowIndex + 2})를 찾지 못했습니다.` };
        }
        const shortUrl = String(target.shortUrl || '').trim();
        if (!shortUrl) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL이 비어 있습니다.' };
        }

        report('상태 업데이트: 발행 중');
        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 중', false);

        report('쇼핑 콘텐츠 생성 중');
        const runtimeOptions = {
            enableRelatedPostsAutoLink: options.enableRelatedPostsAutoLink !== false
        };
        const buildResult = await ShoppingManager.buildPostFromShortUrl(shortUrl, runtimeOptions);

        report('라이선스 확인 중');
        const verify = await License.verifyLicense();
        if (!verify.success) {
            await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 준비 완료');
            return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
        }

        report('네이버 발행 단계 진행 중');
        await Core.publishToBlog(buildResult.targetDir, {
            affiliateUrl: shortUrl,
            requireAffiliateUrl: true
        });
        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 완료');

        return {
            success: true,
            data: {
                rowIndex,
                rowNumber: rowIndex + 2,
                status: '발행 완료',
                shortUrl,
                targetDir: buildResult.targetDir
            }
        };
    } catch (e) {
        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '실패');
        return { success: false, code: 'SHOPPING_ACTION_FAILED', message: e.message };
    }
}

async function executeShoppingBatchRowsAction(requestBody = {}) {
    const rawRowIndices = Array.isArray(requestBody?.rowIndices) ? requestBody.rowIndices : [];
    const rowIndices = Array.from(new Set(
        rawRowIndices
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));

    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: 'rowIndices는 0 이상의 정수 배열이어야 합니다.' };
    }

    clearAllShoppingRuntimeLogs();
    rowIndices.forEach((rowIndex) => {
        setShoppingRuntimeLog(rowIndex, '요청 접수');
    });

    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, `중단: ${precheck.message || '라이선스 확인 실패'}`);
        });
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }

    const features = toFeatureMap(precheck.features);
    if (!isCommandEnabled(features, 'shopping')) {
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, '중단: 현재 플랜에서 shopping 사용 불가');
        });
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)' };
    }

    const initialSession = await checkAuthSessionValid();
    if (!initialSession.ok) {
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, '중단: 네이버 로그인 세션이 유효하지 않습니다.');
        });
        return {
            success: false,
            code: 'NAVER_SESSION_INVALID',
            message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
        };
    }

    const featureMax = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());
    const effectiveMax = featureMax === 0 ? rowIndices.length : Math.max(1, featureMax);
    const targetRowIndices = rowIndices.slice(0, effectiveMax);
    const skippedByLimit = rowIndices.slice(effectiveMax);
    const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);

    targetRowIndices.forEach((rowIndex, i) => {
        setShoppingRuntimeLog(rowIndex, `대기열 등록 (${i + 1}/${targetRowIndices.length})`);
    });

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetRowIndices.length; i += 1) {
        const rowIndex = targetRowIndices[i];
        setShoppingRuntimeLog(rowIndex, `처리 시작 (${i + 1}/${targetRowIndices.length})`);
        const result = await executeShoppingRowAction(
            { rowIndex },
            {
                enableRelatedPostsAutoLink,
                onProgress: (message) => setShoppingRuntimeLog(rowIndex, message)
            }
        );

        if (result.success) {
            successCount += 1;
            results.push({
                rowIndex,
                success: true,
                data: result.data
            });
            setShoppingRuntimeLog(rowIndex, '완료');
            continue;
        }

        failCount += 1;
        setShoppingRuntimeLog(rowIndex, `실패: ${result.message || 'unknown error'}`);
        results.push({
            rowIndex,
            success: false,
            code: result.code || 'SHOPPING_ACTION_FAILED',
            message: result.message || '쇼핑 발행 처리에 실패했습니다.'
        });

        const shouldStop = ['LICENSE_VERIFY_FAILED', 'LICENSE_STATUS_FAILED', 'NAVER_SESSION_INVALID'].includes(result.code);
        if (shouldStop) {
            const remaining = targetRowIndices.slice(i + 1);
            for (const restRowIndex of remaining) {
                setShoppingRuntimeLog(restRowIndex, '중단: 이전 치명 오류로 실행 중단');
                results.push({
                    rowIndex: restRowIndex,
                    success: false,
                    code: 'SKIPPED_AFTER_FATAL_ERROR',
                    message: '이전 치명 오류로 인해 실행이 중단되었습니다.'
                });
            }
            break;
        }
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            attemptedCount: targetRowIndices.length,
            successCount,
            failCount,
            maxPerRun: effectiveMax,
            skippedByLimit,
            results
        }
    };
}

async function executeShoppingRowUpdate(requestBody = {}) {
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const product = String(requestBody?.product || '').trim();
    const shortUrl = String(requestBody?.shortUrl || '').trim();
    const status = String(requestBody?.status || '').trim();
    const allowedStatus = new Set(['준비', '발행 준비 완료', '발행 중', '발행 완료', '실패']);

    if (shortUrl && !/^https?:\/\//i.test(shortUrl)) {
        return { success: false, code: 'INVALID_SHOPPING_URL', message: 'URL 형식이 올바르지 않습니다. (http/https)' };
    }
    if (status && !allowedStatus.has(status)) {
        return { success: false, code: 'INVALID_STATUS', message: '상태 값이 올바르지 않습니다.' };
    }

    try {
        await Utils.updateGoogleSheetShoppingEditableFields(rowIndex, {
            product,
            shortUrl,
            status
        });
        return {
            success: true,
            data: {
                rowIndex,
                rowNumber: rowIndex + 2,
                message: '수정 완료'
            }
        };
    } catch (e) {
        return {
            success: false,
            code: 'SHOPPING_ROW_UPDATE_FAILED',
            message: e.message
        };
    }
}

async function executeBlogTopicUpdate(requestBody) {
    const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
    if (rowIndex === null) {
        return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
    }

    const subject = String(requestBody?.subject || '').trim();
    if (!subject) {
        return { success: false, code: 'INVALID_SUBJECT', message: 'Subject는 비워둘 수 없습니다.' };
    }

    const referenceUrl = String(requestBody?.referenceUrl || '').trim();
    const status = String(requestBody?.status || '').trim();
    const allowedStatus = new Set(['대기', '블로그 발행 준비 완료', '발행 중', '블로그 발행 완료', '실패']);
    if (referenceUrl) {
        const urls = referenceUrl
            .split(',')
            .map(v => String(v || '').trim())
            .filter(Boolean);
        const invalid = urls.find(u => !/^https?:\/\//i.test(u));
        if (invalid) {
            return { success: false, code: 'INVALID_REFERENCE_URL', message: `참고 URL 형식이 올바르지 않습니다: ${invalid}` };
        }
    }
    if (status && !allowedStatus.has(status)) {
        return { success: false, code: 'INVALID_STATUS', message: '상태 값이 올바르지 않습니다.' };
    }

    try {
        await Utils.updateGoogleSheetTopicEditableFields(rowIndex, {
            subject,
            keywords: String(requestBody?.keywords || '').trim(),
            instruction: String(requestBody?.instruction || '').trim(),
            referenceUrl,
            status,
            imageGeneration: normalizeBool(requestBody?.imageGeneration, false),
            externalReference: normalizeBool(requestBody?.externalReference, true)
        });

        return {
            success: true,
            data: {
                rowIndex,
                rowNumber: rowIndex + 2,
                message: '수정 완료'
            }
        };
    } catch (e) {
        return {
            success: false,
            code: 'TOPIC_UPDATE_FAILED',
            message: e.message
        };
    }
}

async function executeTrendCollectAction(requestBody = {}) {
    const precheck = await License.checkLicenseStatus();
    if (!precheck.success) {
        return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
    }
    const features = toFeatureMap(precheck.features);
    if (!isCommandEnabled(features, 'trends')) {
        return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 trends 기능이 비활성화되어 있습니다. (cmd_trends=false)' };
    }
    const dateInput = String(requestBody?.date || '').trim();
    if (dateInput && !getFeatureBool(features, 'enable_trends_date_override', false)) {
        return {
            success: false,
            code: 'FEATURE_DISABLED',
            message: '현재 플랜에서 날짜 지정 트렌드 기능이 비활성화되어 있습니다. (enable_trends_date_override=false)'
        };
    }

    const session = await checkAuthSessionValid();
    if (!session.ok) {
        return { success: false, code: 'NAVER_SESSION_INVALID', message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 로그인해 주세요.' };
    }

    const trendResult = await TrendManager.fetchTrends({ date: dateInput || undefined });
    const trendKeywords = Array.isArray(trendResult?.keywords) ? trendResult.keywords : [];
    if (trendKeywords.length === 0) {
        return {
            success: true,
            data: {
                collectedCount: 0,
                date: trendResult?.date || null,
                appendedCount: 0,
                message: '수집된 트렌드가 없습니다.'
            }
        };
    }

    const verify = await License.verifyLicense();
    if (!verify.success) {
        return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
    }

    const appendResult = await Utils.appendGoogleSheetTrends(trendKeywords, trendResult?.date || null);
    if (!appendResult?.success) {
        return { success: false, code: 'TRENDS_APPEND_FAILED', message: appendResult?.message || 'trends 시트 추가에 실패했습니다.' };
    }

    return {
        success: true,
        data: {
            collectedCount: trendKeywords.length,
            appendedCount: appendResult.addedCount || trendKeywords.length,
            date: appendResult.date || trendResult?.date || null,
            message: '트렌드 수집 및 시트 추가 완료'
        }
    };
}

async function executeTrendsToTopicsAction(requestBody = {}) {
    const rowIndices = Array.from(new Set(
        (Array.isArray(requestBody.rowIndices) ? requestBody.rowIndices : [])
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));
    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: '선택된 trends 행이 없습니다.' };
    }

    const trendsResult = await Utils.readGoogleSheetTrendsAll({ limit: 100000, offset: 0 });
    const allItems = Array.isArray(trendsResult.items) ? trendsResult.items : [];
    const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
    const selected = rowIndices.map(idx => byRowIndex.get(idx)).filter(Boolean);
    if (selected.length === 0) {
        return { success: false, code: 'TRENDS_NOT_FOUND', message: '선택된 trends 행을 찾지 못했습니다.' };
    }

    const topics = selected.map(item => ({
        subject: String(item.category || item.keyword || '').trim(),
        keywords: [String(item.keyword || '').trim()].filter(Boolean),
        content_guide: {
            additional_instructions: '',
            reference_urls: []
        },
        use_external_ref: true,
        image_options: { generate: false, count: 4 },
        status: '대기'
    })).filter(item => item.subject);

    if (topics.length === 0) {
        return { success: false, code: 'EMPTY_TOPICS', message: '선택된 행에서 토픽 생성이 가능한 데이터가 없습니다.' };
    }

    const appendResult = await Utils.appendGoogleSheetTopics(topics, { defaultStatus: '대기' });
    if (!appendResult?.success) {
        return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 추가에 실패했습니다.' };
    }

    for (const rowIndex of rowIndices) {
        await Utils.updateGoogleSheetTrendStatus(rowIndex, '키워드 목록 추가 완료');
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            appendedCount: topics.length,
            rowIndices,
            message: 'trends 선택 항목을 topics에 추가했습니다.'
        }
    };
}

async function executeKeywordsToTopicsAction(requestBody = {}) {
    const rowIndices = Array.from(new Set(
        (Array.isArray(requestBody.rowIndices) ? requestBody.rowIndices : [])
            .map(v => parseIntSafe(v, null, 0))
            .filter(v => v !== null)
    ));
    if (rowIndices.length === 0) {
        return { success: false, code: 'INVALID_ROW_INDICES', message: '선택된 keywords 행이 없습니다.' };
    }

    const keywordsResult = await Utils.readGoogleSheetKeywordsAll({ limit: 100000, offset: 0 });
    const allItems = Array.isArray(keywordsResult.items) ? keywordsResult.items : [];
    const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
    const selected = rowIndices.map(idx => byRowIndex.get(idx)).filter(Boolean);
    if (selected.length === 0) {
        return { success: false, code: 'KEYWORDS_NOT_FOUND', message: '선택된 keywords 행을 찾지 못했습니다.' };
    }

    const topics = selected.map(item => {
        const keyword = String(item.keyword || '').trim();
        return {
            subject: keyword,
            keywords: keyword ? [keyword] : [],
            content_guide: {
                additional_instructions: '',
                reference_urls: []
            },
            use_external_ref: true,
            image_options: { generate: false, count: 4 },
            status: '대기'
        };
    }).filter(item => item.subject);

    if (topics.length === 0) {
        return { success: false, code: 'EMPTY_TOPICS', message: '선택된 행에서 토픽 생성이 가능한 데이터가 없습니다.' };
    }

    const appendResult = await Utils.appendGoogleSheetTopics(topics, { defaultStatus: '대기' });
    if (!appendResult?.success) {
        return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 추가에 실패했습니다.' };
    }

    for (const rowIndex of rowIndices) {
        await Utils.updateGoogleSheetKeywordStatus(rowIndex, '연관검색어 조사 완료');
    }

    return {
        success: true,
        data: {
            requestedCount: rowIndices.length,
            appendedCount: topics.length,
            rowIndices,
            message: 'keywords 선택 항목을 topics에 추가했습니다.'
        }
    };
}

function readJsonBody(req, limitBytes = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limitBytes) {
                reject(new Error('요청 본문이 너무 큽니다.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf-8').trim();
                if (!raw) return resolve({});
                resolve(JSON.parse(raw));
            } catch (e) {
                reject(new Error('JSON 본문 파싱에 실패했습니다.'));
            }
        });
        req.on('error', reject);
    });
}

async function handleApi(requestId, method, pathname, searchParams, requestBody, res) {
    if (pathname === '/api/v1/health') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        return sendSuccess(res, requestId, { status: 'ok', version: APP_VERSION });
    }

    if (pathname === '/api/v1/config/status') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        return sendSuccess(res, requestId, {
            ready: CONFIG.CONFIG_READY === true,
            sourceType: String(CONFIG.CONFIG_SOURCE_TYPE || ''),
            sourcePath: String(CONFIG.CONFIG_SOURCE_PATH || ''),
            message: String(CONFIG.CONFIG_ERROR_MESSAGE || '')
        });
    }

    if (pathname === '/api/v1/license/status') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const quiet = parseBoolQuery(searchParams.get('quiet'));
        const status = await License.checkLicenseStatus({ quiet });
        if (!status.success) {
            return sendError(res, requestId, 400, 'LICENSE_STATUS_FAILED', status.message);
        }
        return sendSuccess(res, requestId, {
            planCode: status.planCode || '',
            planName: status.planDisplayName || status.planCode || '',
            createdAt: status.createdAt || '',
            usageLimit: status.usageLimit,
            usageCount: status.usageCount,
            remaining: status.remaining,
            features: toFeatureMap(status.features)
        });
    }

    if (pathname === '/api/v1/capabilities') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const quiet = parseBoolQuery(searchParams.get('quiet'));
        const status = await License.checkLicenseStatus({ quiet });
        if (!status.success) {
            return sendError(res, requestId, 400, 'CAPABILITY_RESOLVE_FAILED', status.message);
        }
        const features = toFeatureMap(status.features);
        const maxBlogPosts = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
        const maxShoppingPosts = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());

        return sendSuccess(res, requestId, {
            planCode: status.planCode || '',
            planName: status.planDisplayName || status.planCode || '',
            features,
            limits: {
                max_blog_posts_per_run: maxBlogPosts,
                max_shopping_posts_per_run: maxShoppingPosts
            }
        });
    }

    if (pathname === '/api/v1/session/naver') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const session = await checkAuthSessionValid();
        return sendSuccess(res, requestId, {
            valid: Boolean(session.ok),
            reason: session.reason || '',
            message: session.message || '',
            checkedAt: new Date().toISOString()
        });
    }

    if (pathname === '/api/v1/session/naver-login') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        return sendSuccess(res, requestId, getNaverLoginStatus());
    }

    if (pathname === '/api/v1/session/naver-login/start') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');

        if (naverLoginState.status === 'running') {
            return sendError(res, requestId, 409, 'NAVER_LOGIN_ALREADY_RUNNING', '이미 로그인 진행 중입니다. 브라우저 창을 확인해 주세요.');
        }

        Logger.info('🔐 [UI] 네이버 로그인 시작 요청 수신');
        setNaverLoginState({
            status: 'running',
            message: '로그인 프로세스를 시작합니다...',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            detectedBy: '',
            error: ''
        });

        runNaverLoginFlowForUi().catch((e) => {
            setNaverLoginState({
                status: 'failed',
                message: '로그인 실패',
                finishedAt: new Date().toISOString(),
                error: String(e?.message || 'unknown error')
            });
        });

        return sendSuccess(res, requestId, getNaverLoginStatus(), 202);
    }

    if (pathname === '/api/v1/settings/major') {
        if (method === 'GET') {
            try {
                const configSource = tryResolveReadableConfigSource();
                const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
                const effectiveSource = configSource || { path: resolveWritableConfigPath(), sourceType: 'generated' };
                return sendSuccess(res, requestId, buildMajorSettings(raw, effectiveSource));
            } catch (e) {
                return sendError(res, requestId, 400, 'SETTINGS_READ_FAILED', e.message);
            }
        }

        if (method === 'POST') {
            try {
                const configSource = tryResolveReadableConfigSource();
                const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
                const writablePath = resolveWritableConfigPath();
                const fields = parseMajorFieldsFromRequest(requestBody || {});
                const nextRaw = applyConfigUpdates(raw, {
                    NAVER_ID: fields.NAVER_ID,
                    GEMINI_API_KEY: fields.GEMINI_API_KEY,
                    GOOGLE_SHEET_ID: fields.GOOGLE_SHEET_ID,
                    HEADLESS: fields.HEADLESS ? 'true' : 'false',
                    TYPING_SPEED: fields.TYPING_SPEED
                });
                fs.mkdirSync(path.dirname(writablePath), { recursive: true });
                fs.writeFileSync(writablePath, nextRaw, 'utf-8');
                applyRuntimeConfigFromMajor(fields);
                CONFIG.CONFIG_READY = true;
                CONFIG.CONFIG_SOURCE_TYPE = 'config';
                CONFIG.CONFIG_SOURCE_PATH = writablePath;
                CONFIG.CONFIG_ERROR_MESSAGE = '';
                return sendSuccess(res, requestId, {
                    ...buildMajorSettings(nextRaw, { path: writablePath, sourceType: 'config' }),
                    requiresRestart: false,
                    message: '주요 설정 저장 완료'
                });
            } catch (e) {
                return sendError(res, requestId, 400, 'SETTINGS_SAVE_FAILED', e.message);
            }
        }

        return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
    }

    if (pathname === '/api/v1/settings/advanced') {
        if (method === 'GET') {
            try {
                const configSource = tryResolveReadableConfigSource();
                const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
                return sendSuccess(res, requestId, {
                    configPath: (configSource?.path) || resolveWritableConfigPath(),
                    configSourceType: (configSource?.sourceType) || 'generated',
                    content: raw
                });
            } catch (e) {
                return sendError(res, requestId, 400, 'SETTINGS_READ_FAILED', e.message);
            }
        }

        if (method === 'POST') {
            const content = String(requestBody?.content || '');
            if (!content.trim()) {
                return sendError(res, requestId, 400, 'INVALID_CONTENT', '고급 설정 내용이 비어 있습니다.');
            }
            if (content.length > 1024 * 1024) {
                return sendError(res, requestId, 400, 'CONTENT_TOO_LARGE', '고급 설정 내용이 너무 큽니다. (최대 1MB)');
            }

            try {
                const writablePath = resolveWritableConfigPath();
                fs.mkdirSync(path.dirname(writablePath), { recursive: true });
                fs.writeFileSync(writablePath, content, 'utf-8');
                const fields = parseMajorFieldsFromRequest({
                    NAVER_ID: parseConfigValue(content, 'NAVER_ID') || CONFIG.NAVER_ID,
                    GEMINI_API_KEY: parseConfigValue(content, 'GEMINI_API_KEY') || CONFIG.GEMINI_API_KEY,
                    GOOGLE_SHEET_ID: parseConfigValue(content, 'GOOGLE_SHEET_ID') || CONFIG.GOOGLE_SHEET_ID,
                    HEADLESS: parseConfigValue(content, 'HEADLESS'),
                    TYPING_SPEED: parseConfigValue(content, 'TYPING_SPEED')
                });
                applyRuntimeConfigFromMajor(fields);
                CONFIG.CONFIG_READY = true;
                CONFIG.CONFIG_SOURCE_TYPE = 'config';
                CONFIG.CONFIG_SOURCE_PATH = writablePath;
                CONFIG.CONFIG_ERROR_MESSAGE = '';
                return sendSuccess(res, requestId, {
                    configPath: writablePath,
                    configSourceType: 'config',
                    requiresRestart: true,
                    message: '고급 설정 저장 완료'
                });
            } catch (e) {
                return sendError(res, requestId, 400, 'SETTINGS_SAVE_FAILED', e.message);
            }
        }

        return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
    }

    if (pathname === '/api/v1/blog/quick-publish') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeQuickPublish(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'QUICK_PUBLISH_FAILED', result.message || '빠른발행 요청에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/shopping/quick-publish') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeShoppingQuickPublish(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'SHOPPING_QUICK_PUBLISH_FAILED', result.message || '쇼핑 빠른발행 요청에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/blog/topics') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const status = String(searchParams.get('status') || '').trim();
        const q = String(searchParams.get('q') || '').trim();
        const limit = parseIntSafe(searchParams.get('limit'), 50, 1) || 50;
        const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
        const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
        const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
        const result = await Utils.readGoogleSheetTopicsAll({ status, q, limit, offset, sortBy, sortDir });
        const runtimeLogMap = getBlogRuntimeLogMap();
        let items = Array.isArray(result.items) ? [...result.items] : [];

        // 상태/검색 필터로 빠진 행이어도 runtime 로그가 살아있는 동안은 목록에 유지해
        // 사용자가 진행 상황을 추적할 수 있게 한다.
        if (runtimeLogMap.size > 0) {
            const existing = new Set(items.map(item => item.rowIndex));
            const missingRuntimeRowIndices = Array.from(runtimeLogMap.keys()).filter(rowIndex => !existing.has(rowIndex));
            if (missingRuntimeRowIndices.length > 0) {
                const allTopics = await Utils.readGoogleSheetTopicsAll({ limit: 100000, offset: 0, sortBy, sortDir });
                const allItems = Array.isArray(allTopics.items) ? allTopics.items : [];
                const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
                for (const rowIndex of missingRuntimeRowIndices) {
                    const found = byRowIndex.get(rowIndex);
                    if (found) items.push(found);
                }
                items = sortTopicItems(items, sortBy, sortDir);
            }
        }

        items = items.map(item => ({
            ...item,
            runtimeLog: runtimeLogMap.get(item.rowIndex) || ''
        }));
        items = sortTopicItems(items, sortBy, sortDir);
        return sendSuccess(res, requestId, {
            ...result,
            total: Math.max(Number(result.total || 0), items.length),
            items
        });
    }

    if (pathname === '/api/v1/shopping/items') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const status = String(searchParams.get('status') || '').trim();
        const q = String(searchParams.get('q') || '').trim();
        const limit = parseIntSafe(searchParams.get('limit'), 50, 1) || 50;
        const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
        const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
        const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
        const result = await Utils.readGoogleSheetShoppingAll({ status, q, limit, offset, sortBy, sortDir });
        const runtimeLogMap = getShoppingRuntimeLogMap();
        let items = Array.isArray(result.items) ? [...result.items] : [];

        if (runtimeLogMap.size > 0) {
            const existing = new Set(items.map(item => item.rowIndex));
            const missingRuntimeRowIndices = Array.from(runtimeLogMap.keys()).filter(rowIndex => !existing.has(rowIndex));
            if (missingRuntimeRowIndices.length > 0) {
                const allShopping = await Utils.readGoogleSheetShoppingAll({ limit: 100000, offset: 0, sortBy, sortDir });
                const allItems = Array.isArray(allShopping.items) ? allShopping.items : [];
                const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
                for (const rowIndex of missingRuntimeRowIndices) {
                    const found = byRowIndex.get(rowIndex);
                    if (found) items.push(found);
                }
            }
        }

        items = items.map(item => ({
            ...item,
            runtimeLog: runtimeLogMap.get(item.rowIndex) || ''
        }));
        items = sortShoppingItems(items, sortBy, sortDir);
        return sendSuccess(res, requestId, {
            ...result,
            total: Math.max(Number(result.total || 0), items.length),
            items
        });
    }

    if (pathname === '/api/v1/blog/action') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const body = requestBody || {};
        const action = String(body.action || '').trim().toLowerCase();
        const result = (action === 'batch' && Array.isArray(body.rowIndices))
            ? await executeBlogBatchRowsAction(body)
            : await executeBlogRowAction(body);
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'BLOG_ACTION_FAILED', result.message || '블로그 작업 요청에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/shopping/action') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const body = requestBody || {};
        const action = String(body.action || '').trim().toLowerCase();
        if (action !== 'batch' || !Array.isArray(body.rowIndices)) {
            return sendError(res, requestId, 400, 'INVALID_ACTION', 'shopping action은 batch만 지원합니다.');
        }
        const result = await executeShoppingBatchRowsAction(body);
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'SHOPPING_ACTION_FAILED', result.message || '쇼핑 작업 요청에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/shopping/row/update') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeShoppingRowUpdate(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'SHOPPING_ROW_UPDATE_FAILED', result.message || '쇼핑 행 수정에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/blog/topic/update') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeBlogTopicUpdate(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'TOPIC_UPDATE_FAILED', result.message || '토픽 수정에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/trends/collect') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeTrendCollectAction(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'TRENDS_COLLECT_FAILED', result.message || '트렌드 수집에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/trends/items') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const status = String(searchParams.get('status') || '').trim();
        const q = String(searchParams.get('q') || '').trim();
        const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
        const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
        const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
        const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
        const result = await Utils.readGoogleSheetTrendsAll({ status, q, limit, offset, sortBy, sortDir });
        return sendSuccess(res, requestId, result);
    }

    if (pathname === '/api/v1/keywords/items') {
        if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const status = String(searchParams.get('status') || '').trim();
        const q = String(searchParams.get('q') || '').trim();
        const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
        const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
        const result = await Utils.readGoogleSheetKeywordsAll({ status, q, limit, offset });
        return sendSuccess(res, requestId, result);
    }

    if (pathname === '/api/v1/trends/to-topics') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeTrendsToTopicsAction(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'TRENDS_TO_TOPICS_FAILED', result.message || 'trends→topics 처리에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    if (pathname === '/api/v1/keywords/to-topics') {
        if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        const result = await executeKeywordsToTopicsAction(requestBody || {});
        if (!result.success) {
            return sendError(res, requestId, 400, result.code || 'KEYWORDS_TO_TOPICS_FAILED', result.message || 'keywords→topics 처리에 실패했습니다.');
        }
        return sendSuccess(res, requestId, result.data);
    }

    return false;
}

async function startUiServer(options = {}) {
    const port = Number.isFinite(Number(options.port)) ? parseInt(options.port, 10) : DEFAULT_PORT;
    const uiRoot = resolveUiRoot();
    if (!uiRoot) {
        throw new Error('UI 정적 파일 폴더를 찾을 수 없습니다. (ui/)');
    }

    const server = http.createServer(async (req, res) => {
        const requestId = createRequestId();
        const method = String(req.method || 'GET').toUpperCase();
        const url = new URL(String(req.url || '/'), `http://127.0.0.1:${port}`);
        const pathname = url.pathname;

        try {
            if (pathname.startsWith('/api/v1/')) {
                let requestBody = {};
                if (method === 'POST') {
                    requestBody = await readJsonBody(req);
                }
                const apiHandled = await handleApi(requestId, method, pathname, url.searchParams, requestBody, res);
                if (apiHandled !== false) return;
                return sendError(res, requestId, 404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
            }

            if (method !== 'GET') {
                return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            }

            const safePath = sanitizePathname(pathname === '/' ? 'index.html' : pathname);
            const fullPath = path.join(uiRoot, safePath);
            const rootPrefix = `${uiRoot}${path.sep}`;
            if (!(fullPath === uiRoot || fullPath.startsWith(rootPrefix))) {
                return sendError(res, requestId, 403, 'FORBIDDEN_PATH', '허용되지 않은 경로입니다.');
            }
            if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                return sendError(res, requestId, 404, 'NOT_FOUND', '요청한 리소스를 찾을 수 없습니다.');
            }

            const body = fs.readFileSync(fullPath);
            res.writeHead(200, {
                'Content-Type': getContentType(fullPath),
                'Cache-Control': 'no-store'
            });
            res.end(body);
        } catch (e) {
            Logger.error(`❌ UI 서버 요청 처리 실패: ${e.message}`);
            sendError(res, requestId, 500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });

    return { server, port };
}

module.exports = {
    startUiServer
};
