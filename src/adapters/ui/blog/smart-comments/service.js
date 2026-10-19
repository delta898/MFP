const { createApiError } = require('../../errors');

function createSmartCommentsUiService(deps = {}) {
    const { application, settingsStore, CONFIG = {} } = deps;
    if (!application) throw new Error('Blog Smart Comments Application is required.');

    return {
        async getSettings() {
            return {
                settings: application.normalizeSettings(),
                runtime: { environment: String(CONFIG.RUNTIME_ENVIRONMENT || '') }
            };
        },
        async getProgress() {
            return { progress: application.getProgress() };
        },
        async saveSettings(input = {}) {
            const settings = application.normalizeSettings(input);
            if (!settingsStore || typeof settingsStore.save !== 'function') {
                throw createApiError(503, 'SMART_COMMENT_SETTINGS_UNAVAILABLE', '스마트 댓글 설정 저장소를 사용할 수 없습니다.');
            }
            settingsStore.save(settings);
            application.applySettings(settings);
            return { message: '스마트 댓글 설정 저장 완료', settings };
        },
        run: (input = {}) => application.run(input),
        redraft: (input = {}) => application.redraft(input)
    };
}

module.exports = { createSmartCommentsUiService };
