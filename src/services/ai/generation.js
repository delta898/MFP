'use strict';

const EMPTY_SUPPORT = Object.freeze({ routes: Object.freeze([]) });
const UNSUPPORTED_ROUTE_CODE = 'AI_GATEWAY_UNSUPPORTED_ROUTE';

function resolveModels(kind, catalog, support) {
    if (!['text', 'image'].includes(kind)) throw new TypeError('AI model kind must be text or image.');
    const models = Array.isArray(catalog?.[kind]) ? catalog[kind] : [];
    const routes = Array.isArray(support?.routes) ? support.routes : [];
    return models.filter((model) => routes.some((route) => route.kind === kind
        && route.provider === model.provider
        && route.transport === model.transport
        && (!Array.isArray(route.modelIds) || route.modelIds.includes(model.code))));
}

function resolveModel(kind, selection, catalog, support) {
    const provider = String(selection?.provider || '').trim().toLowerCase();
    const modelId = String(selection?.modelId || selection?.code || '').trim();
    if (!provider || !modelId) return null;
    const model = resolveModels(kind, catalog, support).find((item) => item.provider === provider && item.code === modelId);
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

    function supportsFeature(kind, selection, feature) {
        if (feature !== 'jsonResponse') return false;
        const provider = String(selection?.provider || '').trim().toLowerCase();
        const modelId = String(selection?.modelId || selection?.code || '').trim();
        const route = getSupport().routes?.find((item) => item.kind === kind && item.provider === provider
            && (!item.transport || item.transport === getCatalog()?.[kind]?.find((model) => model.provider === provider && model.code === modelId)?.transport)
            && (!Array.isArray(item.modelIds) || item.modelIds.includes(modelId)));
        if (route?.jsonMode !== true) return false;
        const model = getCatalog()?.[kind]?.find((item) => item.provider === provider && item.code === modelId);
        return !model || model.capabilities?.structured_output !== false;
    }

    function resolveSelection(kind, selection) {
        const model = resolveModel(kind, selection, getCatalog(), getSupport());
        if (model) return model;
        const error = new Error(`Selected ${kind} model is not available through the AI Gateway.`);
        error.code = UNSUPPORTED_ROUTE_CODE;
        throw error;
    }

    return Object.freeze({
        getSupportedModels(kind) {
            return resolveModels(kind, getCatalog(), getSupport());
        },
        resolveModel(kind, selection) {
            return resolveModel(kind, selection, getCatalog(), getSupport());
        },
        supportsFeature,
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
            return gateway.generateText({ model, messages, ...(Object.keys(optionsForRequest).length ? { options: optionsForRequest } : {}) }, executionContext);
        },
        async generateImage(request = {}, executionContext = {}) {
            const model = resolveSelection('image', request.modelSelection || request.model);
            if (typeof request.prompt !== 'string' || !request.prompt.trim()) throw new TypeError('AI image generation requires a prompt.');
            return gateway.generateImage({ model, prompt: request.prompt.trim(), options: request.options || {} }, executionContext);
        }
    });
}

module.exports = { createAiGenerationService, resolveModels, resolveModel };
