function createApiError(status, code, message) {
    const err = new Error(message || '요청 처리 중 오류가 발생했습니다.');
    err.status = Number.isInteger(status) ? status : 400;
    err.apiCode = code || 'SETTINGS_ERROR';
    return err;
}

function describeAiModelConnectionFailure(error) {
    const message = String(error?.message || '').trim();
    if (/^서버가 다른 모델 정보를 반환했습니다: [a-z0-9._-]+$/i.test(message)) {
        return `AI 모델 연결 실패 · ${message}`;
    }
    const status = Number(error?.remoteStatus || 0);
    if (status === 401 || status === 403) {
        return `AI 모델 연결 실패 · API Key 또는 모델 접근 권한을 확인해 주세요. (HTTP ${status})`;
    }
    if (status === 404) {
        return 'AI 모델 연결 실패 · 선택한 모델을 찾지 못했습니다.';
    }
    return 'AI 모델 연결 확인에 실패했습니다. 모델 설정과 네트워크 상태를 확인해 주세요.';
}

const {
    getAiModelCatalog,
    buildModelSelectionFromFields,
    toStoredModelSelection,
    toStoredChatModelSettings,
    mergeActiveSelectionsIntoProfiles,
    normalizeStoredModelProfiles,
    normalizeChatModelSource
} = require('../../../services/ai/model-configuration');
const { isSnsAiMode } = require('../../../services/sns/ai-policy');
const {
    readConnectionVerification,
    recordConnectionVerification,
    listConnectionVerifications
} = require('../../storage/connection-verifications/state-store');
const { createConnectionSignature, isVerificationTrusted } = require('../../../services/connection-verification/policy');
const { createAiModelVerificationSignature } = require('../../../services/ai/model-verification');
const { createSettingsWritingProfileRuntime } = require('../../../composition/settings-writing-profile');
const {
    createSettingsAiModelsApplication,
    normalizeAiRoleSettings: normalizeAiRoleSettingsForApplication,
    redactAiRoleSecretFields,
    redactAiProviderProfiles: redactAiProviderProfilesForApplication
} = require('../../../applications/settings/ai-models/application');
const {
    createSettingsAppPreferencesApplication,
    normalizeAppGeneralSettings: normalizeAppGeneralSettingsForApplication,
    normalizeAppInputSettings: normalizeAppInputSettingsForApplication
} = require('../../../applications/settings/app-preferences/application');
const {
    createSettingsCoreConnectionsApplication,
    normalizeCoreConnectionSettings: normalizeCoreConnectionSettingsForApplication,
    applyCoreConnectionSettings
} = require('../../../applications/settings/core-connections/application');
const {
    createSnsDistributionSettingsApplication,
    normalizeSnsDistributionSettings
} = require('../../../applications/sns/distribution/settings-application');
const {
    createSettingsOptionalServicesApplication,
    normalizeOptionalServiceSettings: normalizeOptionalServiceSettingsForApplication
} = require('../../../applications/settings/optional-services/application');
const {
    createSettingsExternalConnectionsApplication,
    normalizeExternalConnectionSettings: normalizeExternalConnectionSettingsForApplication
} = require('../../../applications/settings/external-connections/application');
const { createCardNewsSourceSettingsApplication } = require('../../../applications/card-news/source-settings/application');
const {
    normalizeCardNewsBuiltinSources,
    normalizeCardNewsRssSources
} = require('../../../applications/card-news/sources/feed-sources');

function removeManagedKeywordCredentials(structuredConfig = {}) {
    for (const key of [
        'NAVER_SEARCHAD_API_KEY',
        'NAVER_SEARCHAD_SECRET_KEY',
        'NAVER_SEARCHAD_CUSTOMER_ID',
        'NAVER_API_HUB_CLIENT_ID',
        'NAVER_API_HUB_CLIENT_SECRET'
    ]) {
        delete structuredConfig[key];
    }
    if (structuredConfig.integrations && typeof structuredConfig.integrations === 'object') {
        delete structuredConfig.integrations.naver_searchad;
        delete structuredConfig.integrations.naver_api_hub;
    }
    if (structuredConfig.platforms?.naver && typeof structuredConfig.platforms.naver === 'object') {
        delete structuredConfig.platforms.naver.searchad_api_key;
        delete structuredConfig.platforms.naver.searchad_secret_key;
        delete structuredConfig.platforms.naver.searchad_customer_id;
        delete structuredConfig.platforms.naver.api_hub_client_id;
        delete structuredConfig.platforms.naver.api_hub_client_secret;
    }
    return structuredConfig;
}

function redactMajorSecretFields(settings = {}) {
    const fields = { ...(settings?.fields || {}) };
    const wordpressPassword = String(fields.WORDPRESS_APP_PASSWORD || '').trim();
    delete fields.WORDPRESS_APP_PASSWORD;
    fields.WORDPRESS_APP_PASSWORD_CONFIGURED = Boolean(wordpressPassword);
    return { ...settings, fields };
}

function normalizeCoreConnectionSettings(requestBody = {}) {
    try { return normalizeCoreConnectionSettingsForApplication(requestBody); }
    catch (error) { throw createApiError(error.status || 400, error.code, error.message); }
}

function normalizeAiRoleSettings(requestBody = {}) {
    try { return normalizeAiRoleSettingsForApplication(requestBody, normalizeChatModelSource); }
    catch (error) { throw createApiError(400, error.code, error.message); }
}

function redactAiProviderProfiles(rawProfiles = {}) {
    return redactAiProviderProfilesForApplication(rawProfiles, normalizeStoredModelProfiles, getAiModelCatalog);
}

