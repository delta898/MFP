'use strict';

function createBlogWritingApplication(options = {}) {
    const aiGeneration = options.aiGeneration;
    if (!aiGeneration || typeof aiGeneration.generateText !== 'function' || typeof aiGeneration.generateImage !== 'function') {
        throw new TypeError('Blog Writing Application requires the shared AI Generation service.');
    }

    async function generateText(prompt, executionContext, fallbackSelection) {
        if (typeof prompt !== 'string' || !prompt.trim()) {
            throw new TypeError('Blog manuscript prompt must be a non-empty string.');
        }
        const { generationOptions, logContext, ...gatewayContext } = executionContext;
        const selection = executionContext.modelSelection || fallbackSelection();
        const generated = await aiGeneration.generateText({
            modelSelection: selection,
            prompt: prompt.trim(),
            ...(logContext ? { logContext } : {}),
            ...(generationOptions ? { options: generationOptions } : {}),
            ...(aiGeneration.supportsFeature?.('text', selection, 'jsonResponse') ? { responseFormat: 'json' } : {})
        }, gatewayContext);
        return generated.content;
    }

    return Object.freeze({
        async generateText(prompt, executionContext = {}) {
            return generateText(prompt, executionContext,
                () => typeof options.getTextModel === 'function' ? options.getTextModel() : options.textModel);
        },

        async generateChatText(prompt, executionContext = {}) {
            return generateText(prompt, executionContext,
                () => typeof options.getChatModel === 'function' ? options.getChatModel() : options.chatModel
                    || (typeof options.getTextModel === 'function' ? options.getTextModel() : options.textModel));
        },

        async generateImage(prompt, imageOptions = {}, executionContext = {}) {
            if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Image prompt must be a non-empty string.');
            const selection = executionContext.modelSelection
                || (typeof options.getImageModel === 'function' ? options.getImageModel() : options.imageModel);
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
