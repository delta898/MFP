'use strict';

function createSettingsValidationError(code, message) {
    return Object.assign(new Error(message), { code });
}

function normalizeAppGeneralSettings(requestBody = {}) {
    const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};
    const LISTEN_HOST = String(values.LISTEN_HOST || '').trim();
    const LISTEN_PORT = Number(values.LISTEN_PORT);
    if (!['127.0.0.1', '0.0.0.0'].includes(LISTEN_HOST)) {
        throw createSettingsValidationError('LISTEN_HOST_INVALID', '접속 주소를 확인해 주세요.');
    }
    if (!Number.isInteger(LISTEN_PORT) || LISTEN_PORT < 1 || LISTEN_PORT > 65535) {
        throw createSettingsValidationError('LISTEN_PORT_INVALID', '1~65535 사이의 포트 번호를 입력해 주세요.');
    }
    return { fields: { LISTEN_HOST, LISTEN_PORT } };
}

function normalizeAppInputSettings(requestBody = {}) {
    const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};
    const TYPING_SPEED = String(values.TYPING_SPEED || '').trim().toUpperCase();
    if (!['QUICK', 'FAST', 'NORMAL', 'HUMAN'].includes(TYPING_SPEED)) {
        throw createSettingsValidationError('TYPING_SPEED_INVALID', '네이버 입력 속도를 확인해 주세요.');
    }
    return { fields: { TYPING_SPEED } };
}

function createSettingsAppPreferencesApplication(deps = {}) {
    const {
        config = {},
        configRepository,
        defaultHost,
        defaultPort,
        normalizeListenHost,
        normalizeListenPort,
        scheduleUiReload
    } = deps;

    return {
        getAppGeneralSettings() {
            return { fields: {
                LISTEN_HOST: normalizeListenHost(config.LISTEN_HOST, defaultHost),
                LISTEN_PORT: normalizeListenPort(config.LISTEN_PORT, defaultPort)
            } };
        },

        getAppInputSettings() {
            return { fields: { TYPING_SPEED: String(config.TYPING_SPEED || 'NORMAL').trim().toUpperCase() } };
        },

        saveAppInputSettings(requestBody = {}) {
            const { fields } = normalizeAppInputSettings(requestBody);
            const { path, document } = configRepository.read();
            document.platforms = document.platforms && typeof document.platforms === 'object' ? document.platforms : {};
            document.platforms.naver = document.platforms.naver && typeof document.platforms.naver === 'object'
                ? document.platforms.naver
                : {};
            document.platforms.naver.typing_speed = fields.TYPING_SPEED;
            configRepository.write(path, document);
            config.TYPING_SPEED = fields.TYPING_SPEED;
            config.platforms = config.platforms && typeof config.platforms === 'object' ? config.platforms : {};
            config.platforms.naver = config.platforms.naver && typeof config.platforms.naver === 'object'
                ? config.platforms.naver
                : {};
            config.platforms.naver.typing_speed = fields.TYPING_SPEED;
            return { fields, message: '네이버 입력 속도를 적용했습니다.' };
        },

        saveAppGeneralSettings(requestBody = {}) {
            const { fields } = normalizeAppGeneralSettings(requestBody);
            const { path, document } = configRepository.read();
            const previousHost = normalizeListenHost(config.LISTEN_HOST, defaultHost);
            const previousPort = normalizeListenPort(config.LISTEN_PORT, defaultPort);
            document.general = document.general && typeof document.general === 'object' ? document.general : {};
            document.general.listen_host = fields.LISTEN_HOST;
            document.general.listen_port = fields.LISTEN_PORT;
            configRepository.write(path, document);
            config.LISTEN_HOST = fields.LISTEN_HOST;
            config.LISTEN_PORT = fields.LISTEN_PORT;
            config.general = config.general && typeof config.general === 'object' ? config.general : {};
            config.general.listen_host = fields.LISTEN_HOST;
            config.general.listen_port = fields.LISTEN_PORT;
            const requiresRestart = fields.LISTEN_HOST !== previousHost || fields.LISTEN_PORT !== previousPort;
            if (requiresRestart) scheduleUiReload(fields.LISTEN_HOST, fields.LISTEN_PORT);
            return {
                fields,
                requiresRestart,
                message: requiresRestart
                    ? '접속 설정을 적용했습니다. 앱 서버를 새 주소로 다시 시작합니다.'
                    : '접속 설정이 이미 적용되어 있습니다.'
            };
        }
    };
}

module.exports = {
    createSettingsAppPreferencesApplication,
    normalizeAppGeneralSettings,
    normalizeAppInputSettings
};
