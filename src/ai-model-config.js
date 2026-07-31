const {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL,
    DEFAULT_MODEL_CODES
} = require('./ai-model-catalog');
const {
    findModelDefinition,
    getAiModelCatalog
} = require('./ai/catalog-registry');
const {
    inferTransport
} = require('./ai/transport-registry');

function normalizeProvider(value) {
    const raw = trimString(value).toLowerCase();
    if (raw === 'openai_compatible') return 'direct';
    if (raw === 'imagen') return 'imagen4';
    return raw || 'gemini';
}

function getProviderDefaultBaseUrl(provider) {
    const normalized = normalizeProvider(provider);
    if (normalized === 'gemini') return '';
    if (normalized === 'imagen4') return '';
    if (normalized === 'anthropic') return CLAUDE_OPENAI_BASE_URL;
    if (normalized === 'openai') return OPENAI_BASE_URL;
    if (normalized === 'kie') return KIE_BASE_URL;
    return '';
}

function trimString(value) {
    return String(value || '').trim();
}

function normalizeBaseUrl(value) {
    return trimString(value).replace(/\/+$/, '');
}

function deriveModelDisplayName(code) {
    const raw = trimString(code);
    if (!raw) return '';
    const dotted = raw.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    return dotted
        .split(' ')
        .map((token) => {
            if (/^\d+(\.\d+)?$/.test(token)) return token;
            if (/^[a-z]+$/i.test(token)) {
                return token.charAt(0).toUpperCase() + token.slice(1);
            }
            return token;
        })
        .join(' ');
}

function findPresetByCode(presets = [], code = '', provider = '') {
    const normalizedCode = trimString(code);
    const normalizedProvider = trimString(provider) ? normalizeProvider(provider) : '';
    if (!normalizedCode) return null;
    return presets.find((item) => {
        if (item.code !== normalizedCode) return false;
        if (!normalizedProvider) return true;
        return item.provider === normalizedProvider;
    }) || null;
}

function getDefaultPreset(kind, presets = []) {
    const fallbackCode = DEFAULT_MODEL_CODES[kind] || '';
    return findPresetByCode(presets, fallbackCode) || presets[0] || null;
}

function normalizeModelSelection(rawConfig = {}, presets = [], fallbackPreset = null, options = {}) {
    const raw = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {};
    const legacyApiKey = trimString(options.legacyApiKey);
    const provider = normalizeProvider(raw.provider || fallbackPreset?.provider || 'gemini');
    const code = trimString(raw.code || raw.name || fallbackPreset?.code);
    const exactPreset = findPresetByCode(presets, code, provider) || findPresetByCode(presets, code);
    const isDirect = provider === 'direct';

    if (!isDirect) {
        const preset = exactPreset || (!code ? fallbackPreset : null);
        const resolvedProvider = normalizeProvider(preset?.provider || provider);
        const resolvedCode = trimString(preset?.code || code || fallbackPreset?.code);
        const resolvedBaseUrl = normalizeBaseUrl(
            preset?.base_url || raw.base_url || getProviderDefaultBaseUrl(resolvedProvider)
        );
        const apiKey = trimString(raw.api_key) || (resolvedProvider === 'gemini' ? legacyApiKey : '');
        return {
            provider: resolvedProvider,
            name: trimString(raw.name) || trimString(preset?.name) || deriveModelDisplayName(resolvedCode),
            code: resolvedCode,
            model_ref: trimString(preset?.key || raw.model_ref || `${resolvedProvider}:${resolvedCode}`),
            transport: trimString(preset?.transport || raw.transport || inferTransport(options.kind, resolvedProvider)),
            capabilities: preset?.capabilities && typeof preset.capabilities === 'object'
                ? { ...preset.capabilities }
                : {},
            base_url: resolvedBaseUrl,
            api_key: apiKey,
            catalog_status: exactPreset || preset ? 'available' : 'unavailable'
        };
    }

    return {
        provider: 'direct',
        name: trimString(raw.name),
        code,
        model_ref: '',
        transport: inferTransport(options.kind, 'direct'),
        capabilities: {},
        base_url: normalizeBaseUrl(raw.base_url),
        api_key: trimString(raw.api_key)
    };
}

