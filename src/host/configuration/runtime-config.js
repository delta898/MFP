const fs = require('fs');
const path = require('path');
const { APP_VERSION } = require('../application-metadata');
const { getDefaultRuntimePaths } = require('./default-runtime-paths');
const { TYPING_PRESETS, WAIT } = require('../../adapters/naver/publishing-defaults');
const UpdateDefaults = require('../update-defaults');
const { ensureRuntimeRemoteMcpConfig } = require('./mcp-remote-config');
const { createModelConfigurationService } = require('../../services/ai/model-configuration');
const { createAiGatewayModelMetadata } = require('../../adapters/plugins/ai-gateway/model-metadata');
const modelConfiguration = createModelConfigurationService(createAiGatewayModelMetadata());
const {
    getAiModelCatalog,
    resolveAiModelConfig,
    resolveChatModelSettings,
    resolveStoredModelProfiles
} = modelConfiguration;
const { applyRemoteCatalog } = require('../../../packages/plugins/core/ai-gateway/catalog-registry');
const { resolveContentWritingPreferences } = require('../../services/content-writing/writing-preferences');
const {
    createWritingProfileRepository
} = require('../../adapters/storage/writing-profiles/repository');
const {
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA
} = require('../../services/content-writing/writing-profile');
const { normalizeSnsAiMode } = require('../../services/sns/ai-policy');
const { normalizeCardNewsBuiltinSources, normalizeCardNewsRssSources } = require('../../applications/card-news/sources/feed-sources');
const {
    createRuntimePathConfiguration
} = require('./runtime-paths');
const {
    loadUserConfig,
    readDefaultStructuredConfig
} = require('./user-config-store');
const {
    resolveRuntimeEnvironmentProfile
} = require('./environment/runtime-profile');
const {
    resolveOAuthApplicationConfig
} = require('./environment/oauth-config');
const { loadLicenseKey } = require('../../adapters/storage/license-keys/license-key-storage');
const { extractGoogleSheetId } = require('../../adapters/google/sheets/spreadsheet-reference');
const DefaultRuntimePaths = getDefaultRuntimePaths();

// =========================================================
// 1. 🔒 [비밀 키 로딩] 
// =========================================================
let internalSecrets = {};
try {
    // Release build 시 환경별 public 연결값과 Desktop OAuth 앱 설정을 담아 생성된다.
    // 설치형 OAuth Client Secret은 앱에서 추출 가능하며 server secret으로 취급하지 않는다.
    internalSecrets = require('./environment/secret');
} catch (_error) {
    internalSecrets = {};
}

const runtimeEnvironmentProfile = resolveRuntimeEnvironmentProfile({
    env: process.env,
    buildConfig: internalSecrets
});
const runtimePathConfiguration = createRuntimePathConfiguration({ environmentProfile: runtimeEnvironmentProfile });
const {
    rootDir: ROOT_DIR,
    execDir: EXEC_DIR,
    activeConfigDir: initialActiveConfigDir,
    paths: PATHS,
    resolveRuntimePath: initialResolveRuntimePath,
    licenseKeyStoragePaths
} = runtimePathConfiguration;
const oauthApplicationConfig = resolveOAuthApplicationConfig({
    environment: runtimeEnvironmentProfile.environment,
    runtimeEnv: process.env,
    buildConfig: internalSecrets
});

// =========================================================
// 2. 📂 [기본 설정 파일 로딩]
// =========================================================
const DEFAULT_STRUCTURED_CONFIG = readDefaultStructuredConfig([
    PATHS.configJsonSample,
    PATHS.configJsonSampleFromExec,
    PATHS.configJsonSampleFromBundle,
    PATHS.configJsonSampleFromResources
], fs);
const structuredConfig = loadUserConfig({
    configPath: PATHS.configJson,
    defaultConfig: DEFAULT_STRUCTURED_CONFIG,
    samplePairs: [
        {
            config: PATHS.configJson,
            samples: [PATHS.configJsonSample, PATHS.configJsonSampleFromBundle, PATHS.configJsonSampleFromResources]
        },
        { config: PATHS.configJsonFromExec, samples: [PATHS.configJsonSampleFromExec] }
    ],
    imagesSourceDir: PATHS.configImagesFromResources,
    imagesTargetDir: path.join(ROOT_DIR, 'config', 'images'),
    fsImpl: fs,
    pathImpl: path
});

// 사용자 설정 로드
const configSourcePath = structuredConfig.__CONFIG_SOURCE_PATH;
const configSourceType = structuredConfig.__CONFIG_SOURCE_TYPE;
const configReady = structuredConfig.__CONFIG_READY === true;
const configErrorMessage = String(structuredConfig.__CONFIG_ERROR_MESSAGE || '');

delete structuredConfig.__CONFIG_SOURCE_PATH;
delete structuredConfig.__CONFIG_SOURCE_TYPE;
delete structuredConfig.__CONFIG_READY;
delete structuredConfig.__CONFIG_ERROR_MESSAGE;

