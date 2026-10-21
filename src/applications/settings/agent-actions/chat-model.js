function createChatModelCapabilities(deps = {}) {
    const { configState, modelConfiguration } = deps;
    if (typeof modelConfiguration?.resolveChatModelSettings !== 'function') {
        throw new TypeError('Chat model capability requires the AI model configuration service.');
    }
    const { resolveChatModelSettings } = modelConfiguration;

    return [
        {
            id: 'settings.chat_model.get_summary',
            effect: 'read_only',
            type: 'setting.query',
            domain: 'settings.chat_model',
            confirmPolicy: 'never',
            agentExposure: {
                category: '설정 조회',
                title: 'Chat Model 확인',
                description: '현재 대화에 사용하는 AI 모델의 설정 요약을 확인합니다.',
                useWhen: '사용자가 현재 대화용 AI 모델 설정을 확인합니다.',
                avoidWhen: '사용자가 모델을 바꾸거나 키·비밀값을 확인하라고 합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: 'Chat Model의 설정 요약을 민감한 키 값 없이 반환합니다.',
                availabilityNote: '모델이 설정되지 않은 경우 미설정 상태를 알려드립니다.',
                examples: ['현재 Chat Model이 뭐야?']
            },
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                const chatModel = resolveChatModelSettings(config);
                return {
                    summary: 'Chat Model 설정 요약을 조회합니다.',
                    before: {
                        source: chatModel.source,
                        provider: chatModel.resolved.provider,
                        model: chatModel.resolved.name || chatModel.resolved.code
                    },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const chatModel = resolveChatModelSettings(config);
                const resolved = chatModel.resolved || {};
                const model = String(resolved.name || resolved.code || '').trim();
                const sourceLabel = chatModel.source === 'writing' ? '글쓰기 AI 모델 적용' : '별도 설정';
                const configured = Boolean(model);
                return {
                    success: true,
                    message: configured
                        ? `현재 Chat Model은 ${sourceLabel} 방식이며, 모델은 ${model}입니다.`
                        : `현재 Chat Model은 ${sourceLabel} 방식이지만 사용할 모델이 설정되지 않았습니다.`,
                    data: {
                        configured,
                        source: chatModel.source,
                        provider: String(resolved.provider || '').trim(),
                        baseUrl: String(resolved.base_url || '').trim(),
                        model,
                        hasApiKey: Boolean(String(resolved.api_key || '').trim())
                    },
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createChatModelCapabilities
};
