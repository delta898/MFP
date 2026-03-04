function createApiError(status, code, message) {
    const err = new Error(message || '요청 처리 중 오류가 발생했습니다.');
    err.status = Number.isInteger(status) ? status : 400;
    err.apiCode = code || 'SETTINGS_ERROR';
    return err;
}

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
        createConfigRevision,
        parseConfigValue
    } = deps;

    return {
        async getMajorSettings() {
            const configSource = tryResolveReadableConfigSource();
            const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
            const effectiveSource = configSource || { path: resolveWritableConfigPath(), sourceType: 'generated' };
            return buildMajorSettings(raw, effectiveSource);
        },

        async saveMajorSettings(requestBody = {}) {
            const configSource = tryResolveReadableConfigSource();
            const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
            const writablePath = resolveWritableConfigPath();
            const fields = parseMajorFieldsFromRequest(requestBody || {});
            const prevListenHost = normalizeListenHost(CONFIG.LISTEN_HOST, DEFAULT_HOST);
            const prevListenPort = normalizeListenPort(CONFIG.LISTEN_PORT, DEFAULT_PORT);

            const imageKeys = [
                'FTC_DISCLOSURE_IMAGE_URL',
                'SHOPPING_CTA_IMAGE_URL1',
                'SHOPPING_CTA_IMAGE_URL2',
                'SHOPPING_CTA_IMAGE_URL3'
            ];
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

            const ADVANCED_DEFAULTS = {
                HEADLESS: false,
                TYPING_SPEED: 'NORMAL',
                UPDATE_CHANNEL: 'stable',
                SHOPPING_AUTO_NOTIFY_ENABLED: false,
                COLLECT_TRENDS_ENABLED: false,
                COLLECT_TRENDS_FILTER_MIN_INCR: 50,
                COLLECT_TRENDS_FILTER_INCLUDE_NEW: false,
                COLLECT_TRENDS_FILTER_INCLUDE_DASH: false,
                COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: true,
                COLLECT_TRENDS_FILTER_TYPE: 'min',
                COLLECT_TRENDS_FILTER_TOP_N: 5,
                COLLECT_TRENDS_REUSE_GAP_DAYS: 15,
                COLLECT_TRENDS_TIME: '07:30',
                COLLECT_RSS_ENABLED: false,
                PUBLISH_AUTO_ENABLED: false,
                PUBLISH_AUTO_INTERVAL_MIN: 60,
                PUBLISH_AUTO_BATCH_SIZE: 1,
                PUBLISH_AUTO_NOTIFY_ENABLED: false,
                PUBLISH_AUTO_TARGET_CHANNELS: 'naver',
                PUBLISH_AUTO_HEADLESS: true,
                SHOPPING_PUBLISH_AUTO_ENABLED: false,
                SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: 60,
                SHOPPING_PUBLISH_AUTO_BATCH_SIZE: 1,
                SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: false,
                SHOPPING_PUBLISH_AUTO_HEADLESS: true,
                SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: 'naver'
            };

            const updates = {
                LISTEN_HOST: fields.LISTEN_HOST,
                LISTEN_PORT: String(fields.LISTEN_PORT),
                NAVER_ID: fields.NAVER_ID,
                GEMINI_API_KEY: fields.GEMINI_API_KEY,
                GOOGLE_SHEET_URL: fields.GOOGLE_SHEET_URL,
                WORDPRESS_URL: fields.WORDPRESS_URL,
                WORDPRESS_USER_ID: fields.WORDPRESS_USER_ID,
                WORDPRESS_APP_PASSWORD: fields.WORDPRESS_APP_PASSWORD,
                SHOPPING_PUBLISH_AUTO_ENABLED: fields.SHOPPING_PUBLISH_AUTO_ENABLED ? 'true' : 'false',
                SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: String(fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN),
                SHOPPING_PUBLISH_AUTO_BATCH_SIZE: String(fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE),
                SHOPPING_PUBLISH_AUTO_HEADLESS: fields.SHOPPING_PUBLISH_AUTO_HEADLESS ? 'true' : 'false',
                SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver',
                SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED ? 'true' : 'false',
                SHOPPING_AUTO_TIME: fields.SHOPPING_AUTO_TIME,
                COLLECT_TRENDS_ENABLED: fields.COLLECT_TRENDS_ENABLED ? 'true' : 'false',
                COLLECT_TRENDS_CATEGORIES: fields.COLLECT_TRENDS_CATEGORIES,
                COLLECT_TRENDS_FILTER_MIN_INCR: String(fields.COLLECT_TRENDS_FILTER_MIN_INCR),
                COLLECT_TRENDS_REUSE_GAP_DAYS: String(fields.COLLECT_TRENDS_REUSE_GAP_DAYS),
                COLLECT_TRENDS_TIME: fields.COLLECT_TRENDS_TIME,
                COLLECT_RSS_ENABLED: fields.COLLECT_RSS_ENABLED ? 'true' : 'false',
                COLLECT_RSS_CONFIGS: Array.isArray(fields.COLLECT_RSS_CONFIGS) ? JSON.stringify(fields.COLLECT_RSS_CONFIGS) : JSON.stringify([]),
                PUBLISH_AUTO_BATCH_SIZE: String(fields.PUBLISH_AUTO_BATCH_SIZE),
                PUBLISH_AUTO_TARGET_CHANNELS: fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver',
                FTC_DISCLOSURE_IMAGE_URL: fields.FTC_DISCLOSURE_IMAGE_URL,
                SHOPPING_CTA_IMAGE_URL1: fields.SHOPPING_CTA_IMAGE_URL1,
                SHOPPING_CTA_IMAGE_URL2: fields.SHOPPING_CTA_IMAGE_URL2,
                SHOPPING_CTA_IMAGE_URL3: fields.SHOPPING_CTA_IMAGE_URL3
            };

            // 💡 [Smart Filter] Advanced 설정 중 기본값과 같은 것은 파일에서 제거(null) 처리
            Object.keys(ADVANCED_DEFAULTS).forEach(key => {
                const currentVal = fields[key];
                const defaultVal = ADVANCED_DEFAULTS[key];

                let isDefault = false;
                if (typeof defaultVal === 'boolean') {
                    isDefault = Boolean(currentVal) === defaultVal;
                } else if (typeof defaultVal === 'number') {
                    isDefault = Number(currentVal) === defaultVal || (currentVal === '' && defaultVal === 5); // Special case for TopN
                } else {
                    isDefault = String(currentVal || '').trim() === String(defaultVal).trim();
                }

                if (isDefault) {
                    updates[key] = null; // applyConfigUpdates에서 삭제 처리됨
                } else {
                    if (typeof currentVal === 'boolean') updates[key] = currentVal ? 'true' : 'false';
                    else updates[key] = String(currentVal ?? '');
                }
            });

            // 💡 [Cleanup] 모든 BLOG_AUTO_* 및 기타 레거시 설정을 config.txt에서 제거
            Object.keys(raw).forEach(key => {
                if (key.startsWith('BLOG_AUTO_')) updates[key] = null;
            });
            const EXTRA_LEGACY = [
                'AUTO_MODE', 'AUTO_CATEGORIES', 'AUTO_INCLUDE_CATEGORIES', 'AUTO_MAX_BLOG_PER_CYCLE',
                'AUTO_IMAGE_GENERATION', 'AUTO_USE_EXTERNAL_REF', 'AUTO_TRENDS_MIN_VARIATION',
                'AUTO_TRENDS_VARIATION_INCLUDE_NEW', 'AUTO_TRENDS_VARIATION_INCLUDE_DASH',
                'AUTO_TRENDS_VARIATION_INCLUDE_NUMBER', 'AUTO_TRENDS_TOP_N', 'AUTO_KEYWORD_REUSE_GAP_DAYS',
                'PUBLISH_AUTO_DAILY_LIMIT', 'BLOG_AUTO_MAX_POSTS_PER_RUN', 'BLOG_AUTO_TRENDS_TIME',
                'BLOG_AUTO_IMAGE_GENERATION', 'BLOG_AUTO_EXTERNAL_REFERENCE'
            ];
            EXTRA_LEGACY.forEach(key => {
                if (raw[key] !== undefined) updates[key] = null;
            });

            const nextRaw = applyConfigUpdates(raw, updates);
            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, nextRaw, 'utf-8');
            applyRuntimeConfigFromMajor(fields);

            // 🆕 동적으로 CONFIG 객체 업데이트 (서버 재시작 없이 반영되도록)
            Object.keys(fields).forEach(key => {
                CONFIG[key] = fields[key];
            });

            syncAutoRunnerWithConfig();
            syncShoppingAutoRunnerWithConfig();
            const requiresRestart =
                fields.LISTEN_HOST !== prevListenHost ||
                normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT) !== prevListenPort;
            CONFIG.CONFIG_READY = true;
            CONFIG.CONFIG_SOURCE_TYPE = 'config';
            CONFIG.CONFIG_SOURCE_PATH = writablePath;
            CONFIG.CONFIG_ERROR_MESSAGE = '';

            if (requiresRestart) {
                scheduleUiReload(fields.LISTEN_HOST, normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT));
            }

            return {
                ...buildMajorSettings(nextRaw, { path: writablePath, sourceType: 'config' }),
                requiresRestart,
                restarting: requiresRestart,
                newHost: fields.LISTEN_HOST,
                newPort: normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT),
                message: requiresRestart ? '주요 설정 저장 완료. 서버가 재시작됩니다...' : '주요 설정 저장 완료'
            };
        },

        async getAdvancedSettings() {
            const configSource = tryResolveReadableConfigSource();
            const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
            const revision = createConfigRevision(raw);
            return {
                configPath: (configSource?.path) || resolveWritableConfigPath(),
                configSourceType: (configSource?.sourceType) || 'generated',
                content: raw,
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
                GEMINI_API_KEY: parseConfigValue(content, 'GEMINI_API_KEY') || CONFIG.GEMINI_API_KEY,
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
            return {
                configPath: writablePath,
                configSourceType: 'config',
                requiresRestart: true,
                message: '고급 설정 저장 완료',
                revision
            };
        }
    };
}

module.exports = {
    createSettingsService,
    createApiError
};
