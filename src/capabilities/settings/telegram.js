const { validateAiMode } = require('../validators');

function createTelegramCapabilities(deps = {}) {
    const { configState } = deps;

    return [
        {
            id: 'settings.telegram.get_chat_ai_mode',
            type: 'setting.query',
            domain: 'settings.telegram',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                return {
                    summary: 'Telegram 채팅 AI 모드를 조회합니다.',
                    before: { mode: String(config.notification.telegram.chat_ai_mode || 'default') },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const mode = String(config.notification.telegram.chat_ai_mode || 'default').trim() === 'custom' ? 'custom' : 'default';
                return {
                    success: true,
                    message: `현재 Telegram 채팅 AI 모드는 ${mode === 'custom' ? 'Custom AI' : '기본 AI'} 입니다.`,
                    data: { mode },
                    sideEffects: []
                };
            }
        },
        {
            id: 'settings.telegram.set_chat_ai_mode',
            type: 'setting.update',
            domain: 'settings.telegram',
            confirmPolicy: 'required',
            validate(params = {}) {
                const validated = validateAiMode(params.mode);
                return {
                    ok: validated.ok,
                    errors: validated.ok ? [] : [validated.error],
                    normalizedParams: { mode: validated.value }
                };
            },
            async preview(params = {}) {
                const config = configState.loadStructuredConfig();
                return {
                    summary: 'Telegram 채팅 AI 모드를 변경합니다.',
                    before: { mode: String(config.notification.telegram.chat_ai_mode || 'default') },
                    after: { mode: params.mode }
                };
            },
            async execute(params = {}) {
                const config = configState.loadStructuredConfig();
                if (params.mode === 'custom') {
                    const baseUrl = String(config.ai_settings.custom.base_url || '').trim();
                    const model = String(config.ai_settings.custom.model || '').trim();
                    if (!baseUrl || !model) {
                        throw new Error('Custom AI를 사용하려면 AI 설정에 Base URL과 Model이 필요합니다.');
                    }
                }

                config.notification.telegram.chat_ai_mode = params.mode;
                configState.persistAndSync(config, {
                    TELEGRAM_CHAT_AI_MODE: params.mode,
                    notification: config.notification
                }, {});
                return {
                    success: true,
                    message: `Telegram 채팅 AI 모드를 ${params.mode === 'custom' ? 'Custom AI' : '기본 AI'}로 변경했습니다.`,
                    data: { mode: params.mode },
                    sideEffects: ['config_saved']
                };
            }
        }
    ];
}

module.exports = {
    createTelegramCapabilities
};
