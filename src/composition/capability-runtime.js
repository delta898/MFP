const { createCapabilityRegistry } = require('../capabilities');
const { createBlogTopicRecommendationsApplication } = require('../applications/blog/topic-recommendations/application');
const { createAiMemoryContentIdeaProvider } = require('../applications/blog/topic-recommendations/ai-memory-provider');
const { createBlogKeywordResearchRuntime } = require('./blog-keyword-research');

function createCapabilityRuntime(deps = {}) {
    const topicRecommendationsApplication = deps.topicRecommendationsApplication
        || createBlogTopicRecommendationsApplication({
            knowledgeRegistry: deps.knowledgeRegistry,
            Logger: deps.Logger,
            providers: [
                createAiMemoryContentIdeaProvider({
                    Logger: deps.Logger,
                    generateText: typeof deps.blogWritingApplication?.generateChatText === 'function'
                        ? (prompt, modelOptions = {}) => deps.blogWritingApplication.generateChatText(prompt, {
                            generationOptions: {
                                ...(typeof modelOptions.temperature === 'number' ? { temperature: modelOptions.temperature } : {}),
                                ...(typeof modelOptions.maxTokens === 'number' ? { maxOutputTokens: modelOptions.maxTokens } : {}),
                                responseFormat: 'json'
                            }
                        })
                        : undefined
                })
            ]
        });

    const keywordResearchApplication = deps.keywordResearchApplication
        || createBlogKeywordResearchRuntime(deps);

    return createCapabilityRegistry({ ...deps, topicRecommendationsApplication, keywordResearchApplication });
}

module.exports = { createCapabilityRuntime };
