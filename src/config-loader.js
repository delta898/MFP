const fs = require('fs');
const path = require('path');
const Constants = require('./constants');
const { APP_VERSION } = Constants;

// 💡 [경로 기준점 고도화]
// 1. 실행 파일의 실제 위치 파악
const EXEC_PATH = process.execPath || '';
// 🚀 [IS_PACKAGED Check] 더 정밀하게 패키징 여부를 확인합니다.
const IS_PACKAGED = (() => {
    // 1. pkg로 빌드된 경우
    if (process.pkg) return true;
    // 2. macOS .app 번들인 경우
    if (process.platform === 'darwin' && EXEC_PATH.includes('.app/Contents/MacOS/')) return true;
    // 3. 실행 파일이 'node'가 아닌 경우 (단, 개발 환경의 node_modules는 제외)
    const execName = path.basename(EXEC_PATH).toLowerCase();
    const isNode = execName === 'node' || execName === 'node.exe';
    if (!isNode && !EXEC_PATH.includes('node_modules')) return true;
    return false;
})();

const ACTIVE_ROOT = (() => {
    // A. macOS .app 번들 내부에서 실행되는 경우
    if (process.platform === 'darwin' && EXEC_PATH.includes('.app/Contents/MacOS/')) {
        return path.resolve(path.dirname(EXEC_PATH), '../../..');
    }
    // B. 패키징된 바이너리인 경우 (실행 파일 위치 기준)
    if (IS_PACKAGED) {
        return path.dirname(EXEC_PATH);
    }
    // C. 개발 환경 (node src/main.js 등 - 현재 작업 디렉토리 기준)
    return process.cwd();
})();

// 🚀 [Portable First] 프로그램 폴더 내의 config/ 폴더가 존재하면 포터블 모드로 간주
const LOCAL_CONFIG_DIR = path.join(ACTIVE_ROOT, 'config');
const HAS_LOCAL_CONFIG = fs.existsSync(LOCAL_CONFIG_DIR);

// GUI 모드일 때 권한이 없는 특수 상황을 대비해 userData를 남겨두지만, 
// 포터블 모드(로컬 config 존재)일 경우 ACTIVE_ROOT를 최우선으로 사용합니다.
const BLOG_GENIUS_USER_DATA = process.env.BLOG_GENIUS_USER_DATA;
const ROOT_DIR = (HAS_LOCAL_CONFIG || !BLOG_GENIUS_USER_DATA) ? ACTIVE_ROOT : BLOG_GENIUS_USER_DATA;
const EXEC_DIR = ACTIVE_ROOT;

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
// 🚀 [App Bundle Support] 앱 번들(ASAR) 내부의 원본 경로
const BUNDLE_DIR = path.join(__dirname, '..');

const PATHS = {
    // 실제 설정 파일 (쓰기 가능한 ROOT_DIR 또는 EXEC_DIR 우선)
    configJson: path.join(ROOT_DIR, 'config', 'config.json'),
    configJsonFromExec: path.join(EXEC_DIR, 'config', 'config.json'),

    // 샘플 파일 (앱 번들 내부 ASAR 경로 추가)
    configJsonSample: path.join(ROOT_DIR, 'config', 'config.json.sample'),
    configJsonSampleFromExec: path.join(EXEC_DIR, 'config', 'config.json.sample'),
    configJsonSampleFromBundle: path.join(BUNDLE_DIR, 'config', 'config.json.sample'),

    licenseKeyFile: path.join(ROOT_DIR, 'config', 'license.key'),
    licenseKeyFileFromExec: path.join(EXEC_DIR, 'config', 'license.key'),
    auth: path.join(ROOT_DIR, 'config', 'auth.json'),
    blogPromptOverride: path.join(ROOT_DIR, 'src', 'config', 'blog_prompt.md'),
    blogPromptOverrideFromExec: path.join(EXEC_DIR, 'src', 'config', 'blog_prompt.md'),
    shoppingPromptOverride: path.join(ROOT_DIR, 'src', 'config', 'shopping_prompt.md'),
    shoppingPromptOverrideFromExec: path.join(EXEC_DIR, 'src', 'config', 'shopping_prompt.md'),
    defaultBlogPrompt: path.join(BUNDLE_DIR, 'src', 'config', 'blog_prompt.md'),
    defaultShoppingPrompt: path.join(BUNDLE_DIR, 'src', 'config', 'shopping_prompt.md'),
    workspace: path.join(ROOT_DIR, 'workspace')
};

