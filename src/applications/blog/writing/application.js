'use strict';

function createBlogWritingApplication(options = {}) {
    const aiGeneration = options.aiGeneration;
    if (!aiGeneration || typeof aiGeneration.generateText !== 'function' || typeof aiGeneration.generateImage !== 'function') {
        throw new TypeError('Blog Writing Application requires the shared AI Generation service.');
    }

    return Object.freeze({
        async generateText(prompt, executionContext = {}) {
            if (typeof prompt !== 'string' || !prompt.trim()) {
                throw new TypeError('Blog manuscript prompt must be a non-empty string.');
            }
            const selection = executionContext.modelSelection
                || (typeof options.getTextModel === 'function' ? options.getTextModel() : options.textModel);
            const generated = await aiGeneration.generateText({
                modelSelection: selection,
                prompt: prompt.trim(),
                ...(aiGeneration.supportsFeature?.('text', selection, 'jsonResponse') ? { responseFormat: 'json' } : {})
            }, executionContext);
            return generated.content;
        },

        async generateImage(prompt, imageOptions = {}, executionContext = {}) {
            if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Image prompt must be a non-empty string.');
            const selection = typeof options.getImageModel === 'function' ? options.getImageModel() : options.imageModel;
            const generated = await aiGeneration.generateImage({
                modelSelection: selection,
                prompt: prompt.trim(),
                options: imageOptions
            }, executionContext);
            return generated.images[0];
        }
    });
}

module.exports = { createBlogWritingApplication };
