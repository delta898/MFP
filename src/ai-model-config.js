const CLAUDE_OPENAI_BASE_URL = 'https://api.anthropic.com/v1';

const DEFAULT_TEXT_PRESETS = [
    { name: 'Gemini 3.1 Pro Preview', code: 'gemini-3.1-pro-preview', provider: 'gemini', base_url: '' },
    { name: 'Gemini 3 Flash Preview', code: 'gemini-3-flash-preview', provider: 'gemini', base_url: '' },
    { name: 'Gemini 3.1 Flash Lite Preview', code: 'gemini-3.1-flash-lite-preview', provider: 'gemini', base_url: '' },
    { name: 'Gemini 2.5 Flash', code: 'gemini-2.5-flash', provider: 'gemini', base_url: '' },
    { name: 'Gemini 2.5 Flash Lite', code: 'gemini-2.5-flash-lite', provider: 'gemini', base_url: '' },
    { name: 'Gemini 2.5 Pro', code: 'gemini-2.5-pro', provider: 'gemini', base_url: '' },
    { name: 'Claude Opus 4.6', code: 'claude-opus-4-6', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Sonnet 4.6', code: 'claude-sonnet-4-6', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Haiku 4.5', code: 'claude-haiku-4-5', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Opus 4.5', code: 'claude-opus-4-5', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Sonnet 4.5', code: 'claude-sonnet-4-5', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL }
];

const DEFAULT_IMAGE_PRESETS = [
    { name: 'Nano Banana 2', code: 'gemini-3.1-flash-image-preview', provider: 'gemini', base_url: '' },
    { name: 'Nano Banana Pro', code: 'gemini-3-pro-image-preview', provider: 'gemini', base_url: '' },
    { name: 'Nano Banana', code: 'gemini-2.5-flash-image', provider: 'gemini', base_url: '' },
    { name: 'Imagen 4', code: 'imagen-4.0-generate-001', provider: 'imagen4', base_url: '' },
    { name: 'Imagen 4 Ultra', code: 'imagen-4.0-ultra-generate-001', provider: 'imagen4', base_url: '' },
    { name: 'Imagen 4 Fast', code: 'imagen-4.0-fast-generate-001', provider: 'imagen4', base_url: '' }
];

const DEFAULT_MODEL_CODES = {
    text: 'gemini-3.1-flash-lite-preview',
    image: 'gemini-3.1-flash-image-preview'
};

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

function normalizePresetEntry(entry = {}) {
    const code = trimString(entry.code);
    const provider = trimString(entry.provider || 'gemini').toLowerCase() || 'gemini';
    return {
        name: trimString(entry.name) || deriveModelDisplayName(code),
        code,
        provider,
        base_url: normalizeBaseUrl(entry.base_url),
        api_key: trimString(entry.api_key)
    };
}

function normalizePresetList(list = []) {
    if (!Array.isArray(list)) return [];
    return list
        .map((item) => normalizePresetEntry(item))
        .filter((item) => item.code);
}

function getAiPresets(structuredConfig = {}) {
    const configured = structuredConfig?.ai_presets || {};
    const text = normalizePresetList(configured.text);
    const image = normalizePresetList(configured.image);
    return {
        text: text.length > 0 ? text : normalizePresetList(DEFAULT_TEXT_PRESETS),
        image: image.length > 0 ? image : normalizePresetList(DEFAULT_IMAGE_PRESETS)
    };
}

function findPresetByCode(presets = [], code = '', provider = '') {
    const normalizedCode = trimString(code);
    const normalizedProvider = normalizeProvider(provider);
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
    const preset = findPresetByCode(presets, code, provider) || findPresetByCode(presets, code) || fallbackPreset;
    const isDirect = provider === 'direct';

    if (!isDirect) {
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
            base_url: resolvedBaseUrl,
            api_key: apiKey
        };
    }

    return {
        provider: 'direct',
        name: trimString(raw.name),
        code,
        base_url: normalizeBaseUrl(raw.base_url),
        api_key: trimString(raw.api_key)
    };
}

function resolveAiModelConfig(structuredConfig = {}, kind = 'text') {
    const presets = getAiPresets(structuredConfig);
    const presetList = kind === 'image' ? presets.image : presets.text;
    const fallbackPreset = getDefaultPreset(kind, presetList);
    const key = kind === 'image' ? 'IMAGE_MODEL' : 'TEXT_MODEL';
    const rawObject = structuredConfig?.ai_settings?.[key];
    if (rawObject && typeof rawObject === 'object' && !Array.isArray(rawObject)) {
        return normalizeModelSelection(rawObject, presetList, fallbackPreset);
    }
    return normalizeModelSelection({}, presetList, fallbackPreset);
}

function buildModelSelectionFromFields(kind = 'text', fields = {}, presets = null) {
    const presetCatalog = presets || getAiPresets({});
    const presetList = kind === 'image' ? presetCatalog.image : presetCatalog.text;
    const fallbackPreset = getDefaultPreset(kind, presetList);
    const prefix = kind === 'image' ? 'IMAGE_MODEL' : 'TEXT_MODEL';
    const provider = normalizeProvider(fields[`${prefix}_PROVIDER`] || fallbackPreset?.provider || 'gemini');

    if (provider !== 'direct') {
        const code = trimString(fields[`${prefix}_PRESET_CODE`] || fallbackPreset?.code);
        const preset = findPresetByCode(presetList, code, provider) || findPresetByCode(presetList, code) || fallbackPreset;
        return normalizeModelSelection({
            name: preset?.name,
            code: preset?.code,
            provider: preset?.provider,
            base_url: preset?.base_url,
            api_key: trimString(fields[`${prefix}_API_KEY`])
        }, presetList, fallbackPreset);
    }

    return normalizeModelSelection({
        name: trimString(fields[`${prefix}_NAME`]),
        code: trimString(fields[`${prefix}_NAME`]),
        provider: 'direct',
        base_url: trimString(fields[`${prefix}_BASE_URL`]),
        api_key: trimString(fields[`${prefix}_API_KEY`])
    }, presetList, fallbackPreset);
}

module.exports = {
    CLAUDE_OPENAI_BASE_URL,
    DEFAULT_TEXT_PRESETS,
    DEFAULT_IMAGE_PRESETS,
    deriveModelDisplayName,
    getAiPresets,
    resolveAiModelConfig,
    buildModelSelectionFromFields,
    normalizeBaseUrl,
    getProviderDefaultBaseUrl
};
