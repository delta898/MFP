'use strict';

const { describeSupport } = require('../../../packages/plugins/core/ai-gateway');

function createAiGatewayAdapter(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('AI Gateway adapter requires executeOperation().');
    }
    const getSupport = typeof options.getSupport === 'function' ? options.getSupport : describeSupport;

    return Object.freeze({
        describeSupport: () => getSupport(),
        getModelCatalog(request = {}) {
            return options.executeOperation('ai-gateway', 'models.list', { forceRefresh: request.forceRefresh === true });
        },
        generateText(request, executionContext = {}) {
            if (!request || !request.model || !Array.isArray(request.messages)) {
                throw new TypeError('AI Gateway text request requires a model and messages.');
            }
            return options.executeOperation('ai-gateway', 'text.generate', {
                model: request.model,
                messages: request.messages,
                ...(request.options ? { options: request.options } : {})
            }, executionContext);
        },
        generateImage(request, executionContext = {}) {
            if (!request || !request.model || typeof request.prompt !== 'string' || !request.prompt.trim()) {
                throw new TypeError('AI Gateway image request requires a model and prompt.');
            }
            return options.executeOperation('ai-gateway', 'image.generate', {
                model: request.model,
                input: { prompt: request.prompt.trim() },
                ...(request.options ? { options: request.options } : {})
            }, executionContext);
        }
    });
}

module.exports = { createAiGatewayAdapter };