function resolveAiModelConfig(structuredConfig = {}, kind = 'text') {
    const presets = getAiModelCatalog();
    const presetList = kind === 'image' ? presets.image : presets.text;
    const fallbackPreset = getDefaultPreset(kind, presetList);
    const key = kind === 'image' ? 'IMAGE_MODEL' : 'TEXT_MODEL';
    const rawObject = structuredConfig?.ai_settings?.[key];
    if (rawObject && typeof rawObject === 'object' && !Array.isArray(rawObject)) {
        return normalizeModelSelection(rawObject, presetList, fallbackPreset, { kind });
    }
    return normalizeModelSelection({}, presetList, fallbackPreset, { kind });
}

function buildModelSelectionFromFields(kind = 'text', fields = {}, presets = null) {
    const presetCatalog = presets || getAiModelCatalog();
    const presetList = kind === 'image' ? presetCatalog.image : presetCatalog.text;
    const fallbackPreset = getDefaultPreset(kind, presetList);
    const prefix = kind === 'image' ? 'IMAGE_MODEL' : 'TEXT_MODEL';
    const provider = normalizeProvider(fields[`${prefix}_PROVIDER`] || fallbackPreset?.provider || 'gemini');

    if (provider !== 'direct') {
        const code = trimString(fields[`${prefix}_PRESET_CODE`] || fallbackPreset?.code);
        const preset = findPresetByCode(presetList, code, provider) || findPresetByCode(presetList, code);
        return normalizeModelSelection({
            name: preset?.name || trimString(fields[`${prefix}_NAME`]),
            code: preset?.code || code,
            provider: preset?.provider || provider,
            base_url: preset?.base_url || trimString(fields[`${prefix}_BASE_URL`]),
            api_key: trimString(fields[`${prefix}_API_KEY`])
        }, presetList, fallbackPreset, { kind });
    }

    return normalizeModelSelection({
        name: trimString(fields[`${prefix}_NAME`]),
        code: trimString(fields[`${prefix}_NAME`]),
        provider: 'direct',
        base_url: trimString(fields[`${prefix}_BASE_URL`]),
        api_key: trimString(fields[`${prefix}_API_KEY`])
    }, presetList, fallbackPreset, { kind });
}

function toStoredModelSelection(modelConfig = {}, presets = null) {
    const normalized = modelConfig && typeof modelConfig === 'object' ? modelConfig : {};
    const provider = normalizeProvider(normalized.provider);
    const code = trimString(normalized.code);
    const apiKey = trimString(normalized.api_key);

    if (provider === 'direct') {
        return {
            provider,
            name: trimString(normalized.name),
            code,
            base_url: normalizeBaseUrl(normalized.base_url),
            api_key: apiKey
        };
    }

    const catalog = presets || getAiModelCatalog();
    const allPresets = [...catalog.text, ...catalog.image];
    const knownPreset = findPresetByCode(allPresets, code, provider)
        || findModelDefinition('text', provider, code)
        || findModelDefinition('image', provider, code);
    if (knownPreset) {
        return {
            provider: knownPreset.provider,
            code: knownPreset.code,
            api_key: apiKey
        };
    }

    return {
        provider,
        name: trimString(normalized.name) || deriveModelDisplayName(code),
        code,
        base_url: normalizeBaseUrl(normalized.base_url || getProviderDefaultBaseUrl(provider)),
        api_key: apiKey
    };
}

module.exports = {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL,
    deriveModelDisplayName,
    getAiModelCatalog,
    findModelDefinition,
    resolveAiModelConfig,
    buildModelSelectionFromFields,
    toStoredModelSelection,
    normalizeBaseUrl,
    getProviderDefaultBaseUrl
};
