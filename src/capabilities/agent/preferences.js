function createAgentPreferenceCapabilities() {
    return [
        {
            id: 'agent.preferences.get_summary',
            type: 'agent.query',
            domain: 'agent.preferences',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview(_params = {}, context = {}) {
                const preferences = Array.isArray(context?.memory?.preferences)
                    ? context.memory.preferences
                    : [];
                return {
                    summary: '현재 누적된 사용자 선호 요약을 조회합니다.',
                    before: {
                        preference_count: preferences.length
                    },
                    after: {}
                };
            },
            async execute(_params = {}, context = {}) {
                const preferences = Array.isArray(context?.memory?.preferences)
                    ? context.memory.preferences
                    : [];

                if (preferences.length === 0) {
                    return {
                        success: true,
                        message: '아직 누적된 사용자 선호 정보가 충분하지 않습니다.',
                        data: { preferences: [] },
                        sideEffects: []
                    };
                }

                const lines = preferences.map((item, index) => {
                    const value = item.value && typeof item.value === 'object'
                        ? JSON.stringify(item.value)
                        : String(item.value || '');
                    return `${index + 1}. ${item.name}: ${value} (confidence=${Number(item.confidence || 0).toFixed(2)}, evidence=${Number(item.evidence_count || 0)})`;
                });

                return {
                    success: true,
                    message: `현재 누적된 선호 요약입니다.\n${lines.join('\n')}`,
                    data: { preferences },
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createAgentPreferenceCapabilities
};
