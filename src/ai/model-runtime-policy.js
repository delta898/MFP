const { findModelDefinition } = require('./catalog-registry');
const { inferTransport } = require('./transport-registry');
const { normalizeProviderId } = require('./provider-id');

const REASONING_EFFORT_ORDER = Object.freeze(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

function normalizeReasoningEffort(value, fallback = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const migrated = normalized === 'minimal' ? 'low' : normalized;
    if (REASONING_EFFORT_ORDER.includes(migrated)) return migrated;
    const normalizedFallback = String(fallback || '').trim().toLowerCase();
    return REASONING_EFFORT_ORDER.includes(normalizedFallback) ? normalizedFallback : '';
}

function resolveSupportedReasoningEffort(value, supportedEfforts = [], fallback = '') {
    const requested = normalizeReasoningEffort(value, fallback);
    if (!requested) return '';
    const supported = [...new Set((Array.isArray(supportedEfforts) ? supportedEfforts : [])
        .map((effort) => normalizeReasoningEffort(effort))
        .filter(Boolean))];
    if (supported.length === 0 || supported.includes(requested)) return requested;

    const requestedIndex = REASONING_EFFORT_ORDER.indexOf(requested);
    const safeDowngrade = REASONING_EFFORT_ORDER
        .slice(0, requestedIndex)
        .reverse()
        .find((effort) => supported.includes(effort));
    return safeDowngrade || supported[0] || '';
}

function withAutomaticReasoningEffort(options = {}, taskKind = 'writing') {
    const requested = normalizeReasoningEffort(options.reasoningEffort);
    return {
        ...options,
        reasoningEffort: requested || (taskKind === 'chat' ? 'low' : 'medium')
    };
}

function getModelRuntimeDefinition(kind, modelConfig = {}) {
    const provider = normalizeProviderId(modelConfig.provider);
    const code = String(modelConfig.code || '').trim();
    const catalogDefinition = findModelDefinition(kind, provider, code);
    return {
        kind: String(kind || '').trim(),
        provider,
        name: String(catalogDefinition?.name || modelConfig.name || code).trim(),
        code,
        transport: String(
            catalogDefinition?.transport
            || modelConfig.transport
            || inferTransport(kind, provider)
        ).trim(),
        capabilities: {
            ...(modelConfig.capabilities && typeof modelConfig.capabilities === 'object'
                ? modelConfig.capabilities
                : {}),
            ...(catalogDefinition?.capabilities || {})
        },
        status: String(catalogDefinition?.status || '').trim()
    };
}

function applyTextRuntimePolicy(modelConfig = {}, options = {}) {
    const definition = getModelRuntimeDefinition('text', modelConfig);
    const nextOptions = { ...options };
    if (definition.capabilities.temperature === false) {
        delete nextOptions.temperature;
    }
    if (Object.prototype.hasOwnProperty.call(nextOptions, 'reasoningEffort')) {
        nextOptions.reasoningEffort = normalizeReasoningEffort(nextOptions.reasoningEffort);
    }
    return { definition, options: nextOptions };
}

function buildOpenAiChatRequest(modelConfig = {}, prompt = '', options = {}) {
    const { definition, options: sanitizedOptions } = applyTextRuntimePolicy(modelConfig, options);
    const body = {
        model: String(modelConfig.code || '').trim(),
        messages: [{ role: 'user', content: String(prompt || '') }]
    };
    const maxTokens = Number.isFinite(Number(sanitizedOptions.maxTokens))
        ? Math.max(32, Number.parseInt(sanitizedOptions.maxTokens, 10))
        : null;
    const temperature = Number.isFinite(Number(sanitizedOptions.temperature))
        ? Number(sanitizedOptions.temperature)
        : null;
    const reasoningEffort = resolveSupportedReasoningEffort(
        sanitizedOptions.reasoningEffort,
        definition.capabilities.reasoning_efforts
    );

    if (maxTokens) {
        if (definition.provider === 'openai' && definition.transport === 'openai_chat_completions') {
            body.max_completion_tokens = maxTokens;
        } else {
            body.max_tokens = maxTokens;
        }
    }
    if (temperature !== null) body.temperature = temperature;
    if (
        definition.provider === 'openai'
        && definition.transport === 'openai_chat_completions'
        && reasoningEffort
    ) {
        body.reasoning_effort = reasoningEffort;
    }
    if (
        sanitizedOptions.responseMimeType === 'application/json'
        && definition.capabilities.structured_output === true
    ) {
        body.response_format = { type: 'json_object' };
    }
    if (definition.transport === 'kie_openai_chat') {
        delete body.model;
    }

    return { definition, body };
}

module.exports = {
    applyTextRuntimePolicy,
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    normalizeReasoningEffort,
    resolveSupportedReasoningEffort,
    withAutomaticReasoningEffort
};
