const { createKeywordResearchService } = require('../../keyword-research');
const { DEFAULT_RELATED_LIMIT } = require('../../keyword-research/keyword-metrics-engine');

function createKeywordsService(deps = {}) {
    const keywordResearchService = deps.keywordResearchService || createKeywordResearchService(deps);
    const smartUsageService = deps.smartUsageService || null;

    async function runTitleSuggestion(input = {}, action) {
        if (!smartUsageService) return action();
        const usageResult = await smartUsageService.run('title_recommendation', {
            sessionId: input.smart_usage_session_id || input.sessionId,
            operationId: input.smart_usage_operation_id || input.operationId,
            metadata: { surface: 'blog.quick' }
        }, action);
        return {
            ...usageResult.result,
            smart_usage: usageResult.usage,
            smart_usage_session_id: usageResult.sessionId
        };
    }

    return {
        async getStatus() {
            return {
                configured: keywordResearchService.isConfigured()
            };
        },

        async analyzeKeywords({ keywords, subject, related_assist, related_limit } = {}) {
            return keywordResearchService.analyze({
                keywords,
                subject: subject || (Array.isArray(keywords) ? keywords[0] : keywords),
                related_assist: related_assist ?? true,
                related_limit: related_limit ?? DEFAULT_RELATED_LIMIT
            });
        },

        async suggestTitles(input = {}) {
            const { keyword, keywords, subject, content, title_mode, count } = input;
            return runTitleSuggestion(input, () => keywordResearchService.suggestTitles({
                keyword,
                keywords,
                subject,
                content,
                title_mode,
                count
            }));
        },

        async researchPipeline(input = {}) {
            const { keywords, subject, content, related_assist, related_limit, title_mode, count } = input;
            return runTitleSuggestion(input, () => keywordResearchService.researchAndSuggestTitles({
                keywords,
                subject,
                content,
                related_assist: related_assist ?? true,
                related_limit: related_limit ?? DEFAULT_RELATED_LIMIT,
                title_mode,
                count: count ?? 3
            }));
        },

        async quickPublishSuggestions(requestBody = {}) {
            return keywordResearchService.suggestQuickPublish(requestBody);
        }
    };
}

module.exports = {
    createKeywordsService
};
