function createCustomAiCapabilities(deps = {}) {
    const { configState } = deps;

    return [
        {
            id: 'settings.custom_ai.get_summary',
            type: 'setting.query',
            domain: 'settings.custom_ai',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                const chatModel = config.ai_settings.CHAT_MODEL || {};
                return {
                    summary: 'Custom AI 설정 요약을 조회합니다.',
                    before: {
                        configured: Boolean(String(chatModel.base_url || '').trim() && String(chatModel.model || '').trim()),
                        base_url: String(chatModel.base_url || '').trim(),
                        model: String(chatModel.model || '').trim()
                    },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const chatModel = config.ai_settings.CHAT_MODEL || {};
                const baseUrl = String(chatModel.base_url || '').trim();
                const model = String(chatModel.model || '').trim();
                const configured = Boolean(baseUrl && model);
                return {
                    success: true,
                    message: configured
                        ? `현재 Custom AI는 설정되어 있습니다. Base URL: ${baseUrl}, Model: ${model}`
                        : '현재 Custom AI는 아직 완전히 설정되지 않았습니다.',
                    data: {
                        configured,
                        baseUrl,
                        model,
                        hasApiKey: Boolean(String(chatModel.api_key || '').trim())
                    },
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createCustomAiCapabilities
};
