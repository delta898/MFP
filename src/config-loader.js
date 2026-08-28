const fs = require('fs');
const path = require('path');
const Constants = require('./constants');
const { ensureRuntimeRemoteMcpConfig } = require('./mcp/remote-config');
const {
    getAiModelCatalog,
    resolveAiModelConfig,
    resolveChatModelSettings,
    resolveStoredModelProfiles
} = require('./ai-model-config');
const { applyRemoteCatalog } = require('./ai/catalog-registry');
const { resolveContentWritingPreferences } = require('./content/writing-preferences');
const {
    createWritingProfileRepository
} = require('./content/writing-profile-repository');
const {
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA
} = require('./content/writing-profile');
const { normalizeSnsAiMode } = require('./social/sns-ai-policy');
const {
    resolveRuntimeEnvironmentProfile
} = require('./environment/runtime-profile');
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
    // C. 개발 환경 (node src/main.js UI launcher 등 - 현재 작업 디렉토리 기준)
    return process.cwd();
})();

// 🚀 [Portable First] 프로그램 폴더 내의 config/ 폴더가 존재하면 포터블 모드로 간주
const LOCAL_CONFIG_DIR = path.join(ACTIVE_ROOT, 'config');
const HAS_LOCAL_CONFIG = fs.existsSync(LOCAL_CONFIG_DIR);

// GUI 모드일 때 권한이 없는 특수 상황을 대비해 userData를 남겨두지만, 
// 포터블 모드(로컬 config 존재)일 경우 ACTIVE_ROOT를 최우선으로 사용합니다.
const BLOG_GENIUS_USER_DATA = process.env.BLOG_GENIUS_USER_DATA;
// 개발 런처는 Electron 실행 파일(node_modules/electron)을 기준으로 설정 경로가
// 잘못 결정되지 않도록 프로젝트 루트를 명시한다. 배포본은 이 값을 주입하지 않아
// 기존 portable config / Electron userData 선택 규칙을 그대로 따른다.
const EXPLICIT_RUNTIME_ROOT = String(process.env.BLOGGENIUS_RUNTIME_ROOT || '').trim();
const ROOT_DIR = EXPLICIT_RUNTIME_ROOT
    ? path.resolve(EXPLICIT_RUNTIME_ROOT)
    : ((HAS_LOCAL_CONFIG || !BLOG_GENIUS_USER_DATA) ? ACTIVE_ROOT : BLOG_GENIUS_USER_DATA);
const EXEC_DIR = ACTIVE_ROOT;

// =========================================================
// 1. 🔒 [비밀 키 로딩] 
// =========================================================
let internalSecrets = {};
try {
    // Release build 시 환경별 public 연결값만 담아 생성되는 파일이다.
    internalSecrets = require('./config/secret');
} catch (_error) {
    internalSecrets = {};
}

const runtimeEnvironmentProfile = resolveRuntimeEnvironmentProfile({
    env: process.env,
    buildConfig: internalSecrets
});

const LICENSE_FILE_NAMES = Object.freeze({
    local: 'license.local.key',
    development: 'license.development.key',
    production: 'license.key'
});
const activeLicenseFileName = LICENSE_FILE_NAMES[runtimeEnvironmentProfile.environment] || '';

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

    licenseKeyFile: activeLicenseFileName
        ? path.join(ROOT_DIR, 'config', activeLicenseFileName)
        : '',
    licenseKeyFileFromExec: activeLicenseFileName
        ? path.join(EXEC_DIR, 'config', activeLicenseFileName)
        : '',
    auth: path.join(ROOT_DIR, 'config', 'naver_auth.json'),
    blogPromptOverride: path.join(ROOT_DIR, 'src', 'config', 'blog_prompt.md'),
    blogPromptOverrideFromExec: path.join(EXEC_DIR, 'src', 'config', 'blog_prompt.md'),
    shoppingPromptOverride: path.join(ROOT_DIR, 'src', 'config', 'shopping_prompt.md'),
    shoppingPromptOverrideFromExec: path.join(EXEC_DIR, 'src', 'config', 'shopping_prompt.md'),
    defaultBlogPrompt: path.join(BUNDLE_DIR, 'src', 'config', 'blog_prompt.md'),
    defaultShoppingPrompt: path.join(BUNDLE_DIR, 'src', 'config', 'shopping_prompt.md'),
    workspace: path.join(ROOT_DIR, 'workspace')
};