function normalizeOptionalServiceSettings(requestBody = {}) {
    const scope = String(requestBody.scope || '').trim().toLowerCase();
    if (scope === 'sns-distribution') {
        try { return normalizeSnsDistributionSettings(requestBody); }
        catch (error) { throw createApiError(400, error.code, error.message); }
    }
    try { return normalizeOptionalServiceSettingsForApplication(requestBody); }
    catch (error) { throw createApiError(error.status || 400, error.code, error.message); }
}

function normalizeExternalConnectionSettings(requestBody = {}) {
    try { return normalizeExternalConnectionSettingsForApplication(requestBody); }
    catch (error) { throw createApiError(error.status || 400, error.code, error.message); }
}

function normalizeAppGeneralSettings(requestBody = {}) {
    try { return normalizeAppGeneralSettingsForApplication(requestBody); }
    catch (error) { throw createApiError(400, error.code, error.message); }
}

function normalizeAppInputSettings(requestBody = {}) {
    try { return normalizeAppInputSettingsForApplication(requestBody); }
    catch (error) { throw createApiError(400, error.code, error.message); }
}

function aiVerificationSignature(scope, modelConfig = {}) {
    return createAiModelVerificationSignature(scope, modelConfig);
}

function aiRoleVerification(scope, modelConfig = {}) {
    const record = readConnectionVerification('ai-role', aiVerificationSignature(scope, modelConfig));
    if (!record) return null;
    return {
        status: record.status,
        checked_at: record.checked_at,
        trusted: isVerificationTrusted('ai-role', record)
    };
}

function aiRoleVerificationHistory(scope) {
    const normalized = String(scope || '').trim();
    if (!normalized) return [];
    return listConnectionVerifications('ai-role')
        .filter((entry) => entry?.meta?.scope === normalized && isVerificationTrusted('ai-role', entry))
        .map((entry) => ({
            provider: entry.meta.provider || '',
            code: entry.meta.code || '',
            base_url: entry.meta.base_url || '',
            checked_at: entry.checked_at,
            trusted: true
        }));
}

function recordAiRoleVerification(scope, modelConfig = {}, result = {}) {
    const signature = aiVerificationSignature(scope, modelConfig);
    if (!signature) return null;
    return recordConnectionVerification('ai-role', signature, result, {
        scope: String(scope || '').trim(),
        provider: String(modelConfig?.provider || '').trim(),
        code: String(modelConfig?.code || '').trim(),
        base_url: String(modelConfig?.base_url || '').trim()
    });
}

function bufferConnectionSignature(apiKey, organizationId) {
    return createConnectionSignature(['buffer', apiKey, organizationId || '<all-workspaces>']);
}

