'use strict';

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value.trim();
}

function createGeneratedWordPressPublishingApplication(options = {}) {
    if (!options.aiGeneration || typeof options.aiGeneration.generateText !== 'function') {
        throw new TypeError('Generated WordPress Application requires the shared AI Generation service.');
    }
    if (typeof options.publish !== 'function') {
        throw new TypeError('Generated WordPress Application requires a WordPress publish function.');
    }
    if (typeof options.validatePublicationRequest !== 'function') {
        throw new TypeError('Generated WordPress Application requires WordPress request validation.');
    }

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
            const generated = await options.aiGeneration.generateText({
                modelSelection: typeof options.getTextModel === 'function' ? options.getTextModel() : options.textModel,
                prompt: input.prompt
            }, executionContext);
            const publication = await options.publish({ ...input.publication, content: generated.content }, executionContext);

            return Object.freeze({ generatedText: generated.content, publication });
        }
    });
}

module.exports = { createGeneratedWordPressPublishingApplication };
