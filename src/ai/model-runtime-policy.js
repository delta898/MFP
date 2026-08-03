const { findModelDefinition } = require('./catalog-registry');
const { inferTransport } = require('./transport-registry');
const { normalizeProviderId } = require('./provider-id');

function getModelRuntimeDefinition(kind, modelConfig = {}) {
    const provider = normalizeProviderId(modelConfig.provider);
    const code = String(modelConfig.code || '').trim();
    const catalogDefinition = findModelDefinition(kind, provider, code);
    return {
        kind: String(kind || '').trim(),
        provider,
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

    if (maxTokens) {
        if (definition.provider === 'openai' && definition.transport === 'openai_chat_completions') {
            body.max_completion_tokens = maxTokens;
        } else {
            body.max_tokens = maxTokens;
        }
    }
    if (temperature !== null) body.temperature = temperature;
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

function resolveOpenAiImageRequest(modelConfig = {}, options = {}) {
    const definition = getModelRuntimeDefinition('image', modelConfig);
    const aspectRatio = String(options.aspectRatio || '').trim();
    const imageSize = String(options.imageSize || '').trim().toUpperCase();
    const supportsArbitrarySize = definition.capabilities.arbitrary_size === true;

    let size = '1024x1024';
    if (supportsArbitrarySize) {
        if (aspectRatio === '4:3') {
            size = imageSize === '2K' ? '2048x1536' : '1536x1152';
        } else if (aspectRatio === '3:4') {
            size = imageSize === '2K' ? '1536x2048' : '1152x1536';
        } else if (aspectRatio === '16:9') {
            size = imageSize === '2K' ? '2048x1152' : '1536x864';
        } else if (aspectRatio === '9:16') {
            size = imageSize === '2K' ? '1152x2048' : '864x1536';
        } else if (imageSize === '2K') {
            size = '2048x2048';
        }
    }

    const body = {
        model: String(modelConfig.code || '').trim(),
        prompt: String(options.prompt || '')
    };
    if (size) body.size = size;
    if (definition.capabilities.response_format !== false) {
        body.response_format = 'b64_json';
    }
    if (Array.isArray(definition.capabilities.quality) && definition.capabilities.quality.includes('auto')) {
        body.quality = 'auto';
    }

    return { definition, body };
}

module.exports = {
    applyTextRuntimePolicy,
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    resolveOpenAiImageRequest
};
