function createContentIdeaCapabilities(deps = {}) {
    const { topicRecommendationsApplication, recommendationMaterializer } = deps;
    const { materializeTopicIdeas } = require('../../../services/recommendations/adapters/topic-canonical-adapter');

    return [
        {
            id: 'content.idea.suggest',
            effect: 'generated_output',
            type: 'content.generate',
            domain: 'content.idea',
            confirmPolicy: 'never',
            agentExposure: {
                kind: 'application_workflow',
                category: '블로그 글감',
                title: '글감 추천',
                description: '요청한 주제를 우선 제약으로 지켜 블로그 글감을 제안합니다. 사용자 맥락은 요청 주제와 관련된 경우에만 보조 근거로 사용합니다.',
                useWhen: '사용자가 블로그에 쓸 주제나 글감 후보를 요청합니다.',
                avoidWhen: '사용자가 글감을 저장·발행하거나 검색량 지표 또는 제목만 요청합니다.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: { type: 'integer', minimum: 1, maximum: 5 },
                        query: { type: 'string', maxLength: 500, description: '사용자가 명시한 글감의 간결한 주제 구절입니다. 요청 명령문 전체가 아니라 핵심 주제를 전달하세요. 값이 있으면 모든 결과가 이 주제를 유지해야 하며 관련 없는 개인화 후보로 대체하지 않습니다.' }
                    },
                    additionalProperties: false
                },
                parameterSemantics: {
                    query: { role: 'explicit_constraint', priority: 'user_request', fallback: 'ask_or_generate_within_topic' }
                },
                outputDescription: '주제에 맞는 글감 후보와 추천 근거를 반환합니다.',
                examples: ['여행 관련 새 글감 3개 추천해줘']
            },
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
                if (!topicRecommendationsApplication || typeof topicRecommendationsApplication.generateIdeas !== 'function') {
                    return {
                        success: true,
                        message: '현재 글감 추천 엔진이 준비되지 않았습니다.',
                        data: { ideas: [] },
                        sideEffects: []
                    };
                }

                const result = await topicRecommendationsApplication.generateIdeas({
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
