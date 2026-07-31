const {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL
} = require('../ai-model-catalog');

const TRANSPORTS = Object.freeze({
    gemini_generate_content: Object.freeze({
        id: 'gemini_generate_content',
        providers: Object.freeze(['gemini']),
        kinds: Object.freeze(['text', 'image']),
        base_url: ''
    }),
    imagen_predict: Object.freeze({
        id: 'imagen_predict',
        providers: Object.freeze(['imagen4']),
        kinds: Object.freeze(['image']),
        base_url: ''
    }),
    openai_chat_completions: Object.freeze({
        id: 'openai_chat_completions',
        providers: Object.freeze(['openai']),
        kinds: Object.freeze(['text']),
        base_url: OPENAI_BASE_URL
    }),
    anthropic_openai_compat: Object.freeze({
        id: 'anthropic_openai_compat',
        providers: Object.freeze(['anthropic']),
        kinds: Object.freeze(['text']),
        base_url: CLAUDE_OPENAI_BASE_URL
    }),
    kie_openai_chat: Object.freeze({
        id: 'kie_openai_chat',
        providers: Object.freeze(['kie']),
        kinds: Object.freeze(['text']),
        base_url: KIE_BASE_URL
    }),
    kie_responses: Object.freeze({
        id: 'kie_responses',
        providers: Object.freeze(['kie']),
        kinds: Object.freeze(['text']),
        base_url: KIE_BASE_URL
    }),
    kie_market_image_jobs: Object.freeze({
        id: 'kie_market_image_jobs',
        providers: Object.freeze(['kie']),
        kinds: Object.freeze(['image']),
        base_url: KIE_BASE_URL,
        model_ids: Object.freeze([
            'gpt-image-2-text-to-image',
            'nano-banana-2',
            'nano-banana-pro',
            'seedream/4.5-text-to-image',
            'seedream/5-pro-text-to-image'
        ])
    }),
    openai_images: Object.freeze({
        id: 'openai_images',
        providers: Object.freeze(['openai']),
        kinds: Object.freeze(['image']),
        base_url: OPENAI_BASE_URL
    })
});

function getTransportDefinition(transport) {
    return TRANSPORTS[String(transport || '').trim()] || null;
}

function isSupportedTransportRoute({ kind, provider, transport } = {}) {
    const definition = getTransportDefinition(transport);
    if (!definition) return false;
    return definition.kinds.includes(String(kind || '').trim())
        && definition.providers.includes(String(provider || '').trim());
}

function getTransportBaseUrl(transport) {
    return String(getTransportDefinition(transport)?.base_url || '').trim();
}

function isSupportedTransportModel(transport, modelCode) {
    const definition = getTransportDefinition(transport);
    if (!definition) return false;
    if (!Array.isArray(definition.model_ids)) return true;
    return definition.model_ids.includes(String(modelCode || '').trim());
}

function isSupportedProviderKind(kind, provider) {
    const normalizedKind = String(kind || '').trim();
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    return Object.values(TRANSPORTS).some((definition) => (
        definition.kinds.includes(normalizedKind)
        && definition.providers.includes(normalizedProvider)
    ));
}

function inferTransport(kind, provider) {
    const normalizedKind = String(kind || '').trim();
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider === 'gemini') return 'gemini_generate_content';
    if (normalizedProvider === 'imagen4' && normalizedKind === 'image') return 'imagen_predict';
    if (normalizedProvider === 'anthropic' && normalizedKind === 'text') return 'anthropic_openai_compat';
    if (normalizedProvider === 'openai' && normalizedKind === 'text') return 'openai_chat_completions';
    if (normalizedProvider === 'openai' && normalizedKind === 'image') return 'openai_images';
    if (normalizedProvider === 'kie' && normalizedKind === 'text') return 'kie_openai_chat';
    if (normalizedProvider === 'kie' && normalizedKind === 'image') return 'kie_market_image_jobs';
    if (normalizedProvider === 'direct' && normalizedKind === 'text') return 'openai_chat_completions';
    if (normalizedProvider === 'direct' && normalizedKind === 'image') return 'openai_images';
    return '';
}

module.exports = {
    TRANSPORTS,
    getTransportDefinition,
    getTransportBaseUrl,
    inferTransport,
    isSupportedProviderKind,
    isSupportedTransportModel,
    isSupportedTransportRoute
};