const activeConfigDir = (() => {
    if (configReady && configSourcePath) return path.dirname(configSourcePath);
    const execConfigDir = path.join(EXEC_DIR, 'config');
    if (fs.existsSync(execConfigDir)) return execConfigDir;
    return path.join(ROOT_DIR, 'config');
})();
const activeAppRoot = path.basename(activeConfigDir).toLowerCase() === 'config'
    ? path.dirname(activeConfigDir)
    : activeConfigDir;
const resolveRuntimePath = activeConfigDir === initialActiveConfigDir
    ? initialResolveRuntimePath
    : createRuntimePathConfiguration({
        environmentProfile: runtimeEnvironmentProfile,
        activeConfigDir
    }).resolveRuntimePath;

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

const licenseKeyInfo = loadLicenseKey({
    primaryPath: licenseKeyStoragePaths.primaryPath,
    legacyPaths: licenseKeyStoragePaths.legacyPaths,
    fsImpl: fs,
    pathImpl: path
});
if (licenseKeyInfo.migrationError) {
    console.warn(`⚠️ 라이선스 정보 이전 실패: ${licenseKeyInfo.migrationError}`);
}

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

// 💡 [환경변수 및 동적 경로 처리]
const googleOauthTokensRaw = String(process.env.GOOGLE_OAUTH_TOKENS_JSON || structuredConfig.general?.google_oauth_tokens_json || '').trim();
const googleOauthTokensPath = resolveRuntimePath(googleOauthTokensRaw || './config/google_oauth_tokens.json', { mustExist: false });
const googleOauthClientId = oauthApplicationConfig.GOOGLE_OAUTH_CLIENT_ID;
const googleOauthClientSecret = oauthApplicationConfig.GOOGLE_OAUTH_CLIENT_SECRET;
const cloudflareOauthClientId = oauthApplicationConfig.CLOUDFLARE_OAUTH_CLIENT_ID;
const cloudflareOauthScopes = oauthApplicationConfig.CLOUDFLARE_OAUTH_SCOPES;

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

const resolvedLicenseKeyPath = licenseKeyInfo.path || licenseKeyStoragePaths.primaryPath;
const productionLicenseEnvironmentOverride = runtimeEnvironmentProfile.environment === 'production'
    ? String(process.env.LICENSE_KEY || '').trim()
    : '';

const userSheetUrl = String(structuredConfig.general?.google_sheet_url || '').trim();
const resolvedSheetId = extractGoogleSheetId(userSheetUrl, { allowForeignUrlHost: false });
const resolvedSheetUrl = resolvedSheetId
    ? `https://docs.google.com/spreadsheets/d/${resolvedSheetId}`
    : userSheetUrl;
