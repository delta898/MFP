'use strict';

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value.trim();
}

function createGeneratedWordPressPublishingApplication(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('Generated WordPress Application requires executeOperation().');
    }
    if (typeof options.publish !== 'function') {
        throw new TypeError('Generated WordPress Application requires a WordPress publish function.');
    }
    if (typeof options.validatePublicationRequest !== 'function') {
        throw new TypeError('Generated WordPress Application requires WordPress request validation.');
    }
    if (typeof options.resolveTextModel !== 'function') throw new TypeError('Generated WordPress Application requires resolveTextModel().');

    return Object.freeze({
        async publish(request, executionContext = {}) {
            if (!request || typeof request !== 'object' || Array.isArray(request)) {
                throw new TypeError('Generated WordPress request must be an object.');
            }
            const input = {
                prompt: requireText(request.prompt, 'Generation prompt'),
                publication: options.validatePublicationRequest({
                    title: request.title,
                    content: request.content,
                    status: request.status,
                    date: request.date,
                    category: request.category,
                    assets: request.assets,
                    featuredAsset: request.featuredAsset
                })
            };
            const model = options.resolveTextModel(typeof options.getTextModel === 'function' ? options.getTextModel() : options.textModel);
            if (!model?.provider || !model?.modelId) throw Object.assign(new Error('Selected text model is not supported by AI Gateway.'), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
            const generated = await options.executeOperation(
                'ai-gateway',
                'text.generate',
                { model, messages: [{ role: 'user', content: input.prompt }] },
                executionContext
            );
            const publication = await options.publish({ ...input.publication, content: generated.content }, executionContext);

            return Object.freeze({ generatedText: generated.content, publication });
        }
    });
}

module.exports = { createGeneratedWordPressPublishingApplication };
