function createAgentRecommendationCapabilities(deps = {}) {
    const { recommendationRequestService } = deps;

    return [
        {
            id: 'agent.recommendations.get',
            type: 'agent.query',
            domain: 'agent.recommendations',
            confirmPolicy: 'never',
            validate(params = {}) {
                const limit = Number.isFinite(Number(params.limit)) ? Math.max(1, Math.min(5, Number(params.limit))) : 3;
                return { ok: true, errors: [], normalizedParams: { limit } };
            },
            async preview(params = {}) {
                return {
                    summary: '현재 기억과 상태를 바탕으로 추천을 생성합니다.',
                    before: {},
                    after: { limit: Number(params.limit || 3) }
                };
            },
            async execute(params = {}, context = {}) {
                if (!recommendationRequestService || typeof recommendationRequestService.getRecommendations !== 'function') {
                    return {
                        success: true,
                        message: '현재 추천 엔진이 준비되지 않았습니다.',
                        data: { recommendations: [] },
                        sideEffects: []
                    };
                }

                const result = await recommendationRequestService.getRecommendations({
                    limit: params.limit || 3
                }, context);

                const recommendations = Array.isArray(result?.recommendations) ? result.recommendations : [];
                if (recommendations.length === 0) {
                    return {
                        success: true,
                        message: '현재 바로 드릴 추천이 없습니다.',
                        data: { recommendations: [], knowledge: result?.knowledge || [] },
                        sideEffects: []
                    };
                }

                const lines = recommendations.map((item, index) => `${index + 1}. ${item.summary}`);
                return {
                    success: true,
                    message: `현재 기준 추천입니다.\n${lines.join('\n')}`,
                    data: {
                        recommendations,
                        knowledge: result?.knowledge || []
                    },
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createAgentRecommendationCapabilities
};
