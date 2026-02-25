const path = require('path');
const fs = require('fs');
const Constants = require('./constants');

// 💡 [경로 기준점]
const ROOT_DIR = process.cwd();
const EXEC_DIR = path.dirname(process.execPath || ROOT_DIR);

function decodeFileUriPath(raw) {
    const input = String(raw || '').trim();
    if (!/^file:\/\//i.test(input)) return input;
    try {
        const parsed = new URL(input);
        if (parsed.protocol !== 'file:') return input;
        const host = decodeURIComponent(parsed.hostname || '');
        let localPath = decodeURIComponent(parsed.pathname || '');
        if (host === '.') {
            localPath = `.${localPath}`;
        } else if (host && host !== 'localhost') {
            localPath = `//${host}${localPath}`;
        }
        if (process.platform === 'win32' && /^[\/\\][A-Za-z]:/.test(localPath)) {
            localPath = localPath.slice(1);
        }
        return localPath || input;
    } catch (e) {
        return input.replace(/^file:\/\//i, '');
    }
}

// =========================================================
// 1. 🔒 [비밀 키 로딩] 
// =========================================================
let internalSecrets = {};
try {
    // pkg 빌드 시 번들링되는 내부 파일 (secret.js)
    internalSecrets = require('./config/secret');
} catch (e) {
    console.warn("⚠️ 라이선스 서버 설정 파일을 찾지 못했습니다.");
    internalSecrets = {
        LICENSE_CHK_URL: "",
        LICENSE_CHK_KEY: ""
    };
}

// =========================================================
// 2. 📂 [경로 정의]
// =========================================================
const PATHS = {
    configFile: path.join(ROOT_DIR, 'config', 'config.txt'),
    configFileFromExec: path.join(EXEC_DIR, 'config', 'config.txt'),
    configSampleFile: path.join(ROOT_DIR, 'config', 'config.txt.sample'),
    configSampleFileFromExec: path.join(EXEC_DIR, 'config', 'config.txt.sample'),
    licenseKeyFile: path.join(ROOT_DIR, 'config', 'license.key'),
    licenseKeyFileFromExec: path.join(EXEC_DIR, 'config', 'license.key'),
    auth: path.join(ROOT_DIR, 'config', 'auth.json'),
    blogPromptOverride: path.join(ROOT_DIR, 'config', 'blog_prompt.md'),
    blogPromptOverrideFromExec: path.join(EXEC_DIR, 'config', 'blog_prompt.md'),
    shoppingPromptOverride: path.join(ROOT_DIR, 'config', 'shopping_prompt.md'),
    shoppingPromptOverrideFromExec: path.join(EXEC_DIR, 'config', 'shopping_prompt.md'),
    defaultBlogPrompt: path.join(__dirname, 'config', 'blog_prompt.md'),
    defaultShoppingPrompt: path.join(__dirname, 'config', 'shopping_prompt.md'),
    workspace: path.join(ROOT_DIR, 'workspace')
};

function ensureConfigFileFromSample() {
    const pairs = [
        { config: PATHS.configFile, sample: PATHS.configSampleFile },
        { config: PATHS.configFileFromExec, sample: PATHS.configSampleFileFromExec }
    ];

    for (const pair of pairs) {
        try {
            if (fs.existsSync(pair.config)) return pair.config;
            if (!fs.existsSync(pair.sample)) continue;
            fs.mkdirSync(path.dirname(pair.config), { recursive: true });
            fs.copyFileSync(pair.sample, pair.config);
            console.info(`✅ config.txt 자동 생성 완료: ${pair.config}`);
            return pair.config;
        } catch (e) {
            console.warn(`⚠️ config.txt 자동 생성 실패: ${pair.config} (${e.message})`);
        }
    }
    return '';
}

// =========================================================
// 3. 🛠️ [config.txt 파싱 함수]
// =========================================================
function loadUserConfig() {
    const config = {};
    const autoCreatedConfigPath = ensureConfigFileFromSample();
    const configPath = fs.existsSync(PATHS.configFile)
        ? PATHS.configFile
        : fs.existsSync(PATHS.configFileFromExec)
            ? PATHS.configFileFromExec
            : fs.existsSync(PATHS.configSampleFile)
                ? PATHS.configSampleFile
                : PATHS.configSampleFileFromExec;

    if (!fs.existsSync(configPath)) {
        const lines = [
            '❌ 설정 파일을 찾을 수 없습니다.',
            `- 확인 경로: ${PATHS.configFile}`,
            `- 확인 경로: ${PATHS.configSampleFile}`,
            '',
            '해결 방법:',
            '1) 배포 패키지의 config/config.txt.sample 파일이 있는지 확인하세요.',
            '2) sample이 있으면 config.txt로 복사한 뒤 필수값을 입력하세요.',
            '',
            '   macOS / Linux: cp config/config.txt.sample config/config.txt',
            '   Windows PowerShell: Copy-Item .\\config\\config.txt.sample .\\config\\config.txt',
            '',
            '3) sample도 없으면 패키지를 다시 받아서 압축을 풀어주세요.'
        ];
        const message = lines.join('\n');
        console.error(message);
        try {
            const logDir = path.join(ROOT_DIR, 'logs');
            fs.mkdirSync(logDir, { recursive: true });
            const startupErrorLog = path.join(logDir, 'startup-error.log');
            fs.appendFileSync(startupErrorLog, `\n[${new Date().toISOString()}]\n${message}\n`);
            console.error(`📝 상세 안내 로그: ${startupErrorLog}`);
        } catch (e) { }
        return {
            __CONFIG_SOURCE_PATH: PATHS.configFile,
            __CONFIG_SOURCE_TYPE: 'missing',
            __CONFIG_READY: false,
            __CONFIG_ERROR_MESSAGE: message
        };
    }

    const usingSample = configPath.endsWith('config.txt.sample');
    if (usingSample) {
        console.warn(`⚠️ config.txt가 없어 sample 설정으로 로드합니다: ${configPath}`);
    }

    const fileContent = fs.readFileSync(configPath, 'utf-8');

    fileContent.split('\n').forEach(line => {
        const cleanLine = line.split('#')[0].trim();
        if (!cleanLine || !cleanLine.includes('=')) return;

        const [key, ...valueParts] = cleanLine.split('=');
        const finalKey = key.trim();
        const finalValue = valueParts.join('=').trim();

        if (finalValue.toLowerCase() === 'true') config[finalKey] = true;
        else if (finalValue.toLowerCase() === 'false') config[finalKey] = false;
        else if (!isNaN(finalValue) && finalValue !== '') config[finalKey] = Number(finalValue);
        else config[finalKey] = finalValue;
    });

    return {
        ...config,
        __CONFIG_SOURCE_PATH: autoCreatedConfigPath || configPath,
        __CONFIG_SOURCE_TYPE: usingSample ? 'sample' : 'config',
        __CONFIG_READY: true,
        __CONFIG_ERROR_MESSAGE: ''
    };
}

function loadLicenseKey() {
    const candidates = [PATHS.licenseKeyFile, PATHS.licenseKeyFileFromExec];
    const matchedPath = candidates.find((filePath) => fs.existsSync(filePath));
    if (!matchedPath) {
        return { value: '', path: PATHS.licenseKeyFile };
    }
    try {
        const value = String(fs.readFileSync(matchedPath, 'utf-8') || '')
            .split(/\r?\n/)
            .find((line) => String(line || '').trim() !== '') || '';
        return { value: String(value).trim(), path: matchedPath };
    } catch (e) {
        return { value: '', path: matchedPath };
    }
}

function extractGoogleSheetId(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const idPattern = /^[a-zA-Z0-9-_]{20,}$/;
    if (idPattern.test(raw)) return raw;

    try {
        const u = new URL(raw);
        if (!/docs\.google\.com$/i.test(u.hostname) && !/googleusercontent\.com$/i.test(u.hostname)) return '';
        const byPath = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
        if (byPath?.[1]) return byPath[1];
        const byQuery = u.searchParams.get('id');
        if (byQuery && idPattern.test(byQuery)) return byQuery;
    } catch (e) { }
    return '';
}

function parseBoolLike(input, fallback = false) {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input !== 0;
    if (typeof input === 'string') {
        const v = input.trim().toLowerCase();
        if (['true', '1', 'yes', 'on', 'y'].includes(v)) return true;
        if (['false', '0', 'no', 'off', 'n'].includes(v)) return false;
    }
    return fallback;
}

function parseNonNegativeInt(input, fallback) {
    const num = parseInt(String(input ?? ''), 10);
    if (!Number.isInteger(num) || num < 0) return fallback;
    return num;
}

function parseIntegerOrBlank(input, fallback = '') {
    const raw = String(input ?? '').trim();
    if (!raw) return fallback;
    const num = parseInt(raw, 10);
    if (!Number.isInteger(num)) return fallback;
    return num;
}

function parsePositiveInt(input, fallback) {
    const num = parseInt(String(input ?? ''), 10);
    if (!Number.isInteger(num) || num <= 0) return fallback;
    return num;
}

function parseTimeHHmm(input, fallback = '07:30') {
    const raw = String(input || '').trim();
    if (!raw) return fallback;
    const m = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return fallback;
    return `${m[1]}:${m[2]}`;
}

// 사용자 설정 로드
const userConfig = loadUserConfig();
const configSourcePath = userConfig.__CONFIG_SOURCE_PATH;
const configSourceType = userConfig.__CONFIG_SOURCE_TYPE;
const configReady = userConfig.__CONFIG_READY === true;
const configErrorMessage = String(userConfig.__CONFIG_ERROR_MESSAGE || '');
delete userConfig.__CONFIG_SOURCE_PATH;
delete userConfig.__CONFIG_SOURCE_TYPE;
delete userConfig.__CONFIG_READY;
delete userConfig.__CONFIG_ERROR_MESSAGE;
delete userConfig.NAVER_CLIENT_ID;
delete userConfig.NAVER_CLIENT_SECRET;
delete userConfig.LICENSE_KEY;
const licenseKeyInfo = loadLicenseKey();

const activeConfigDir = (() => {
    if (configReady && configSourcePath) return path.dirname(configSourcePath);
    const execConfigDir = path.join(EXEC_DIR, 'config');
    if (fs.existsSync(execConfigDir)) return execConfigDir;
    return path.join(ROOT_DIR, 'config');
})();

const activeAppRoot = path.basename(activeConfigDir).toLowerCase() === 'config'
    ? path.dirname(activeConfigDir)
    : activeConfigDir;

function resolveRuntimePath(rawPath, options = {}) {
    const { mustExist = false } = options || {};
    const input = decodeFileUriPath(String(rawPath || '').trim());
    if (!input) return '';
    if (/^https?:\/\//i.test(input)) return input;

    const candidates = [];
    if (path.isAbsolute(input)) {
        candidates.push(input);
    } else {
        candidates.push(path.resolve(activeAppRoot, input));
        candidates.push(path.resolve(activeConfigDir, input));
        candidates.push(path.resolve(EXEC_DIR, input));
        candidates.push(path.resolve(ROOT_DIR, input));
    }

    if (!mustExist) return candidates[0] || '';
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch (e) { }
    }
    return candidates[0] || '';
}

const googleAuthRaw = String(process.env.GOOGLE_AUTH_JSON || userConfig.GOOGLE_AUTH_JSON || '').trim();
const googleAuthPath = resolveRuntimePath(googleAuthRaw || './config/service_account.json', { mustExist: true });
const workspaceRaw = String(userConfig.WORKSPACE_DIR || '').trim();
const resolvedWorkspaceDir = workspaceRaw
    ? resolveRuntimePath(workspaceRaw)
    : path.join(activeAppRoot, 'workspace');
const resolvedAuthPath = path.join(activeConfigDir, 'auth.json');
const resolvedLicenseKeyPath = licenseKeyInfo.path || path.join(activeConfigDir, 'license.key');

const userSheetUrl = String(userConfig.GOOGLE_SHEET_URL || '').trim();
const fallbackSheetId = String(userConfig.GOOGLE_SHEET_ID || '').trim();
const resolvedSheetId = extractGoogleSheetId(userSheetUrl) || (fallbackSheetId || '');
const resolvedSheetUrl = resolvedSheetId
    ? `https://docs.google.com/spreadsheets/d/${resolvedSheetId}`
    : userSheetUrl;

const naverAutoMode = parseBoolLike(userConfig.NAVER_AUTO_MODE ?? userConfig.AUTO_MODE, false);
const naverAutoCategories = String(
    userConfig.NAVER_AUTO_CATEGORIES
    ?? userConfig.AUTO_INCLUDE_CATEGORIES
    ?? userConfig.AUTO_CATEGORIES
    ?? ''
).trim();
const naverAutoDailyPosts = parseNonNegativeInt(
    userConfig.NAVER_AUTO_DAILY_POSTS ?? userConfig.AUTO_DAILY_BLOG_CAP,
    5
);
const naverAutoTrendsTime = parseTimeHHmm(userConfig.NAVER_AUTO_TRENDS_TIME, '07:30');
const naverAutoImageGeneration = parseBoolLike(
    userConfig.NAVER_AUTO_IMAGE_GENERATION ?? userConfig.AUTO_IMAGE_GENERATION,
    true
);
const naverAutoExternalReference = parseBoolLike(
    userConfig.NAVER_AUTO_EXTERNAL_REFERENCE ?? userConfig.AUTO_USE_EXTERNAL_REF,
    true
);
const naverAutoNotifyEnabled = parseBoolLike(userConfig.NAVER_AUTO_NOTIFY_ENABLED, false);
const naverAutoVariationIncludeNew = parseBoolLike(
    userConfig.NAVER_AUTO_VARIATION_INCLUDE_NEW ?? userConfig.AUTO_TRENDS_VARIATION_INCLUDE_NEW,
    false
);
const naverAutoVariationIncludeDash = parseBoolLike(
    userConfig.NAVER_AUTO_VARIATION_INCLUDE_DASH ?? userConfig.AUTO_TRENDS_VARIATION_INCLUDE_DASH,
    false
);
const naverAutoVariationIncludeNumber = parseBoolLike(
    userConfig.NAVER_AUTO_VARIATION_INCLUDE_NUMBER ?? userConfig.AUTO_TRENDS_VARIATION_INCLUDE_NUMBER,
    true
);
const naverAutoVariationType = String(
    userConfig.NAVER_AUTO_VARIATION_TYPE || 'min'
).trim();
const naverAutoVariationNumber = parseIntegerOrBlank(
    userConfig.NAVER_AUTO_VARIATION_NUMBER ?? userConfig.AUTO_TRENDS_MIN_VARIATION,
    50
);
const naverAutoKeywordReuseGapDays = parseNonNegativeInt(
    userConfig.NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS ?? userConfig.AUTO_KEYWORD_REUSE_GAP_DAYS,
    15
);
const naverShoppingAutoMode = parseBoolLike(
    userConfig.NAVER_SHOPPING_AUTO_MODE,
    false
);
const naverShoppingAutoDailyPosts = parseNonNegativeInt(
    userConfig.NAVER_SHOPPING_AUTO_DAILY_POSTS,
    3
);
const naverShoppingAutoTime = parseTimeHHmm(userConfig.NAVER_SHOPPING_AUTO_TIME, '07:50');
const naverShoppingAutoNotifyEnabled = parseBoolLike(
    userConfig.NAVER_SHOPPING_AUTO_NOTIFY_ENABLED,
    false
);

// =========================================================
// 4. 🧩 [데이터 가공 및 엔드포인트 동적 생성]
// =========================================================

// 💡 [모델명 처리] 사용자가 설정한 모델, 없으면 기본값 사용
const textModel = userConfig.TEXT_MODEL || 'gemini-3-flash-preview';
const imageModel = userConfig.IMAGE_MODEL || 'gemini-2.5-flash-image';
const imageStyle = userConfig.IMAGE_STYLE || 'photorealistic';

// 💡 [엔드포인트 생성] 주소 체계 유지하며 모델명만 주입
const TEXT_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent`;
const IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent`;

// 타이핑 속도 변환
const typingModeRaw = String(userConfig.TYPING_SPEED || 'NORMAL').trim().toUpperCase();
const typingMode = Constants.TYPING_PRESETS[typingModeRaw] ? typingModeRaw : 'NORMAL';
const typingDelay = Constants.TYPING_PRESETS[typingMode];

const listenHost = String(process.env.LISTEN_HOST || userConfig.LISTEN_HOST || '127.0.0.1').trim() || '127.0.0.1';
const listenPortRaw = process.env.LISTEN_PORT || userConfig.LISTEN_PORT || 4577;
const listenPortParsed = parseInt(String(listenPortRaw), 10);
const listenPort = Number.isInteger(listenPortParsed) && listenPortParsed >= 1 && listenPortParsed <= 65535
    ? listenPortParsed
    : 4577;

const closeDelay = (userConfig.CLOSE_DELAY_SECONDS || 10) * 1000;

const blogPromptCandidates = [
    PATHS.blogPromptOverride,
    PATHS.blogPromptOverrideFromExec,
    PATHS.defaultBlogPrompt
];
const shoppingPromptCandidates = [
    PATHS.shoppingPromptOverride,
    PATHS.shoppingPromptOverrideFromExec,
    PATHS.defaultShoppingPrompt
];

const blogPromptPath = blogPromptCandidates.find((filePath) => fs.existsSync(filePath)) || PATHS.defaultBlogPrompt;
const shoppingPromptPath = shoppingPromptCandidates.find((filePath) => fs.existsSync(filePath)) || PATHS.defaultShoppingPrompt;

PATHS.auth = resolvedAuthPath;
PATHS.workspace = resolvedWorkspaceDir;
PATHS.appRoot = activeAppRoot;
PATHS.configDir = activeConfigDir;

// 최종 내보낼 객체
module.exports = {
    ...Constants,       // 1. 내부 상수 (대기 시간 등)
    ...internalSecrets, // 2. 비밀키 (라이선스 URL, KEY)
    ...userConfig,      // 3. 사용자 설정 (ID, Key, 모델명 등)

    // 🔧 [Fixed] 환경 변수 우선 지원 (보안 강화)
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || userConfig.GEMINI_API_KEY,
    GOOGLE_AUTH_JSON: googleAuthRaw || './config/service_account.json',
    GOOGLE_AUTH_JSON_PATH: googleAuthPath,
    LICENSE_KEY: process.env.LICENSE_KEY || licenseKeyInfo.value || '',
    NAVER_ID: process.env.NAVER_ID || userConfig.NAVER_ID,
    NAVER_PASSWORD: process.env.NAVER_PASSWORD || userConfig.NAVER_PASSWORD,
    NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || '',
    NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || '',
    GOOGLE_SHEET_URL: process.env.GOOGLE_SHEET_URL || resolvedSheetUrl,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID || resolvedSheetId,
    LISTEN_HOST: listenHost,
    LISTEN_PORT: listenPort,
    NAVER_AUTO_MODE: naverAutoMode,
    NAVER_AUTO_CATEGORIES: naverAutoCategories,
    NAVER_AUTO_DAILY_POSTS: naverAutoDailyPosts,
    NAVER_AUTO_TRENDS_TIME: naverAutoTrendsTime,
    NAVER_AUTO_IMAGE_GENERATION: naverAutoImageGeneration,
    NAVER_AUTO_EXTERNAL_REFERENCE: naverAutoExternalReference,
    NAVER_AUTO_NOTIFY_ENABLED: naverAutoNotifyEnabled,
    NAVER_AUTO_VARIATION_INCLUDE_NEW: naverAutoVariationIncludeNew,
    NAVER_AUTO_VARIATION_INCLUDE_DASH: naverAutoVariationIncludeDash,
    NAVER_AUTO_VARIATION_INCLUDE_NUMBER: naverAutoVariationIncludeNumber,
    NAVER_AUTO_VARIATION_TYPE: naverAutoVariationType,
    NAVER_AUTO_VARIATION_NUMBER: naverAutoVariationNumber,
    NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS: naverAutoKeywordReuseGapDays,
    NAVER_SHOPPING_AUTO_MODE: naverShoppingAutoMode,
    NAVER_SHOPPING_AUTO_DAILY_POSTS: naverShoppingAutoDailyPosts,
    NAVER_SHOPPING_AUTO_TIME: naverShoppingAutoTime,
    NAVER_SHOPPING_AUTO_NOTIFY_ENABLED: naverShoppingAutoNotifyEnabled,
    // legacy alias (내부 호환)
    AUTO_MODE: naverAutoMode,
    AUTO_INCLUDE_CATEGORIES: naverAutoCategories,
    AUTO_CATEGORIES: naverAutoCategories,
    AUTO_DAILY_BLOG_CAP: naverAutoDailyPosts,
    AUTO_IMAGE_GENERATION: naverAutoImageGeneration,
    AUTO_USE_EXTERNAL_REF: naverAutoExternalReference,
    AUTO_TRENDS_VARIATION_INCLUDE_NEW: naverAutoVariationIncludeNew,
    AUTO_TRENDS_VARIATION_INCLUDE_DASH: naverAutoVariationIncludeDash,
    AUTO_TRENDS_VARIATION_INCLUDE_NUMBER: naverAutoVariationIncludeNumber,
    AUTO_TRENDS_MIN_VARIATION: naverAutoVariationNumber,
    AUTO_KEYWORD_REUSE_GAP_DAYS: naverAutoKeywordReuseGapDays,
    AUTO_SHOPPING_ENABLED: naverShoppingAutoMode,
    AUTO_MAX_SHOPPING_PER_CYCLE: naverShoppingAutoDailyPosts,
    // 🆕 데이터 소스 (GOOGLE 고정)
    DATA_SOURCE: 'GOOGLE',

    // 🆕 시트 이름 (내부 고정값)
    GOOGLE_KEYWORDS_SHEET: 'keywords',
    GOOGLE_TOPICS_SHEET: 'topics',
    GOOGLE_TRENDS_SHEET: 'trends',
    GOOGLE_SHOPPING_SHEET: 'shopping',

    // 💡 데이터 가공 섹션 (명시적 선언)
    IMAGE_STYLE: imageStyle,
    GEMINI_TEXT_ENDPOINT: TEXT_ENDPOINT,
    GEMINI_IMAGE_ENDPOINT: IMAGE_ENDPOINT,
    // VIEWPORT_* 설정은 폐기됨. 발행 안정성을 위해 core에서 안전 뷰포트 정책을 사용한다.

    // 4. 경로 상수 (호환성 유지)
    PATHS: PATHS,
    APP_ROOT_DIR: activeAppRoot,
    CONFIG_DIR: activeConfigDir,
    AUTH_FILE_PATH: resolvedAuthPath,
    LICENSE_KEY_FILE_PATH: resolvedLicenseKeyPath,
    BLOG_PROMPT_PATH: blogPromptPath,
    SHOPPING_PROMPT_PATH: shoppingPromptPath,
    WORKSPACE_DIR: resolvedWorkspaceDir,
    CONFIG_SOURCE_PATH: configSourcePath,
    CONFIG_SOURCE_TYPE: configSourceType,
    CONFIG_READY: configReady,
    CONFIG_ERROR_MESSAGE: configErrorMessage,
    resolveRuntimePath: (targetPath, opts = {}) => resolveRuntimePath(targetPath, opts),

    // 5. 확정된 동적 데이터
    WRITE_URL: `https://blog.naver.com/${process.env.NAVER_ID || userConfig.NAVER_ID}/postwrite`,
    TYPING_SPEED: typingMode,
    TYPING: typingDelay,
    CLOSE_DELAY: closeDelay,

    // 브라우저 채널 처리
    BROWSER_CHANNEL: (userConfig.BROWSER_CHANNEL === 'auto') ? undefined : userConfig.BROWSER_CHANNEL
};
