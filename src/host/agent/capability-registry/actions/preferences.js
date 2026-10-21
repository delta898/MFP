function createAgentPreferenceCapabilities() {
    return [
        {
            id: 'agent.preferences.get_summary',
            effect: 'read_only',
            type: 'agent.query',
            domain: 'agent.preferences',
            confirmPolicy: 'never',
            agentExposure: {
                category: '개인화',
                title: '학습된 선호 확인',
                description: '기록된 사용자 선호 요약을 확인합니다.',
                useWhen: '사용자가 저장되거나 학습된 본인의 선호 내용을 묻습니다.',
                avoidWhen: '사용자가 선호 정보를 수정·삭제하거나 일반적인 추천을 요청합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '현재 기록된 사용자 선호 요약을 반환합니다.',
                examples: ['내 선호 요약 알려줘']
            },
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
