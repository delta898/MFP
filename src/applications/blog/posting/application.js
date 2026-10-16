'use strict';

function toModelSelection(modelConfig) {
    const provider = String(modelConfig?.provider || '').trim();
    const modelId = String(modelConfig?.code || modelConfig?.modelId || modelConfig?.name || '').trim();
    return provider && modelId ? { provider, modelId } : null;
}

function createBlogPostingApplication(options = {}) {
    const Core = options.Core;
    const writing = options.blogWritingApplication;
    if (typeof Core?.generateContent !== 'function' || typeof Core?.prepareImages !== 'function') {
        throw new TypeError('Blog Posting Application requires content preparation operations.');
    }
    if (typeof writing?.generateText !== 'function' || typeof writing?.generateImage !== 'function') {
        throw new TypeError('Blog Posting Application requires Blog Writing Application.');
    }

    return Object.freeze({
        async preparePost(topic, settings = {}) {
            const signal = settings.signal;
            settings.onStage?.('writing');
            const generated = await Core.generateContent(topic, settings.workspaceDir || null, {
                ...(settings.enableRelatedPostsAutoLink !== undefined
                    ? { enableRelatedPostsAutoLink: settings.enableRelatedPostsAutoLink }
                    : {}),
                ...(settings.platform ? { platform: settings.platform } : {}),
                ...(settings.textModelConfig ? { textModelConfig: settings.textModelConfig } : {}),
                ...(settings.imageModelConfig ? { imageModelConfig: settings.imageModelConfig } : {}),
                ...(signal ? { signal } : {}),
                generateText(prompt, context = {}) {
                    return writing.generateText(prompt, {
                        ...(context.signal || signal ? { signal: context.signal || signal } : {}),
                        ...(toModelSelection(context.modelConfig) ? { modelSelection: toModelSelection(context.modelConfig) } : {})
                    });
                }
            });

            if (signal?.aborted) {
                const error = new Error('Blog post preparation was canceled.');
                error.code = 'BLOG_POST_CANCELED';
                throw error;
            }
            settings.onStage?.('images');
            await Core.prepareImages(generated.targetDir, topic, {
                imageGenerationEnabled: settings.imageGenerationEnabled !== false,
                ...(settings.imageModelConfig ? { imageModelConfig: settings.imageModelConfig } : {}),
                ...(signal ? { signal } : {}),
                ...(typeof settings.onImageProgress === 'function'
                    ? { onImageProgress: settings.onImageProgress }
                    : {}),
                generateImage(prompt, imageOptions = {}) {
                    const modelSelection = toModelSelection(imageOptions.modelConfig);
                    return writing.generateImage(prompt, {
                        aspectRatio: imageOptions.aspectRatio || '4:3',
                        size: imageOptions.size || '1K',
                        count: 1
                    }, {
                        ...(imageOptions.signal || signal ? { signal: imageOptions.signal || signal } : {}),
                        ...(typeof settings.reportImageProgress === 'function'
                            ? { reportProgress: settings.reportImageProgress }
                            : {}),
                        ...(modelSelection ? { modelSelection } : {})
                    });
                }
            });
            return generated;
        }
    });
}

module.exports = { createBlogPostingApplication, toModelSelection };
