'use strict';

function createSettingsValidationError(code, message, status = 400) {
    return Object.assign(new Error(message), { code, status });
}

function extractSpreadsheetId(value) {
    const match = String(value || '').trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
    return match?.[1] || '';
}

function normalizeCoreConnectionSettings(requestBody = {}) {
    const scope = String(requestBody.scope || '').trim().toLowerCase();
    const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};

    if (!['content', 'naver', 'wordpress'].includes(scope)) {
        throw createSettingsValidationError('CORE_CONNECTION_SCOPE_INVALID', '저장할 기본 연결 항목을 확인해 주세요.');
    }
    if (scope === 'content') {
        const GOOGLE_SHEET_URL = String(values.GOOGLE_SHEET_URL || '').trim();
        const GOOGLE_SHEET_TITLE = String(values.GOOGLE_SHEET_TITLE || '').trim().slice(0, 200);
        const GOOGLE_SHEET_AUTHORIZED_FILE_ID = String(values.GOOGLE_SHEET_AUTHORIZED_FILE_ID || '').trim().slice(0, 200);
        let parsedUrl;
        try { parsedUrl = new URL(GOOGLE_SHEET_URL); }
        catch (_error) {
            throw createSettingsValidationError('GOOGLE_SHEET_URL_INVALID', '올바른 Google Spreadsheet 주소를 입력해 주세요.');
        }
        const spreadsheetId = extractSpreadsheetId(GOOGLE_SHEET_URL);
        if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'docs.google.com' || !spreadsheetId) {
            throw createSettingsValidationError('GOOGLE_SHEET_URL_INVALID', 'Google Spreadsheet의 HTTPS 주소를 입력해 주세요.');
        }
        if (GOOGLE_SHEET_AUTHORIZED_FILE_ID && GOOGLE_SHEET_AUTHORIZED_FILE_ID !== spreadsheetId) {
            throw createSettingsValidationError('GOOGLE_SHEET_AUTHORIZATION_MISMATCH', '선택한 Spreadsheet와 연결 주소가 일치하지 않습니다. 파일을 다시 선택해 주세요.');
        }
        return { scope, fields: {
            GOOGLE_SHEET_URL: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
            GOOGLE_SHEET_ID: spreadsheetId,
            GOOGLE_SHEET_TITLE,
            GOOGLE_SHEET_AUTHORIZED_FILE_ID
        } };
    }
    if (scope === 'naver') {
        const NAVER_ID = String(values.NAVER_ID || '').trim();
        if (!NAVER_ID) throw createSettingsValidationError('NAVER_ID_REQUIRED', '네이버 아이디를 입력해 주세요.');
        return { scope, fields: { NAVER_ID } };
    }

    const WORDPRESS_URL = String(values.WORDPRESS_URL || '').trim();
    const WORDPRESS_USER_ID = String(values.WORDPRESS_USER_ID || '').trim();
    const WORDPRESS_APP_PASSWORD = String(values.WORDPRESS_APP_PASSWORD || '').trim();
    if (!WORDPRESS_URL || !WORDPRESS_USER_ID) {
        throw createSettingsValidationError('WORDPRESS_CONNECTION_REQUIRED', '사이트 주소, 사용자 ID와 애플리케이션 비밀번호를 모두 입력해 주세요.');
    }
    try {
        const parsedUrl = new URL(WORDPRESS_URL);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('unsupported protocol');
    } catch (_error) {
        throw createSettingsValidationError('WORDPRESS_URL_INVALID', '올바른 워드프레스 사이트 주소를 입력해 주세요.');
    }
    return { scope, fields: { WORDPRESS_URL, WORDPRESS_USER_ID, WORDPRESS_APP_PASSWORD } };
}

function applyCoreConnectionSettings(structuredConfig = {}, normalized = {}) {
    const { scope, fields = {} } = normalized;
    if (scope === 'content') {
        structuredConfig.general = structuredConfig.general && typeof structuredConfig.general === 'object' ? structuredConfig.general : {};
        structuredConfig.general.google_sheet_url = fields.GOOGLE_SHEET_URL;
        structuredConfig.general.google_sheet_title = fields.GOOGLE_SHEET_TITLE || '';
        structuredConfig.general.google_sheet_authorized_file_id = fields.GOOGLE_SHEET_AUTHORIZED_FILE_ID || '';
    } else if (scope === 'naver') {
        structuredConfig.platforms = structuredConfig.platforms && typeof structuredConfig.platforms === 'object' ? structuredConfig.platforms : {};
        structuredConfig.platforms.naver = structuredConfig.platforms.naver && typeof structuredConfig.platforms.naver === 'object' ? structuredConfig.platforms.naver : {};
        structuredConfig.platforms.naver.user_id = fields.NAVER_ID;
    } else if (scope === 'wordpress') {
        structuredConfig.platforms = structuredConfig.platforms && typeof structuredConfig.platforms === 'object' ? structuredConfig.platforms : {};
        structuredConfig.platforms.wordpress = structuredConfig.platforms.wordpress && typeof structuredConfig.platforms.wordpress === 'object' ? structuredConfig.platforms.wordpress : {};
        structuredConfig.platforms.wordpress.url = fields.WORDPRESS_URL;
        structuredConfig.platforms.wordpress.user_id = fields.WORDPRESS_USER_ID;
        if (fields.WORDPRESS_APP_PASSWORD) structuredConfig.platforms.wordpress.app_password = fields.WORDPRESS_APP_PASSWORD;
    }
    return structuredConfig;
}

