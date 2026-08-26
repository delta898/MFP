function createUiSettingsFieldsRuntime(deps = {}) {
    const {
        fs,
        path,
        CONFIG,
        TelegramBotService,
        ensureRuntimeRemoteMcpConfig,
        normalizeWritingStrategy,
        normalizeBufferChannels,
        normalizeSnsAiMode,
        normalizeSnsSourceBlogs,
        getAiModelCatalog,
        normalizeStoredModelProfiles,
        getRemoteServiceStatus,
        normalizeListenHost,
        normalizeListenPort,
        normalizeWritingStyle,
        normalizeGoogleSheetUrl,
        extractGoogleSheetId,
        normalizeTypingSpeed,
        buildModelSelectionFromFields,
        normalizeChatModelSource,
        normalizeBlogAutoSettings,
        normalizeShoppingAutoSettings,
        normalizeBool,
        mergeActiveSelectionsIntoProfiles,
        normalizeIntegerOrBlank,
        normalizeNonNegativeInt,
        normalizeTimeHHmm,
        normalizePositiveInt,
        normalizeCollectTrendsSettings,
        normalizePublishAutoSettings,
        normalizeRemoteMcpHost,
        normalizeRemoteMcpPort,
        normalizeRemoteMcpPath,
        resolveWritableConfigPath,
        defaultHost: DEFAULT_HOST,
        defaultPort: DEFAULT_PORT,
        allowedTypingSpeeds: ALLOWED_TYPING_SPEEDS,
        shoppingImageSlotMap: SHOPPING_IMAGE_SLOT_MAP,
        defaultShoppingImageSources: DEFAULT_SHOPPING_IMAGE_SOURCES,
        allowedImageExts: ALLOWED_IMAGE_EXTS
    } = deps;

    function applyConfigUpdates(raw, updates = {}) {
        const source = String(raw || '');
        const entries = Object.entries(updates || {});
        if (entries.length === 0) return source;

        try {
            const structured = JSON.parse(source);
            if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
                structured.platforms = structured.platforms && typeof structured.platforms === 'object'
                    ? structured.platforms
                    : {};
                structured.platforms.naver = structured.platforms.naver && typeof structured.platforms.naver === 'object'
                    ? structured.platforms.naver
                    : {};
                structured.platforms.naver.assets = structured.platforms.naver.assets && typeof structured.platforms.naver.assets === 'object'
                    ? structured.platforms.naver.assets
                    : {};

                const assets = structured.platforms.naver.assets;
                const ctaImages = Array.isArray(assets.cta_images) ? [...assets.cta_images] : [];
                while (ctaImages.length < 3) ctaImages.push('');
                const ctaIndexByKey = {
                    SHOPPING_CTA_IMAGE_URL1: 0,
                    SHOPPING_CTA_IMAGE_URL2: 1,
                    SHOPPING_CTA_IMAGE_URL3: 2
                };

                for (const [key, value] of entries) {
                    if (key === 'FTC_DISCLOSURE_IMAGE_URL') {
                        assets.ftc_image = value;
                    } else if (Object.prototype.hasOwnProperty.call(ctaIndexByKey, key)) {
                        ctaImages[ctaIndexByKey[key]] = value;
                    } else {
                        structured[key] = value;
                    }
                }
                assets.cta_images = ctaImages;
                return `${JSON.stringify(structured, null, 2)}\n`;
            }
        } catch (_error) {
            // Legacy KEY=VALUE config is updated below.
        }

        const pending = new Map(entries.map(([key, value]) => [key, String(value ?? '')]));
        const lines = source.split(/\r?\n/).map((line) => {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
            if (!match || !pending.has(match[1])) return line;
            const key = match[1];
            const value = pending.get(key);
            pending.delete(key);
            return `${key} = ${value}`;
        });
        for (const [key, value] of pending.entries()) lines.push(`${key} = ${value}`);
        return lines.join('\n');
    }

    function buildMajorSettings(raw, configSource) {
        const remoteMcp = ensureRuntimeRemoteMcpConfig(CONFIG);
        // 이제 raw(text)를 파싱하는 대신 이미 로드된 CONFIG 객체의 값을 우선 시용합니다.
        const fields = {
            LISTEN_HOST: CONFIG.LISTEN_HOST,
            LISTEN_PORT: CONFIG.LISTEN_PORT,
            NAVER_ID: CONFIG.NAVER_ID,
            WORDPRESS_URL: CONFIG.WORDPRESS_URL,
            WORDPRESS_USER_ID: CONFIG.WORDPRESS_USER_ID,
            WORDPRESS_APP_PASSWORD: CONFIG.WORDPRESS_APP_PASSWORD,
            BLOG_WRITING_MODE: CONFIG.BLOG_WRITING_MODE || 'conversational',
            BLOG_SPEECH_LEVEL: CONFIG.BLOG_SPEECH_LEVEL || 'polite',
            BLOG_WRITING_STRATEGY: normalizeWritingStrategy(CONFIG.BLOG_WRITING_STRATEGY),
            GOOGLE_SHEET_URL: CONFIG.GOOGLE_SHEET_URL,
            HEADLESS: CONFIG.HEADLESS,
            IMAGE_OPTIMIZATION_ENABLED: CONFIG.IMAGE_OPTIMIZATION_ENABLED,
            TYPING_SPEED: CONFIG.TYPING_SPEED,
            FTC_DISCLOSURE_IMAGE_URL: CONFIG.FTC_DISCLOSURE_IMAGE_URL,
            SHOPPING_CTA_IMAGE_URL1: CONFIG.SHOPPING_CTA_IMAGE_URL1,
            SHOPPING_CTA_IMAGE_URL2: CONFIG.SHOPPING_CTA_IMAGE_URL2,
            SHOPPING_CTA_IMAGE_URL3: CONFIG.SHOPPING_CTA_IMAGE_URL3,
            UPDATE_CHANNEL: CONFIG.UPDATE_CHANNEL || 'stable',
            UPDATE_SERVER_TYPE: CONFIG.UPDATE_SERVER_TYPE || 'github',
            CUSTOM_UPDATE_CHECK_URL: CONFIG.CUSTOM_UPDATE_CHECK_URL || '',
            UPDATE_MIRROR_REPO: CONFIG.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases',
            TEXT_MODEL_PROVIDER: CONFIG.TEXT_MODEL_CONFIG?.provider || 'google',
            TEXT_MODEL_PRESET_CODE: CONFIG.TEXT_MODEL_CONFIG?.provider === 'direct' ? '' : (CONFIG.TEXT_MODEL_CONFIG?.code || ''),
            TEXT_MODEL_NAME: CONFIG.TEXT_MODEL_CONFIG?.name || '',
            TEXT_MODEL_BASE_URL: CONFIG.TEXT_MODEL_CONFIG?.base_url || '',
            TEXT_MODEL_API_KEY: CONFIG.TEXT_MODEL_CONFIG?.api_key || '',
            IMAGE_MODEL_PROVIDER: CONFIG.IMAGE_MODEL_CONFIG?.provider || 'google',
            IMAGE_MODEL_PRESET_CODE: CONFIG.IMAGE_MODEL_CONFIG?.provider === 'direct' ? '' : (CONFIG.IMAGE_MODEL_CONFIG?.code || ''),
            IMAGE_MODEL_NAME: CONFIG.IMAGE_MODEL_CONFIG?.name || '',
            IMAGE_MODEL_BASE_URL: CONFIG.IMAGE_MODEL_CONFIG?.base_url || '',
            IMAGE_MODEL_API_KEY: CONFIG.IMAGE_MODEL_CONFIG?.api_key || '',

            // Automation - Trends
            COLLECT_TRENDS_ENABLED: CONFIG.COLLECT_TRENDS_ENABLED,
            COLLECT_TRENDS_CATEGORIES: CONFIG.COLLECT_TRENDS_CATEGORIES,
            COLLECT_TRENDS_FILTER_MIN_INCR: CONFIG.COLLECT_TRENDS_FILTER_MIN_INCR,
            COLLECT_TRENDS_FILTER_INCLUDE_NEW: CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NEW,
            COLLECT_TRENDS_FILTER_INCLUDE_DASH: CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_DASH,
            COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER,
            COLLECT_TRENDS_FILTER_TYPE: CONFIG.COLLECT_TRENDS_FILTER_TYPE,
            COLLECT_TRENDS_FILTER_TOP_N: CONFIG.COLLECT_TRENDS_FILTER_TOP_N,
            COLLECT_TRENDS_REUSE_GAP_DAYS: CONFIG.COLLECT_TRENDS_REUSE_GAP_DAYS,
            COLLECT_TRENDS_TIME: CONFIG.COLLECT_TRENDS_TIME,
            COLLECT_TRENDS_NAVER_CATEGORY: CONFIG.COLLECT_TRENDS_NAVER_CATEGORY,
            COLLECT_TRENDS_WP_CATEGORY: CONFIG.COLLECT_TRENDS_WP_CATEGORY,

            // Automation - RSS
            COLLECT_RSS_ENABLED: CONFIG.COLLECT_RSS_ENABLED,
            COLLECT_RSS_CONFIGS: CONFIG.COLLECT_RSS_CONFIGS || [],

            // Buffer SNS Distribution
            BUFFER_API_KEY: CONFIG.BUFFER_API_KEY || '',
            BUFFER_ORGANIZATION_ID: CONFIG.BUFFER_ORGANIZATION_ID || '',
            BUFFER_CHANNELS: normalizeBufferChannels(CONFIG.BUFFER_CHANNELS),
            BUFFER_HELP_URL: CONFIG.BUFFER_HELP_URL || '',
            SNS_PUBLISH_ENABLED: CONFIG.SNS_PUBLISH_ENABLED === true,
            SNS_PUBLISH_INTERVAL_MIN: Math.max(10, Number(CONFIG.SNS_PUBLISH_INTERVAL_MIN) || 10),
            SNS_AI_MODE: normalizeSnsAiMode(CONFIG.SNS_AI_MODE),
            SNS_SOURCE_BLOGS: normalizeSnsSourceBlogs(CONFIG.SNS_SOURCE_BLOGS),

            // Automation - Publish
            PUBLISH_AUTO_ENABLED: CONFIG.PUBLISH_AUTO_ENABLED,
            PUBLISH_AUTO_INTERVAL_MIN: CONFIG.PUBLISH_AUTO_INTERVAL_MIN,
            PUBLISH_AUTO_BATCH_SIZE: CONFIG.PUBLISH_AUTO_BATCH_SIZE,
            PUBLISH_AUTO_POST_STATUS: CONFIG.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish',
            PUBLISH_AUTO_TARGET_CHANNELS: CONFIG.PUBLISH_AUTO_TARGET_CHANNELS,
            PUBLISH_AUTO_HEADLESS: CONFIG.PUBLISH_AUTO_HEADLESS,
            PUBLISH_AUTO_NOTIFY_ENABLED: CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED,
            PUBLISH_AUTO_START_TIME: CONFIG.PUBLISH_AUTO_START_TIME,
            PUBLISH_AUTO_END_TIME: CONFIG.PUBLISH_AUTO_END_TIME,

            // Automation - Shopping
            SHOPPING_PUBLISH_AUTO_ENABLED: CONFIG.SHOPPING_PUBLISH_AUTO_ENABLED,
            SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: CONFIG.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN,
            SHOPPING_PUBLISH_AUTO_BATCH_SIZE: CONFIG.SHOPPING_PUBLISH_AUTO_BATCH_SIZE,
            SHOPPING_PUBLISH_AUTO_HEADLESS: CONFIG.SHOPPING_PUBLISH_AUTO_HEADLESS,
            SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: CONFIG.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS,
            SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: CONFIG.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED,
            SHOPPING_PUBLISH_AUTO_START_TIME: CONFIG.SHOPPING_PUBLISH_AUTO_START_TIME,
            SHOPPING_PUBLISH_AUTO_END_TIME: CONFIG.SHOPPING_PUBLISH_AUTO_END_TIME,
            SHOPPING_AUTO_TIME: CONFIG.SHOPPING_AUTO_TIME,

            // Telegram Notification
            NOTIFY_TELEGRAM_ENABLED: CONFIG.NOTIFY_TELEGRAM_ENABLED,
            NOTIFY_TELEGRAM_BOT_TOKEN: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
            NOTIFY_TELEGRAM_CHAT_ID: CONFIG.NOTIFY_TELEGRAM_CHAT_ID,
            NOTIFY_BITLY_TOKEN: CONFIG.NOTIFY_BITLY_TOKEN,
            // Chat Model role
            CHAT_MODEL_SOURCE: CONFIG.CHAT_MODEL_SOURCE || 'writing',
            CHAT_MODEL_PROVIDER: CONFIG.CHAT_MODEL_SELECTION_CONFIG?.provider || 'google',
            CHAT_MODEL_PRESET_CODE: CONFIG.CHAT_MODEL_SELECTION_CONFIG?.provider === 'direct'
                ? ''
                : (CONFIG.CHAT_MODEL_SELECTION_CONFIG?.code || ''),
            CHAT_MODEL_NAME: CONFIG.CHAT_MODEL_SELECTION_CONFIG?.name || '',
            CHAT_MODEL_BASE_URL: CONFIG.CHAT_MODEL_SELECTION_CONFIG?.base_url || '',
            CHAT_MODEL_API_KEY: CONFIG.CHAT_MODEL_SELECTION_CONFIG?.api_key || '',

            // Slack Notification
            NOTIFY_SLACK_ENABLED: CONFIG.NOTIFY_SLACK_ENABLED,
            NOTIFY_SLACK_WEBHOOK_URL: CONFIG.NOTIFY_SLACK_WEBHOOK_URL,

            MCP_REMOTE_ENABLED: remoteMcp.enabled,
            MCP_REMOTE_HOST: remoteMcp.host,
            MCP_REMOTE_PORT: remoteMcp.port,
            MCP_REMOTE_PATH: remoteMcp.path,
            MCP_REMOTE_AUTH_TOKEN: remoteMcp.authToken
        };

        return {
            configPath: configSource?.path || CONFIG.CONFIG_SOURCE_PATH || '',
            configSourceType: configSource?.sourceType || CONFIG.CONFIG_SOURCE_TYPE || 'json',
            fields,
            telegramBotStatus: typeof TelegramBotService.getStatus === 'function'
                ? TelegramBotService.getStatus()
                : null,
            remoteMcpStatus: getRemoteServiceStatus(),
            typingSpeedOptions: ALLOWED_TYPING_SPEEDS,
            aiPresets: getAiModelCatalog(),
            aiProviderProfiles: normalizeStoredModelProfiles(CONFIG.AI_MODEL_PROFILES, getAiModelCatalog()),
            shoppingImageDefaults: { ...DEFAULT_SHOPPING_IMAGE_SOURCES },
            shoppingImageSlots: buildShoppingImageSlots(fields)
        };
    }

    function applyRuntimeConfigFromMajor(fields = {}) {
        const listenHost = normalizeListenHost(fields.LISTEN_HOST, normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST));
        const listenPort = normalizeListenPort(fields.LISTEN_PORT, normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT));
        const naverId = String(fields.NAVER_ID || '').trim();
        const wordpressUrl = String(fields.WORDPRESS_URL || '').trim();
        const wordpressUserId = String(fields.WORDPRESS_USER_ID || '').trim();
        const wordpressAppPassword = String(fields.WORDPRESS_APP_PASSWORD || '').trim();
        const writingStyle = normalizeWritingStyle({
            writing_mode: fields.BLOG_WRITING_MODE,
            speech_level: fields.BLOG_SPEECH_LEVEL
        });
        const writingStrategy = normalizeWritingStrategy(fields.BLOG_WRITING_STRATEGY);
        const googleSheetUrl = normalizeGoogleSheetUrl(fields.GOOGLE_SHEET_URL, CONFIG.GOOGLE_SHEET_ID);
        const googleSheetId = extractGoogleSheetId(googleSheetUrl);
        const headless = Boolean(fields.HEADLESS);
        const typingSpeed = normalizeTypingSpeed(fields.TYPING_SPEED, 'NORMAL');
        const ftcImageUrl = String(fields.FTC_DISCLOSURE_IMAGE_URL || '').trim();
        const ctaImageUrl1 = String(fields.SHOPPING_CTA_IMAGE_URL1 || '').trim();
        const ctaImageUrl2 = String(fields.SHOPPING_CTA_IMAGE_URL2 || '').trim();
        const ctaImageUrl3 = String(fields.SHOPPING_CTA_IMAGE_URL3 || '').trim();
        const aiPresets = getAiModelCatalog();
        const textModelConfig = buildModelSelectionFromFields('text', fields, aiPresets);
        const imageModelConfig = buildModelSelectionFromFields('image', fields, aiPresets);
        const chatModelSelection = buildModelSelectionFromFields('chat', fields, aiPresets);
        const chatModelSource = normalizeChatModelSource(fields.CHAT_MODEL_SOURCE);
        const chatModelConfig = chatModelSource === 'writing' ? textModelConfig : chatModelSelection;
        const autoSettings = normalizeBlogAutoSettings(fields);
        const shoppingAutoSettings = normalizeShoppingAutoSettings(fields);
        const remoteMcp = ensureRuntimeRemoteMcpConfig(CONFIG, {
            enabled: fields.MCP_REMOTE_ENABLED,
            host: fields.MCP_REMOTE_HOST,
            port: fields.MCP_REMOTE_PORT,
            path: fields.MCP_REMOTE_PATH,
            authToken: fields.MCP_REMOTE_AUTH_TOKEN
        });

        CONFIG.NAVER_ID = naverId;
        CONFIG.WORDPRESS_URL = wordpressUrl;
        CONFIG.WORDPRESS_USER_ID = wordpressUserId;
        CONFIG.WORDPRESS_APP_PASSWORD = wordpressAppPassword;
        const profileVoice = CONFIG.CONTENT_WRITING_PROFILE?.common?.voice;
        const runtimeWritingMode = profileVoice?.writing_mode || writingStyle.writing_mode;
        const runtimeSpeechLevel = profileVoice?.speech_level || writingStyle.speech_level;
        CONFIG.BLOG_WRITING_MODE = runtimeWritingMode;
        CONFIG.BLOG_SPEECH_LEVEL = runtimeSpeechLevel;
        CONFIG.BLOG_WRITING_STRATEGY = writingStrategy;
        CONFIG.CONTENT_WRITING_MODE = runtimeWritingMode;
        CONFIG.CONTENT_SPEECH_LEVEL = runtimeSpeechLevel;
        CONFIG.CONTENT_WRITING_STRATEGY = writingStrategy;
        CONFIG.LISTEN_HOST = listenHost;
        CONFIG.LISTEN_PORT = listenPort;
        CONFIG.GOOGLE_SHEET_URL = googleSheetUrl;
        CONFIG.GOOGLE_SHEET_ID = googleSheetId;
        CONFIG.HEADLESS = headless;
        CONFIG.IMAGE_OPTIMIZATION_ENABLED = normalizeBool(fields.IMAGE_OPTIMIZATION_ENABLED, true);
        CONFIG.UPDATE_SERVER_TYPE = String(fields.UPDATE_SERVER_TYPE || 'github').trim() === 'custom' ? 'custom' : 'github';
        CONFIG.CUSTOM_UPDATE_CHECK_URL = String(fields.CUSTOM_UPDATE_CHECK_URL || '').trim();
        CONFIG.UPDATE_MIRROR_REPO = String(fields.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases').trim() || 'delta898/NaverAutoBlog-Releases';
        CONFIG.TEXT_MODEL_CONFIG = textModelConfig;
        CONFIG.IMAGE_MODEL_CONFIG = imageModelConfig;
        CONFIG.AI_MODEL_PROFILES = mergeActiveSelectionsIntoProfiles(fields.AI_MODEL_PROFILES, {
            text: textModelConfig,
            image: imageModelConfig,
            chat: chatModelSelection
        }, aiPresets);
        CONFIG.TEXT_MODEL = textModelConfig.code;
        CONFIG.IMAGE_MODEL = imageModelConfig.code;
        CONFIG.TEXT_MODEL_NAME = textModelConfig.name;
        CONFIG.IMAGE_MODEL_NAME = imageModelConfig.name;
        CONFIG.TEXT_MODEL_PROVIDER = textModelConfig.provider;
        CONFIG.IMAGE_MODEL_PROVIDER = imageModelConfig.provider;
        CONFIG.TEXT_MODEL_BASE_URL = textModelConfig.base_url;
        CONFIG.IMAGE_MODEL_BASE_URL = imageModelConfig.base_url;
        CONFIG.TEXT_MODEL_API_KEY = textModelConfig.api_key;
        CONFIG.IMAGE_MODEL_API_KEY = imageModelConfig.api_key;
        CONFIG.GEMINI_TEXT_ENDPOINT = textModelConfig.transport === 'gemini_generate_content' && textModelConfig.code
            ? `https://generativelanguage.googleapis.com/v1beta/models/${textModelConfig.code}:generateContent`
            : '';
        CONFIG.GEMINI_IMAGE_ENDPOINT = imageModelConfig.transport === 'gemini_generate_content' && imageModelConfig.code
            ? `https://generativelanguage.googleapis.com/v1beta/models/${imageModelConfig.code}:generateContent`
            : '';
        CONFIG.TYPING_SPEED = typingSpeed;
        CONFIG.TYPING = CONFIG.TYPING_PRESETS?.[typingSpeed] || CONFIG.TYPING;
        CONFIG.WRITE_URL = `https://blog.naver.com/${naverId}/postwrite`;
        CONFIG.FTC_DISCLOSURE_IMAGE_URL = ftcImageUrl;
        CONFIG.SHOPPING_CTA_IMAGE_URL1 = ctaImageUrl1;
        CONFIG.SHOPPING_CTA_IMAGE_URL2 = ctaImageUrl2;
        CONFIG.SHOPPING_CTA_IMAGE_URL3 = ctaImageUrl3;

        CONFIG.COLLECT_TRENDS_ENABLED = normalizeBool(fields.COLLECT_TRENDS_ENABLED, false);
        CONFIG.COLLECT_TRENDS_CATEGORIES = String(fields.COLLECT_TRENDS_CATEGORIES || '').trim();
        CONFIG.COLLECT_TRENDS_FILTER_MIN_INCR = normalizeIntegerOrBlank(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
        CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NEW = normalizeBool(fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW, false);
        CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_DASH = normalizeBool(fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH, false);
        CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER = normalizeBool(fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER, true);
        CONFIG.COLLECT_TRENDS_FILTER_TYPE = String(fields.COLLECT_TRENDS_FILTER_TYPE || 'min').trim();
        CONFIG.COLLECT_TRENDS_FILTER_TOP_N = normalizeIntegerOrBlank(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
        CONFIG.COLLECT_TRENDS_REUSE_GAP_DAYS = normalizeNonNegativeInt(fields.COLLECT_TRENDS_REUSE_GAP_DAYS, 15);
        CONFIG.COLLECT_TRENDS_TIME = normalizeTimeHHmm(fields.COLLECT_TRENDS_TIME, '07:30');
        CONFIG.COLLECT_TRENDS_NAVER_CATEGORY = String(fields.COLLECT_TRENDS_NAVER_CATEGORY || '').trim();
        CONFIG.COLLECT_TRENDS_WP_CATEGORY = String(fields.COLLECT_TRENDS_WP_CATEGORY || '').trim();

        CONFIG.BUFFER_API_KEY = String(fields.BUFFER_API_KEY || '').trim();
        CONFIG.BUFFER_ORGANIZATION_ID = String(fields.BUFFER_ORGANIZATION_ID || '').trim();
        CONFIG.BUFFER_CHANNELS = normalizeBufferChannels(fields.BUFFER_CHANNELS);
        CONFIG.BUFFER_HELP_URL = String(fields.BUFFER_HELP_URL || '').trim();
        CONFIG.SNS_PUBLISH_ENABLED = normalizeBool(fields.SNS_PUBLISH_ENABLED, false);
        CONFIG.SNS_PUBLISH_INTERVAL_MIN = Math.max(10, normalizePositiveInt(fields.SNS_PUBLISH_INTERVAL_MIN, 10));
        CONFIG.SNS_AI_MODE = normalizeSnsAiMode(fields.SNS_AI_MODE);
        CONFIG.SNS_SHEET_NAME = 'SNS';
        CONFIG.SNS_SOURCE_BLOGS = normalizeSnsSourceBlogs(fields.SNS_SOURCE_BLOGS);

        CONFIG.PUBLISH_AUTO_ENABLED = normalizeBool(fields.PUBLISH_AUTO_ENABLED, false);
        CONFIG.PUBLISH_AUTO_BATCH_SIZE = normalizePositiveInt(fields.PUBLISH_AUTO_BATCH_SIZE, 1);
        CONFIG.PUBLISH_AUTO_INTERVAL_MIN = normalizeNonNegativeInt(fields.PUBLISH_AUTO_INTERVAL_MIN, 60);
        CONFIG.PUBLISH_AUTO_TARGET_CHANNELS = autoSettings.PUBLISH_AUTO_TARGET_CHANNELS;
        CONFIG.PUBLISH_AUTO_HEADLESS = normalizeBool(fields.PUBLISH_AUTO_HEADLESS, true);
        CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED = normalizeBool(fields.PUBLISH_AUTO_NOTIFY_ENABLED, false);
        CONFIG.PUBLISH_AUTO_START_TIME = autoSettings.PUBLISH_AUTO_START_TIME;
        CONFIG.PUBLISH_AUTO_END_TIME = autoSettings.PUBLISH_AUTO_END_TIME;

        try {
            const rawRss = String(fields.COLLECT_RSS_CONFIGS || '').trim();
            CONFIG.COLLECT_RSS_CONFIGS = rawRss ? JSON.parse(rawRss) : [];
            if (!Array.isArray(CONFIG.COLLECT_RSS_CONFIGS)) CONFIG.COLLECT_RSS_CONFIGS = [];
        } catch {
            CONFIG.COLLECT_RSS_CONFIGS = [];
        }

        CONFIG.PUBLISH_AUTO_ENABLED = normalizeBool(fields.PUBLISH_AUTO_ENABLED, false);
        CONFIG.PUBLISH_AUTO_INTERVAL_MIN = normalizeNonNegativeInt(fields.PUBLISH_AUTO_INTERVAL_MIN, 60);
        CONFIG.PUBLISH_AUTO_BATCH_SIZE = normalizeNonNegativeInt(fields.PUBLISH_AUTO_BATCH_SIZE, 1);

        CONFIG.SHOPPING_PUBLISH_AUTO_ENABLED = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_ENABLED;
        CONFIG.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN;
        CONFIG.SHOPPING_PUBLISH_AUTO_BATCH_SIZE = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_BATCH_SIZE;
        CONFIG.SHOPPING_PUBLISH_AUTO_HEADLESS = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_HEADLESS;
        CONFIG.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS;
        CONFIG.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED = normalizeBool(fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED, false);
        CONFIG.SHOPPING_PUBLISH_AUTO_START_TIME = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_START_TIME;
        CONFIG.SHOPPING_PUBLISH_AUTO_END_TIME = shoppingAutoSettings.SHOPPING_PUBLISH_AUTO_END_TIME;
        CONFIG.SHOPPING_AUTO_MODE = shoppingAutoSettings.SHOPPING_AUTO_MODE;
        CONFIG.SHOPPING_AUTO_DAILY_POSTS = shoppingAutoSettings.SHOPPING_AUTO_DAILY_POSTS;
        CONFIG.SHOPPING_AUTO_HEADLESS = shoppingAutoSettings.SHOPPING_AUTO_HEADLESS;
        CONFIG.SHOPPING_AUTO_NOTIFY_ENABLED = shoppingAutoSettings.SHOPPING_AUTO_NOTIFY_ENABLED;
        CONFIG.SHOPPING_AUTO_TIME = shoppingAutoSettings.SHOPPING_AUTO_TIME;

        // Telegram Notify
        CONFIG.NOTIFY_TELEGRAM_ENABLED = normalizeBool(fields.NOTIFY_TELEGRAM_ENABLED, false);
        CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN = String(fields.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim();
        CONFIG.NOTIFY_TELEGRAM_CHAT_ID = String(fields.NOTIFY_TELEGRAM_CHAT_ID || '').trim();
        CONFIG.NOTIFY_BITLY_TOKEN = String(fields.NOTIFY_BITLY_TOKEN || '').trim();
        // Chat Model role
        CONFIG.CHAT_MODEL_SOURCE = chatModelSource;
        CONFIG.CHAT_MODEL_SELECTION_CONFIG = chatModelSelection;
        CONFIG.CHAT_MODEL_CONFIG = chatModelConfig;

        // Slack Notify
        CONFIG.NOTIFY_SLACK_ENABLED = normalizeBool(fields.NOTIFY_SLACK_ENABLED, false);
        CONFIG.NOTIFY_SLACK_WEBHOOK_URL = String(fields.NOTIFY_SLACK_WEBHOOK_URL || '').trim();
        CONFIG.MCP_REMOTE_ENABLED = remoteMcp.enabled;
        CONFIG.MCP_REMOTE_HOST = remoteMcp.host;
        CONFIG.MCP_REMOTE_PORT = remoteMcp.port;
        CONFIG.MCP_REMOTE_PATH = remoteMcp.path;
        CONFIG.MCP_REMOTE_AUTH_TOKEN = remoteMcp.authToken;

        Object.assign(CONFIG, autoSettings);
        Object.assign(CONFIG, shoppingAutoSettings);
    }

    function parseMajorFieldsFromRequest(requestBody = {}) {
        const listenHost = normalizeListenHost(requestBody.LISTEN_HOST, DEFAULT_HOST);
        const listenPort = normalizeListenPort(requestBody.LISTEN_PORT, DEFAULT_PORT);
        const naverId = String(requestBody.NAVER_ID || '').trim();
        const wordpressUrl = String(requestBody.WORDPRESS_URL || '').trim();
        const wordpressUserId = String(requestBody.WORDPRESS_USER_ID || '').trim();
        const wordpressAppPassword = String(requestBody.WORDPRESS_APP_PASSWORD || '').trim();
        const writingStyle = normalizeWritingStyle({
            writing_mode: requestBody.BLOG_WRITING_MODE,
            speech_level: requestBody.BLOG_SPEECH_LEVEL
        });
        const writingStrategy = normalizeWritingStrategy(
            Object.prototype.hasOwnProperty.call(requestBody, 'BLOG_WRITING_STRATEGY')
                ? requestBody.BLOG_WRITING_STRATEGY
                : (CONFIG.CONTENT_WRITING_PROFILE?.common?.writing_strategy || CONFIG.CONTENT_WRITING_STRATEGY)
        );
        const googleSheetUrl = normalizeGoogleSheetUrl(requestBody.GOOGLE_SHEET_URL, requestBody.GOOGLE_SHEET_ID);
        const headless = normalizeBool(requestBody.HEADLESS, false);
        const typingSpeed = normalizeTypingSpeed(requestBody.TYPING_SPEED, 'NORMAL');
        const ftcImageUrl = String(requestBody.FTC_DISCLOSURE_IMAGE_URL || '').trim();
        const ctaImageUrl1 = String(requestBody.SHOPPING_CTA_IMAGE_URL1 || '').trim();
        const ctaImageUrl2 = String(requestBody.SHOPPING_CTA_IMAGE_URL2 || '').trim();
        const ctaImageUrl3 = String(requestBody.SHOPPING_CTA_IMAGE_URL3 || '').trim();

        // Reorganized Namespaces
        const collectTrendsSettings = normalizeCollectTrendsSettings(requestBody);
        const rssConfigs = (() => {
            let configs = [];
            const raw = requestBody.COLLECT_RSS_CONFIGS;
            if (Array.isArray(raw)) {
                configs = raw;
            } else if (typeof raw === 'string' && raw.trim()) {
                try { configs = JSON.parse(raw); } catch (e) { configs = []; }
            }

            return configs.map(config => {
                const includeKeywords = Array.isArray(config.includeKeywords)
                    ? config.includeKeywords
                    : String(config.includeKeywords || '').split(',').map(s => s.trim()).filter(Boolean);

                const excludeKeywords = Array.isArray(config.excludeKeywords)
                    ? config.excludeKeywords
                    : String(config.excludeKeywords || '').split(',').map(s => s.trim()).filter(Boolean);

                return {
                    ...config,
                    includeKeywords,
                    excludeKeywords
                };
            });
        })();
        const collectRssEnabled = normalizeBool(requestBody.COLLECT_RSS_ENABLED, false);
        const imageOptimizationEnabled = normalizeBool(requestBody.IMAGE_OPTIMIZATION_ENABLED, true);
        const updateServerType = String(requestBody.UPDATE_SERVER_TYPE || 'github').trim() === 'custom' ? 'custom' : 'github';
        const customUpdateCheckUrl = String(requestBody.CUSTOM_UPDATE_CHECK_URL || '').trim();
        const updateMirrorRepo = String(requestBody.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases').trim() || 'delta898/NaverAutoBlog-Releases';
        const aiPresets = getAiModelCatalog();
        const textModelConfig = buildModelSelectionFromFields('text', requestBody, aiPresets);
        const imageModelConfig = buildModelSelectionFromFields('image', requestBody, aiPresets);
        const chatModelConfig = buildModelSelectionFromFields('chat', requestBody, aiPresets);
        const aiModelProfiles = mergeActiveSelectionsIntoProfiles(
            Object.prototype.hasOwnProperty.call(requestBody, 'AI_MODEL_PROFILES')
                ? requestBody.AI_MODEL_PROFILES
                : CONFIG.AI_MODEL_PROFILES,
            {
                text: textModelConfig,
                image: imageModelConfig,
                chat: chatModelConfig
            },
            aiPresets
        );

        const publishAutoSettings = normalizePublishAutoSettings(requestBody);
        const shoppingAutoSettings = normalizeShoppingAutoSettings(requestBody);
        const bufferChannels = normalizeBufferChannels(requestBody.BUFFER_CHANNELS);
        const snsSourceBlogs = normalizeSnsSourceBlogs(requestBody.SNS_SOURCE_BLOGS);

        return {
            LISTEN_HOST: listenHost,
            LISTEN_PORT: listenPort,
            NAVER_ID: naverId,
            WORDPRESS_URL: wordpressUrl,
            WORDPRESS_USER_ID: wordpressUserId,
            WORDPRESS_APP_PASSWORD: wordpressAppPassword,
            BLOG_WRITING_MODE: writingStyle.writing_mode,
            BLOG_SPEECH_LEVEL: writingStyle.speech_level,
            BLOG_WRITING_STRATEGY: writingStrategy,
            GOOGLE_SHEET_URL: googleSheetUrl,
            HEADLESS: headless,
            IMAGE_OPTIMIZATION_ENABLED: imageOptimizationEnabled,
            UPDATE_SERVER_TYPE: updateServerType,
            CUSTOM_UPDATE_CHECK_URL: customUpdateCheckUrl,
            UPDATE_MIRROR_REPO: updateMirrorRepo,
            TEXT_MODEL_PROVIDER: textModelConfig.provider,
            TEXT_MODEL_PRESET_CODE: textModelConfig.provider === 'direct' ? '' : textModelConfig.code,
            TEXT_MODEL_NAME: textModelConfig.name,
            TEXT_MODEL_BASE_URL: textModelConfig.base_url,
            TEXT_MODEL_API_KEY: textModelConfig.api_key,
            IMAGE_MODEL_PROVIDER: imageModelConfig.provider,
            IMAGE_MODEL_PRESET_CODE: imageModelConfig.provider === 'direct' ? '' : imageModelConfig.code,
            IMAGE_MODEL_NAME: imageModelConfig.name,
            IMAGE_MODEL_BASE_URL: imageModelConfig.base_url,
            IMAGE_MODEL_API_KEY: imageModelConfig.api_key,
            AI_MODEL_PROFILES: aiModelProfiles,
            TYPING_SPEED: typingSpeed,
            FTC_DISCLOSURE_IMAGE_URL: ftcImageUrl,
            SHOPPING_CTA_IMAGE_URL1: ctaImageUrl1,
            SHOPPING_CTA_IMAGE_URL2: ctaImageUrl2,
            SHOPPING_CTA_IMAGE_URL3: ctaImageUrl3,

            ...collectTrendsSettings,
            COLLECT_RSS_ENABLED: collectRssEnabled,
            COLLECT_RSS_CONFIGS: rssConfigs,

            BUFFER_API_KEY: String(requestBody.BUFFER_API_KEY || '').trim(),
            BUFFER_ORGANIZATION_ID: String(requestBody.BUFFER_ORGANIZATION_ID || '').trim(),
            BUFFER_CHANNELS: bufferChannels,
            BUFFER_HELP_URL: String(requestBody.BUFFER_HELP_URL || CONFIG.BUFFER_HELP_URL || '').trim(),
            SNS_PUBLISH_ENABLED: normalizeBool(requestBody.SNS_PUBLISH_ENABLED, false),
            SNS_PUBLISH_INTERVAL_MIN: Math.max(10, normalizePositiveInt(requestBody.SNS_PUBLISH_INTERVAL_MIN, 10)),
            SNS_AI_MODE: normalizeSnsAiMode(requestBody.SNS_AI_MODE),
            SNS_SOURCE_BLOGS: snsSourceBlogs,

            ...publishAutoSettings,
            ...shoppingAutoSettings,

            NOTIFY_TELEGRAM_ENABLED: normalizeBool(requestBody.NOTIFY_TELEGRAM_ENABLED, false),
            NOTIFY_TELEGRAM_BOT_TOKEN: String(requestBody.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim(),
            NOTIFY_TELEGRAM_CHAT_ID: String(requestBody.NOTIFY_TELEGRAM_CHAT_ID || '').trim(),
            NOTIFY_BITLY_TOKEN: String(requestBody.NOTIFY_BITLY_TOKEN || '').trim(),
            CHAT_MODEL_SOURCE: normalizeChatModelSource(requestBody.CHAT_MODEL_SOURCE),
            CHAT_MODEL_PROVIDER: chatModelConfig.provider,
            CHAT_MODEL_PRESET_CODE: chatModelConfig.provider === 'direct' ? '' : chatModelConfig.code,
            CHAT_MODEL_NAME: chatModelConfig.name,
            CHAT_MODEL_BASE_URL: chatModelConfig.base_url,
            CHAT_MODEL_API_KEY: chatModelConfig.api_key,

            NOTIFY_SLACK_ENABLED: normalizeBool(requestBody.NOTIFY_SLACK_ENABLED, false),
            NOTIFY_SLACK_WEBHOOK_URL: String(requestBody.NOTIFY_SLACK_WEBHOOK_URL || '').trim(),

            MCP_REMOTE_ENABLED: normalizeBool(requestBody.MCP_REMOTE_ENABLED, false),
            MCP_REMOTE_HOST: normalizeRemoteMcpHost(requestBody.MCP_REMOTE_HOST, '127.0.0.1'),
            MCP_REMOTE_PORT: normalizeRemoteMcpPort(requestBody.MCP_REMOTE_PORT, 4578),
            MCP_REMOTE_PATH: normalizeRemoteMcpPath(requestBody.MCP_REMOTE_PATH, '/mcp'),
            MCP_REMOTE_AUTH_TOKEN: String(requestBody.MCP_REMOTE_AUTH_TOKEN || '').trim()
        };
    }

    function isAllowedImageSourceValue(value) {
        const v = String(value || '').trim();
        if (!v) return true;
        if (/^https:\/\//i.test(v)) return true;
        if (/^http:\/\//i.test(v)) return false;
        if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(v)) return false;
        return true;
    }

    function validateRequiredShoppingImageSources(fields = {}) {
        const errors = [];
        for (const slotInfo of Object.values(SHOPPING_IMAGE_SLOT_MAP)) {
            if (!slotInfo.required) continue;
            const value = String(fields[slotInfo.key] || '').trim();
            if (!value) {
                errors.push(`${slotInfo.label}는 필수입니다.`);
            }
        }
        return errors;
    }

    function resolveRuntimePath(rawPath, options = {}) {
        const raw = String(rawPath || '').trim();
        if (!raw) return '';

        if (typeof CONFIG.resolveRuntimePath === 'function') {
            const resolved = CONFIG.resolveRuntimePath(raw, options || {});
            if (resolved) return resolved;
        }

        const appRoot = CONFIG.APP_ROOT_DIR || process.cwd();
        const writablePath = resolveWritableConfigPath();
        const configDir = path.dirname(writablePath);
        const execDir = path.dirname(process.execPath || process.cwd());
        const mustExist = Boolean(options?.mustExist);

        const candidates = path.isAbsolute(raw)
            ? [raw]
            : [
                path.resolve(appRoot, raw),
                path.resolve(configDir, raw),
                path.resolve(execDir, raw)
            ];

        for (const candidate of candidates) {
            if (!mustExist || fs.existsSync(candidate)) {
                return candidate;
            }
        }
        return '';
    }

    function resolveLocalImagePathFromSource(source) {
        const raw = String(source || '').trim();
        if (!raw || /^https?:\/\//i.test(raw)) return '';

        if (typeof CONFIG.resolveRuntimePath === 'function') {
            const resolved = CONFIG.resolveRuntimePath(raw, { mustExist: true });
            if (resolved) {
                try {
                    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
                } catch (e) { }
            }
        }

        const writablePath = resolveWritableConfigPath();
        const configDir = path.dirname(writablePath);
        const appRoot = CONFIG.APP_ROOT_DIR || process.cwd();
        const execDir = path.dirname(process.execPath || process.cwd());
        const candidates = [];
        if (/^file:\/\//i.test(raw)) {
            try {
                const parsed = new URL(raw);
                if (parsed.protocol === 'file:') {
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
                    if (localPath) candidates.push(localPath);
                }
            } catch (e) {
                const afterScheme = raw.replace(/^file:\/\//i, '');
                if (afterScheme) candidates.push(afterScheme);
            }
        } else {
            candidates.push(raw);
        }

        const expanded = [];
        for (const candidate of candidates) {
            const normalized = String(candidate || '').trim();
            if (!normalized) continue;
            if (path.isAbsolute(normalized)) {
                expanded.push(normalized);
            } else {
                expanded.push(path.resolve(appRoot, normalized));
                expanded.push(path.resolve(configDir, normalized));
                expanded.push(path.resolve(execDir, normalized));
            }
        }

        for (const candidate of expanded) {
            try {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
            } catch (e) { }
        }

        return '';
    }

    function buildShoppingImageSlots(fields = {}) {
        const slots = {};
        for (const [slot, info] of Object.entries(SHOPPING_IMAGE_SLOT_MAP)) {
            const source = String(fields[info.key] || '').trim();
            const isRemote = /^https?:\/\//i.test(source);
            const isLocal = !!source && !isRemote;
            const defaultSource = String(DEFAULT_SHOPPING_IMAGE_SOURCES[info.key] || '').trim();
            const previewUrl = source
                ? (isLocal
                    ? `/api/v1/settings/shopping-image/preview?slot=${encodeURIComponent(slot)}&_t=${Date.now()}`
                    : source)
                : '';
            slots[slot] = {
                slot,
                label: info.label,
                key: info.key,
                source,
                defaultSource,
                required: Boolean(info.required),
                mode: source ? (isLocal ? 'local' : 'remote') : 'empty',
                previewUrl
            };
        }
        return slots;
    }

    function inferImageExt(fileName = '', mimeType = '') {
        const fromName = path.extname(String(fileName || '')).toLowerCase();
        if (ALLOWED_IMAGE_EXTS.has(fromName)) return fromName;
        const m = String(mimeType || '').toLowerCase();
        if (m.includes('png')) return '.png';
        if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
        if (m.includes('webp')) return '.webp';
        if (m.includes('gif')) return '.gif';
        return '';
    }

    function parseBase64ImagePayload(requestBody = {}) {
        const fileName = String(requestBody.fileName || '').trim();
        const mimeType = String(requestBody.mimeType || '').trim();
        let base64Data = String(requestBody.base64Data || '').trim();
        if (!base64Data) throw new Error('이미지 데이터가 비어 있습니다.');

        const dataUrlMatch = base64Data.match(/^data:([^;,]+);base64,(.+)$/i);
        if (dataUrlMatch) {
            if (!mimeType) {
                requestBody.mimeType = dataUrlMatch[1] || '';
            }
            base64Data = dataUrlMatch[2] || '';
        }

        const ext = inferImageExt(fileName, mimeType || requestBody.mimeType || '');
        if (!ext) throw new Error('지원하지 않는 이미지 형식입니다. (png/jpg/jpeg/webp/gif)');

        let buffer;
        try {
            buffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
            throw new Error('이미지 base64 디코딩에 실패했습니다.');
        }
        if (!buffer || buffer.length < 128) throw new Error('이미지 데이터가 너무 작습니다.');
        if (buffer.length > 10 * 1024 * 1024) throw new Error('이미지 파일이 너무 큽니다. (최대 10MB)');

        return { buffer, ext };
    }


    return {
        applyConfigUpdates,
        buildMajorSettings,
        applyRuntimeConfigFromMajor,
        parseMajorFieldsFromRequest,
        isAllowedImageSourceValue,
        validateRequiredShoppingImageSources,
        resolveRuntimePath,
        resolveLocalImagePathFromSource,
        buildShoppingImageSlots,
        inferImageExt,
        parseBase64ImagePayload
    };
}

module.exports = {
    createUiSettingsFieldsRuntime
};
