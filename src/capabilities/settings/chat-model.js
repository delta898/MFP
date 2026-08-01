const { resolveChatModelSettings } = require('../../ai-model-config');

function createChatModelCapabilities(deps = {}) {
    const { configState } = deps;

    return [
        {
            id: 'settings.chat_model.get_summary',
            type: 'setting.query',
            domain: 'settings.chat_model',
            confirmPolicy: 'never',
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
