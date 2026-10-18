'use strict';

function createExternalConnectionError(code, message) {
    return Object.assign(new Error(message), { code });
}

function normalizeExternalConnectionSettings(requestBody = {}) {
    const scope = String(requestBody.scope || '').trim();
    const values = requestBody.values || {};
    if (scope === 'telegram') {
        return { scope, fields: { TELEGRAM_INBOUND_ENABLED: values.TELEGRAM_INBOUND_ENABLED === true } };
    }
    if (scope === 'mcp') {
        return { scope, fields: {
            MCP_REMOTE_ENABLED: values.MCP_REMOTE_ENABLED === true,
            MCP_REMOTE_HOST: String(values.MCP_REMOTE_HOST || '').trim(),
            MCP_REMOTE_PORT: String(values.MCP_REMOTE_PORT || '').trim(),
            MCP_REMOTE_PATH: String(values.MCP_REMOTE_PATH || '').trim(),
            MCP_REMOTE_AUTH_TOKEN: String(values.MCP_REMOTE_AUTH_TOKEN || '').trim()
        } };
    }
    throw createExternalConnectionError('EXTERNAL_CONNECTION_SCOPE_INVALID', '외부 연결 항목을 확인해 주세요.');
}

function createSettingsExternalConnectionsApplication(deps = {}) {
    const {
        config = {}, configRepository, getTelegramStatus, getRemoteServiceStatus,
        ensureRuntimeRemoteMcpConfig, restartRemoteMcpService, telegramBotService
    } = deps;

    function getSettings() {
        const mcpStatus = typeof getRemoteServiceStatus === 'function' ? getRemoteServiceStatus() : {};
        const telegramStatus = typeof getTelegramStatus === 'function' ? getTelegramStatus() : {};
        return { fields: {
            TELEGRAM_INBOUND_CONFIGURED: Boolean(String(config.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim() && String(config.NOTIFY_TELEGRAM_CHAT_ID || '').trim()),
            TELEGRAM_INBOUND_ENABLED: config.NOTIFY_TELEGRAM_INBOUND_ENABLED === true,
            TELEGRAM_INBOUND_RUNNING: telegramStatus.running === true,
            TELEGRAM_INBOUND_LAST_ERROR_CATEGORY: String(telegramStatus.lastErrorCategory || ''),
            TELEGRAM_INBOUND_LAST_ERROR_MESSAGE: String(telegramStatus.lastErrorMessage || ''),
            TELEGRAM_INBOUND_LAST_ERROR_AT: String(telegramStatus.lastErrorAt || ''),
            MCP_REMOTE_ENABLED: config.MCP_REMOTE_ENABLED === true,
            MCP_REMOTE_RUNNING: mcpStatus.running === true,
            MCP_REMOTE_HOST: config.MCP_REMOTE_HOST || '127.0.0.1',
            MCP_REMOTE_PORT: config.MCP_REMOTE_PORT || 4578,
            MCP_REMOTE_PATH: config.MCP_REMOTE_PATH || '/mcp',
            MCP_REMOTE_AUTH_TOKEN_CONFIGURED: Boolean(String(config.MCP_REMOTE_AUTH_TOKEN || '').trim())
        } };
    }

    async function save(requestBody = {}) {
        const normalized = normalizeExternalConnectionSettings(requestBody);
        const { path, document } = configRepository.read();
        document.notification = document.notification && typeof document.notification === 'object' ? document.notification : {};
        document.notification.telegram = document.notification.telegram && typeof document.notification.telegram === 'object'
            ? document.notification.telegram : {};
        document.mcp = document.mcp && typeof document.mcp === 'object' ? document.mcp : {};
        document.mcp.remote = document.mcp.remote && typeof document.mcp.remote === 'object' ? document.mcp.remote : {};
        document.mcp.remote.auth = document.mcp.remote.auth && typeof document.mcp.remote.auth === 'object'
            ? document.mcp.remote.auth : {};

        if (normalized.scope === 'telegram') {
            if (normalized.fields.TELEGRAM_INBOUND_ENABLED && !(config.NOTIFY_TELEGRAM_BOT_TOKEN && config.NOTIFY_TELEGRAM_CHAT_ID)) {
                throw createExternalConnectionError('TELEGRAM_CONNECTION_REQUIRED', '부가 서비스에서 Telegram 연결을 먼저 완료해 주세요.');
            }
            document.notification.telegram.inbound_enabled = normalized.fields.TELEGRAM_INBOUND_ENABLED;
            config.NOTIFY_TELEGRAM_INBOUND_ENABLED = normalized.fields.TELEGRAM_INBOUND_ENABLED;
            if (telegramBotService) {
                await telegramBotService.stop?.();
                if (config.NOTIFY_TELEGRAM_INBOUND_ENABLED) telegramBotService.init?.();
            }
        } else {
            const currentToken = document.mcp.remote.auth.bearer_token || config.MCP_REMOTE_AUTH_TOKEN || '';
            const token = normalized.fields.MCP_REMOTE_AUTH_TOKEN || currentToken;
            if (normalized.fields.MCP_REMOTE_ENABLED && !token) {
                throw createExternalConnectionError('MCP_TOKEN_REQUIRED', '원격 MCP를 사용하려면 Bearer Token을 입력해 주세요.');
            }
            const resolved = ensureRuntimeRemoteMcpConfig(config, {
                enabled: normalized.fields.MCP_REMOTE_ENABLED,
                host: normalized.fields.MCP_REMOTE_HOST,
                port: normalized.fields.MCP_REMOTE_PORT,
                path: normalized.fields.MCP_REMOTE_PATH,
                authToken: token
            });
            document.mcp.remote = {
                ...document.mcp.remote,
                enabled: resolved.enabled,
                host: resolved.host,
                port: resolved.port,
                path: resolved.path,
                auth: { ...document.mcp.remote.auth, bearer_token: resolved.authToken }
            };
            await restartRemoteMcpService?.(resolved);
        }

        configRepository.write(path, document);
        return getSettings();
    }

    return { getSettings, save };
}

module.exports = { createSettingsExternalConnectionsApplication, normalizeExternalConnectionSettings };
