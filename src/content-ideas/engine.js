function createContentIdeaEngine(options = {}) {
    const providers = Array.isArray(options.providers) ? options.providers.filter(Boolean) : [];
    const knowledgeRegistry = options.knowledgeRegistry || null;

    return {
        async generateIdeas(input = {}, context = {}) {
            const ideas = [];
            const knowledge = knowledgeRegistry && typeof knowledgeRegistry.fetchForRoute === 'function'
                ? await knowledgeRegistry.fetchForRoute('content_ideas', {
                    query: input.query || '',
                    topic: input.query || '',
                    limit: input.limit || 5,
                    purpose: 'content_ideas'
                }, context).catch(() => [])
                : [];

            for (const provider of providers) {
                if (!provider || typeof provider.generate !== 'function') continue;
                const result = await provider.generate(input, {
                    ...context,
                    knowledge
                });
                if (Array.isArray(result?.ideas)) {
                    ideas.push(...result.ideas);
                }
            }

            const deduped = [];
            const seen = new Set();
            ideas.forEach((item) => {
                const title = String(item?.title || '').trim();
                if (!title) return;
                const key = title.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                deduped.push({
                    id: String(item.id || `idea_${Date.now()}_${deduped.length + 1}`),
                    title,
                    summary: String(item.summary || '').trim(),
                    reason: String(item.reason || '').trim(),
                    keywords: Array.isArray(item.keywords) ? item.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean) : [],
                    source: String(item.source || 'memory_ai').trim()
                });
            });

            return {
                ideas: deduped.slice(0, Math.max(1, Math.min(5, Number(input.limit || 3)))),
                knowledge
            };
        }
    };
}

module.exports = {
    createContentIdeaEngine
};
