'use strict';

const EMPTY_SUPPORT = Object.freeze({ routes: Object.freeze([]) });
const UNSUPPORTED_ROUTE_CODE = 'AI_GATEWAY_UNSUPPORTED_ROUTE';

function logField(value, maxLength = 500) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function resolveModels(kind, catalog, support, configuredModels = []) {
    if (!['text', 'image'].includes(kind)) throw new TypeError('AI model kind must be text or image.');
    const models = [
        ...(Array.isArray(catalog?.[kind]) ? catalog[kind] : []),
        ...(Array.isArray(configuredModels) ? configuredModels.filter((model) => model?.provider === 'direct') : [])
    ];
    const routes = Array.isArray(support?.routes) ? support.routes : [];
    return models.filter((model) => routes.some((route) => route.kind === kind
        && route.provider === model.provider
        && route.transport === model.transport
        && (!Array.isArray(route.modelIds) || route.modelIds.includes(model.code))));
}

function resolveModel(kind, selection, catalog, support, configuredModels = []) {
    const provider = String(selection?.provider || '').trim().toLowerCase();
    const modelId = String(selection?.modelId || selection?.code || '').trim();
    if (!provider || !modelId) return null;
    const model = resolveModels(kind, catalog, support, configuredModels).find((item) => item.provider === provider && item.code === modelId);
    return model ? Object.freeze({ provider: model.provider, modelId: model.code }) : null;
}

function createAiGenerationService(options = {}) {
    const gateway = options.gateway;
    if (!gateway || typeof gateway.generateText !== 'function' || typeof gateway.generateImage !== 'function'
        || typeof gateway.describeSupport !== 'function') {
        throw new TypeError('AI Generation service requires a Gateway capability adapter.');
    }
    if (typeof options.getModelCatalog !== 'function') {
        throw new TypeError('AI Generation service requires getModelCatalog().');
    }
    const getSupport = () => gateway.describeSupport() || EMPTY_SUPPORT;
    const getCatalog = () => options.getModelCatalog() || {};
    const logger = options.logger;
    const getConfiguredModels = (kind) => {
        const configured = typeof options.getConfiguredModels === 'function' ? options.getConfiguredModels(kind) : [];
        return (Array.isArray(configured) ? configured : [])
            .filter((model) => model?.provider === 'direct' && model.code && model.transport)
            .map((model) => ({
                provider: 'direct',
                code: String(model.code),
                name: String(model.name || model.code),
                transport: String(model.transport),
                capabilities: model.capabilities && typeof model.capabilities === 'object'
                    ? { ...model.capabilities }
                    : {}
            }));
    };

    function availableModels(kind) {
        return resolveModels(kind, getCatalog(), getSupport(), getConfiguredModels(kind));
    }

    function logGenerationFailure(kind, model, error, startedAt) {
        let metadata = null;
        try {
            metadata = availableModels(kind).find((item) => item.provider === model.provider && item.code === model.modelId) || null;
        } catch (_error) {
            // Preserve the originating generation failure if diagnostics cannot resolve model metadata.
        }
        const detail = [
            `provider=${logField(model.provider, 80)}`,
            `modelId=${logField(model.modelId, 160)}`,
            `transport=${logField(metadata?.transport, 100) || 'unknown'}`,
            `elapsed=${Math.max(0, Date.now() - startedAt)}ms`,
            `gatewayCode=${logField(error?.code || 'AI_GENERATION_FAILED', 100)}`,
            ...(Number.isInteger(error?.status) ? [`httpStatus=${error.status}`] : []),
            ...(error?.providerCode ? [`providerCode=${logField(error.providerCode, 100)}`] : []),
            ...(error?.providerMessage ? [`providerMessage=${JSON.stringify(logField(error.providerMessage))}`] : []),
            ...(error?.providerRequestId ? [`providerRequestId=${logField(error.providerRequestId, 256)}`] : [])
        ].join(', ');
        try { logger?.warn?.(`[AI Gateway] ${kind}.generate 실패 (${detail})`); } catch (_error) {
            // Logging must not replace the upstream generation error.
        }
    }

    function supportsFeature(kind, selection, feature) {
        if (feature !== 'jsonResponse') return false;
        const provider = String(selection?.provider || '').trim().toLowerCase();
        const modelId = String(selection?.modelId || selection?.code || '').trim();
        const route = getSupport().routes?.find((item) => item.kind === kind && item.provider === provider
            && (!item.transport || item.transport === getCatalog()?.[kind]?.find((model) => model.provider === provider && model.code === modelId)?.transport)
            && (!Array.isArray(item.modelIds) || item.modelIds.includes(modelId)));
        if (route?.jsonMode !== true) return false;
        const model = availableModels(kind).find((item) => item.provider === provider && item.code === modelId);
        return !model || model.capabilities?.structured_output !== false;
    }

    function supportsOption(kind, selection, option, value) {
        if (kind !== 'image' || option !== 'aspectRatio') return false;
        const provider = String(selection?.provider || '').trim().toLowerCase();
        const modelId = String(selection?.modelId || selection?.code || '').trim();
        const model = availableModels(kind).find((item) => item.provider === provider && item.code === modelId);
        const route = getSupport().routes?.find((item) => item.kind === kind && item.provider === provider
            && (!item.transport || item.transport === model?.transport)
            && (!Array.isArray(item.modelIds) || item.modelIds.includes(modelId)));
        if (!route || !model) return false;
        if (!Array.isArray(route.aspectRatios)) return undefined;
        return route.aspectRatios.includes(value);
    }

    function resolveSelection(kind, selection) {
        const model = resolveModel(kind, selection, getCatalog(), getSupport(), getConfiguredModels(kind));
        if (model) return model;
        const error = new Error(`Selected ${kind} model is not available through the AI Gateway.`);
        error.code = UNSUPPORTED_ROUTE_CODE;
        throw error;
    }

    return Object.freeze({
        getSupportedModels(kind) {
            return availableModels(kind);
        },
        resolveModel(kind, selection) {
            return resolveModel(kind, selection, getCatalog(), getSupport(), getConfiguredModels(kind));
        },
        supportsFeature,
        supportsOption,
        async generateText(request = {}, executionContext = {}) {
            const model = resolveSelection('text', request.modelSelection || request.model);
            const messages = Array.isArray(request.messages)
                ? request.messages
                : typeof request.prompt === 'string' && request.prompt.trim()
                    ? [{ role: 'user', content: request.prompt.trim() }]
                    : null;
            if (!messages?.length) throw new TypeError('AI text generation requires a prompt or messages.');
            const optionsForRequest = { ...(request.options || {}) };
            if (request.responseFormat === 'json') {
                optionsForRequest.responseFormat = 'json';
            }
            const startedAt = Date.now();
            try {
                return await gateway.generateText({ model, messages, ...(Object.keys(optionsForRequest).length ? { options: optionsForRequest } : {}) }, executionContext);
            } catch (error) {
                logGenerationFailure('text', model, error, startedAt);
                throw error;
            }
        },
        async generateImage(request = {}, executionContext = {}) {
            const model = resolveSelection('image', request.modelSelection || request.model);
            if (typeof request.prompt !== 'string' || !request.prompt.trim()) throw new TypeError('AI image generation requires a prompt.');
            const startedAt = Date.now();
            try {
                return await gateway.generateImage({ model, prompt: request.prompt.trim(), options: request.options || {} }, executionContext);
            } catch (error) {
                logGenerationFailure('image', model, error, startedAt);
                throw error;
            }
        }
    });
}

module.exports = { createAiGenerationService, resolveModels, resolveModel };