// 타이핑 속도 변환
const typingModeRaw = String(structuredConfig.platforms.naver.typing_speed || 'NORMAL').trim().toUpperCase();
const typingMode = TYPING_PRESETS[typingModeRaw] ? typingModeRaw : 'NORMAL';
const typingDelay = TYPING_PRESETS[typingMode];

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
    TRENDS_API_PUBLIC_CONFIG: Object.freeze({
        environment: runtimeEnvironmentProfile.environment,
        configured: runtimeEnvironmentProfile.trendsApi.configured,
        url: runtimeEnvironmentProfile.trendsApi.url,
        endpointHost: runtimeEnvironmentProfile.trendsApi.endpointHost,
        reason: runtimeEnvironmentProfile.trendsApi.reason
    }),

    // 🔧 [Essential Resolved]
    GOOGLE_OAUTH_CLIENT_ID: googleOauthClientId,
    GOOGLE_OAUTH_CLIENT_SECRET: googleOauthClientSecret,
    CLOUDFLARE_OAUTH_CLIENT_ID: cloudflareOauthClientId,
    CLOUDFLARE_OAUTH_SCOPES: cloudflareOauthScopes,
    GOOGLE_OAUTH_TOKENS_JSON: googleOauthTokensRaw,
    GOOGLE_OAUTH_TOKENS_JSON_PATH: googleOauthTokensPath,
    GOOGLE_SHEET_URL: resolvedSheetUrl,
    GOOGLE_SHEET_ID: resolvedSheetId,
    GOOGLE_SHEET_TITLE: String(structuredConfig.general?.google_sheet_title || ''),
    GOOGLE_SHEET_AUTHORIZED_FILE_ID: String(structuredConfig.general?.google_sheet_authorized_file_id || ''),
    LISTEN_HOST: structuredConfig.general?.listen_host || '127.0.0.1',
    LISTEN_PORT: structuredConfig.general?.listen_port || 4577,
    WORKSPACE_DIR: resolvedWorkspaceDir || DefaultRuntimePaths.WORKSPACE_DIR,
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
    AUTH_FILE_PATH: resolvedAuthPath || DefaultRuntimePaths.AUTH_FILE_PATH,
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
    CARD_NEWS_RSS_SOURCES: normalizeCardNewsRssSources(structuredConfig.content?.card_news?.rss_sources),
    CARD_NEWS_BUILTIN_SOURCES: normalizeCardNewsBuiltinSources(structuredConfig.content?.card_news?.builtin_sources),

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
    PUBLISH_AUTO_BATCH_SIZE: structuredConfig.automation.publish.blog.batch_size,
    PUBLISH_AUTO_POST_STATUS: structuredConfig.automation.publish.blog.post_status === 'draft' ? 'draft' : 'publish',
    PUBLISH_AUTO_TARGET_CHANNELS: Array.isArray(structuredConfig.automation.publish.blog.target_channels) ? structuredConfig.automation.publish.blog.target_channels : [structuredConfig.automation.publish.blog.target_channels || 'naver'],
    PUBLISH_AUTO_HEADLESS: structuredConfig.automation.publish.blog.headless,
    PUBLISH_AUTO_NOTIFY_ENABLED: structuredConfig.automation.publish.blog.notify_enabled,
    PUBLISH_AUTO_IMAGE_MODE: structuredConfig.automation.publish.blog.image_mode || 'generate',

    // System defaults
    UPDATE_CHANNEL: structuredConfig.system.update_channel,
    HEADLESS: structuredConfig.automation.publish.blog.headless, // Global fallback
    CLOSE_DELAY_SECONDS: structuredConfig.platforms.naver.close_delay_seconds,
    WAIT_LOAD: WAIT.LOAD,
    WAIT_UPLOAD: WAIT.UPLOAD,
    // 기존 내부 호출 경계를 위한 별칭. 값은 Environment Resolver에서만 공급한다.
    LICENSE_CHK_URL: runtimeEnvironmentProfile.supabase.url,
    LICENSE_CHK_KEY: runtimeEnvironmentProfile.supabase.publishableKey,
    BLOG_PROMPT_CONTRACT_PATH: resolveRuntimePath('src/applications/blog/writing/prompts/contract.md', { mustExist: true }),
    BLOG_PROMPT_COMMON_PATH: resolveRuntimePath('src/applications/blog/writing/prompts/common.md', { mustExist: true }),
    BLOG_PROMPT_SEARCH_PATH: resolveRuntimePath('src/applications/blog/writing/prompts/search.md', { mustExist: true }),
    BLOG_PROMPT_DISCOVERY_PATH: resolveRuntimePath('src/applications/blog/writing/prompts/discovery.md', { mustExist: true }),
    // 이전 내부 참조를 위한 공통 프롬프트 별칭
    BLOG_PROMPT_PATH: resolveRuntimePath('src/applications/blog/writing/prompts/common.md', { mustExist: true }),
    SHOPPING_PROMPT_PATH: resolveRuntimePath('src/applications/shopping/generation/prompts/default.md', { mustExist: true }),

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
    TYPING_SPEED: typingMode,
    TYPING: typingDelay,
    CLOSE_DELAY: (structuredConfig.platforms.naver.close_delay_seconds || 10) * 1000,
    BROWSER_CHANNEL: structuredConfig.platforms.naver.browser_channel === 'auto' ? undefined : structuredConfig.platforms.naver.browser_channel,

    // 🔧 [System]
    UPDATE_SERVER_TYPE: structuredConfig.system.update_server_type || UpdateDefaults.DEFAULT_UPDATE_SERVER_TYPE,
    CUSTOM_UPDATE_CHECK_URL: structuredConfig.system.custom_update_check_url || '',
    UPDATE_MIRROR_REPO: structuredConfig.system.update_mirror_repo || UpdateDefaults.DEFAULT_UPDATE_MIRROR_REPO,
    NOTIFY_TELEGRAM_ENABLED: structuredConfig.notification?.telegram?.delivery_enabled ?? structuredConfig.notification?.telegram?.enabled ?? false,
    NOTIFY_TELEGRAM_INBOUND_ENABLED: structuredConfig.notification?.telegram?.inbound_enabled ?? structuredConfig.notification?.telegram?.enabled ?? false,
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
    NOTIFY_SLACK_ENABLED: structuredConfig.notification?.slack?.delivery_enabled ?? structuredConfig.notification?.slack?.enabled ?? false,
    NOTIFY_SLACK_WEBHOOK_URL: structuredConfig.notification?.slack?.webhook_url || '',
    MCP_REMOTE_ENABLED: structuredConfig.mcp?.remote?.enabled === true,
    MCP_REMOTE_HOST: String(structuredConfig.mcp?.remote?.host || '127.0.0.1').trim() || '127.0.0.1',
    MCP_REMOTE_PORT: Number(structuredConfig.mcp?.remote?.port || 4578) || 4578,
    MCP_REMOTE_PATH: String(structuredConfig.mcp?.remote?.path || '/mcp').trim() || '/mcp',
    MCP_REMOTE_AUTH_TOKEN: String(structuredConfig.mcp?.remote?.auth?.bearer_token || '').trim(),
    NAVER_COMMENT_DRAFT_AI_MODE: structuredConfig.features?.naver?.comment_draft?.ai_mode === 'custom' ? 'custom' : 'default',
    NAVER_COMMENT_DRAFT_FETCH_LIMIT: Number(structuredConfig.features?.naver?.comment_draft?.fetch_limit || 10),
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