function bufferConnectionVerification(apiKey, organizationId) {
    const signature = bufferConnectionSignature(apiKey, organizationId);
    const record = readConnectionVerification('buffer', signature);
    if (!record) return null;
    return {
        status: record.status,
        checked_at: record.checked_at,
        trusted: isVerificationTrusted('buffer', record),
        message: record.message || ''
    };
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
        scheduleUiReload,
        restartRemoteMcpService,
        getRemoteServiceStatus,
        ensureRuntimeRemoteMcpConfig,
        generateRemoteMcpBearerToken,
        createConfigRevision,
        parseConfigValue,
        TelegramService,
        TelegramBotService,
        SlackService,
        telegramPairingService: providedTelegramPairingService,
        socialPublisher,
        axios,
        styleReferenceAnalyzer,
        writingProfilePreviewService,
        blogWritingApplication,
        aiGenerationService,
        aiGateway = null
    } = deps;
    const telegramPairingService = providedTelegramPairingService;

    const writingProfileApplication = createSettingsWritingProfileRuntime({
        fs,
        path,
        config: CONFIG || {},
        axios,
        cheerio: deps.cheerio,
        blogWritingApplication,
        aiGenerationService,
        styleReferenceAnalyzer,
        writingProfilePreviewService
    });

    const settingsConfigRepository = {
        resolvePath() {
            return resolveWritableConfigPath();
        },
        read() {
            const writablePath = resolveWritableConfigPath();
            let document = {};
            if (fs.existsSync(writablePath)) {
                try { document = JSON.parse(fs.readFileSync(writablePath, 'utf8')); }
                catch (_error) {
                    throw createApiError(409, 'CONFIG_JSON_INVALID', '현재 설정 파일을 읽을 수 없어 안전하게 반영하지 못했습니다.');
                }
            }
            return { path: writablePath, document };
        },
        write(writablePath, document) {
            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, JSON.stringify(document, null, 2), 'utf8');
        }
    };

    const appPreferencesApplication = createSettingsAppPreferencesApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        defaultHost: DEFAULT_HOST,
        defaultPort: DEFAULT_PORT,
        normalizeListenHost,
        normalizeListenPort,
        scheduleUiReload
    });

    const coreConnectionsApplication = createSettingsCoreConnectionsApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        buildMajorSettings
    });

    const snsDistributionSettingsApplication = createSnsDistributionSettingsApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        syncAutoRunnerWithConfig
    });

    const optionalServicesApplication = createSettingsOptionalServicesApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        getBufferConnectionVerification: bufferConnectionVerification,
        async reapplyTelegramRuntime() {
            if (!TelegramBotService) return;
            try {
                if (typeof TelegramBotService.stop === 'function') await TelegramBotService.stop();
                if (CONFIG.NOTIFY_TELEGRAM_INBOUND_ENABLED && typeof TelegramBotService.init === 'function') TelegramBotService.init();
            } catch (error) {
                console.error('Failed to apply Telegram runtime settings:', error);
            }
        }
    });

    const externalConnectionsApplication = createSettingsExternalConnectionsApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        getTelegramStatus: () => TelegramBotService?.getStatus?.() || {},
        getRemoteServiceStatus,
        ensureRuntimeRemoteMcpConfig,
        restartRemoteMcpService,
        telegramBotService: TelegramBotService
    });

    const cardNewsSourceSettingsApplication = createCardNewsSourceSettingsApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        normalizeBuiltinSources: normalizeCardNewsBuiltinSources,
        normalizeRssSources: normalizeCardNewsRssSources
    });

    const aiModelsApplication = createSettingsAiModelsApplication({
        config: CONFIG || {},
        configRepository: settingsConfigRepository,
        aiGateway,
        getModelCatalog: getAiModelCatalog,
        buildMajorSettings,
        modelConfig: {
            buildModelSelectionFromFields,
            toStoredModelSelection,
            toStoredChatModelSettings,
            mergeActiveSelectionsIntoProfiles,
            normalizeStoredModelProfiles,
            normalizeChatModelSource
        },
        verification: {
            get: aiRoleVerification,
            history: aiRoleVerificationHistory,
            record: recordAiRoleVerification
        },
        describeConnectionFailure: describeAiModelConnectionFailure
    });

    function toWritingProfileApiError(error) {
        if (error?.code !== 'INVALID_WRITING_PROFILE') return error;
        const message = Array.isArray(error.details) && error.details.length > 0
            ? error.details.map((item) => item.message).join(' ')
            : error.message;
        return createApiError(400, 'WRITING_PROFILE_INVALID', message);
    }

    return {
        async getWritingProfile() {
            return writingProfileApplication.getWritingProfile();
        },

        async saveWritingProfile(requestBody = {}) {
            try {
                return writingProfileApplication.saveWritingProfile(requestBody);
            } catch (error) {
                throw toWritingProfileApiError(error);
            }
        },

        async useDefaultWritingProfile() {
            return writingProfileApplication.useDefaultWritingProfile();
        },

        async analyzeWritingProfileReferences(requestBody = {}) {
            try {
                return await writingProfileApplication.analyzeWritingProfileReferences(requestBody);
            } catch (error) {
                if (String(error?.code || '').startsWith('STYLE_REFERENCE_')) {
                    throw createApiError(400, error.code, error.message);
                }
                throw error;
            }
        },

        async deleteWritingProfileReferences() {
            return writingProfileApplication.deleteWritingProfileReferences();
        },

        async previewWritingProfile(requestBody = {}) {
            try {
                return await writingProfileApplication.previewWritingProfile(requestBody);
            } catch (error) {
                if (String(error?.code || '').startsWith('WRITING_PREVIEW_')) {
                    throw createApiError(error.status || 400, error.code, error.message);
                }
                throw error;
            }
        },

        async getMajorSettings() {
            const gatewayCatalog = typeof aiGateway?.getModelCatalog === 'function'
                ? await aiGateway.getModelCatalog({ forceRefresh: true })
                : null;
            const aiCatalogStatus = gatewayCatalog?.status || null;
            ensureRuntimeRemoteMcpConfig(CONFIG);
            const configSource = {
                path: CONFIG.CONFIG_SOURCE_PATH || resolveWritableConfigPath(),
                sourceType: CONFIG.CONFIG_SOURCE_TYPE
            };
            const data = redactMajorSecretFields(buildMajorSettings(null, configSource));
            if (gatewayCatalog) data.aiPresets = gatewayCatalog;
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

            return {
                ...data,
                aiCatalogStatus
            };
        },

        async getCoreConnectionSettings() {
            return coreConnectionsApplication.getSettings();
        },

        async getAiRoleSettings() {
            return aiModelsApplication.getSettings();
        },

        async getOptionalServiceSettings() {
            const [optionalSettings, distributionSettings] = await Promise.all([
                optionalServicesApplication.getSettings(),
                snsDistributionSettingsApplication.getSettings()
            ]);
            return { fields: { ...optionalSettings.fields, ...distributionSettings.fields } };
        },

        async getExternalConnectionSettings() {
            return externalConnectionsApplication.getSettings();
        },

        async getAppGeneralSettings() {
            return appPreferencesApplication.getAppGeneralSettings();
        },

        async getAppInputSettings() {
            return appPreferencesApplication.getAppInputSettings();
        },

        async getCardNewsSourceSettings() {
            return cardNewsSourceSettingsApplication.getSettings();
        },

        async saveCardNewsSourceSettings(requestBody = {}) {
            try { return cardNewsSourceSettingsApplication.saveSettings(requestBody); }
            catch (error) {
                if (error?.code === 'CONFIG_JSON_INVALID' || error?.apiCode) throw error;
                throw createApiError(400, 'CARD_NEWS_SOURCE_INVALID', error.message);
            }
        },

        async saveAppInputSettings(requestBody = {}) {
            try { return appPreferencesApplication.saveAppInputSettings(requestBody); }
            catch (error) {
                if (error?.code === 'TYPING_SPEED_INVALID') throw createApiError(400, error.code, error.message);
                throw error;
            }
        },

        async saveAppGeneralSettings(requestBody = {}) {
            try { return appPreferencesApplication.saveAppGeneralSettings(requestBody); }
            catch (error) {
                if (['LISTEN_HOST_INVALID', 'LISTEN_PORT_INVALID'].includes(error?.code)) {
                    throw createApiError(400, error.code, error.message);
                }
                throw error;
            }
        },
        async saveExternalConnectionSettings(requestBody = {}) {
            try { return await externalConnectionsApplication.save(requestBody); }
            catch (error) {
                if (error?.apiCode) throw error;
                throw createApiError(error?.status || 400, error?.code || 'EXTERNAL_CONNECTION_SAVE_FAILED', error?.message);
            }
        },

        async saveOptionalServiceSettings(requestBody = {}) {
            const normalized = normalizeOptionalServiceSettings(requestBody);
            if (normalized.scope === 'sns-distribution') {
                try {
                    await snsDistributionSettingsApplication.save(requestBody);
                    return { scope: normalized.scope, ...(await this.getOptionalServiceSettings()) };
                } catch (error) {
                    if (error?.apiCode) throw error;
                    throw createApiError(error?.status || 400, error?.code || 'SNS_DISTRIBUTION_SETTINGS_FAILED', error?.message);
                }
            }
            try {
                await optionalServicesApplication.save(requestBody);
                return { scope: normalized.scope, ...(await this.getOptionalServiceSettings()) };
            }
            catch (error) {
                if (error?.apiCode) throw error;
                throw createApiError(error?.status || 400, error?.code || 'OPTIONAL_SERVICE_SAVE_FAILED', error?.message);
            }
        },

        async testOptionalServiceConnection(requestBody = {}) {
            const normalized = normalizeOptionalServiceSettings(requestBody);
            const fields = normalized.fields;
            if (normalized.scope === 'buffer') {
                const apiKey = fields.BUFFER_API_KEY || CONFIG.BUFFER_API_KEY;
                const organizationId = fields.BUFFER_ORGANIZATION_ID || CONFIG.BUFFER_ORGANIZATION_ID;
                const signature = bufferConnectionSignature(apiKey, organizationId);
                try {
                    const result = await this.inspectBufferConnection({ apiKey, organizationId });
                    const verification = recordConnectionVerification('buffer', signature, { success: true, connected: true });
                    return { ...result, verification };
                } catch (error) {
                    recordConnectionVerification('buffer', signature, { success: false, connected: false, message: error.message });
                    throw error;
                }
            }
            if (normalized.scope === 'telegram') return this.testTelegramConnection({ botToken: fields.NOTIFY_TELEGRAM_BOT_TOKEN || CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN, chatId: fields.NOTIFY_TELEGRAM_CHAT_ID || CONFIG.NOTIFY_TELEGRAM_CHAT_ID });
            if (normalized.scope === 'slack') return this.testSlackConnection({ webhookUrl: fields.NOTIFY_SLACK_WEBHOOK_URL || CONFIG.NOTIFY_SLACK_WEBHOOK_URL });
            const token = fields.NOTIFY_BITLY_TOKEN || CONFIG.NOTIFY_BITLY_TOKEN;
            if (!token) throw createApiError(400, 'BITLY_TOKEN_REQUIRED', 'Bitly Access Token을 입력해 주세요.');
            try {
                await axios.get('https://api-ssl.bitly.com/v4/user', { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 });
                return { message: 'Bitly 연결을 확인했습니다.' };
            } catch (error) {
                throw createApiError(error?.response?.status === 401 ? 401 : 400, 'BITLY_CONNECTION_FAILED', 'Bitly 연결을 확인하지 못했습니다. Access Token을 확인해 주세요.');
            }
        },

        async saveCoreConnectionSettings(requestBody = {}) {
            try { return coreConnectionsApplication.saveSettings(requestBody); }
            catch (error) {
                if (error?.apiCode) throw error;
                throw createApiError(error?.status || 400, error?.code || 'CORE_CONNECTION_SAVE_FAILED', error?.message);
            }
        },

        async saveAiRoleSettings(requestBody = {}) {
            try { return await aiModelsApplication.saveRole(requestBody); }
            catch (error) {
                if (error?.apiCode) throw error;
                throw createApiError(error?.status || 400, error?.code || 'AI_SETTINGS_FAILED', error?.message);
            }
        },

        async testAiRoleConnection(requestBody = {}) {
            try { return await aiModelsApplication.testRole(requestBody); }
            catch (error) {
                if (error?.apiCode) throw error;
                throw createApiError(error?.status || 400, error?.code || 'AI_MODEL_CONNECTION_CHECK_FAILED', error?.message);
            }
        },

        async saveMajorSettings(requestBody = {}) {
            const writablePath = resolveWritableConfigPath();
            const requestedBufferChannels = Array.isArray(requestBody.BUFFER_CHANNELS)
                ? requestBody.BUFFER_CHANNELS
                : [];
            if (requestedBufferChannels.length > 3) {
                throw createApiError(400, 'BUFFER_CHANNEL_LIMIT_EXCEEDED', 'Buffer 채널은 최대 3개까지 선택할 수 있습니다.');
            }
            if (!isSnsAiMode(requestBody.SNS_AI_MODE ?? 'none')) {
                throw createApiError(
                    400,
                    'SNS_AI_MODE_INVALID',
                    'SNS AI 설정값이 올바르지 않습니다.'
                );
            }
            const fields = parseMajorFieldsFromRequest(requestBody || {});
            if (fields.SNS_PUBLISH_ENABLED && !String(fields.BUFFER_API_KEY || '').trim()) {
                throw createApiError(400, 'BUFFER_API_KEY_REQUIRED', 'SNS 자동 발행을 사용하려면 Buffer API Key가 필요합니다.');
            }
            if (fields.SNS_PUBLISH_ENABLED && !String(fields.BUFFER_ORGANIZATION_ID || '').trim()) {
                throw createApiError(400, 'BUFFER_ORGANIZATION_REQUIRED', 'SNS 자동 발행을 사용하려면 Buffer Organization을 선택해야 합니다.');
            }
            if (fields.SNS_PUBLISH_ENABLED && (!Array.isArray(fields.BUFFER_CHANNELS) || fields.BUFFER_CHANNELS.length === 0)) {
                throw createApiError(400, 'BUFFER_CHANNEL_REQUIRED', 'SNS 자동 발행을 사용하려면 Buffer 채널을 1개 이상 선택해야 합니다.');
            }
            if (fields.SNS_PUBLISH_ENABLED && (!Array.isArray(fields.SNS_SOURCE_BLOGS) || fields.SNS_SOURCE_BLOGS.length === 0)) {
                throw createApiError(400, 'SNS_SOURCE_BLOG_REQUIRED', 'SNS 자동 발행을 사용하려면 발행 대상 블로그를 1개 이상 선택해야 합니다.');
            }
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
            removeManagedKeywordCredentials(structuredConfig);

            // 계층 구조에 맞춰 필드 업데이트
            // 1. Essential
            if (!structuredConfig.general) structuredConfig.general = {};
            structuredConfig.general.google_sheet_url = fields.GOOGLE_SHEET_URL;
            structuredConfig.general.listen_host = fields.LISTEN_HOST;
            structuredConfig.general.listen_port = Number(fields.LISTEN_PORT);

            // 2. AI Settings
            if (!structuredConfig.ai_settings) structuredConfig.ai_settings = {};
            const aiPresets = getAiModelCatalog();
            const textModelConfig = buildModelSelectionFromFields('text', fields, aiPresets);
            const imageModelConfig = buildModelSelectionFromFields('image', fields, aiPresets);
            const chatModelConfig = buildModelSelectionFromFields('chat', fields, aiPresets);
            const chatModelSource = normalizeChatModelSource(fields.CHAT_MODEL_SOURCE);
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
            if (chatModelSource === 'dedicated' && !String(chatModelConfig.api_key || '').trim() && chatModelConfig.provider !== 'direct') {
                warnings.push('별도 Chat Model의 API Key가 비어 있습니다. Chat 기능을 사용하려면 입력이 필요합니다.');
            }
            if (chatModelSource === 'dedicated' && chatModelConfig.provider === 'direct' && (!String(chatModelConfig.name || '').trim() || !String(chatModelConfig.base_url || '').trim())) {
                warnings.push('Chat Model을 직접 입력할 때는 모델 이름과 Base URL이 필요합니다.');
            }
            structuredConfig.ai_settings.TEXT_MODEL = toStoredModelSelection(textModelConfig, aiPresets);
            structuredConfig.ai_settings.IMAGE_MODEL = toStoredModelSelection(imageModelConfig, aiPresets);
            structuredConfig.ai_settings.CHAT_MODEL = toStoredChatModelSettings(
                chatModelSource,
                chatModelConfig,
                aiPresets
            );
            structuredConfig.ai_settings.MODEL_PROFILES = fields.AI_MODEL_PROFILES;
            delete structuredConfig.ai_presets;

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

            // 4. Content preferences
            if (!structuredConfig.content) structuredConfig.content = {};
            structuredConfig.content.writing_style = {
                writing_mode: fields.BLOG_WRITING_MODE,
                speech_level: fields.BLOG_SPEECH_LEVEL
            };
            delete structuredConfig.content.writing_strategy;

            // Older configurations and runtimes used the blog namespace. Keep a
            // mirrored value while the common content preference is adopted.
            if (!structuredConfig.content.blog) structuredConfig.content.blog = {};
            structuredConfig.content.blog.writing_style = {
                writing_mode: fields.BLOG_WRITING_MODE,
                speech_level: fields.BLOG_SPEECH_LEVEL
            };
            delete structuredConfig.content.blog.writing_strategy;
            if (!structuredConfig.content.card_news) structuredConfig.content.card_news = {};
            structuredConfig.content.card_news.builtin_sources = fields.CARD_NEWS_BUILTIN_SOURCES;
            structuredConfig.content.card_news.rss_sources = fields.CARD_NEWS_RSS_SOURCES;

            if (!structuredConfig.integrations) structuredConfig.integrations = {};
            if (!structuredConfig.integrations.buffer) structuredConfig.integrations.buffer = {};
            structuredConfig.integrations.buffer.api_key = fields.BUFFER_API_KEY;
            structuredConfig.integrations.buffer.organization_id = fields.BUFFER_ORGANIZATION_ID;
            structuredConfig.integrations.buffer.channels = fields.BUFFER_CHANNELS;
            structuredConfig.integrations.buffer.help_url = fields.BUFFER_HELP_URL;

            // 5. Automation
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
                structuredConfig.automation.collect.blog = { trends };
                delete structuredConfig.automation.collect.trends;
                delete structuredConfig.automation.collect.rss;
            }

            if (!structuredConfig.automation.collect.blog) structuredConfig.automation.collect.blog = {};
            if (!structuredConfig.automation.collect.blog.trends) structuredConfig.automation.collect.blog.trends = {};
            delete structuredConfig.automation.collect.blog.rss;

            structuredConfig.automation.collect.blog.trends.categories = fields.COLLECT_TRENDS_CATEGORIES;
            structuredConfig.automation.collect.blog.trends.naver_category = String(fields.COLLECT_TRENDS_NAVER_CATEGORY || '').trim();
            structuredConfig.automation.collect.blog.trends.wordpress_category = String(fields.COLLECT_TRENDS_WP_CATEGORY || '').trim();
            structuredConfig.automation.collect.blog.trends.reuse_gap_days = Number(fields.COLLECT_TRENDS_REUSE_GAP_DAYS);

            if (!structuredConfig.automation.collect.blog.trends.filters) structuredConfig.automation.collect.blog.trends.filters = {};
            structuredConfig.automation.collect.blog.trends.filters.min_increase = Number(fields.COLLECT_TRENDS_FILTER_MIN_INCR);
            structuredConfig.automation.collect.blog.trends.filters.include_new = fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW;
            structuredConfig.automation.collect.blog.trends.filters.include_dash = fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH;
            structuredConfig.automation.collect.blog.trends.filters.include_number = fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER;
            structuredConfig.automation.collect.blog.trends.filters.type = fields.COLLECT_TRENDS_FILTER_TYPE;
            structuredConfig.automation.collect.blog.trends.filters.top_n = Number(fields.COLLECT_TRENDS_FILTER_TOP_N);

            if (!structuredConfig.publish) structuredConfig.publish = {};
            structuredConfig.publish.image_optimization_enabled = fields.IMAGE_OPTIMIZATION_ENABLED !== false;
            if (structuredConfig.automation && Object.prototype.hasOwnProperty.call(structuredConfig.automation, 'image_optimization_enabled')) {
                delete structuredConfig.automation.image_optimization_enabled;
            }

            // Publish
            if (!structuredConfig.automation.publish) structuredConfig.automation.publish = {};
            if (!structuredConfig.automation.publish.blog) structuredConfig.automation.publish.blog = {};
            structuredConfig.automation.publish.blog.batch_size = Number(fields.PUBLISH_AUTO_BATCH_SIZE);
            structuredConfig.automation.publish.blog.post_status = fields.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish';
            structuredConfig.automation.publish.blog.notify_enabled = fields.PUBLISH_AUTO_NOTIFY_ENABLED;
            structuredConfig.automation.publish.blog.target_channels = fields.PUBLISH_AUTO_TARGET_CHANNELS || ['naver'];
            structuredConfig.automation.publish.blog.headless = fields.PUBLISH_AUTO_HEADLESS;
            delete structuredConfig.automation.publish.blog.enabled;
            delete structuredConfig.automation.publish.blog.interval_min;
            delete structuredConfig.automation.publish.blog.start_time;
            delete structuredConfig.automation.publish.blog.end_time;
            structuredConfig.automation.publish.blog.image_mode = fields.PUBLISH_AUTO_IMAGE_MODE || 'generate';

            if (!structuredConfig.automation.publish.social) structuredConfig.automation.publish.social = {};
            structuredConfig.automation.publish.social.enabled = fields.SNS_PUBLISH_ENABLED;
            structuredConfig.automation.publish.social.interval_min = Number(fields.SNS_PUBLISH_INTERVAL_MIN);
            structuredConfig.automation.publish.social.ai_mode = fields.SNS_AI_MODE;
            structuredConfig.automation.publish.social.sheet_name = 'SNS';
            structuredConfig.automation.publish.social.source_blogs = fields.SNS_SOURCE_BLOGS;

            // Notification
            if (!structuredConfig.notification) structuredConfig.notification = {};
            if (!structuredConfig.notification.telegram) structuredConfig.notification.telegram = {};
            structuredConfig.notification.telegram.enabled = fields.NOTIFY_TELEGRAM_ENABLED;
            structuredConfig.notification.telegram.bot_token = fields.NOTIFY_TELEGRAM_BOT_TOKEN;
            structuredConfig.notification.telegram.chat_id = fields.NOTIFY_TELEGRAM_CHAT_ID;
            structuredConfig.notification.telegram.bitly_token = fields.NOTIFY_BITLY_TOKEN;
            delete structuredConfig.notification.telegram.chat_ai_mode;
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


            return {
                requiresRestart,
                restarting: requiresRestart,
                newHost: fields.LISTEN_HOST,
                newPort: normalizeListenPort(fields.LISTEN_PORT, DEFAULT_PORT),
                message: requiresRestart
                    ? '주요 설정 저장 완료. 서버가 재시작됩니다...'
                    : (mcpSettingsChanged ? '주요 설정 저장 완료. MCP 서버 설정이 적용되었습니다.' : '주요 설정 저장 완료'),
                warnings,
                fields: redactMajorSecretFields(updatedSettings).fields,
                aiPresets: updatedSettings.aiPresets,
                aiProviderProfiles: updatedSettings.aiProviderProfiles,
                shoppingImageSlots: updatedSettings.shoppingImageSlots,
                shoppingImageDefaults: updatedSettings.shoppingImageDefaults,
                remoteMcpStatus
            };
        },

        async inspectBufferConnection(requestBody = {}) {
            if (typeof socialPublisher?.inspectConnection !== 'function') {
                throw createApiError(500, 'BUFFER_PUBLISHER_UNAVAILABLE', 'Buffer 연결 기능을 사용할 수 없습니다.');
            }
            const apiKey = String(requestBody.apiKey || requestBody.BUFFER_API_KEY || '').trim();
            const organizationId = String(requestBody.organizationId || requestBody.BUFFER_ORGANIZATION_ID || '').trim();
            if (!apiKey) {
                throw createApiError(400, 'BUFFER_API_KEY_REQUIRED', 'Buffer API Key를 입력해 주세요.');
            }

            try {
                return await socialPublisher.inspectConnection(apiKey, organizationId);
            } catch (error) {
                throw createApiError(
                    error?.code === 'BUFFER_AUTH_INVALID' ? 401 : 400,
                    error?.code || 'BUFFER_CONNECTION_FAILED',
                    error?.message || 'Buffer 연결 확인에 실패했습니다.'
                );
            }
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
                FTC_DISCLOSURE_IMAGE_URL: parseConfigValue(content, 'FTC_DISCLOSURE_IMAGE_URL') || CONFIG.FTC_DISCLOSURE_IMAGE_URL,
                SHOPPING_CTA_IMAGE_URL1: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL1') || CONFIG.SHOPPING_CTA_IMAGE_URL1,
                SHOPPING_CTA_IMAGE_URL2: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL2') || CONFIG.SHOPPING_CTA_IMAGE_URL2,
                SHOPPING_CTA_IMAGE_URL3: parseConfigValue(content, 'SHOPPING_CTA_IMAGE_URL3') || CONFIG.SHOPPING_CTA_IMAGE_URL3,
                WORDPRESS_URL: parseConfigValue(content, 'WORDPRESS_URL') || CONFIG.WORDPRESS_URL,
                WORDPRESS_USER_ID: parseConfigValue(content, 'WORDPRESS_USER_ID') || CONFIG.WORDPRESS_USER_ID,
                WORDPRESS_APP_PASSWORD: parseConfigValue(content, 'WORDPRESS_APP_PASSWORD') || CONFIG.WORDPRESS_APP_PASSWORD,
                COLLECT_TRENDS_CATEGORIES: parseConfigValue(content, 'COLLECT_TRENDS_CATEGORIES'),
                COLLECT_TRENDS_FILTER_MIN_INCR: parseConfigValue(content, 'COLLECT_TRENDS_FILTER_MIN_INCR'),
                COLLECT_TRENDS_REUSE_GAP_DAYS: parseConfigValue(content, 'COLLECT_TRENDS_REUSE_GAP_DAYS'),
                COLLECT_TRENDS_NAVER_CATEGORY: parseConfigValue(content, 'COLLECT_TRENDS_NAVER_CATEGORY'),
                COLLECT_TRENDS_WP_CATEGORY: parseConfigValue(content, 'COLLECT_TRENDS_WP_CATEGORY'),
                CARD_NEWS_RSS_SOURCES: parseConfigValue(content, 'CARD_NEWS_RSS_SOURCES'),
                CARD_NEWS_BUILTIN_SOURCES: parseConfigValue(content, 'CARD_NEWS_BUILTIN_SOURCES'),
                PUBLISH_AUTO_BATCH_SIZE: parseConfigValue(content, 'PUBLISH_AUTO_BATCH_SIZE'),
                PUBLISH_AUTO_POST_STATUS: parseConfigValue(content, 'PUBLISH_AUTO_POST_STATUS')
            });
            applyRuntimeConfigFromMajor(fields);
            syncAutoRunnerWithConfig();
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
        },

        async testTelegramConnection(requestBody = {}) {
            const botToken = String(requestBody.botToken || '').trim();
            const chatId = String(requestBody.chatId || '').trim();

            if (!botToken || !chatId) {
                throw createApiError(400, 'MISSING_PARAMS', '봇 토큰과 챗 ID를 모두 입력해주세요.');
            }

            const result = await TelegramService.testConnection(botToken, chatId);
            if (!result.success) {
                const statusByCategory = {
                    token_invalid: 401,
                    chat_forbidden: 403,
                    polling_conflict: 409,
                    rate_limited: 429,
                    network: 503,
                    tls: 503
                };
                const category = String(result.category || 'connection_failed').toUpperCase();
                throw createApiError(
                    statusByCategory[result.category] || 400,
                    `TELEGRAM_${category}`,
                    result.message || '텔레그램 메시지 전송에 실패했습니다.'
                );
            }

            return { message: result.message || '연결됨 · 테스트 메시지를 전송했습니다.' };
        },

        async manageTelegramPairing(requestBody = {}) {
            const action = String(requestBody.action || '').trim();
            if (action === 'cancel') {
                await telegramPairingService.cancel();
                return { cancelled: true };
            }
            const botToken = String(requestBody.botToken || CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim();
            if (action === 'verify') {
                if (!botToken) throw createApiError(400, 'TELEGRAM_TOKEN_REQUIRED', 'Bot Token을 입력해 주세요.');
                try {
                    const response = await TelegramService.callBotApi('getMe', {}, { botToken });
                    const bot = response?.data?.result || {};
                    if (!bot.is_bot || !bot.username) throw new Error('Telegram 봇 계정 정보를 확인하지 못했습니다.');
                    return { username: bot.username, firstName: String(bot.first_name || '') };
                } catch (error) {
                    const result = TelegramService.failureResult(error, { botToken, stage: 'token' });
                    throw createApiError(result.category === 'token_invalid' ? 401 : 400, 'TELEGRAM_TOKEN_INVALID', result.message);
                }
            }
            if (action === 'start') {
                if (!botToken) throw createApiError(400, 'TELEGRAM_TOKEN_REQUIRED', 'Bot Token을 입력해 주세요.');
                let bot;
                try {
                    const response = await TelegramService.callBotApi('getMe', {}, { botToken });
                    bot = response?.data?.result || {};
                    if (!bot.is_bot || !bot.username) throw new Error('Telegram 봇 계정 정보를 확인하지 못했습니다.');
                    const webhookResponse = await TelegramService.callBotApi('getWebhookInfo', {}, { botToken });
                    if (String(webhookResponse?.data?.result?.url || '').trim()) {
                        throw createApiError(409, 'TELEGRAM_WEBHOOK_CONFIGURED', '이 봇은 이미 webhook 방식으로 연결되어 있습니다. webhook을 사용하는 서비스를 먼저 종료한 뒤 다시 시도해 주세요.');
                    }
                } catch (error) {
                    if (error.apiCode === 'TELEGRAM_WEBHOOK_CONFIGURED') throw error;
                    const result = TelegramService.failureResult(error, { botToken, stage: 'token' });
                    throw createApiError(result.category === 'token_invalid' ? 401 : 400, 'TELEGRAM_TOKEN_INVALID', result.message);
                }
                try {
                    return await telegramPairingService.start({ botToken, username: bot.username });
                } catch (error) {
                    throw createApiError(409, 'TELEGRAM_PAIRING_START_FAILED', 'Telegram 연결을 시작하지 못했습니다. 기존 봇 polling이나 webhook이 실행 중인지 확인해 주세요.');
                }
            }
            if (action === 'complete') {
                let paired;
                try {
                    paired = await telegramPairingService.complete({ sessionId: requestBody.sessionId, code: requestBody.code });
                } catch (error) {
                    throw createApiError(400, error.code || 'TELEGRAM_PAIRING_FAILED', error.message || '연결 코드를 확인하지 못했습니다.');
                }
                await this.saveOptionalServiceSettings({ scope: 'telegram', values: {
                    NOTIFY_TELEGRAM_BOT_TOKEN: paired.botToken,
                    NOTIFY_TELEGRAM_CHAT_ID: paired.chatId,
                    NOTIFY_TELEGRAM_DELIVERY_ENABLED: CONFIG.NOTIFY_TELEGRAM_ENABLED === true
                } });
                if (CONFIG.NOTIFY_TELEGRAM_INBOUND_ENABLED === true
                    && CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN && CONFIG.NOTIFY_TELEGRAM_CHAT_ID) {
                    TelegramBotService?.init?.();
                }
                try {
                    const tested = await this.testTelegramConnection({ botToken: paired.botToken, chatId: paired.chatId });
                    return { paired: true, message: tested.message };
                } catch (error) {
                    return {
                        paired: true,
                        warning: true,
                        message: `연결은 저장했지만 테스트 메시지를 보내지 못했습니다. ${error.message || 'Telegram 권한을 확인해 주세요.'}`
                    };
                }
            }
            throw createApiError(400, 'TELEGRAM_PAIRING_ACTION_INVALID', 'Telegram 연결 단계를 확인해 주세요.');
        },

        async testAiModelConnection(requestBody = {}) {
            const kind = String(requestBody.kind || '').trim().toLowerCase();
            if (!['text', 'image'].includes(kind)) {
                throw createApiError(400, 'AI_MODEL_KIND_INVALID', 'Text 또는 Image 모델을 선택해 주세요.');
            }

            const prefix = kind === 'image' ? 'IMAGE_MODEL' : 'TEXT_MODEL';
            const fields = {
                [`${prefix}_PROVIDER`]: requestBody.provider,
                [`${prefix}_PRESET_CODE`]: requestBody.presetCode,
                [`${prefix}_NAME`]: requestBody.name,
                [`${prefix}_BASE_URL`]: requestBody.baseUrl,
                [`${prefix}_API_KEY`]: requestBody.apiKey
            };
            const modelConfig = buildModelSelectionFromFields(kind, fields, getAiModelCatalog());

            try {
                const result = await aiGateway.verifyModelConnection({ kind, modelConfig });
                try {
                    recordAiRoleVerification(kind, modelConfig, { success: true, connected: true });
                } catch (_) { }
                return {
                    ...result,
                    display_name: modelConfig.provider === 'kie'
                        ? 'KIE.ai'
                        : (modelConfig.name || modelConfig.code),
                    message: modelConfig.provider === 'kie'
                        ? 'KIE.ai API Key와 계정 연결을 확인했습니다.'
                        : `${modelConfig.name || modelConfig.code} API Key와 모델 정보를 확인했습니다.`
                };
            } catch (error) {
                try {
                    recordAiRoleVerification(kind, modelConfig, { success: false, connected: false, message: error.message });
                } catch (_) { }
                throw createApiError(
                    400,
                    'AI_MODEL_CONNECTION_CHECK_FAILED',
                    `${modelConfig.name || modelConfig.code || 'AI 모델'} 연결 실패 · ${error.message}`
                );
            }
        },

        async testSlackConnection(requestBody = {}) {
            const webhookUrl = String(requestBody.webhookUrl || '').trim();

            if (!webhookUrl) {
                throw createApiError(400, 'MISSING_PARAMS', 'Webhook URL을 입력해주세요.');
            }

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
    createApiError,
    removeManagedKeywordCredentials,
    normalizeCoreConnectionSettings,
    normalizeAiRoleSettings,
    normalizeOptionalServiceSettings,
    normalizeExternalConnectionSettings,
    normalizeAppGeneralSettings,
    normalizeAppInputSettings,
    redactMajorSecretFields,
    redactAiRoleSecretFields,
    redactAiProviderProfiles,
    applyCoreConnectionSettings
};
