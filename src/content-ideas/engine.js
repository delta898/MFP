const { createTopicCandidateGenerator } = require('../recommendations/topic-candidate-generator');
const { rankTopicCandidates } = require('../recommendations/topic-ranking-policy');

function createContentIdeaEngine(options = {}) {
    const providers = Array.isArray(options.providers) ? options.providers.filter(Boolean) : [];
    const knowledgeRegistry = options.knowledgeRegistry || null;
    const candidateGenerator = options.candidateGenerator || createTopicCandidateGenerator();
    const candidateRanker = options.candidateRanker || rankTopicCandidates;

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
            const ownerMemory = context?.memory?.owner_memory && typeof context.memory.owner_memory === 'object'
                ? context.memory.owner_memory
                : {};
            const candidateSet = candidateGenerator.generate({
                query: input.query || '',
                ownerProfile: ownerMemory.profile || {},
                recentArtifacts: ownerMemory.recent_artifacts || [],
                knowledge,
                limit: Math.max(10, Number(input.limit || 5) * 4)
            });
            const ranking = candidateRanker({
                candidates: candidateSet.candidates,
                ownerProfile: ownerMemory.profile || {},
                limit: Math.max(8, Number(input.limit || 5) * 3)
            });

            for (const provider of providers) {
                if (!provider || typeof provider.generate !== 'function') continue;
                const result = await provider.generate(input, {
                    ...context,
                    knowledge,
                    recommendationCandidates: ranking.selected
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
                knowledge,
                candidates: ranking.selected,
                ranking: {
                    policy: ranking.policy,
                    input_count: ranking.input_count,
                    selected_count: ranking.selected_count,
                    deferred_count: ranking.deferred_count
                }
            };
        }
    };
}

module.exports = {
    createContentIdeaEngine
};
