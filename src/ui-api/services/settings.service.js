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

            const nextRaw = applyConfigUpdates(raw, {
                LISTEN_HOST: fields.LISTEN_HOST,
                LISTEN_PORT: String(fields.LISTEN_PORT),
                NAVER_ID: fields.NAVER_ID,
                GEMINI_API_KEY: fields.GEMINI_API_KEY,
                GOOGLE_SHEET_URL: fields.GOOGLE_SHEET_URL,
                HEADLESS: fields.HEADLESS ? 'true' : 'false',
                TYPING_SPEED: fields.TYPING_SPEED,
                NAVER_AUTO_MODE: fields.NAVER_AUTO_MODE ? 'true' : 'false',
                NAVER_AUTO_CATEGORIES: fields.NAVER_AUTO_CATEGORIES,
                NAVER_AUTO_MAX_POSTS_PER_RUN: String(fields.NAVER_AUTO_MAX_POSTS_PER_RUN),
                NAVER_AUTO_TRENDS_TIME: fields.NAVER_AUTO_TRENDS_TIME,
                NAVER_AUTO_IMAGE_GENERATION: fields.NAVER_AUTO_IMAGE_GENERATION ? 'true' : 'false',
                NAVER_AUTO_EXTERNAL_REFERENCE: fields.NAVER_AUTO_EXTERNAL_REFERENCE ? 'true' : 'false',
                NAVER_AUTO_NOTIFY_ENABLED: fields.NAVER_AUTO_NOTIFY_ENABLED ? 'true' : 'false',
                NAVER_AUTO_VARIATION_INCLUDE_NEW: fields.NAVER_AUTO_VARIATION_INCLUDE_NEW ? 'true' : 'false',
                NAVER_AUTO_VARIATION_INCLUDE_DASH: fields.NAVER_AUTO_VARIATION_INCLUDE_DASH ? 'true' : 'false',
                NAVER_AUTO_VARIATION_INCLUDE_NUMBER: fields.NAVER_AUTO_VARIATION_INCLUDE_NUMBER ? 'true' : 'false',
                NAVER_AUTO_VARIATION_TYPE: fields.NAVER_AUTO_VARIATION_TYPE || 'min',
                NAVER_AUTO_VARIATION_NUMBER: fields.NAVER_AUTO_VARIATION_NUMBER === '' ? '' : String(fields.NAVER_AUTO_VARIATION_NUMBER),
                NAVER_AUTO_VARIATION_TOP_N: fields.NAVER_AUTO_VARIATION_TOP_N === '' ? '5' : String(fields.NAVER_AUTO_VARIATION_TOP_N),
                NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS: String(fields.NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS),
                NAVER_AUTO_HEADLESS: fields.NAVER_AUTO_HEADLESS ? 'true' : 'false',
                NAVER_SHOPPING_AUTO_MODE: fields.NAVER_SHOPPING_AUTO_MODE ? 'true' : 'false',
                NAVER_SHOPPING_AUTO_DAILY_POSTS: String(fields.NAVER_SHOPPING_AUTO_DAILY_POSTS),
                NAVER_SHOPPING_AUTO_TIME: fields.NAVER_SHOPPING_AUTO_TIME,
                NAVER_SHOPPING_AUTO_NOTIFY_ENABLED: fields.NAVER_SHOPPING_AUTO_NOTIFY_ENABLED ? 'true' : 'false',
                FTC_DISCLOSURE_IMAGE_URL: fields.FTC_DISCLOSURE_IMAGE_URL,
                SHOPPING_CTA_IMAGE_URL1: fields.SHOPPING_CTA_IMAGE_URL1,
                SHOPPING_CTA_IMAGE_URL2: fields.SHOPPING_CTA_IMAGE_URL2,
                SHOPPING_CTA_IMAGE_URL3: fields.SHOPPING_CTA_IMAGE_URL3,
                UPDATE_CHANNEL: fields.UPDATE_CHANNEL || 'stable'
            });
            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, nextRaw, 'utf-8');
            applyRuntimeConfigFromMajor(fields);
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
                NAVER_AUTO_MODE: parseConfigValue(content, 'NAVER_AUTO_MODE') || parseConfigValue(content, 'AUTO_MODE'),
                NAVER_AUTO_CATEGORIES:
                    parseConfigValue(content, 'NAVER_AUTO_CATEGORIES')
                    || parseConfigValue(content, 'AUTO_INCLUDE_CATEGORIES')
                    || parseConfigValue(content, 'AUTO_CATEGORIES'),
                NAVER_AUTO_MAX_POSTS_PER_RUN:
                    parseConfigValue(content, 'NAVER_AUTO_MAX_POSTS_PER_RUN')
                    || parseConfigValue(content, 'NAVER_AUTO_DAILY_POSTS')
                    || parseConfigValue(content, 'AUTO_MAX_BLOG_PER_CYCLE')
                    || parseConfigValue(content, 'AUTO_DAILY_BLOG_CAP'),
                NAVER_AUTO_TRENDS_TIME: parseConfigValue(content, 'NAVER_AUTO_TRENDS_TIME'),
                NAVER_AUTO_IMAGE_GENERATION: parseConfigValue(content, 'NAVER_AUTO_IMAGE_GENERATION') || parseConfigValue(content, 'AUTO_IMAGE_GENERATION'),
                NAVER_AUTO_EXTERNAL_REFERENCE: parseConfigValue(content, 'NAVER_AUTO_EXTERNAL_REFERENCE') || parseConfigValue(content, 'AUTO_USE_EXTERNAL_REF'),
                NAVER_AUTO_NOTIFY_ENABLED: parseConfigValue(content, 'NAVER_AUTO_NOTIFY_ENABLED'),
                NAVER_AUTO_VARIATION_INCLUDE_NEW: parseConfigValue(content, 'NAVER_AUTO_VARIATION_INCLUDE_NEW') || parseConfigValue(content, 'AUTO_TRENDS_VARIATION_INCLUDE_NEW'),
                NAVER_AUTO_VARIATION_INCLUDE_DASH: parseConfigValue(content, 'NAVER_AUTO_VARIATION_INCLUDE_DASH') || parseConfigValue(content, 'AUTO_TRENDS_VARIATION_INCLUDE_DASH'),
                NAVER_AUTO_VARIATION_INCLUDE_NUMBER: parseConfigValue(content, 'NAVER_AUTO_VARIATION_INCLUDE_NUMBER') || parseConfigValue(content, 'AUTO_TRENDS_VARIATION_INCLUDE_NUMBER'),
                NAVER_AUTO_VARIATION_TYPE: parseConfigValue(content, 'NAVER_AUTO_VARIATION_TYPE') || 'min',
                NAVER_AUTO_VARIATION_NUMBER: parseConfigValue(content, 'NAVER_AUTO_VARIATION_NUMBER') || parseConfigValue(content, 'AUTO_TRENDS_MIN_VARIATION'),
                NAVER_AUTO_VARIATION_TOP_N: parseConfigValue(content, 'NAVER_AUTO_VARIATION_TOP_N') || parseConfigValue(content, 'AUTO_TRENDS_TOP_N'),
                NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS: parseConfigValue(content, 'NAVER_AUTO_KEYWORD_REUSE_GAP_DAYS') || parseConfigValue(content, 'AUTO_KEYWORD_REUSE_GAP_DAYS'),
                NAVER_AUTO_HEADLESS: parseConfigValue(content, 'NAVER_AUTO_HEADLESS'),
                NAVER_SHOPPING_AUTO_MODE: parseConfigValue(content, 'NAVER_SHOPPING_AUTO_MODE'),
                NAVER_SHOPPING_AUTO_DAILY_POSTS: parseConfigValue(content, 'NAVER_SHOPPING_AUTO_DAILY_POSTS'),
                NAVER_SHOPPING_AUTO_TIME: parseConfigValue(content, 'NAVER_SHOPPING_AUTO_TIME'),
                NAVER_SHOPPING_AUTO_NOTIFY_ENABLED: parseConfigValue(content, 'NAVER_SHOPPING_AUTO_NOTIFY_ENABLED'),
                FTC_DISCLOSURE_IMAGE_URL: parseConfigValue(content, 'FTC_DISCLOSURE_IMAGE_URL') || CONFIG.FTC_DISCLOSURE_IMAGE_URL,
                SHOPPING_CTA_IMAGE_URL1: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL1') || CONFIG.SHOPPING_CTA_IMAGE_URL1,
                SHOPPING_CTA_IMAGE_URL2: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL2') || CONFIG.SHOPPING_CTA_IMAGE_URL2,
                SHOPPING_CTA_IMAGE_URL3: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL3') || CONFIG.SHOPPING_CTA_IMAGE_URL3
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
