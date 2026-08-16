const { createKeywordResearchService } = require('../../keyword-research');

function createKeywordsService(deps = {}) {
    const keywordResearchService = deps.keywordResearchService || createKeywordResearchService(deps);

    return {
        async getStatus() {
            return {
                configured: keywordResearchService.isConfigured()
            };
        },

        async analyzeKeywords({ keywords, subject, related_assist, related_limit, candidate_limit, min_search_volume } = {}) {
            return keywordResearchService.analyze({
                keywords,
                subject: subject || (Array.isArray(keywords) ? keywords[0] : keywords),
                related_assist: related_assist ?? true,
                related_limit: related_limit ?? 20,
                candidate_limit: candidate_limit ?? 30,
                min_search_volume: min_search_volume ?? 300
            });
        },

        async suggestTitles({ keyword, subject, content, title_mode, count } = {}) {
            return keywordResearchService.suggestTitles({
                keyword,
                subject,
                content,
                title_mode,
                count
            });
        },

        async researchPipeline({ keywords, subject, content, related_assist, title_mode, min_search_volume, count } = {}) {
            return keywordResearchService.researchAndSuggestTitles({
                keywords,
                subject,
                content,
                related_assist: related_assist ?? true,
                title_mode,
                min_search_volume: min_search_volume ?? 300,
                count: count ?? 3
            });
        }
    };
}

module.exports = {
    createKeywordsService
};
