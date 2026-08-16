const { createKeywordResearchService } = require('../../keyword-research');
const { DEFAULT_RELATED_LIMIT } = require('../../keyword-research/keyword-metrics-engine');

function createKeywordsService(deps = {}) {
    const keywordResearchService = deps.keywordResearchService || createKeywordResearchService(deps);

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

        async suggestTitles({ keyword, keywords, subject, content, title_mode, count } = {}) {
            return keywordResearchService.suggestTitles({
                keyword,
                keywords,
                subject,
                content,
                title_mode,
                count
            });
        },

        async researchPipeline({ keywords, subject, content, related_assist, related_limit, title_mode, count } = {}) {
            return keywordResearchService.researchAndSuggestTitles({
                keywords,
                subject,
                content,
                related_assist: related_assist ?? true,
                related_limit: related_limit ?? DEFAULT_RELATED_LIMIT,
                title_mode,
                count: count ?? 3
            });
        },

        async quickPublishSuggestions(requestBody = {}) {
            return keywordResearchService.suggestQuickPublish(requestBody);
        }
    };
}

module.exports = {
    createKeywordsService
};
