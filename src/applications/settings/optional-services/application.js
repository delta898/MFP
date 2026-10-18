'use strict';

function createSettingsOptionalServiceError(code, message, status = 400) {
    return Object.assign(new Error(message), { code, status });
}

function normalizeOptionalServiceSettings(requestBody = {}) {
    const scope = String(requestBody.scope || '').trim().toLowerCase();
    const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};
    if (!['buffer', 'telegram', 'slack', 'bitly'].includes(scope)) {
        throw createSettingsOptionalServiceError('OPTIONAL_SERVICE_SCOPE_INVALID', '설정할 부가 서비스를 확인해 주세요.');
    }
    if (scope === 'buffer') return { scope, fields: {
        BUFFER_API_KEY: String(values.BUFFER_API_KEY || '').trim(),
        BUFFER_ORGANIZATION_ID: String(values.BUFFER_ORGANIZATION_ID || '').trim()
    } };
    if (scope === 'telegram') return { scope, fields: {
        NOTIFY_TELEGRAM_BOT_TOKEN: String(values.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim(),
        NOTIFY_TELEGRAM_CHAT_ID: String(values.NOTIFY_TELEGRAM_CHAT_ID || '').trim(),
        NOTIFY_TELEGRAM_DELIVERY_ENABLED: typeof values.NOTIFY_TELEGRAM_DELIVERY_ENABLED === 'boolean'
            ? values.NOTIFY_TELEGRAM_DELIVERY_ENABLED : null
    } };
    if (scope === 'slack') return { scope, fields: {
        NOTIFY_SLACK_WEBHOOK_URL: String(values.NOTIFY_SLACK_WEBHOOK_URL || '').trim(),
        NOTIFY_SLACK_DELIVERY_ENABLED: typeof values.NOTIFY_SLACK_DELIVERY_ENABLED === 'boolean'
            ? values.NOTIFY_SLACK_DELIVERY_ENABLED : null
    } };
    return { scope, fields: { NOTIFY_BITLY_TOKEN: String(values.NOTIFY_BITLY_TOKEN || '').trim() } };
}

