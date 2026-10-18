'use strict';

function createSettingsAiModelError(code, message) {
    return Object.assign(new Error(message), { code });
}

function normalizeAiRoleSettings(requestBody = {}, normalizeChatModelSource) {
    const scope = String(requestBody.scope || '').trim().toLowerCase();
    const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};
    if (!['text', 'image', 'chat'].includes(scope)) {
        throw createSettingsAiModelError('AI_ROLE_SCOPE_INVALID', '설정할 AI 역할을 확인해 주세요.');
    }
    const source = scope === 'chat' ? normalizeChatModelSource(values.CHAT_MODEL_SOURCE) : '';
    const prefix = scope === 'text' ? 'TEXT' : (scope === 'image' ? 'IMAGE' : 'CHAT');
    const fields = {
        [`${prefix}_MODEL_PROVIDER`]: String(values.provider || '').trim(),
        [`${prefix}_MODEL_PRESET_CODE`]: String(values.presetCode || '').trim(),
        [`${prefix}_MODEL_NAME`]: String(values.name || '').trim(),
        [`${prefix}_MODEL_BASE_URL`]: String(values.baseUrl || '').trim(),
        [`${prefix}_MODEL_API_KEY`]: String(values.apiKey || '').trim()
    };
    if (scope === 'chat') fields.CHAT_MODEL_SOURCE = source;
    return { scope, source, fields };
}

function redactAiRoleSecretFields(settings = {}) {
    const fields = { ...(settings?.fields || settings || {}) };
    ['TEXT', 'IMAGE', 'CHAT'].forEach((prefix) => {
        const key = `${prefix}_MODEL_API_KEY`;
        fields[`${key}_CONFIGURED`] = Boolean(String(fields[key] || '').trim());
        delete fields[key];
    });
    return { ...(settings?.fields ? settings : {}), fields };
}

function redactAiProviderProfiles(rawProfiles = {}, normalizeStoredModelProfiles, getAiModelCatalog) {
    const profiles = normalizeStoredModelProfiles(rawProfiles, getAiModelCatalog());
    return Object.fromEntries(Object.entries(profiles).map(([role, roleProfiles]) => [
        role,
        Object.fromEntries(Object.entries(roleProfiles).map(([provider, profile]) => [provider, {
            provider: String(profile?.provider || provider),
            code: String(profile?.code || ''),
            name: String(profile?.name || ''),
            base_url: String(profile?.base_url || ''),
            api_key_configured: Boolean(String(profile?.api_key || '').trim())
        }]))
    ]));
}