function ensureConfigJsonFromSample() {
    const pairs = [
        { config: PATHS.configJson, samples: [PATHS.configJsonSample, PATHS.configJsonSampleFromBundle] },
        { config: PATHS.configJsonFromExec, samples: [PATHS.configJsonSampleFromExec] }
    ];

    for (const pair of pairs) {
        try {
            if (fs.existsSync(pair.config)) return pair.config;

            // 사용 가능한 샘플 찾기
            const samplePath = pair.samples.find(p => fs.existsSync(p));
            if (!samplePath) continue;

            fs.mkdirSync(path.dirname(pair.config), { recursive: true });
            fs.copyFileSync(samplePath, pair.config);
            console.info(`✅ config.json 자동 생성 완료: ${pair.config} (from ${samplePath})`);
            return pair.config;
        } catch (e) {
            console.warn(`⚠️ config.json 자동 생성 실패: ${pair.config} (${e.message})`);
        }
    }
    return '';
}

function loadUserConfig() {
    // 💡 [JSON First] config.json이 있으면 최우선으로 사용, 없으면 샘플로부터 생성 시도
    ensureConfigJsonFromSample();

    const jsonPath = PATHS.configJson;
    if (fs.existsSync(jsonPath)) {
        try {
            const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            return {
                ...json,
                __CONFIG_SOURCE_PATH: jsonPath,
                __CONFIG_SOURCE_TYPE: 'json',
                __CONFIG_READY: true,
                __CONFIG_ERROR_MESSAGE: ''
            };
        } catch (e) {
            console.error(`❌ config.json 파싱 실패: ${e.message}`);
        }
    }

    // 샘플 파일 로드 (최상위 fallback)
    return {
        ...DEFAULT_STRUCTURED_CONFIG,
        __CONFIG_SOURCE_PATH: jsonPath,
        __CONFIG_SOURCE_TYPE: 'generated',
        __CONFIG_READY: false,
        __CONFIG_ERROR_MESSAGE: '설정 파일이 없습니다. 기본값으로 시작합니다.'
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

// 사용자 설정 로드
const structuredConfig = loadUserConfig();
const configSourcePath = structuredConfig.__CONFIG_SOURCE_PATH;
const configSourceType = structuredConfig.__CONFIG_SOURCE_TYPE;
const configReady = structuredConfig.__CONFIG_READY === true;
const configErrorMessage = String(structuredConfig.__CONFIG_ERROR_MESSAGE || '');

delete structuredConfig.__CONFIG_SOURCE_PATH;
delete structuredConfig.__CONFIG_SOURCE_TYPE;
delete structuredConfig.__CONFIG_READY;
delete structuredConfig.__CONFIG_ERROR_MESSAGE;

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

function decodeFileUriPath(raw) {
    const input = String(raw || '').trim();
    if (!/^file:\/\//i.test(input)) return input;
    try {
        const parsed = new URL(input);
        if (parsed.protocol !== 'file:') return input;
        const host = decodeURIComponent(parsed.hostname || '');
        let localPath = decodeURIComponent(parsed.pathname || '');
        if (host === '.') localPath = `.${localPath}`;
        else if (host && host !== 'localhost') localPath = `//${host}${localPath}`;
        if (process.platform === 'win32' && /^[\/\\][A-Za-z]:/.test(localPath)) localPath = localPath.slice(1);
        return localPath || input;
    } catch (e) {
        return input.replace(/^file:\/\//i, '');
    }
}

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
        candidates.push(path.resolve(BUNDLE_DIR, input));
    }

    if (!mustExist) return candidates[0] || '';
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch (e) { }
    }
    return candidates[0] || '';
}

// 💡 [환경변수 및 동적 경로 처리]
const googleAuthRaw = String(process.env.GOOGLE_AUTH_JSON || structuredConfig.essential.google_auth_json || '').trim();
const googleAuthPath = resolveRuntimePath(googleAuthRaw || './config/service_account.json', { mustExist: true });

const workspaceRaw = String(structuredConfig.essential.workspace_dir || '').trim();
const resolvedWorkspaceDir = workspaceRaw
    ? resolveRuntimePath(workspaceRaw)
    : path.join(activeAppRoot, 'workspace');

const resolvedAuthPath = path.join(activeConfigDir, 'auth.json');
const resolvedLicenseKeyPath = licenseKeyInfo.path || path.join(activeConfigDir, 'license.key');

const userSheetUrl = String(structuredConfig.essential.google_sheet_url || '').trim();
const resolvedSheetId = extractGoogleSheetId(userSheetUrl);
const resolvedSheetUrl = resolvedSheetId
    ? `https://docs.google.com/spreadsheets/d/${resolvedSheetId}`
    : userSheetUrl;

// 타이핑 속도 변환
const typingModeRaw = String(structuredConfig.platforms.naver.typing_speed || 'NORMAL').trim().toUpperCase();
const typingMode = Constants.TYPING_PRESETS[typingModeRaw] ? typingModeRaw : 'NORMAL';
const typingDelay = Constants.TYPING_PRESETS[typingMode];

// 💡 [최종 CONFIG 객체 구성]
const CONFIG = {
    ...structuredConfig, // 신규 계층 구조 전체 포함

    // 🔧 [Metadata]
    APP_VERSION,
    CONFIG_READY: configReady,
    CONFIG_SOURCE_PATH: configSourcePath,
    CONFIG_SOURCE_TYPE: configSourceType,
    CONFIG_ERROR_MESSAGE: configErrorMessage,
    ROOT_DIR: ROOT_DIR,

    // 🔧 [Essential Resolved]
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || structuredConfig.essential.gemini_api_key,
    GOOGLE_AUTH_JSON: googleAuthRaw,
    GOOGLE_AUTH_JSON_PATH: googleAuthPath,
    GOOGLE_SHEET_URL: resolvedSheetUrl,
    GOOGLE_SHEET_ID: resolvedSheetId,
    LISTEN_HOST: structuredConfig.essential.listen_host || '127.0.0.1',
    LISTEN_PORT: structuredConfig.essential.listen_port || 4577,
    WORKSPACE_DIR: resolvedWorkspaceDir,
    LICENSE_KEY: process.env.LICENSE_KEY || licenseKeyInfo.value || '',

    // 🔧 [Flat Keys for Backward Compatibility]
    NAVER_ID: process.env.NAVER_ID || structuredConfig.platforms.naver.user_id,
    NAVER_PASSWORD: process.env.NAVER_PASSWORD || structuredConfig.platforms.naver.password || '', // 비밀번호 필드는 스키마에 명시 안되었으나 호환성 위해 유지
    WORDPRESS_URL: structuredConfig.platforms.wordpress.url,
    WORDPRESS_USER_ID: structuredConfig.platforms.wordpress.user_id,
    WORDPRESS_APP_PASSWORD: structuredConfig.platforms.wordpress.app_password,
    AUTH_FILE_PATH: resolvedAuthPath,
    APP_ROOT_DIR: activeAppRoot,
    CONFIG_DIR: activeConfigDir,

    // 🔧 [More Flat Keys for Backward Compatibility]
    TEXT_MODEL: structuredConfig.ai_settings.text_model,
    IMAGE_MODEL: structuredConfig.ai_settings.image_model,
    IMAGE_STYLE: structuredConfig.ai_settings.image_style,
    FTC_DISCLOSURE_IMAGE_URL: structuredConfig.platforms.naver.assets.ftc_image,
    SHOPPING_CTA_IMAGE_URL1: structuredConfig.platforms.naver.assets.cta_images?.[0] || '',
    SHOPPING_CTA_IMAGE_URL2: structuredConfig.platforms.naver.assets.cta_images?.[1] || '',
    SHOPPING_CTA_IMAGE_URL3: structuredConfig.platforms.naver.assets.cta_images?.[2] || '',

    // Automation - Trends
    COLLECT_TRENDS_ENABLED: structuredConfig.automation.collect?.blog?.trends?.enabled,
    COLLECT_TRENDS_TIME: structuredConfig.automation.collect?.blog?.trends?.time,
    COLLECT_TRENDS_CATEGORIES: structuredConfig.automation.collect?.blog?.trends?.categories,
    COLLECT_TRENDS_WP_CATEGORY: structuredConfig.automation.collect?.blog?.trends?.wpCategory,
    COLLECT_TRENDS_REUSE_GAP_DAYS: structuredConfig.automation.collect?.blog?.trends?.reuse_gap_days,
    COLLECT_TRENDS_FILTER_MIN_INCR: structuredConfig.automation.collect?.blog?.trends?.filters?.min_increase,
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: structuredConfig.automation.collect?.blog?.trends?.filters?.include_new,
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: structuredConfig.automation.collect?.blog?.trends?.filters?.include_dash,
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: structuredConfig.automation.collect?.blog?.trends?.filters?.include_number,
    COLLECT_TRENDS_FILTER_TYPE: structuredConfig.automation.collect?.blog?.trends?.filters?.type,
    COLLECT_TRENDS_FILTER_TOP_N: structuredConfig.automation.collect?.blog?.trends?.filters?.top_n,

    // Automation - RSS
    COLLECT_RSS_ENABLED: structuredConfig.automation.collect?.blog?.rss?.enabled,
    COLLECT_RSS_CONFIGS: structuredConfig.automation.collect?.blog?.rss?.feeds,

    // Automation - Publish (Blog)
    PUBLISH_AUTO_ENABLED: structuredConfig.automation.publish.blog.enabled,
    PUBLISH_AUTO_INTERVAL_MIN: structuredConfig.automation.publish.blog.interval_min,
    PUBLISH_AUTO_BATCH_SIZE: structuredConfig.automation.publish.blog.batch_size,
    PUBLISH_AUTO_TARGET_CHANNELS: Array.isArray(structuredConfig.automation.publish.blog.target_channels) ? structuredConfig.automation.publish.blog.target_channels : [structuredConfig.automation.publish.blog.target_channels || 'naver'],
    PUBLISH_AUTO_HEADLESS: structuredConfig.automation.publish.blog.headless,
    PUBLISH_AUTO_NOTIFY_ENABLED: structuredConfig.automation.publish.blog.notify_enabled,
    PUBLISH_AUTO_START_TIME: structuredConfig.automation.publish.blog.start_time,
    PUBLISH_AUTO_END_TIME: structuredConfig.automation.publish.blog.end_time,

    // Automation - Publish (Shopping)
    SHOPPING_PUBLISH_AUTO_ENABLED: structuredConfig.automation.publish.shopping.enabled,
    SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: structuredConfig.automation.publish.shopping.interval_min,
    SHOPPING_PUBLISH_AUTO_BATCH_SIZE: structuredConfig.automation.publish.shopping.batch_size,
    SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.isArray(structuredConfig.automation.publish.shopping.target_channels) ? structuredConfig.automation.publish.shopping.target_channels : [structuredConfig.automation.publish.shopping.target_channels || 'naver'],
    SHOPPING_PUBLISH_AUTO_HEADLESS: structuredConfig.automation.publish.shopping.headless,
    SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: structuredConfig.automation.publish.shopping.notify_enabled,
    SHOPPING_AUTO_TIME: structuredConfig.automation.publish.shopping.scheduled_time,

    // System & Constants
    UPDATE_CHANNEL: structuredConfig.system.update_channel,
    HEADLESS: structuredConfig.automation.publish.blog.headless, // Global fallback
    CLOSE_DELAY_SECONDS: structuredConfig.platforms.naver.close_delay_seconds,
    WAIT_LOAD: Constants.WAIT.LOAD,
    WAIT_UPLOAD: Constants.WAIT.UPLOAD,
    LICENSE_CHK_URL: internalSecrets.LICENSE_CHK_URL,
    LICENSE_CHK_KEY: internalSecrets.LICENSE_CHK_KEY,
    BLOG_PROMPT_PATH: resolveRuntimePath('src/config/blog_prompt.md', { mustExist: true }),
    SHOPPING_PROMPT_PATH: resolveRuntimePath('src/config/shopping_prompt.md', { mustExist: true }),

    // 🔧 [Paths]
    PATHS: {
        ...PATHS,
        auth: resolvedAuthPath,
        workspace: resolvedWorkspaceDir,
        appRoot: activeAppRoot,
        configDir: activeConfigDir,
        licenseKeyFile: resolvedLicenseKeyPath
    },

    // 🔧 [AI/Dynamic]
    GEMINI_TEXT_ENDPOINT: `https://generativelanguage.googleapis.com/v1beta/models/${structuredConfig.ai_settings.text_model || 'gemini-3.1-flash-lite-preview'}:generateContent`,
    GEMINI_IMAGE_ENDPOINT: `https://generativelanguage.googleapis.com/v1beta/models/${structuredConfig.ai_settings.image_model || 'gemini-2.5-flash-image'}:generateContent`,
    TYPING_SPEED: typingMode,
    TYPING: typingDelay,
    CLOSE_DELAY: (structuredConfig.platforms.naver.close_delay_seconds || 10) * 1000,
    BROWSER_CHANNEL: structuredConfig.platforms.naver.browser_channel === 'auto' ? undefined : structuredConfig.platforms.naver.browser_channel,

    // 🔧 [System]
    UPDATE_MIRROR_REPO: structuredConfig.system.update_mirror_repo || Constants.DEFAULT_UPDATE_MIRROR_REPO,
    NOTIFY_TELEGRAM_ENABLED: structuredConfig.notification?.telegram?.enabled || false,
    NOTIFY_TELEGRAM_BOT_TOKEN: structuredConfig.notification?.telegram?.bot_token || '',
    NOTIFY_TELEGRAM_CHAT_ID: structuredConfig.notification?.telegram?.chat_id || '',
    NOTIFY_BITLY_TOKEN: structuredConfig.notification?.telegram?.bitly_token || '',

    // 🔧 [Utility]
    resolveRuntimePath: (targetPath, opts = {}) => resolveRuntimePath(targetPath, opts),

    // 🆕 필수 설정 완료 여부 (UX 개선용)
    get CONFIG_IS_ESSENTIAL_SET() {
        const apiKey = String(this.GEMINI_API_KEY || '').trim();
        const sheetId = String(this.GOOGLE_SHEET_ID || '').trim();
        const isPlaceholder = (v) => !v || v.includes('본인의_') || v.includes('your_') || v.startsWith('xxxxxxx');

        const isCoreSet = apiKey && !isPlaceholder(apiKey) && sheetId && !isPlaceholder(sheetId);
        const isPlatformSet = this.CONFIG_IS_NAVER_SET || this.CONFIG_IS_WP_SET;

        return Boolean(isCoreSet && isPlatformSet);
    },

    // 🆕 네이버 설정 완료 여부
    get CONFIG_IS_NAVER_SET() {
        const naverId = String(this.NAVER_ID || '').trim();
        const isPlaceholder = (v) => !v || v.includes('본인의_') || v.includes('your_') || v.startsWith('xxxxxxx');
        return Boolean(naverId && !isPlaceholder(naverId));
    },

    // 🆕 워드프레스 설정 완료 여부
    get CONFIG_IS_WP_SET() {
        const wpUrl = String(this.WORDPRESS_URL || '').trim();
        const wpUser = String(this.WORDPRESS_USER_ID || '').trim();
        const wpPass = String(this.WORDPRESS_APP_PASSWORD || '').trim();
        const isPlaceholder = (v) => !v || v.includes('본인의_') || v.includes('your_') || v.startsWith('xxxxxxx');
        return Boolean(wpUrl && !isPlaceholder(wpUrl) &&
            wpUser && !isPlaceholder(wpUser) &&
            wpPass && !isPlaceholder(wpPass));
    }
};

module.exports = CONFIG;
