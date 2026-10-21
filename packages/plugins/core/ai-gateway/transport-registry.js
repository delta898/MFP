const {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL,
    PROVIDER_ENDPOINTS
} = require('./provider-endpoints');

const TRANSPORTS = Object.freeze({
    gemini_generate_content: Object.freeze({
        id: 'gemini_generate_content',
        providers: Object.freeze(['google']),
        kinds: Object.freeze(['text', 'image']),
        base_url: `${PROVIDER_ENDPOINTS.google}/v1beta`,
        endpoint_mode: 'fixed'
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
        base_url: KIE_BASE_URL,
        verification_scope: 'provider'
    }),
    kie_claude_messages: Object.freeze({
        id: 'kie_claude_messages',
        providers: Object.freeze(['kie']),
        kinds: Object.freeze(['text']),
        base_url: KIE_BASE_URL,
        verification_scope: 'provider'
    }),
    kie_responses: Object.freeze({
        id: 'kie_responses',
        providers: Object.freeze(['kie']),
        kinds: Object.freeze(['text']),
        base_url: KIE_BASE_URL,
        verification_scope: 'provider'
    }),
    kie_openai_responses: Object.freeze({
        id: 'kie_openai_responses', providers: Object.freeze(['kie']), kinds: Object.freeze(['text']),
        base_url: KIE_BASE_URL, verification_scope: 'provider'
    }),
    kie_grok_responses: Object.freeze({
        id: 'kie_grok_responses', providers: Object.freeze(['kie']), kinds: Object.freeze(['text']),
        base_url: KIE_BASE_URL, verification_scope: 'provider'
    }),
    kie_market_image_jobs: Object.freeze({
        id: 'kie_market_image_jobs',
        providers: Object.freeze(['kie']),
        kinds: Object.freeze(['image']),
        base_url: KIE_BASE_URL,
        verification_scope: 'provider'
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

function getTransportVerificationScope(transport) {
    return String(getTransportDefinition(transport)?.verification_scope || 'model').trim();
}

function getCanonicalTransportEndpoint(transport, configuredBaseUrl = '') {
    const definition = getTransportDefinition(transport);
    if (definition?.endpoint_mode === 'fixed') {
        return String(definition.base_url || '').trim().replace(/\/+$/, '');
    }
    return String(configuredBaseUrl || '').trim().replace(/\/+$/, '');
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
    if (normalizedProvider === 'google') return 'gemini_generate_content';
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
    getTransportVerificationScope,
    getCanonicalTransportEndpoint,
    inferTransport,
    isSupportedProviderKind,
    isSupportedTransportRoute
};