function createSettingsCoreConnectionsApplication(deps = {}) {
    const { config = {}, configRepository, buildMajorSettings } = deps;

    function getSettings() {
        const filePath = config.CONFIG_SOURCE_PATH || configRepository.resolvePath();
        const major = buildMajorSettings(null, { path: filePath, sourceType: config.CONFIG_SOURCE_TYPE });
        const source = major?.fields || {};
        return { fields: {
            GOOGLE_SHEET_URL: source.GOOGLE_SHEET_URL || '',
            GOOGLE_SHEET_TITLE: String(config.general?.google_sheet_title || ''),
            GOOGLE_SHEET_AUTHORIZED_FILE_ID: String(config.general?.google_sheet_authorized_file_id || ''),
            NAVER_ID: source.NAVER_ID || '',
            WORDPRESS_URL: source.WORDPRESS_URL || '',
            WORDPRESS_USER_ID: source.WORDPRESS_USER_ID || '',
            WORDPRESS_APP_PASSWORD_CONFIGURED: source.WORDPRESS_APP_PASSWORD_CONFIGURED === true
        } };
    }

    function saveSettings(requestBody = {}) {
        const normalized = normalizeCoreConnectionSettings(requestBody);
        const { path: writablePath, document } = configRepository.read();
        const existingWordpressPassword = String(
            document?.platforms?.wordpress?.app_password || config.WORDPRESS_APP_PASSWORD || ''
        ).trim();
        if (normalized.scope === 'wordpress' && !normalized.fields.WORDPRESS_APP_PASSWORD && !existingWordpressPassword) {
            throw createSettingsValidationError('WORDPRESS_CONNECTION_REQUIRED', '사이트 주소, 사용자 ID와 애플리케이션 비밀번호를 모두 입력해 주세요.');
        }

        applyCoreConnectionSettings(document, normalized);
        configRepository.write(writablePath, document);

        const runtimeFields = normalized.scope === 'wordpress' && !normalized.fields.WORDPRESS_APP_PASSWORD
            ? { ...normalized.fields, WORDPRESS_APP_PASSWORD: existingWordpressPassword }
            : normalized.fields;
        Object.assign(config, runtimeFields);
        if (normalized.scope === 'content') {
            config.general = config.general && typeof config.general === 'object' ? config.general : {};
            Object.assign(config.general, {
                google_sheet_url: normalized.fields.GOOGLE_SHEET_URL,
                google_sheet_title: normalized.fields.GOOGLE_SHEET_TITLE || '',
                google_sheet_authorized_file_id: normalized.fields.GOOGLE_SHEET_AUTHORIZED_FILE_ID || ''
            });
        } else if (normalized.scope === 'naver') {
            config.platforms = config.platforms && typeof config.platforms === 'object' ? config.platforms : {};
            config.platforms.naver = config.platforms.naver && typeof config.platforms.naver === 'object' ? config.platforms.naver : {};
            config.platforms.naver.user_id = normalized.fields.NAVER_ID;
        } else if (normalized.scope === 'wordpress') {
            config.platforms = config.platforms && typeof config.platforms === 'object' ? config.platforms : {};
            config.platforms.wordpress = config.platforms.wordpress && typeof config.platforms.wordpress === 'object' ? config.platforms.wordpress : {};
            config.platforms.wordpress.url = normalized.fields.WORDPRESS_URL;
            config.platforms.wordpress.user_id = normalized.fields.WORDPRESS_USER_ID;
            if (normalized.fields.WORDPRESS_APP_PASSWORD) config.platforms.wordpress.app_password = normalized.fields.WORDPRESS_APP_PASSWORD;
        }
        config.CONFIG_READY = true;
        config.CONFIG_SOURCE_TYPE = 'json';
        config.CONFIG_SOURCE_PATH = writablePath;
        config.CONFIG_ERROR_MESSAGE = '';
        const fields = buildMajorSettings(null, { path: writablePath, sourceType: 'json' })?.fields || {};
        const safeFields = { ...fields };
        const appPassword = String(safeFields.WORDPRESS_APP_PASSWORD || '').trim();
        delete safeFields.WORDPRESS_APP_PASSWORD;
        safeFields.WORDPRESS_APP_PASSWORD_CONFIGURED = Boolean(appPassword);
        return { scope: normalized.scope, message: '기본 연결 설정을 저장했습니다.', fields: safeFields };
    }

    return { getSettings, saveSettings };
}

module.exports = {
    createSettingsCoreConnectionsApplication,
    normalizeCoreConnectionSettings,
    applyCoreConnectionSettings
};