function createSettingsAiModelsApplication(deps = {}) {
    const {
        config = {},
        configRepository,
        aiGateway,
        getModelCatalog,
        buildMajorSettings,
        modelConfig,
        verification,
        describeConnectionFailure
    } = deps;
    const {
        buildModelSelectionFromFields,
        toStoredModelSelection,
        toStoredChatModelSettings,
        mergeActiveSelectionsIntoProfiles,
        normalizeStoredModelProfiles,
        normalizeChatModelSource
    } = modelConfig;

    function readConfiguredModelFields(filePath) {
        return buildMajorSettings(null, { path: filePath, sourceType: 'json' }).fields || {};
    }

    function apiError(error, status = 400) {
        if (error?.code === 'CONFIG_JSON_INVALID') {
            return Object.assign(new Error(error.message), { code: error.code, status: 409 });
        }
        return Object.assign(new Error(error?.message || 'AI 설정을 처리하지 못했습니다.'), {
            code: error?.code || 'AI_SETTINGS_FAILED', status
        });
    }

    async function getSettings() {
        const gatewayCatalog = typeof aiGateway?.getModelCatalog === 'function'
            ? await aiGateway.getModelCatalog()
            : null;
        const settings = redactAiRoleSecretFields(buildMajorSettings(null, {
            path: config.CONFIG_SOURCE_PATH || configRepository.resolvePath(),
            sourceType: config.CONFIG_SOURCE_TYPE
        }));
        return {
            fields: settings.fields,
            aiPresets: gatewayCatalog || getModelCatalog(),
            aiProviderProfiles: redactAiProviderProfiles(config.AI_MODEL_PROFILES, normalizeStoredModelProfiles, getModelCatalog),
            verification: {
                text: { ...verification.get('text', config.TEXT_MODEL_CONFIG), history: verification.history('text') },
                image: { ...verification.get('image', config.IMAGE_MODEL_CONFIG), history: verification.history('image') },
                chat: { ...verification.get('chat', config.CHAT_MODEL_CONFIG), history: verification.history('chat') }
            }
        };
    }

    async function saveRole(requestBody = {}) {
        const normalized = normalizeAiRoleSettings(requestBody, normalizeChatModelSource);
        const { path: writablePath, document } = configRepository.read();
        const current = readConfiguredModelFields(writablePath);
        const fields = { ...current, ...normalized.fields };
        const selectedPrefix = normalized.scope === 'text' ? 'TEXT' : (normalized.scope === 'image' ? 'IMAGE' : 'CHAT');
        const selectedApiKey = `${selectedPrefix}_MODEL_API_KEY`;
        const catalog = getModelCatalog();
        const storedProfiles = normalizeStoredModelProfiles(
            document?.ai_settings?.MODEL_PROFILES || config.AI_MODEL_PROFILES || {}, catalog
        );
        const selectedKind = normalized.scope === 'image' ? 'image' : (normalized.scope === 'chat' ? 'chat' : 'text');
        const candidate = buildModelSelectionFromFields(selectedKind, { ...fields, [selectedApiKey]: '' }, catalog);
        if (!String(normalized.fields[selectedApiKey] || '').trim()) {
            const activeCandidate = buildModelSelectionFromFields(selectedKind, current, catalog);
            fields[selectedApiKey] = String(
                storedProfiles?.[normalized.scope]?.[candidate.provider]?.api_key
                || (activeCandidate.provider === candidate.provider ? current[selectedApiKey] : '')
                || ''
            ).trim();
        }

        const text = buildModelSelectionFromFields('text', fields, catalog);
        const image = buildModelSelectionFromFields('image', fields, catalog);
        const chatSelection = buildModelSelectionFromFields('chat', fields, catalog);
        const chatSource = normalizeChatModelSource(fields.CHAT_MODEL_SOURCE);
        const selected = normalized.scope === 'text' ? text : (normalized.scope === 'image' ? image : chatSelection);
        if (normalized.scope !== 'chat' || chatSource === 'dedicated') {
            if (!String(selected.code || '').trim()) throw createSettingsAiModelError('AI_MODEL_REQUIRED', '사용할 AI 모델을 선택해 주세요.');
            if (selected.provider === 'direct' && (!String(selected.name || '').trim() || !String(selected.base_url || '').trim())) {
                throw createSettingsAiModelError('AI_MODEL_DIRECT_CONFIG_REQUIRED', '직접 입력 모델은 모델 이름과 Base URL이 필요합니다.');
            }
        }

        document.ai_settings = document.ai_settings && typeof document.ai_settings === 'object' ? document.ai_settings : {};
        document.ai_settings.TEXT_MODEL = toStoredModelSelection(text, catalog);
        document.ai_settings.IMAGE_MODEL = toStoredModelSelection(image, catalog);
        document.ai_settings.CHAT_MODEL = toStoredChatModelSettings(chatSource, chatSelection, catalog);
        document.ai_settings.MODEL_PROFILES = mergeActiveSelectionsIntoProfiles(
            storedProfiles, { text, image, chat: chatSelection }, catalog
        );
        configRepository.write(writablePath, document);

        config.TEXT_MODEL_CONFIG = text;
        config.IMAGE_MODEL_CONFIG = image;
        config.TEXT_MODEL_API_KEY = text.api_key;
        config.IMAGE_MODEL_API_KEY = image.api_key;
        config.CHAT_MODEL_SOURCE = chatSource;
        config.CHAT_MODEL_SELECTION_CONFIG = chatSelection;
        config.CHAT_MODEL_CONFIG = chatSource === 'writing' ? text : chatSelection;
        config.AI_MODEL_PROFILES = document.ai_settings.MODEL_PROFILES;
        config.CONFIG_READY = true;
        config.CONFIG_SOURCE_TYPE = 'json';
        config.CONFIG_SOURCE_PATH = writablePath;
        config.CONFIG_ERROR_MESSAGE = '';
        return { scope: normalized.scope, ...(await getSettings()) };
    }

    async function testRole(requestBody = {}) {
        const scope = String(requestBody.scope || '').trim().toLowerCase();
        if (!['text', 'image', 'chat'].includes(scope)) {
            throw createSettingsAiModelError('AI_ROLE_SCOPE_INVALID', '확인할 AI 역할을 선택해 주세요.');
        }
        const kind = scope === 'image' ? 'image' : 'text';
        const selectedModel = scope === 'image' ? config.IMAGE_MODEL_CONFIG
            : (scope === 'chat' ? config.CHAT_MODEL_CONFIG : config.TEXT_MODEL_CONFIG);
        try {
            const result = await aiGateway.verifyModelConnection({ kind, modelConfig: selectedModel });
            try {
                const effectiveScope = scope === 'chat' && config.CHAT_MODEL_SOURCE !== 'dedicated' ? 'text' : scope;
                verification.record(effectiveScope, selectedModel, { success: true, connected: true });
            } catch (_) { }
            return { ...result, display_name: selectedModel?.name || selectedModel?.code || 'AI 모델' };
        } catch (error) {
            try {
                const effectiveScope = scope === 'chat' && config.CHAT_MODEL_SOURCE !== 'dedicated' ? 'text' : scope;
                verification.record(effectiveScope, selectedModel, { success: false, connected: false, message: error.message });
            } catch (_) { }
            throw createSettingsAiModelError('AI_MODEL_CONNECTION_CHECK_FAILED', describeConnectionFailure(error));
        }
    }

    return Object.freeze({ getSettings, saveRole, testRole });
}

module.exports = {
    createSettingsAiModelsApplication,
    normalizeAiRoleSettings,
    redactAiRoleSecretFields,
    redactAiProviderProfiles
};
