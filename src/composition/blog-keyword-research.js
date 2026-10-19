'use strict';

const { createKeywordResearchSupabaseClient } = require('../adapters/supabase/functions/keyword-research-client');
const { createBlogKeywordResearchApplication, createTitleGenerator } = require('../applications/blog/keyword-research/application');

function createBlogKeywordResearchRuntime(options = {}) {
    const config = options.CONFIG || options.config || {};
    const blogWritingApplication = options.blogWritingApplication;
    const keywordGateway = options.keywordGateway || createKeywordResearchSupabaseClient({
        config,
        License: options.License
    });
    const titleGenerator = options.titleGenerator || createTitleGenerator({
        Logger: options.Logger,
        generateText: typeof blogWritingApplication?.generateText === 'function'
            ? (prompt, modelOptions = {}) => {
                const provider = String(config.TEXT_MODEL_CONFIG?.provider || '').trim().toLowerCase();
                const modelId = String(config.TEXT_MODEL_CONFIG?.code || '').trim();
                return blogWritingApplication.generateText(prompt, {
                    ...(provider && modelId ? { modelSelection: { provider, modelId } } : {}),
                    generationOptions: {
                        ...(typeof modelOptions.temperature === 'number' ? { temperature: modelOptions.temperature } : {}),
                        ...(typeof modelOptions.maxTokens === 'number' ? { maxOutputTokens: modelOptions.maxTokens } : {}),
                        ...(modelOptions.reasoningEffort ? { reasoningEffort: modelOptions.reasoningEffort } : {}),
                        responseFormat: 'json'
                    }
                });
            }
            : undefined
    });

    return createBlogKeywordResearchApplication({
        keywordGateway,
        titleGenerator,
        Logger: options.Logger
    });
}

module.exports = { createBlogKeywordResearchRuntime };
