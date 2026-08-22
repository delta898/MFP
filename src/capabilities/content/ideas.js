function createContentIdeaCapabilities(deps = {}) {
    const { contentIdeaEngine, recommendationMaterializer } = deps;
    const { materializeTopicIdeas } = require('../../recommendations/adapters/topic-canonical-adapter');

    return [
        {
            id: 'content.idea.suggest',
            type: 'content.generate',
            domain: 'content.idea',
            confirmPolicy: 'never',
            validate(params = {}) {
                const limit = Number.isFinite(Number(params.limit)) ? Math.max(1, Math.min(5, Number(params.limit))) : 3;
                const query = String(params.query || params.topic_hint || '').trim();
                return {
                    ok: true,
                    errors: [],
                    normalizedParams: { limit, query }
                };
            },
            async preview(params = {}) {
                return {
                    summary: '사용자 맥락과 기억을 바탕으로 새로운 글감을 추천합니다.',
                    before: {},
                    after: {
                        limit: Number(params.limit || 3),
                        query: String(params.query || '').trim()
                    }
                };
            },
            async execute(params = {}, context = {}) {
                if (!contentIdeaEngine || typeof contentIdeaEngine.generateIdeas !== 'function') {
                    return {
                        success: true,
                        message: '현재 글감 추천 엔진이 준비되지 않았습니다.',
                        data: { ideas: [] },
                        sideEffects: []
                    };
                }

                const result = await contentIdeaEngine.generateIdeas({
                    limit: params.limit || 3,
                    query: params.query || ''
                }, context);

                const ownerUserId = String(context?.memory?.owner_memory?.owner_user_id
                    || deps.eventStore?.getLocalOwnerIdentity?.()?.owner_user_id || '').trim();
                const ideas = await materializeTopicIdeas({
                    ideas: Array.isArray(result?.ideas) ? result.ideas : [],
                    candidates: Array.isArray(result?.candidates) ? result.candidates : [],
                    run_id: result?.recommendation_run?.id,
                    owner_user_id: ownerUserId,
                    memory: context.memory
                }, { materializer: recommendationMaterializer });
                if (ideas.length === 0) {
                    return {
                        success: true,
                        message: '현재 바로 드릴 글감 추천이 없습니다.',
                        data: { ideas: [] },
                        sideEffects: []
                    };
                }

                const lines = ideas.map((item, index) => {
                    const reason = item.reason ? ` — ${item.reason}` : '';
                    return `${index + 1}. ${item.title}${reason}`;
                });

                return {
                    success: true,
                    message: `글감 추천입니다.\n${lines.join('\n')}`,
                    data: {
                        ideas,
                        recommendation_run: result.recommendation_run || null,
                        ranking: result.ranking || null
                    },
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createContentIdeaCapabilities
};