function readDefaultStructuredConfig() {
    const sampleCandidates = [
        PATHS.configJsonSample,
        PATHS.configJsonSampleFromExec,
        PATHS.configJsonSampleFromBundle
    ];

    for (const samplePath of sampleCandidates) {
        try {
            if (!fs.existsSync(samplePath)) continue;
            return JSON.parse(fs.readFileSync(samplePath, 'utf8'));
        } catch (_ignore) { }
    }
    return {};
}

function mergeStructuredDefaults(target, defaults) {
    if (Array.isArray(defaults)) {
        return Array.isArray(target) ? target : defaults.slice();
    }

    if (!defaults || typeof defaults !== 'object') {
        return target === undefined ? defaults : target;
    }

    const result = target && typeof target === 'object' && !Array.isArray(target)
        ? { ...target }
        : {};

    Object.keys(defaults).forEach((key) => {
        result[key] = mergeStructuredDefaults(result[key], defaults[key]);
    });

    return result;
}

const DEFAULT_STRUCTURED_CONFIG = readDefaultStructuredConfig();

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
                ...mergeStructuredDefaults(json, DEFAULT_STRUCTURED_CONFIG),
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
    const candidates = [...new Set([
        PATHS.licenseKeyFile,
        PATHS.licenseKeyFileFromExec
    ].filter(Boolean))];
    const matchedPath = candidates.find((filePath) => fs.existsSync(filePath));
    if (!matchedPath) {
        return { value: '', path: PATHS.licenseKeyFile || '' };
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

try {
    const cachedCatalogPath = path.join(ROOT_DIR, 'data', 'cache', 'ai-model-catalog.json');
    if (fs.existsSync(cachedCatalogPath)) {
        const cachedCatalog = JSON.parse(fs.readFileSync(cachedCatalogPath, 'utf8'));
        applyRemoteCatalog(cachedCatalog, { appVersion: APP_VERSION });
    }
} catch (_error) {
    // Bundled catalog remains the startup fallback when the cache is invalid.
}

const aiPresets = getAiModelCatalog();
const resolvedTextModelConfig = resolveAiModelConfig(structuredConfig, 'text');
const resolvedImageModelConfig = resolveAiModelConfig(structuredConfig, 'image');
const resolvedChatModelSettings = resolveChatModelSettings(structuredConfig);
const resolvedAiModelProfiles = resolveStoredModelProfiles(structuredConfig, {
    presets: aiPresets,
    textSelection: resolvedTextModelConfig,
    imageSelection: resolvedImageModelConfig,
    chatSelection: resolvedChatModelSettings.selection
});
const resolvedContentWritingPreferences = resolveContentWritingPreferences(structuredConfig.content);
const legacyContentWritingStrategy = resolvedContentWritingPreferences.strategy;
const geminiTextModelCode = resolvedTextModelConfig.transport === 'gemini_generate_content'
    ? resolvedTextModelConfig.code
    : '';
const geminiImageModelCode = resolvedImageModelConfig.transport === 'gemini_generate_content'
    ? resolvedImageModelConfig.code
    : '';

const licenseKeyInfo = loadLicenseKey();

const activeConfigDir = (() => {
    if (configReady && configSourcePath) return path.dirname(configSourcePath);
    const execConfigDir = path.join(EXEC_DIR, 'config');
    if (fs.existsSync(execConfigDir)) return execConfigDir;
    return path.join(ROOT_DIR, 'config');
})();

const writingProfilePath = path.join(activeConfigDir, 'writing_profile.json');
const writingProfileRepository = createWritingProfileRepository({
    fs,
    path,
    filePath: writingProfilePath,
    legacyContentConfig: structuredConfig.content
});
const writingProfileLoadResult = writingProfileRepository.read();
const resolvedContentWritingProfile = writingProfileLoadResult.effective_profile;
const resolvedContentWritingVoice = resolvedContentWritingProfile.common.voice;
const resolvedBlogWritingStrategy = resolvedContentWritingProfile.common.writing_strategy || legacyContentWritingStrategy;

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
const googleOauthTokensRaw = String(process.env.GOOGLE_OAUTH_TOKENS_JSON || structuredConfig.general?.google_oauth_tokens_json || '').trim();
const googleOauthTokensPath = resolveRuntimePath(googleOauthTokensRaw || './config/google_oauth_tokens.json', { mustExist: false });
const googleOauthClientId = String(
    process.env.GOOGLE_OAUTH_CLIENT_ID
    || internalSecrets.GOOGLE_OAUTH_CLIENT_ID
    || ''
).trim();
const googleOauthClientSecret = String(
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
    || internalSecrets.GOOGLE_OAUTH_CLIENT_SECRET
    || ''
).trim();

const workspaceRaw = String(structuredConfig.general?.workspace_dir || '').trim();
const resolvedWorkspaceDir = workspaceRaw
    ? resolveRuntimePath(workspaceRaw)
    : path.join(activeAppRoot, 'workspace');

const oldAuthPath = path.join(activeConfigDir, 'auth.json');
const resolvedAuthPath = path.join(activeConfigDir, 'naver_auth.json');

// [Migration] 기존 auth.json이 존재하고 naver_auth.json이 없을 경우 자동 이름 변경
if (fs.existsSync(oldAuthPath) && !fs.existsSync(resolvedAuthPath)) {
    try {
        fs.renameSync(oldAuthPath, resolvedAuthPath);
        // Logger는 나중에 세팅되므로 일단 console.log 사용
        console.log(`✅ [Migration] 성공적으로 auth.json을 naver_auth.json으로 마이그레이션했습니다.`);
    } catch (err) {
        console.error(`❌ [Migration] auth.json 이름 변경 실패: ${err.message}`);
    }
}

const resolvedLicenseKeyPath = licenseKeyInfo.path || (activeLicenseFileName
    ? path.join(activeConfigDir, activeLicenseFileName)
    : '');
const productionLicenseEnvironmentOverride = runtimeEnvironmentProfile.environment === 'production'
    ? String(process.env.LICENSE_KEY || '').trim()
    : '';

const userSheetUrl = String(structuredConfig.general?.google_sheet_url || '').trim();
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
    RUNTIME_ENVIRONMENT: runtimeEnvironmentProfile.environment,
    RUNTIME_ENVIRONMENT_STATUS: runtimeEnvironmentProfile.status,
    RUNTIME_ENVIRONMENT_PROFILE: runtimeEnvironmentProfile,
    SUPABASE_PUBLIC_CONFIG: Object.freeze({
        environment: runtimeEnvironmentProfile.environment,
        configured: runtimeEnvironmentProfile.configured,
        url: runtimeEnvironmentProfile.supabase.url,
        publishableKey: runtimeEnvironmentProfile.supabase.publishableKey,
        endpointHost: runtimeEnvironmentProfile.supabase.endpointHost
    }),

    // 🔧 [Essential Resolved]
    GOOGLE_OAUTH_CLIENT_ID: googleOauthClientId,
    GOOGLE_OAUTH_CLIENT_SECRET: googleOauthClientSecret,
    GOOGLE_OAUTH_TOKENS_JSON: googleOauthTokensRaw,
    GOOGLE_OAUTH_TOKENS_JSON_PATH: googleOauthTokensPath,
    GOOGLE_SHEET_URL: resolvedSheetUrl,
    GOOGLE_SHEET_ID: resolvedSheetId,
    LISTEN_HOST: structuredConfig.general?.listen_host || '127.0.0.1',
    LISTEN_PORT: structuredConfig.general?.listen_port || 4577,
    WORKSPACE_DIR: resolvedWorkspaceDir,
    LICENSE_KEY: productionLicenseEnvironmentOverride || licenseKeyInfo.value || '',
    LICENSE_KEY_FILE_PATH: resolvedLicenseKeyPath,
    LICENSE_KEY_USES_ENV_OVERRIDE: Boolean(productionLicenseEnvironmentOverride),

    // 🔧 [Flat Keys for Backward Compatibility]
    NAVER_ID: process.env.NAVER_ID || structuredConfig.platforms.naver.user_id,
    NAVER_PASSWORD: process.env.NAVER_PASSWORD || structuredConfig.platforms.naver.password || '', // 비밀번호 필드는 스키마에 명시 안되었으나 호환성 위해 유지
    WORDPRESS_URL: structuredConfig.platforms.wordpress.url,
    WORDPRESS_USER_ID: structuredConfig.platforms.wordpress.user_id,
    WORDPRESS_APP_PASSWORD: structuredConfig.platforms.wordpress.app_password,
    BLOG_WRITING_MODE: resolvedContentWritingVoice.writing_mode,
    BLOG_SPEECH_LEVEL: resolvedContentWritingVoice.speech_level,
    BLOG_WRITING_STRATEGY: resolvedBlogWritingStrategy,
    CONTENT_WRITING_MODE: resolvedContentWritingVoice.writing_mode,
    CONTENT_SPEECH_LEVEL: resolvedContentWritingVoice.speech_level,
    CONTENT_WRITING_STRATEGY: resolvedBlogWritingStrategy,
    CONTENT_WRITING_PROFILE: resolvedContentWritingProfile,
    CONTENT_WRITING_PROFILE_SOURCE: writingProfileLoadResult.source,
    CONTENT_WRITING_PROFILE_WARNINGS: writingProfileLoadResult.warnings,
    CONTENT_WRITING_PROFILE_METADATA: DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    WRITING_PROFILE_PATH: writingProfilePath,
    AUTH_FILE_PATH: resolvedAuthPath,
    APP_ROOT_DIR: activeAppRoot,
    CONFIG_DIR: activeConfigDir,

    // 🔧 [More Flat Keys for Backward Compatibility]
    TEXT_MODEL: resolvedTextModelConfig.code,
    IMAGE_MODEL: resolvedImageModelConfig.code,
    TEXT_MODEL_CONFIG: resolvedTextModelConfig,
    IMAGE_MODEL_CONFIG: resolvedImageModelConfig,
    AI_MODEL_PROFILES: resolvedAiModelProfiles,
    AI_PRESETS: aiPresets,
    TEXT_MODEL_NAME: resolvedTextModelConfig.name,
    TEXT_MODEL_PROVIDER: resolvedTextModelConfig.provider,
    TEXT_MODEL_BASE_URL: resolvedTextModelConfig.base_url,
    TEXT_MODEL_API_KEY: resolvedTextModelConfig.api_key,
    IMAGE_MODEL_NAME: resolvedImageModelConfig.name,
    IMAGE_MODEL_PROVIDER: resolvedImageModelConfig.provider,
    IMAGE_MODEL_BASE_URL: resolvedImageModelConfig.base_url,
    IMAGE_MODEL_API_KEY: resolvedImageModelConfig.api_key,
    IMAGE_STYLE: structuredConfig.ai_settings.image_style,
    FTC_DISCLOSURE_IMAGE_URL: structuredConfig.platforms.naver.assets.ftc_image,
    SHOPPING_CTA_IMAGE_URL1: structuredConfig.platforms.naver.assets.cta_images?.[0] || '',
    SHOPPING_CTA_IMAGE_URL2: structuredConfig.platforms.naver.assets.cta_images?.[1] || '',
    SHOPPING_CTA_IMAGE_URL3: structuredConfig.platforms.naver.assets.cta_images?.[2] || '',

    // Automation - Trends
    COLLECT_TRENDS_ENABLED: structuredConfig.automation.collect?.blog?.trends?.enabled,
    COLLECT_TRENDS_TIME: structuredConfig.automation.collect?.blog?.trends?.time,
    COLLECT_TRENDS_CATEGORIES: structuredConfig.automation.collect?.blog?.trends?.categories,
    COLLECT_TRENDS_NAVER_CATEGORY: structuredConfig.automation.collect?.blog?.trends?.naver_category,
    COLLECT_TRENDS_WP_CATEGORY: structuredConfig.automation.collect?.blog?.trends?.wordpress_category,
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

    // Buffer SNS Distribution
    BUFFER_API_KEY: process.env.BUFFER_API_KEY || structuredConfig.integrations?.buffer?.api_key || '',
    BUFFER_ORGANIZATION_ID: structuredConfig.integrations?.buffer?.organization_id || '',
    BUFFER_CHANNELS: Array.isArray(structuredConfig.integrations?.buffer?.channels)
        ? structuredConfig.integrations.buffer.channels
        : [],
    BUFFER_HELP_URL: structuredConfig.integrations?.buffer?.help_url || '',

    SNS_PUBLISH_ENABLED: structuredConfig.automation.publish?.social?.enabled === true,
    SNS_PUBLISH_INTERVAL_MIN: Math.max(10, Number(structuredConfig.automation.publish?.social?.interval_min) || 10),
    SNS_AI_MODE: normalizeSnsAiMode(
        structuredConfig.automation.publish?.social?.ai_mode
    ),
    SNS_SHEET_NAME: 'SNS',
    SNS_SOURCE_BLOGS: (() => {
        const configured = structuredConfig.automation.publish?.social?.source_blogs;
        const source = Array.isArray(configured) ? configured : ['naver', 'wordpress'];
        return [...new Set(source.map((item) => String(item || '').trim().toLowerCase()))]
            .filter((item) => item === 'naver' || item === 'wordpress');
    })(),

    // Publish
    IMAGE_OPTIMIZATION_ENABLED: structuredConfig.publish?.image_optimization_enabled !== false,

    // Automation - Publish (Blog)
    PUBLISH_AUTO_ENABLED: structuredConfig.automation.publish.blog.enabled,
    PUBLISH_AUTO_INTERVAL_MIN: structuredConfig.automation.publish.blog.interval_min,
    PUBLISH_AUTO_BATCH_SIZE: structuredConfig.automation.publish.blog.batch_size,
    PUBLISH_AUTO_POST_STATUS: structuredConfig.automation.publish.blog.post_status === 'draft' ? 'draft' : 'publish',
    PUBLISH_AUTO_TARGET_CHANNELS: Array.isArray(structuredConfig.automation.publish.blog.target_channels) ? structuredConfig.automation.publish.blog.target_channels : [structuredConfig.automation.publish.blog.target_channels || 'naver'],
    PUBLISH_AUTO_HEADLESS: structuredConfig.automation.publish.blog.headless,
    PUBLISH_AUTO_NOTIFY_ENABLED: structuredConfig.automation.publish.blog.notify_enabled,
    PUBLISH_AUTO_START_TIME: structuredConfig.automation.publish.blog.start_time,
    PUBLISH_AUTO_END_TIME: structuredConfig.automation.publish.blog.end_time,
    PUBLISH_AUTO_IMAGE_MODE: structuredConfig.automation.publish.blog.image_mode || 'generate',

    // Automation - Publish (Shopping)
    SHOPPING_PUBLISH_AUTO_ENABLED: structuredConfig.automation.publish.shopping.enabled,
    SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: structuredConfig.automation.publish.shopping.interval_min,
    SHOPPING_PUBLISH_AUTO_BATCH_SIZE: structuredConfig.automation.publish.shopping.batch_size,
    SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.isArray(structuredConfig.automation.publish.shopping.target_channels) ? structuredConfig.automation.publish.shopping.target_channels : [structuredConfig.automation.publish.shopping.target_channels || 'naver'],
    SHOPPING_PUBLISH_AUTO_HEADLESS: structuredConfig.automation.publish.shopping.headless,
    SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: structuredConfig.automation.publish.shopping.notify_enabled,
    SHOPPING_PUBLISH_AUTO_START_TIME: structuredConfig.automation.publish.shopping.start_time || '00:00',
    SHOPPING_PUBLISH_AUTO_END_TIME: structuredConfig.automation.publish.shopping.end_time || '23:59',
    SHOPPING_AUTO_TIME: structuredConfig.automation.publish.shopping.scheduled_time
        || structuredConfig.automation.publish.shopping.time,

    // System & Constants
    UPDATE_CHANNEL: structuredConfig.system.update_channel,
    HEADLESS: structuredConfig.automation.publish.blog.headless, // Global fallback
    CLOSE_DELAY_SECONDS: structuredConfig.platforms.naver.close_delay_seconds,
    WAIT_LOAD: Constants.WAIT.LOAD,
    WAIT_UPLOAD: Constants.WAIT.UPLOAD,
    // 기존 내부 호출 경계를 위한 별칭. 값은 Environment Resolver에서만 공급한다.
    LICENSE_CHK_URL: runtimeEnvironmentProfile.supabase.url,
    LICENSE_CHK_KEY: runtimeEnvironmentProfile.supabase.publishableKey,
    BLOG_PROMPT_CONTRACT_PATH: resolveRuntimePath('src/config/blog_prompt_contract.md', { mustExist: true }),
    BLOG_PROMPT_COMMON_PATH: resolveRuntimePath('src/config/blog_prompt.md', { mustExist: true }),
    BLOG_PROMPT_SEARCH_PATH: resolveRuntimePath('src/config/blog_prompt_search.md', { mustExist: true }),
    BLOG_PROMPT_DISCOVERY_PATH: resolveRuntimePath('src/config/blog_prompt_discovery.md', { mustExist: true }),
    // 이전 내부 참조를 위한 공통 프롬프트 별칭
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
    GEMINI_TEXT_ENDPOINT: geminiTextModelCode
        ? `https://generativelanguage.googleapis.com/v1beta/models/${geminiTextModelCode}:generateContent`
        : '',
    GEMINI_IMAGE_ENDPOINT: geminiImageModelCode
        ? `https://generativelanguage.googleapis.com/v1beta/models/${geminiImageModelCode}:generateContent`
        : '',
    TYPING_SPEED: typingMode,
    TYPING: typingDelay,
    CLOSE_DELAY: (structuredConfig.platforms.naver.close_delay_seconds || 10) * 1000,
    BROWSER_CHANNEL: structuredConfig.platforms.naver.browser_channel === 'auto' ? undefined : structuredConfig.platforms.naver.browser_channel,

    // 🔧 [System]
    UPDATE_SERVER_TYPE: structuredConfig.system.update_server_type || Constants.DEFAULT_UPDATE_SERVER_TYPE || 'github',
    CUSTOM_UPDATE_CHECK_URL: structuredConfig.system.custom_update_check_url || '',
    UPDATE_MIRROR_REPO: structuredConfig.system.update_mirror_repo || Constants.DEFAULT_UPDATE_MIRROR_REPO,
    NOTIFY_TELEGRAM_ENABLED: structuredConfig.notification?.telegram?.enabled || false,
    NOTIFY_TELEGRAM_BOT_TOKEN: structuredConfig.notification?.telegram?.bot_token || '',
    NOTIFY_TELEGRAM_CHAT_ID: structuredConfig.notification?.telegram?.chat_id || '',
    NOTIFY_BITLY_TOKEN: structuredConfig.notification?.telegram?.bitly_token || '',
    CHAT_MODEL_SOURCE: resolvedChatModelSettings.source,
    CHAT_MODEL_CONFIG: resolvedChatModelSettings.resolved,
    CHAT_MODEL_SELECTION_CONFIG: resolvedChatModelSettings.selection,
    KNOWLEDGE_PROVIDERS: Array.isArray(structuredConfig.knowledge?.providers) ? structuredConfig.knowledge.providers : [],
    KNOWLEDGE_ROUTING: structuredConfig.knowledge?.routing && typeof structuredConfig.knowledge.routing === 'object' ? structuredConfig.knowledge.routing : {},
    RECOMMENDATION_DELIVERY_ENABLED: structuredConfig.recommendations?.delivery?.enabled !== false,
    RECOMMENDATION_REFRESH_INTERVAL_MIN: Math.max(30, Math.min(1440,
        Number(structuredConfig.recommendations?.delivery?.refresh_interval_min) || 240)),
    RECOMMENDATION_STARTUP_DELAY_MS: Math.max(0, Math.min(60000,
        Number(structuredConfig.recommendations?.delivery?.startup_delay_ms) || 0)),
    NOTIFY_SLACK_ENABLED: structuredConfig.notification?.slack?.enabled || false,
    NOTIFY_SLACK_WEBHOOK_URL: structuredConfig.notification?.slack?.webhook_url || '',
    MCP_REMOTE_ENABLED: structuredConfig.mcp?.remote?.enabled === true,
    MCP_REMOTE_HOST: String(structuredConfig.mcp?.remote?.host || '127.0.0.1').trim() || '127.0.0.1',
    MCP_REMOTE_PORT: Number(structuredConfig.mcp?.remote?.port || 4578) || 4578,
    MCP_REMOTE_PATH: String(structuredConfig.mcp?.remote?.path || '/mcp').trim() || '/mcp',
    MCP_REMOTE_AUTH_TOKEN: String(structuredConfig.mcp?.remote?.auth?.bearer_token || '').trim(),
    NAVER_COMMENT_DRAFT_AI_MODE: structuredConfig.features?.naver?.comment_draft?.ai_mode === 'custom' ? 'custom' : 'default',
    NAVER_COMMENT_DRAFT_FETCH_LIMIT: Number(structuredConfig.features?.naver?.comment_draft?.fetch_limit || 10),
    NAVER_COMMENT_DRAFT_TONE: structuredConfig.features?.naver?.comment_draft?.tone || 'empathetic',
    NAVER_COMMENT_DRAFT_MAX_CHARS: Number(structuredConfig.features?.naver?.comment_draft?.max_chars || 60),
    NAVER_COMMENT_DRAFT_HEADLESS: structuredConfig.features?.naver?.comment_draft?.headless !== false,

    // 🔧 [Utility]
    resolveRuntimePath: (targetPath, opts = {}) => resolveRuntimePath(targetPath, opts),

    // 🆕 필수 설정 완료 여부 (UX 개선용)
    get CONFIG_IS_ESSENTIAL_SET() {
        const apiKey = String(this.TEXT_MODEL_API_KEY || '').trim();
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
    },

};

ensureRuntimeRemoteMcpConfig(CONFIG);

module.exports = CONFIG;
