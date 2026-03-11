function createSuggestionEngine(options = {}) {
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const knowledgeRegistry = options.knowledgeRegistry || null;

    return {
        async generateSuggestions(input = {}, context = {}) {
            const knowledge = knowledgeRegistry
                ? await knowledgeRegistry.fetchForRoute('suggestions', {
                    topic: input.topic || '',
                    intent: input.intent || '',
                    query: input.query || '',
                    limit: input.limit || 5,
                    purpose: 'suggestions'
                }, context)
                : [];
            const suggestions = [];
            for (const provider of providers) {
                if (!provider || typeof provider.generate !== 'function') continue;
                const items = await provider.generate(input, { ...context, knowledge });
                if (Array.isArray(items)) suggestions.push(...items);
            }

            return {
                suggestions: suggestions.slice(0, Math.max(1, Math.min(5, Number(input.limit || 3)))),
                knowledge
            };
        }
    };
}

module.exports = {
    createSuggestionEngine
};
