'use strict';

const { createWordPressPublishingApplication } = require('../publishing/wordpress');

function createBlogWritingApplication(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('Blog Writing Application requires executeOperation().');
    }

    const wordpress = options.wordpressApplication
        || createWordPressPublishingApplication({ executeOperation: options.executeOperation });

    return Object.freeze({
        async generateText(prompt, executionContext = {}) {
            if (typeof prompt !== 'string' || !prompt.trim()) {
                throw new TypeError('Blog manuscript prompt must be a non-empty string.');
            }
            const selection = executionContext.modelSelection
                || (typeof options.getTextModel === 'function' ? options.getTextModel() : options.textModel);
            const model = typeof options.resolveTextModel === 'function'
                ? options.resolveTextModel(selection)
                : selection;
            if (!model?.provider || !model?.modelId) {
                const error = new Error('선택한 텍스트 모델은 AI Gateway에서 사용할 수 없습니다.');
                error.code = 'AI_GATEWAY_UNSUPPORTED_ROUTE';
                throw error;
            }
            const generated = await options.executeOperation(
                'ai-gateway',
                'text.generate',
                {
                    model,
                    messages: [{ role: 'user', content: prompt.trim() }],
                    options: {
                        ...(options.supportsJson?.(model) ? { responseFormat: 'json' } : {})
                    }
                },
                executionContext
            );
            return generated.content;
        },

        async generateImage(prompt, imageOptions = {}, executionContext = {}) {
            if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Image prompt must be a non-empty string.');
            const selection = typeof options.getImageModel === 'function' ? options.getImageModel() : options.imageModel;
            const model = typeof options.resolveImageModel === 'function'
                ? options.resolveImageModel(selection)
                : selection;
            if (!model?.provider || !model?.modelId) {
                const error = new Error('선택한 이미지 모델은 AI Gateway에서 사용할 수 없습니다.');
                error.code = 'AI_GATEWAY_UNSUPPORTED_ROUTE';
                throw error;
            }
            const generated = await options.executeOperation('ai-gateway', 'image.generate', {
                model,
                input: { prompt: prompt.trim() },
                options: imageOptions
            }, executionContext);
            return generated.images[0];
        },

        async listWordPressCategories(search = '', executionContext = {}) {
            const result = await options.executeOperation(
                'wordpress-publisher',
                'categories.list',
                { search: typeof search === 'string' ? search.trim() : '' },
                executionContext
            );
            return result;
        },

        async publishWordPress(request, executionContext = {}) {
            return wordpress.publish(request, executionContext);
        }
    });
}

module.exports = { createBlogWritingApplication };