function createSettingsOptionalServicesApplication(deps = {}) {
    const { config = {}, configRepository, getBufferConnectionVerification, reapplyTelegramRuntime } = deps;

    function getSettings() {
        const bufferApiKey = String(config.BUFFER_API_KEY || '').trim();
        const bufferOrganizationId = String(config.BUFFER_ORGANIZATION_ID || '').trim();
        return { fields: {
            BUFFER_API_KEY_CONFIGURED: Boolean(bufferApiKey),
            BUFFER_CONNECTION_VERIFICATION: getBufferConnectionVerification?.(bufferApiKey, bufferOrganizationId) || null,
            NOTIFY_TELEGRAM_BOT_TOKEN_CONFIGURED: Boolean(String(config.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim()),
            NOTIFY_TELEGRAM_CHAT_PAIRED: Boolean(String(config.NOTIFY_TELEGRAM_CHAT_ID || '').trim()),
            NOTIFY_TELEGRAM_DELIVERY_ENABLED: config.NOTIFY_TELEGRAM_ENABLED === true,
            NOTIFY_SLACK_WEBHOOK_URL_CONFIGURED: Boolean(String(config.NOTIFY_SLACK_WEBHOOK_URL || '').trim()),
            NOTIFY_SLACK_DELIVERY_ENABLED: config.NOTIFY_SLACK_ENABLED === true,
            NOTIFY_BITLY_TOKEN_CONFIGURED: Boolean(String(config.NOTIFY_BITLY_TOKEN || '').trim())
        } };
    }

    async function save(requestBody = {}) {
        const { scope, fields } = normalizeOptionalServiceSettings(requestBody);
        const { path, document } = configRepository.read();
        document.integrations = document.integrations && typeof document.integrations === 'object' ? document.integrations : {};
        document.notification = document.notification && typeof document.notification === 'object' ? document.notification : {};

        if (scope === 'buffer') {
            const current = document.integrations.buffer || {};
            const apiKey = fields.BUFFER_API_KEY || current.api_key || config.BUFFER_API_KEY || '';
            if (!apiKey) throw createSettingsOptionalServiceError('BUFFER_API_KEY_REQUIRED', 'Buffer API Key를 입력해 주세요.');
            document.integrations.buffer = { ...current, api_key: apiKey };
            config.BUFFER_API_KEY = apiKey;
        }

        let telegramRuntimeChanged = false;
        if (scope === 'telegram') {
            const current = document.notification.telegram || {};
            const botToken = fields.NOTIFY_TELEGRAM_BOT_TOKEN || current.bot_token || config.NOTIFY_TELEGRAM_BOT_TOKEN || '';
            const chatId = fields.NOTIFY_TELEGRAM_CHAT_ID || current.chat_id || config.NOTIFY_TELEGRAM_CHAT_ID || '';
            if (!botToken || !chatId) throw createSettingsOptionalServiceError('TELEGRAM_CONNECTION_REQUIRED', 'Bot Token 확인과 Telegram 연결을 먼저 완료해 주세요.');
            const deliveryEnabled = fields.NOTIFY_TELEGRAM_DELIVERY_ENABLED === null
                ? (current.delivery_enabled ?? current.enabled ?? (config.NOTIFY_TELEGRAM_ENABLED === true))
                : fields.NOTIFY_TELEGRAM_DELIVERY_ENABLED;
            telegramRuntimeChanged = String(current.bot_token || '') !== String(botToken)
                || String(current.chat_id || '') !== String(chatId);
            document.notification.telegram = {
                ...current,
                enabled: current.enabled === true || (current.enabled === undefined && config.NOTIFY_TELEGRAM_ENABLED === true),
                delivery_enabled: deliveryEnabled,
                bot_token: botToken,
                chat_id: chatId
            };
            Object.assign(config, {
                NOTIFY_TELEGRAM_BOT_TOKEN: botToken,
                NOTIFY_TELEGRAM_CHAT_ID: chatId,
                NOTIFY_TELEGRAM_ENABLED: deliveryEnabled
            });
        }

        if (scope === 'slack') {
            const current = document.notification.slack || {};
            const webhookUrl = fields.NOTIFY_SLACK_WEBHOOK_URL || current.webhook_url || config.NOTIFY_SLACK_WEBHOOK_URL || '';
            if (!webhookUrl) throw createSettingsOptionalServiceError('SLACK_WEBHOOK_REQUIRED', 'Slack Webhook URL을 입력해 주세요.');
            const deliveryEnabled = fields.NOTIFY_SLACK_DELIVERY_ENABLED === null
                ? (current.delivery_enabled ?? current.enabled ?? (config.NOTIFY_SLACK_ENABLED === true))
                : fields.NOTIFY_SLACK_DELIVERY_ENABLED;
            document.notification.slack = {
                ...current,
                enabled: current.enabled === true || (current.enabled === undefined && config.NOTIFY_SLACK_ENABLED === true),
                delivery_enabled: deliveryEnabled,
                webhook_url: webhookUrl
            };
            config.NOTIFY_SLACK_WEBHOOK_URL = webhookUrl;
            config.NOTIFY_SLACK_ENABLED = deliveryEnabled;
        }

        if (scope === 'bitly') {
            const current = document.notification.telegram || {};
            const token = fields.NOTIFY_BITLY_TOKEN || current.bitly_token || config.NOTIFY_BITLY_TOKEN || '';
            if (!token) throw createSettingsOptionalServiceError('BITLY_TOKEN_REQUIRED', 'Bitly Access Token을 입력해 주세요.');
            document.notification.telegram = { ...current, bitly_token: token };
            config.NOTIFY_BITLY_TOKEN = token;
        }

        configRepository.write(path, document);
        Object.assign(config, { CONFIG_READY: true, CONFIG_SOURCE_TYPE: 'json', CONFIG_SOURCE_PATH: path });
        if (telegramRuntimeChanged) await reapplyTelegramRuntime?.();
        return { scope, ...getSettings() };
    }

    return { getSettings, save };
}

module.exports = { createSettingsOptionalServicesApplication, normalizeOptionalServiceSettings };
