function createSmartCommentSettingsStore(deps = {}) {
    const { fs, path, resolveWritableConfigPath } = deps;

    return {
        save(settings) {
            if (!fs || !path || typeof resolveWritableConfigPath !== 'function') {
                throw new Error('스마트 댓글 설정 저장소를 사용할 수 없습니다.');
            }
            const writablePath = resolveWritableConfigPath();
            let structuredConfig = {};
            try {
                if (fs.existsSync(writablePath)) structuredConfig = JSON.parse(fs.readFileSync(writablePath, 'utf8'));
            } catch (_) {
                structuredConfig = {};
            }
            if (!structuredConfig.features) structuredConfig.features = {};
            if (!structuredConfig.features.naver) structuredConfig.features.naver = {};
            structuredConfig.features.naver.comment_draft = {
                ai_mode: settings.aiMode,
                fetch_limit: settings.fetchLimit,
                max_chars: settings.maxChars,
                headless: settings.headless
            };
            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, JSON.stringify(structuredConfig, null, 2), 'utf8');
        }
    };
}

module.exports = { createSmartCommentSettingsStore };
