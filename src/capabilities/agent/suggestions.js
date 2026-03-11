function createAgentSuggestionCapabilities(deps = {}) {
    const { suggestionEngine } = deps;

    return [
        {
            id: 'agent.suggestions.get',
            type: 'agent.query',
            domain: 'agent.suggestions',
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
                if (!suggestionEngine || typeof suggestionEngine.generateSuggestions !== 'function') {
                    return {
                        success: true,
                        message: '현재 추천 엔진이 준비되지 않았습니다.',
                        data: { suggestions: [] },
                        sideEffects: []
                    };
                }

                const result = await suggestionEngine.generateSuggestions({
                    limit: params.limit || 3
                }, context);

                const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
                if (suggestions.length === 0) {
                    return {
                        success: true,
                        message: '현재 바로 드릴 추천이 없습니다.',
                        data: { suggestions: [], knowledge: result?.knowledge || [] },
                        sideEffects: []
                    };
                }

                const lines = suggestions.map((item, index) => `${index + 1}. ${item.summary}`);
                return {
                    success: true,
                    message: `현재 기준 추천입니다.\n${lines.join('\n')}`,
                    data: {
                        suggestions,
                        knowledge: result?.knowledge || []
                    },
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createAgentSuggestionCapabilities
};
