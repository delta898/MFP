function createApiError(status, code, message) {
    const err = new Error(message || '요청 처리 중 오류가 발생했습니다.');
    err.status = Number.isInteger(status) ? status : 400;
    err.apiCode = code || 'SETTINGS_ERROR';
    return err;
}

const {
    ensureRuntimeRemoteMcpConfig,
    generateRemoteMcpBearerToken
} = require('../../mcp/remote-config');
const {
    getAiPresets,
    buildModelSelectionFromFields
} = require('../../ai-model-config');
const { recordDashboardActivity } = require('../../activity/dashboard-activity-store');

function createSettingsService(deps = {}) {
    const {
        fs,
        path,
        CONFIG,
        DEFAULT_HOST,
        DEFAULT_PORT,
        SHOPPING_IMAGE_SLOT_MAP,
        tryResolveReadableConfigSource,
        readConfigRaw,
        buildDefaultConfigTemplate,
        resolveWritableConfigPath,
        buildMajorSettings,
        parseMajorFieldsFromRequest,
        normalizeListenHost,
        normalizeListenPort,
        isAllowedImageSourceValue,
        validateRequiredShoppingImageSources,
        applyConfigUpdates,
        applyRuntimeConfigFromMajor,
        syncAutoRunnerWithConfig,
        syncShoppingAutoRunnerWithConfig,
        scheduleUiReload,
        restartRemoteMcpService,
        getRemoteServiceStatus,
        createConfigRevision,
        parseConfigValue,
        TelegramService
    } = deps;

    const normalizeTelegramCustomAiBaseUrl = (rawBaseUrl) => {
        const trimmed = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
        if (!trimmed) return '';
        return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
    };

    return {
        async getMajorSettings() {
            ensureRuntimeRemoteMcpConfig(CONFIG);
            const configSource = {
                path: CONFIG.CONFIG_SOURCE_PATH || resolveWritableConfigPath(),
                sourceType: CONFIG.CONFIG_SOURCE_TYPE
            };
            const data = buildMajorSettings(null, configSource);
            const savedTokenExists = (() => {
                try {
                    const configPath = configSource.path || resolveWritableConfigPath();
                    if (!configPath || !fs.existsSync(configPath)) return false;
                    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    return Object.prototype.hasOwnProperty.call(raw?.mcp?.remote?.auth || {}, 'bearer_token');
                } catch (_error) {
                    return false;
                }
            })();

            if (!savedTokenExists && !String(data?.fields?.MCP_REMOTE_AUTH_TOKEN || '').trim()) {
                data.fields.MCP_REMOTE_AUTH_TOKEN = generateRemoteMcpBearerToken();
            }

            return data;
        },

        async saveMajorSettings(requestBody = {}) {
            const writablePath = resolveWritableConfigPath();
            const fields = parseMajorFieldsFromRequest(requestBody || {});
            const prevListenHost = normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST);
            const prevListenPort = normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT);
            const prevTelegramEnabled = CONFIG.NOTIFY_TELEGRAM_ENABLED;
            const prevTelegramBotToken = CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
            const prevTelegramChatId = String(CONFIG.NOTIFY_TELEGRAM_CHAT_ID || '').trim();
            const prevMcpRemoteEnabled = CONFIG.MCP_REMOTE_ENABLED ?? (CONFIG.mcp?.remote?.enabled === true);
            const prevMcpRemoteHost = String(CONFIG.MCP_REMOTE_HOST || CONFIG.mcp?.remote?.host || '127.0.0.1').trim();
            const prevMcpRemotePort = normalizeListenPort(CONFIG.MCP_REMOTE_PORT || CONFIG.mcp?.remote?.port, 4578);
            const prevMcpRemotePath = String(CONFIG.MCP_REMOTE_PATH || CONFIG.mcp?.remote?.path || '/mcp').trim();
            const prevMcpRemoteAuthToken = String(CONFIG.MCP_REMOTE_AUTH_TOKEN || CONFIG.mcp?.remote?.auth?.bearer_token || '').trim();

            const imageKeys = [
                'FTC_DISCLOSURE_IMAGE_URL',
                'SHOPPING_CTA_IMAGE_URL1',
                'SHOPPING_CTA_IMAGE_URL2',
                'SHOPPING_CTA_IMAGE_URL3'
            ];
            for (const key of imageKeys) {
                // [수정] 단순히 값이 비어있는지(empty)가 아니라, 
                // 요청 바디 자체에 해당 키가 '존재하지 않을 때'만 기존 값을 복원합니다.
                // 이렇게 해야 쇼핑 탭에서 명시적으로 '설정 삭제'를 눌러 빈 값을 보냈을 때 
                // 삭제 의도가 무시되지 않고 정상적으로 반영됩니다.
                if (!(key in requestBody)) {
                    const existingValue = String(CONFIG[key] || '').trim();
                    if (existingValue) {
                        fields[key] = existingValue;
                    }
                }
            }

            for (const key of imageKeys) {
                if (!isAllowedImageSourceValue(fields[key])) {
                    const slotInfo = Object.values(SHOPPING_IMAGE_SLOT_MAP).find(v => v.key === key);
                    const label = slotInfo?.label || key;
                    throw createApiError(
                        400,
                        'INVALID_IMAGE_SOURCE',
                        `${label} 경로는 https:// 또는 로컬 파일 경로(예: ./config/images/sample.jpg) 형식만 허용됩니다.`
                    );
                }
            }
            const requiredErrors = validateRequiredShoppingImageSources(fields);
            if (requiredErrors.length > 0) {
                throw createApiError(400, 'REQUIRED_IMAGE_MISSING', requiredErrors[0]);
            }
            const resolvedRemoteMcp = ensureRuntimeRemoteMcpConfig(CONFIG, {
                enabled: fields.MCP_REMOTE_ENABLED,
                host: fields.MCP_REMOTE_HOST,
                port: fields.MCP_REMOTE_PORT,
                path: fields.MCP_REMOTE_PATH,
                authToken: fields.MCP_REMOTE_AUTH_TOKEN
            });
            fields.MCP_REMOTE_ENABLED = resolvedRemoteMcp.enabled;
            fields.MCP_REMOTE_HOST = resolvedRemoteMcp.host;
            fields.MCP_REMOTE_PORT = resolvedRemoteMcp.port;
            fields.MCP_REMOTE_PATH = resolvedRemoteMcp.path;
            fields.MCP_REMOTE_AUTH_TOKEN = resolvedRemoteMcp.authToken;

            // 💡 [JSON 기반 저장 로직 시작]
            // 기존 config.json이 있으면 읽어오고, 없으면 기본 구조 사용
            let structuredConfig = {};
            try {
                if (fs.existsSync(writablePath)) {
                    structuredConfig = JSON.parse(fs.readFileSync(writablePath, 'utf8'));
                }
            } catch (e) {
                console.error('Failed to read existing config.json for update:', e);
            }

            // 계층 구조에 맞춰 필드 업데이트
            // 1. Essential
            if (!structuredConfig.general) structuredConfig.general = {};
            structuredConfig.general.google_sheet_url = fields.GOOGLE_SHEET_URL;
            structuredConfig.general.listen_host = fields.LISTEN_HOST;
            structuredConfig.general.listen_port = Number(fields.LISTEN_PORT);

            // 2. AI Settings
            if (!structuredConfig.ai_settings) structuredConfig.ai_settings = {};
            const aiPresets = getAiPresets(structuredConfig);
            const textModelConfig = buildModelSelectionFromFields('text', fields, aiPresets);
            const imageModelConfig = buildModelSelectionFromFields('image', fields, aiPresets);
            const warnings = [];
            if (!String(textModelConfig.api_key || '').trim()) {
                warnings.push('텍스트 모델의 API Key가 비어 있습니다. AI 기능을 사용하려면 입력이 필요합니다.');
            }
            if (textModelConfig.provider === 'direct' && (!String(textModelConfig.name || '').trim() || !String(textModelConfig.base_url || '').trim())) {
                warnings.push('텍스트 모델을 직접 입력할 때는 모델 이름과 Base URL이 필요합니다.');
            }
            if (!String(imageModelConfig.api_key || '').trim()) {
                warnings.push('이미지 모델의 API Key가 비어 있습니다. 이미지 생성 기능을 사용하려면 입력이 필요합니다.');
            }
            if (imageModelConfig.provider === 'direct' && (!String(imageModelConfig.name || '').trim() || !String(imageModelConfig.base_url || '').trim())) {
                warnings.push('이미지 모델을 직접 입력할 때는 모델 이름과 Base URL이 필요합니다.');
            }
            structuredConfig.ai_settings.TEXT_MODEL = textModelConfig;
            structuredConfig.ai_settings.IMAGE_MODEL = imageModelConfig;

            // 3. Platforms
            if (!structuredConfig.platforms) structuredConfig.platforms = {};
            if (!structuredConfig.platforms.naver) structuredConfig.platforms.naver = {};
            structuredConfig.platforms.naver.user_id = fields.NAVER_ID;
            structuredConfig.platforms.naver.typing_speed = fields.TYPING_SPEED;
            if (!structuredConfig.platforms.naver.assets) structuredConfig.platforms.naver.assets = {};
            structuredConfig.platforms.naver.assets.ftc_image = fields.FTC_DISCLOSURE_IMAGE_URL;
            structuredConfig.platforms.naver.assets.cta_images = [
                fields.SHOPPING_CTA_IMAGE_URL1,
                fields.SHOPPING_CTA_IMAGE_URL2,
                fields.SHOPPING_CTA_IMAGE_URL3
            ].filter(Boolean);

            if (!structuredConfig.platforms.wordpress) structuredConfig.platforms.wordpress = {};
            structuredConfig.platforms.wordpress.url = fields.WORDPRESS_URL;
            structuredConfig.platforms.wordpress.user_id = fields.WORDPRESS_USER_ID;
            structuredConfig.platforms.wordpress.app_password = fields.WORDPRESS_APP_PASSWORD;

            // 4. Automation
            if (!structuredConfig.automation) structuredConfig.automation = {};
            if (!structuredConfig.automation.collect) structuredConfig.automation.collect = {};

            // [Migration/Cleanup] Legacy paths migration
            // blog_collect -> collect.blog
            if (structuredConfig.automation.blog_collect) {
                if (!structuredConfig.automation.collect.blog) {
                    structuredConfig.automation.collect.blog = structuredConfig.automation.blog_collect;
                }
                delete structuredConfig.automation.blog_collect;
            }
            // Old collect (flat) -> collect.blog
            if (structuredConfig.automation.collect.trends && !structuredConfig.automation.collect.blog) {
                const trends = structuredConfig.automation.collect.trends;
                const rss = structuredConfig.automation.collect.rss;
                structuredConfig.automation.collect.blog = { trends, rss };
                delete structuredConfig.automation.collect.trends;
                delete structuredConfig.automation.collect.rss;
            }

            if (!structuredConfig.automation.collect.blog) structuredConfig.automation.collect.blog = {};
            if (!structuredConfig.automation.collect.blog.trends) structuredConfig.automation.collect.blog.trends = {};

            structuredConfig.automation.collect.blog.trends.enabled = fields.COLLECT_TRENDS_ENABLED;
            structuredConfig.automation.collect.blog.trends.categories = fields.COLLECT_TRENDS_CATEGORIES;
            structuredConfig.automation.collect.blog.trends.naver_category = String(fields.COLLECT_TRENDS_NAVER_CATEGORY || '').trim();
            structuredConfig.automation.collect.blog.trends.wordpress_category = String(fields.COLLECT_TRENDS_WP_CATEGORY || '').trim();
            structuredConfig.automation.collect.blog.trends.time = fields.COLLECT_TRENDS_TIME;
            structuredConfig.automation.collect.blog.trends.reuse_gap_days = Number(fields.COLLECT_TRENDS_REUSE_GAP_DAYS);

            if (!structuredConfig.automation.collect.blog.trends.filters) structuredConfig.automation.collect.blog.trends.filters = {};
            structuredConfig.automation.collect.blog.trends.filters.min_increase = Number(fields.COLLECT_TRENDS_FILTER_MIN_INCR);
            structuredConfig.automation.collect.blog.trends.filters.include_new = fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW;
            structuredConfig.automation.collect.blog.trends.filters.include_dash = fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH;
            structuredConfig.automation.collect.blog.trends.filters.include_number = fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER;
            structuredConfig.automation.collect.blog.trends.filters.type = fields.COLLECT_TRENDS_FILTER_TYPE;
            structuredConfig.automation.collect.blog.trends.filters.top_n = Number(fields.COLLECT_TRENDS_FILTER_TOP_N);

            if (!structuredConfig.automation.collect.blog.rss) structuredConfig.automation.collect.blog.rss = {};
            structuredConfig.automation.collect.blog.rss.enabled = fields.COLLECT_RSS_ENABLED;
            structuredConfig.automation.collect.blog.rss.feeds = Array.isArray(fields.COLLECT_RSS_CONFIGS) ? fields.COLLECT_RSS_CONFIGS : [];

            if (!structuredConfig.publish) structuredConfig.publish = {};
            structuredConfig.publish.image_optimization_enabled = fields.IMAGE_OPTIMIZATION_ENABLED !== false;
            if (structuredConfig.automation && Object.prototype.hasOwnProperty.call(structuredConfig.automation, 'image_optimization_enabled')) {
                delete structuredConfig.automation.image_optimization_enabled;
            }

            // Publish
            if (!structuredConfig.automation.publish) structuredConfig.automation.publish = {};
            if (!structuredConfig.automation.publish.blog) structuredConfig.automation.publish.blog = {};
            structuredConfig.automation.publish.blog.enabled = fields.PUBLISH_AUTO_ENABLED;
            structuredConfig.automation.publish.blog.interval_min = Number(fields.PUBLISH_AUTO_INTERVAL_MIN);
            structuredConfig.automation.publish.blog.batch_size = Number(fields.PUBLISH_AUTO_BATCH_SIZE);
            structuredConfig.automation.publish.blog.notify_enabled = fields.PUBLISH_AUTO_NOTIFY_ENABLED;
            structuredConfig.automation.publish.blog.target_channels = fields.PUBLISH_AUTO_TARGET_CHANNELS || ['naver'];
            structuredConfig.automation.publish.blog.headless = fields.PUBLISH_AUTO_HEADLESS;
            structuredConfig.automation.publish.blog.start_time = fields.PUBLISH_AUTO_START_TIME || "00:00";
            structuredConfig.automation.publish.blog.end_time = fields.PUBLISH_AUTO_END_TIME || "23:59";

            if (!structuredConfig.automation.publish.shopping) structuredConfig.automation.publish.shopping = {};
            structuredConfig.automation.publish.shopping.enabled = fields.SHOPPING_PUBLISH_AUTO_ENABLED;
            structuredConfig.automation.publish.shopping.interval_min = Number(fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN);
            structuredConfig.automation.publish.shopping.batch_size = Number(fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE);
            structuredConfig.automation.publish.shopping.notify_enabled = fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED;
            structuredConfig.automation.publish.shopping.target_channels = fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || ['naver'];
            structuredConfig.automation.publish.shopping.headless = fields.SHOPPING_PUBLISH_AUTO_HEADLESS;
            structuredConfig.automation.publish.shopping.start_time = fields.SHOPPING_PUBLISH_AUTO_START_TIME;
            structuredConfig.automation.publish.shopping.end_time = fields.SHOPPING_PUBLISH_AUTO_END_TIME;
            structuredConfig.automation.publish.shopping.time = fields.SHOPPING_AUTO_TIME;

            // Notification
            if (!structuredConfig.notification) structuredConfig.notification = {};
            if (!structuredConfig.notification.telegram) structuredConfig.notification.telegram = {};
            structuredConfig.notification.telegram.enabled = fields.NOTIFY_TELEGRAM_ENABLED;
            structuredConfig.notification.telegram.bot_token = fields.NOTIFY_TELEGRAM_BOT_TOKEN;
            structuredConfig.notification.telegram.chat_id = fields.NOTIFY_TELEGRAM_CHAT_ID;
            structuredConfig.notification.telegram.bitly_token = fields.NOTIFY_BITLY_TOKEN;
            const hasCustomAiBaseUrl = Boolean(String(fields.CHAT_MODEL_BASE_URL || '').trim());
            const hasCustomAiModel = Boolean(String(fields.CHAT_MODEL_CODE || '').trim());
            const hasCustomAiConfig = hasCustomAiBaseUrl && hasCustomAiModel;
            if (fields.TELEGRAM_CHAT_AI_MODE === 'custom' && !hasCustomAiConfig) {
                throw createApiError(400, 'INVALID_CUSTOM_AI', '텔레그램 채팅 모델로 Custom AI를 사용하려면 AI 탭에서 Base URL과 Model을 입력해야 합니다.');
            }
            structuredConfig.notification.telegram.chat_ai_mode = fields.TELEGRAM_CHAT_AI_MODE || 'default';
            if (!structuredConfig.ai_settings) structuredConfig.ai_settings = {};
            structuredConfig.ai_settings.CHAT_MODEL = {
                base_url: fields.CHAT_MODEL_BASE_URL,
                api_key: fields.CHAT_MODEL_API_KEY,
                model: fields.CHAT_MODEL_CODE
            };
            if ('custom' in structuredConfig.ai_settings) {
                delete structuredConfig.ai_settings.custom;
            }
            if (!structuredConfig.system) structuredConfig.system = {};
            structuredConfig.system.update_channel = String(structuredConfig.system.update_channel || 'stable').trim() || 'stable';
            structuredConfig.system.update_server_type = fields.UPDATE_SERVER_TYPE;
            structuredConfig.system.custom_update_check_url = fields.CUSTOM_UPDATE_CHECK_URL;
            structuredConfig.system.update_mirror_repo = fields.UPDATE_MIRROR_REPO;
            if (!structuredConfig.notification.slack) structuredConfig.notification.slack = {};
            structuredConfig.notification.slack.enabled = fields.NOTIFY_SLACK_ENABLED;
            structuredConfig.notification.slack.webhook_url = fields.NOTIFY_SLACK_WEBHOOK_URL;

            // MCP Remote
            if (!structuredConfig.mcp) structuredConfig.mcp = {};
            if (!structuredConfig.mcp.remote) structuredConfig.mcp.remote = {};
            structuredConfig.mcp.remote.enabled = fields.MCP_REMOTE_ENABLED;
            structuredConfig.mcp.remote.host = fields.MCP_REMOTE_HOST;
            structuredConfig.mcp.remote.port = Number(fields.MCP_REMOTE_PORT);
            structuredConfig.mcp.remote.path = fields.MCP_REMOTE_PATH;
            if (!structuredConfig.mcp.remote.auth) structuredConfig.mcp.remote.auth = {};
            structuredConfig.mcp.remote.auth.bearer_token = fields.MCP_REMOTE_AUTH_TOKEN;
            if ('mode' in structuredConfig.mcp.remote.auth) {
                delete structuredConfig.mcp.remote.auth.mode;
            }

            // 파일 저장 (Pretty JSON)
            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, JSON.stringify(structuredConfig, null, 2), 'utf-8');

            // 런타임 적용
            applyRuntimeConfigFromMajor(fields);

            // 🆕 동적으로 CONFIG 객체 업데이트 (서버 재시작 없이 반영되도록)
            // 여기서는 신규 스택 구조 업데이트 + 레거시 플랫 키 업데이트 병행
            Object.keys(fields).forEach(key => {
                CONFIG[key] = fields[key];
            });
            // 계층 구조도 동기화 (간소화를 위해 다시 로드하는 것과 유사한 효과)
            Object.assign(CONFIG, structuredConfig);

            syncAutoRunnerWithConfig();
            syncShoppingAutoRunnerWithConfig();

            const requiresRestart =
                fields.LISTEN_HOST !== prevListenHost ||
                normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT) !== prevListenPort;
            const mcpSettingsChanged =
                fields.MCP_REMOTE_ENABLED !== prevMcpRemoteEnabled ||
                fields.MCP_REMOTE_HOST !== prevMcpRemoteHost ||
                normalizeListenPort(fields.MCP_REMOTE_PORT, 4578) !== prevMcpRemotePort ||
                fields.MCP_REMOTE_PATH !== prevMcpRemotePath ||
                String(fields.MCP_REMOTE_AUTH_TOKEN || '').trim() !== prevMcpRemoteAuthToken;

            CONFIG.CONFIG_READY = true;
            CONFIG.CONFIG_SOURCE_TYPE = 'json';
            CONFIG.CONFIG_SOURCE_PATH = writablePath;
            CONFIG.CONFIG_ERROR_MESSAGE = '';

            // 🤖 텔레그램 봇 동적 재시작 (텔레그램 관련 설정이 실제로 변경된 경우에만)
            const telegramSettingsChanged =
                fields.NOTIFY_TELEGRAM_ENABLED !== prevTelegramEnabled ||
                fields.NOTIFY_TELEGRAM_BOT_TOKEN !== prevTelegramBotToken ||
                String(fields.NOTIFY_TELEGRAM_CHAT_ID || '') !== prevTelegramChatId;

            if (telegramSettingsChanged) {
                try {
                    const TelegramBotService = require('../../telegram-bot.service');
                    await TelegramBotService.stop(); // 기존 인스턴스가 완전히 중지될 때까지 대기
                    if (CONFIG.NOTIFY_TELEGRAM_ENABLED && CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN) {
                        TelegramBotService.init(); // 새 설정으로 다시 시작
                    }
                } catch (err) {
                    console.error('Failed to restart TelegramBotService:', err);
                }
            }

            if (requiresRestart) {
                scheduleUiReload(fields.LISTEN_HOST, normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT));
            }
            if (mcpSettingsChanged && typeof restartRemoteMcpService === 'function') {
                await restartRemoteMcpService({
                    enabled: fields.MCP_REMOTE_ENABLED,
                    host: fields.MCP_REMOTE_HOST,
                    port: normalizeListenPort(fields.MCP_REMOTE_PORT, 4578),
                    path: fields.MCP_REMOTE_PATH,
                    authToken: String(fields.MCP_REMOTE_AUTH_TOKEN || '').trim()
                });
            }

            const updatedSettings = buildMajorSettings(null, {
                path: writablePath,
                sourceType: 'json'
            });
            const remoteMcpStatus = typeof getRemoteServiceStatus === 'function'
                ? getRemoteServiceStatus()
                : null;
            const detailParts = [];
            if (requiresRestart) {
                detailParts.push(`UI 서버 재시작 예정: ${fields.LISTEN_HOST}:${normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT)}`);
            }
            if (telegramSettingsChanged) {
                detailParts.push(`텔레그램 ${fields.NOTIFY_TELEGRAM_ENABLED ? '재적용' : '비활성화'}`);
            }
            if (mcpSettingsChanged) {
                detailParts.push(`MCP ${fields.MCP_REMOTE_ENABLED ? '적용' : '비활성화'}`);
            }
            recordDashboardActivity({
                category: 'settings',
                type: 'major_settings_saved',
                title: '설정 저장 완료',
                detail: detailParts.join(' · ') || '주요 설정이 저장되었습니다.'
            });

            return {
                requiresRestart,
                restarting: requiresRestart,
                newHost: fields.LISTEN_HOST,
                newPort: normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT),
                message: requiresRestart
                    ? '주요 설정 저장 완료. 서버가 재시작됩니다...'
                    : (mcpSettingsChanged ? '주요 설정 저장 완료. MCP 서버 설정이 적용되었습니다.' : '주요 설정 저장 완료'),
                warnings,
                fields: updatedSettings.fields,
                aiPresets: updatedSettings.aiPresets,
                shoppingImageSlots: updatedSettings.shoppingImageSlots,
                shoppingImageDefaults: updatedSettings.shoppingImageDefaults,
                remoteMcpStatus
            };
        },

        async regenerateMcpToken() {
            return {
                token: generateRemoteMcpBearerToken()
            };
        },

        async getAdvancedSettings() {
            const writablePath = resolveWritableConfigPath();
            let content = '';
            try {
                if (fs.existsSync(writablePath)) {
                    content = fs.readFileSync(writablePath, 'utf8');
                }
            } catch (e) {
                console.error('Failed to read config.json for advanced view:', e);
            }

            const revision = createConfigRevision(content);
            return {
                configPath: writablePath,
                configSourceType: 'json',
                content,
                revision
            };
        },

        async saveAdvancedSettings(requestBody = {}) {
            const content = String(requestBody?.content || '');
            if (!content.trim()) {
                throw createApiError(400, 'INVALID_CONTENT', '고급 설정 내용이 비어 있습니다.');
            }
            if (content.length > 1024 * 1024) {
                throw createApiError(400, 'CONTENT_TOO_LARGE', '고급 설정 내용이 너무 큽니다. (최대 1MB)');
            }

            const configSource = tryResolveReadableConfigSource();
            const currentRaw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
            const currentRevision = createConfigRevision(currentRaw);
            const expectedRevision = String(requestBody?.revision || '').trim();
            if (expectedRevision && expectedRevision !== currentRevision) {
                throw createApiError(
                    409,
                    'SETTINGS_CONFLICT',
                    '고급 설정이 최신 상태가 아닙니다. [원문 다시 불러오기] 후 다시 저장해 주세요.'
                );
            }

            const writablePath = resolveWritableConfigPath();
            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, content, 'utf-8');
            const fields = parseMajorFieldsFromRequest({
                LISTEN_HOST: parseConfigValue(content, 'LISTEN_HOST') || CONFIG.LISTEN_HOST,
                LISTEN_PORT: parseConfigValue(content, 'LISTEN_PORT') || CONFIG.LISTEN_PORT,
                NAVER_ID: parseConfigValue(content, 'NAVER_ID') || CONFIG.NAVER_ID,
                GOOGLE_SHEET_URL: parseConfigValue(content, 'GOOGLE_SHEET_URL') || CONFIG.GOOGLE_SHEET_URL,
                HEADLESS: parseConfigValue(content, 'HEADLESS'),
                TYPING_SPEED: parseConfigValue(content, 'TYPING_SPEED'),
                BLOG_AUTO_MODE: parseConfigValue(content, 'BLOG_AUTO_MODE'),
                BLOG_AUTO_CATEGORIES: parseConfigValue(content, 'BLOG_AUTO_CATEGORIES'),
                BLOG_AUTO_MAX_POSTS_PER_RUN: parseConfigValue(content, 'BLOG_AUTO_MAX_POSTS_PER_RUN'),
                BLOG_AUTO_TRENDS_TIME: parseConfigValue(content, 'BLOG_AUTO_TRENDS_TIME'),
                BLOG_AUTO_IMAGE_GENERATION: parseConfigValue(content, 'BLOG_AUTO_IMAGE_GENERATION'),
                BLOG_AUTO_EXTERNAL_REFERENCE: parseConfigValue(content, 'BLOG_AUTO_EXTERNAL_REFERENCE'),
                BLOG_AUTO_NOTIFY_ENABLED: parseConfigValue(content, 'BLOG_AUTO_NOTIFY_ENABLED'),
                BLOG_AUTO_VARIATION_INCLUDE_NEW: parseConfigValue(content, 'BLOG_AUTO_VARIATION_INCLUDE_NEW'),
                BLOG_AUTO_VARIATION_INCLUDE_DASH: parseConfigValue(content, 'BLOG_AUTO_VARIATION_INCLUDE_DASH'),
                BLOG_AUTO_VARIATION_INCLUDE_NUMBER: parseConfigValue(content, 'BLOG_AUTO_VARIATION_INCLUDE_NUMBER'),
                BLOG_AUTO_VARIATION_TYPE: parseConfigValue(content, 'BLOG_AUTO_VARIATION_TYPE') || 'min',
                BLOG_AUTO_VARIATION_TOP_N: parseConfigValue(content, 'BLOG_AUTO_VARIATION_TOP_N'),
                BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS: parseConfigValue(content, 'BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS'),
                BLOG_AUTO_HEADLESS: parseConfigValue(content, 'BLOG_AUTO_HEADLESS'),
                SHOPPING_PUBLISH_AUTO_ENABLED: parseConfigValue(content, 'SHOPPING_PUBLISH_AUTO_ENABLED'),
                SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseConfigValue(content, 'SHOPPING_PUBLISH_AUTO_INTERVAL_MIN'),
                SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseConfigValue(content, 'SHOPPING_PUBLISH_AUTO_BATCH_SIZE'),
                SHOPPING_PUBLISH_AUTO_HEADLESS: parseConfigValue(content, 'SHOPPING_PUBLISH_AUTO_HEADLESS'),
                SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: parseConfigValue(content, 'SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS'),
                SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: parseConfigValue(content, 'SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED'),
                SHOPPING_AUTO_TIME: parseConfigValue(content, 'SHOPPING_AUTO_TIME'),
                FTC_DISCLOSURE_IMAGE_URL: parseConfigValue(content, 'FTC_DISCLOSURE_IMAGE_URL') || CONFIG.FTC_DISCLOSURE_IMAGE_URL,
                SHOPPING_CTA_IMAGE_URL1: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL1') || CONFIG.SHOPPING_CTA_IMAGE_URL1,
                SHOPPING_CTA_IMAGE_URL2: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL2') || CONFIG.SHOPPING_CTA_IMAGE_URL2,
                SHOPPING_CTA_IMAGE_URL3: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL3') || CONFIG.SHOPPING_CTA_IMAGE_URL3,
                WORDPRESS_URL: parseConfigValue(content, 'WORDPRESS_URL') || CONFIG.WORDPRESS_URL,
                WORDPRESS_USER_ID: parseConfigValue(content, 'WORDPRESS_USER_ID') || CONFIG.WORDPRESS_USER_ID,
                WORDPRESS_APP_PASSWORD: parseConfigValue(content, 'WORDPRESS_APP_PASSWORD') || CONFIG.WORDPRESS_APP_PASSWORD,
                COLLECT_TRENDS_ENABLED: parseConfigValue(content, 'COLLECT_TRENDS_ENABLED'),
                COLLECT_TRENDS_CATEGORIES: parseConfigValue(content, 'COLLECT_TRENDS_CATEGORIES'),
                COLLECT_TRENDS_FILTER_MIN_INCR: parseConfigValue(content, 'COLLECT_TRENDS_FILTER_MIN_INCR'),
                COLLECT_TRENDS_REUSE_GAP_DAYS: parseConfigValue(content, 'COLLECT_TRENDS_REUSE_GAP_DAYS'),
                COLLECT_TRENDS_TIME: parseConfigValue(content, 'COLLECT_TRENDS_TIME'),
                COLLECT_TRENDS_NAVER_CATEGORY: parseConfigValue(content, 'COLLECT_TRENDS_NAVER_CATEGORY'),
                COLLECT_TRENDS_WP_CATEGORY: parseConfigValue(content, 'COLLECT_TRENDS_WP_CATEGORY'),
                COLLECT_RSS_CONFIGS: parseConfigValue(content, 'COLLECT_RSS_CONFIGS'),
                PUBLISH_AUTO_ENABLED: parseConfigValue(content, 'PUBLISH_AUTO_ENABLED'),
                PUBLISH_AUTO_INTERVAL_MIN: parseConfigValue(content, 'PUBLISH_AUTO_INTERVAL_MIN'),
                PUBLISH_AUTO_BATCH_SIZE: parseConfigValue(content, 'PUBLISH_AUTO_BATCH_SIZE')
            });
            applyRuntimeConfigFromMajor(fields);
            syncAutoRunnerWithConfig();
            syncShoppingAutoRunnerWithConfig();
            CONFIG.CONFIG_READY = true;
            CONFIG.CONFIG_SOURCE_TYPE = 'config';
            CONFIG.CONFIG_SOURCE_PATH = writablePath;
            CONFIG.CONFIG_ERROR_MESSAGE = '';
            const revision = createConfigRevision(content);
            recordDashboardActivity({
                category: 'settings',
                type: 'advanced_settings_saved',
                title: '고급 설정 저장 완료',
                detail: path.basename(writablePath)
            });
            return {
                configPath: writablePath,
                configSourceType: 'config',
                requiresRestart: true,
                message: '고급 설정 저장 완료',
                revision
            };
        },

        async testTelegramConnection(requestBody = {}) {
            const botToken = String(requestBody.botToken || '').trim();
            const chatId = String(requestBody.chatId || '').trim();

            if (!botToken || !chatId) {
                throw createApiError(400, 'MISSING_PARAMS', '봇 토큰과 챗 ID를 모두 입력해주세요.');
            }

            const result = await TelegramService.testConnection(botToken, chatId);
            if (!result.success) {
                throw createApiError(400, 'TEST_FAILED', result.message || '텔레그램 메시지 전송에 실패했습니다.');
            }

            return { message: '테스트 메시지가 성공적으로 전송되었습니다.' };
        },

        async testCustomAiConnection(requestBody = {}) {
            const baseUrl = normalizeTelegramCustomAiBaseUrl(requestBody.baseUrl);
            const apiKey = String(requestBody.apiKey || '').trim();
            const model = String(requestBody.model || '').trim();

            if (!baseUrl) {
                throw createApiError(400, 'MISSING_PARAMS', 'Base URL을 입력해주세요.');
            }
            if (!model) {
                throw createApiError(400, 'MISSING_PARAMS', 'Model을 입력해주세요.');
            }

            const axios = require('axios');
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

            try {
                const response = await axios.post(`${baseUrl}/chat/completions`, {
                    model,
                    messages: [
                        { role: 'user', content: 'Return exactly this JSON: {"ok":true}' }
                    ]
                }, {
                    headers,
                    timeout: 30000
                });
                const content = response?.data?.choices?.[0]?.message?.content;
                if (!content || (Array.isArray(content) && content.length === 0)) {
                    throw new Error('응답 본문이 비어 있습니다.');
                }
            } catch (e) {
                const remoteMessage =
                    e?.response?.data?.error?.message ||
                    e?.response?.data?.message ||
                    e.message;
                throw createApiError(400, 'TEST_FAILED', `Custom AI 연결에 실패했습니다: ${remoteMessage}`);
            }

            return { message: 'Custom AI 연결에 성공했습니다.' };
        },

        async testSlackConnection(requestBody = {}) {
            const webhookUrl = String(requestBody.webhookUrl || '').trim();

            if (!webhookUrl) {
                throw createApiError(400, 'MISSING_PARAMS', 'Webhook URL을 입력해주세요.');
            }

            const SlackService = require('../../slack-service');
            const result = await SlackService.testConnection(webhookUrl);
            if (!result.success) {
                throw createApiError(400, 'TEST_FAILED', result.message || 'Slack 메시지 전송에 실패했습니다.');
            }

            return { message: '테스트 메시지가 Slack으로 성공적으로 전송되었습니다.' };
        }
    };
}

module.exports = {
    createSettingsService,
    createApiError
};
