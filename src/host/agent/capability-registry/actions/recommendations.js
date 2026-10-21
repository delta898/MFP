function createAgentRecommendationCapabilities(deps = {}) {
    const { recommendationRequestService } = deps;

    return [
        {
            id: 'agent.recommendations.get',
            effect: 'generated_output',
            type: 'agent.query',
            domain: 'agent.recommendations',
            confirmPolicy: 'never',
            agentExposure: {
                category: '추천',
                title: '현재 기준 추천',
                description: '현재 상태와 활용 가능한 기억을 바탕으로 다음에 할 일을 추천합니다.',
                useWhen: '사용자가 지금 할 일이나 다음 단계에 대한 개인화된 추천을 요청합니다.',
                avoidWhen: '사용자가 특정 주제의 블로그 글감이나 키워드 지표를 요청합니다.',
                inputSchema: {
                    type: 'object',
                    properties: { limit: { type: 'integer', minimum: 1, maximum: 5 } },
                    additionalProperties: false
                },
                outputDescription: '현재 기준으로 요청한 개수 이내의 추천과 근거를 반환합니다.',
                examples: ['지금 추천할 만한 게 있어?']
            },
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
