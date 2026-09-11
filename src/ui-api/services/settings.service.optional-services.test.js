const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    createSettingsService,
    normalizeOptionalServiceSettings,
    normalizeExternalConnectionSettings,
    normalizeAppGeneralSettings
} = require('./settings.service');

function createHarness(initial = {}, overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-optional-services-'));
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(initial, null, 2));
    const CONFIG = {
        BUFFER_API_KEY: initial.integrations?.buffer?.api_key || '',
        BUFFER_ORGANIZATION_ID: initial.integrations?.buffer?.organization_id || '',
        BUFFER_CHANNELS: initial.integrations?.buffer?.channels || [],
        SNS_PUBLISH_ENABLED: initial.automation?.publish?.social?.enabled === true,
        SNS_SOURCE_BLOGS: initial.automation?.publish?.social?.source_blogs || [],
        NOTIFY_TELEGRAM_ENABLED: initial.notification?.telegram?.enabled === true,
        NOTIFY_TELEGRAM_INBOUND_ENABLED: initial.notification?.telegram?.enabled === true,
        NOTIFY_TELEGRAM_BOT_TOKEN: initial.notification?.telegram?.bot_token || '',
        NOTIFY_TELEGRAM_CHAT_ID: initial.notification?.telegram?.chat_id || '',
        NOTIFY_BITLY_TOKEN: initial.notification?.telegram?.bitly_token || '',
        NOTIFY_SLACK_ENABLED: initial.notification?.slack?.enabled === true,
        NOTIFY_SLACK_WEBHOOK_URL: initial.notification?.slack?.webhook_url || '',
        MCP_REMOTE_ENABLED: initial.mcp?.remote?.enabled === true,
        MCP_REMOTE_HOST: initial.mcp?.remote?.host || '127.0.0.1',
        MCP_REMOTE_PORT: initial.mcp?.remote?.port || 4578,
        MCP_REMOTE_PATH: initial.mcp?.remote?.path || '/mcp',
        MCP_REMOTE_AUTH_TOKEN: initial.mcp?.remote?.auth?.bearer_token || ''
    };
    const service = createSettingsService({
        fs, path, CONFIG,
        resolveWritableConfigPath: () => configPath,
        dashboardActivityRecorder: () => {},
        ...overrides
    });
    return { CONFIG, configPath, service };
}

test('optional service normalization is scoped and connection cards do not own runtime activation', () => {
    const normalized = normalizeOptionalServiceSettings({ scope: 'buffer', values: {
        BUFFER_API_KEY: 'key', BUFFER_CHANNELS: [1, 2, 3, 4].map((id) => ({ id: String(id), name: `channel-${id}` }))
    } });
    assert.deepEqual(normalized.fields, { BUFFER_API_KEY: 'key', BUFFER_ORGANIZATION_ID: '' });
    assert.deepEqual(normalizeOptionalServiceSettings({ scope: 'sns-distribution', values: {
        SNS_PUBLISH_ENABLED: true,
        SNS_SOURCE_BLOGS: ['naver', 'wordpress', 'other'],
        BUFFER_ORGANIZATION_ID: 'org-1',
        BUFFER_CHANNELS: [{ id: 'channel-1', name: 'Threads', service: 'threads' }]
    } }).fields, {
        SNS_PUBLISH_ENABLED: true,
        SNS_SOURCE_BLOGS: ['naver', 'wordpress'],
        BUFFER_ORGANIZATION_ID: 'org-1',
        BUFFER_CHANNELS: [{ id: 'channel-1', name: 'Threads', displayName: 'Threads', service: 'threads' }]
    });
    assert.deepEqual(normalizeOptionalServiceSettings({ scope: 'telegram', values: {
        NOTIFY_TELEGRAM_ENABLED: false, NOTIFY_TELEGRAM_BOT_TOKEN: 'token', NOTIFY_TELEGRAM_CHAT_ID: 'chat'
    } }).fields, { NOTIFY_TELEGRAM_BOT_TOKEN: 'token', NOTIFY_TELEGRAM_CHAT_ID: 'chat', NOTIFY_TELEGRAM_DELIVERY_ENABLED: null });
    assert.deepEqual(normalizeOptionalServiceSettings({ scope: 'slack', values: {
        NOTIFY_SLACK_ENABLED: false, NOTIFY_SLACK_WEBHOOK_URL: 'webhook'
    } }).fields, { NOTIFY_SLACK_WEBHOOK_URL: 'webhook', NOTIFY_SLACK_DELIVERY_ENABLED: null });
    assert.throws(() => normalizeOptionalServiceSettings({ scope: 'email' }), (error) => error.apiCode === 'OPTIONAL_SERVICE_SCOPE_INVALID');
});

test('optional service reads expose registration state without returning secrets', async () => {
    const { service } = createHarness({
        integrations: { buffer: { api_key: 'buffer-secret', organization_id: 'org-1' } },
        notification: {
            telegram: { enabled: true, bot_token: 'telegram-secret', chat_id: 'chat-1', bitly_token: 'bitly-secret' },
            slack: { enabled: true, webhook_url: 'slack-secret' }
        }
    });
    const result = await service.getOptionalServiceSettings();
    assert.equal(result.fields.BUFFER_API_KEY_CONFIGURED, true);
    assert.equal(result.fields.NOTIFY_TELEGRAM_BOT_TOKEN_CONFIGURED, true);
    assert.equal(result.fields.NOTIFY_SLACK_WEBHOOK_URL_CONFIGURED, true);
    assert.equal(result.fields.NOTIFY_BITLY_TOKEN_CONFIGURED, true);
    assert.doesNotMatch(JSON.stringify(result), /buffer-secret|telegram-secret|slack-secret|bitly-secret/);
});

test('optional service delivery selection is separate from credential connection and inbound activation', async () => {
    const initial = {
        notification: {
            telegram: { enabled: true, bot_token: 'telegram-secret', chat_id: 'chat-1' },
            slack: { enabled: false, webhook_url: 'slack-secret' }
        }
    };
    const { CONFIG, configPath, service } = createHarness(initial);
    await service.saveOptionalServiceSettings({ scope: 'telegram', values: {
        NOTIFY_TELEGRAM_DELIVERY_ENABLED: false,
        NOTIFY_TELEGRAM_BOT_TOKEN: '',
        NOTIFY_TELEGRAM_CHAT_ID: 'chat-1'
    } });
    await service.saveOptionalServiceSettings({ scope: 'slack', values: {
        NOTIFY_SLACK_DELIVERY_ENABLED: true,
        NOTIFY_SLACK_WEBHOOK_URL: ''
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.notification.telegram.enabled, true);
    assert.equal(saved.notification.telegram.delivery_enabled, false);
    assert.equal(saved.notification.slack.delivery_enabled, true);
    assert.equal(CONFIG.NOTIFY_TELEGRAM_ENABLED, false);
    assert.equal(CONFIG.NOTIFY_SLACK_ENABLED, true);
});

test('scoped optional saves preserve blank secrets and unrelated settings', async () => {
    const initial = {
        integrations: { buffer: { api_key: 'keep-buffer', organization_id: 'old-org', help_url: 'https://help.example' } },
        notification: {
            telegram: { enabled: true, bot_token: 'keep-telegram', chat_id: 'old-chat', bitly_token: 'keep-bitly' },
            slack: { enabled: false, webhook_url: 'keep-slack' }
        },
        platforms: { naver: { user_id: 'keep-user' } }
    };
    const { configPath, service } = createHarness(initial);
    await service.saveOptionalServiceSettings({ scope: 'telegram', values: {
        NOTIFY_TELEGRAM_BOT_TOKEN: '', NOTIFY_TELEGRAM_CHAT_ID: 'new-chat'
    } });
    await service.saveOptionalServiceSettings({ scope: 'bitly', values: { NOTIFY_BITLY_TOKEN: '' } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.notification.telegram.bot_token, 'keep-telegram');
    assert.equal(saved.notification.telegram.bitly_token, 'keep-bitly');
    assert.equal(saved.notification.telegram.chat_id, 'new-chat');
    assert.equal(saved.notification.telegram.enabled, true);
    assert.deepEqual(saved.notification.slack, initial.notification.slack);
    assert.deepEqual(saved.platforms, initial.platforms);
    await service.saveOptionalServiceSettings({ scope: 'buffer', values: { BUFFER_API_KEY: '' } });
    const afterBufferSave = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(afterBufferSave.integrations.buffer.organization_id, 'old-org');
});

test('Telegram connection updates preserve inbound activation and only reapply an already active runtime', async () => {
    const calls = [];
    const initial = {
        notification: { telegram: { enabled: true, bot_token: 'old-token', chat_id: 'old-chat' } }
    };
    const { CONFIG, configPath, service } = createHarness(initial, {
        TelegramBotService: {
            async stop() { calls.push('stop'); },
            init() { calls.push('init'); }
        }
    });
    await service.saveOptionalServiceSettings({ scope: 'telegram', values: {
        NOTIFY_TELEGRAM_BOT_TOKEN: 'new-token', NOTIFY_TELEGRAM_CHAT_ID: 'new-chat'
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.notification.telegram.enabled, true);
    assert.equal(CONFIG.NOTIFY_TELEGRAM_ENABLED, true);
    assert.deepEqual(calls, ['stop', 'init']);
});

test('optional connection tests reuse stored secrets when the new input is blank', async () => {
    const calls = [];
    class BufferClient {
        async inspectConnection(apiKey, organizationId) {
            calls.push({ apiKey, organizationId });
            return { organizations: [], channels: [] };
        }
    }
    const { service } = createHarness({ integrations: { buffer: { api_key: 'stored-key', organization_id: 'stored-org' } } }, { BufferClient });
    await service.testOptionalServiceConnection({ scope: 'buffer', values: { BUFFER_API_KEY: '' } });
    assert.deepEqual(calls, [{ apiKey: 'stored-key', organizationId: 'stored-org' }]);
});

test('SNS distribution saves RSS source and Buffer delivery policy without broad major settings', async () => {
    const initial = {
        integrations: { buffer: { api_key: 'buffer-secret', organization_id: 'old-org', channels: [{ id: 'old-channel' }] } },
        automation: { publish: { social: { enabled: false, interval_min: 10, ai_mode: 'none', source_blogs: ['naver'] } } },
        platforms: { naver: { user_id: 'keep-user' } }
    };
    const calls = [];
    const { CONFIG, configPath, service } = createHarness(initial, { syncAutoRunnerWithConfig: () => calls.push('sync') });
    const result = await service.saveOptionalServiceSettings({ scope: 'sns-distribution', values: {
        SNS_PUBLISH_ENABLED: true,
        SNS_SOURCE_BLOGS: ['wordpress'],
        BUFFER_ORGANIZATION_ID: 'org-2',
        BUFFER_CHANNELS: [{ id: 'channel-2', displayName: '@bloggenius', service: 'threads' }]
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.integrations.buffer.organization_id, 'org-2');
    assert.deepEqual(saved.integrations.buffer.channels, [{ id: 'channel-2', name: '@bloggenius', displayName: '@bloggenius', service: 'threads' }]);
    assert.equal(saved.automation.publish.social.enabled, true);
    assert.deepEqual(saved.automation.publish.social.source_blogs, ['wordpress']);
    assert.equal(saved.automation.publish.social.interval_min, 10);
    assert.equal(CONFIG.SNS_PUBLISH_ENABLED, true);
    assert.deepEqual(CONFIG.SNS_SOURCE_BLOGS, ['wordpress']);
    assert.deepEqual(calls, ['sync']);
    assert.equal(result.fields.SNS_PUBLISH_ENABLED, true);
    assert.doesNotMatch(JSON.stringify(result), /buffer-secret/);
});

test('SNS distribution saves manual composer channels even when RSS auto sharing is disabled', async () => {
    const initial = {
        integrations: { buffer: { api_key: 'buffer-secret', organization_id: 'old-org', channels: [] } },
        automation: { publish: { social: { enabled: false, source_blogs: [] } } }
    };
    const { CONFIG, configPath, service } = createHarness(initial);
    await service.saveOptionalServiceSettings({ scope: 'sns-distribution', values: {
        SNS_PUBLISH_ENABLED: false,
        SNS_SOURCE_BLOGS: [],
        BUFFER_ORGANIZATION_ID: 'org-2',
        BUFFER_CHANNELS: [{ id: 'channel-2', displayName: '@bloggenius', service: 'threads' }]
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.automation.publish.social.enabled, false);
    assert.deepEqual(saved.integrations.buffer.channels, [{ id: 'channel-2', name: '@bloggenius', displayName: '@bloggenius', service: 'threads' }]);
    assert.deepEqual(CONFIG.BUFFER_CHANNELS, [{ id: 'channel-2', name: '@bloggenius', displayName: '@bloggenius', service: 'threads' }]);
});

test('external connection settings separate inbound Telegram activation from delivery and never read back MCP tokens', async () => {
    const calls = [];
    const initial = {
        notification: {
            telegram: {
                bot_token: 'telegram-secret',
                chat_id: 'chat-1',
                delivery_enabled: false
            }
        },
        mcp: {
            remote: {
                enabled: false,
                host: '127.0.0.1',
                port: 4578,
                path: '/mcp',
                auth: { bearer_token: 'mcp-secret' }
            }
        }
    };
    const { CONFIG, configPath, service } = createHarness(initial, {
        TelegramBotService: {
            async stop() { calls.push('telegram-stop'); },
            init() { calls.push('telegram-init'); },
            getStatus() { return { running: true }; }
        },
        restartRemoteMcpService: async (settings) => calls.push({ mcp: settings }),
        getRemoteServiceStatus: () => ({ running: true })
    });

    const before = await service.getExternalConnectionSettings();
    assert.equal(before.fields.TELEGRAM_INBOUND_CONFIGURED, true);
    assert.equal(before.fields.TELEGRAM_INBOUND_RUNNING, true);
    assert.equal(before.fields.MCP_REMOTE_AUTH_TOKEN_CONFIGURED, true);
    assert.doesNotMatch(JSON.stringify(before), /telegram-secret|mcp-secret/);
    assert.deepEqual(normalizeExternalConnectionSettings({ scope: 'telegram', values: { TELEGRAM_INBOUND_ENABLED: true } }).fields, {
        TELEGRAM_INBOUND_ENABLED: true
    });

    await service.saveExternalConnectionSettings({ scope: 'telegram', values: { TELEGRAM_INBOUND_ENABLED: true } });
    await service.saveExternalConnectionSettings({ scope: 'mcp', values: {
        MCP_REMOTE_ENABLED: true,
        MCP_REMOTE_HOST: '0.0.0.0',
        MCP_REMOTE_PORT: '4580',
        MCP_REMOTE_PATH: '/remote',
        MCP_REMOTE_AUTH_TOKEN: ''
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.notification.telegram.inbound_enabled, true);
    assert.equal(saved.notification.telegram.delivery_enabled, false);
    assert.equal(saved.mcp.remote.enabled, true);
    assert.equal(saved.mcp.remote.auth.bearer_token, 'mcp-secret');
    assert.equal(CONFIG.MCP_REMOTE_PORT, 4580);
    assert.deepEqual(calls.slice(0, 2), ['telegram-stop', 'telegram-init']);
    assert.equal(calls[2].mcp.path, '/remote');
});

test('external MCP activation requires a token when no stored token exists', async () => {
    const { service } = createHarness({ mcp: { remote: { auth: {} } } });
    await assert.rejects(
        () => service.saveExternalConnectionSettings({ scope: 'mcp', values: {
            MCP_REMOTE_ENABLED: true,
            MCP_REMOTE_HOST: '127.0.0.1',
            MCP_REMOTE_PORT: '4578',
            MCP_REMOTE_PATH: '/mcp',
            MCP_REMOTE_AUTH_TOKEN: ''
        } }),
        (error) => error.apiCode === 'MCP_TOKEN_REQUIRED'
    );
});

test('app general settings validate the UI server address and schedule a restart only after a real change', async () => {
    const restarts = [];
    const { CONFIG, configPath, service } = createHarness({ general: { listen_host: '127.0.0.1', listen_port: 4577 } }, {
        DEFAULT_HOST: '127.0.0.1',
        DEFAULT_PORT: 4577,
        normalizeListenHost: (value, fallback) => ['127.0.0.1', '0.0.0.0'].includes(value) ? value : fallback,
        normalizeListenPort: (value, fallback) => Number(value) || fallback,
        scheduleUiReload: (host, port) => restarts.push({ host, port })
    });
    const normalized = normalizeAppGeneralSettings({ values: { LISTEN_HOST: '0.0.0.0', LISTEN_PORT: '4588' } });
    assert.deepEqual(normalized.fields, { LISTEN_HOST: '0.0.0.0', LISTEN_PORT: 4588 });
    await service.saveAppGeneralSettings({ values: { LISTEN_HOST: '0.0.0.0', LISTEN_PORT: '4588' } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(saved.general, { listen_host: '0.0.0.0', listen_port: 4588 });
    assert.deepEqual(restarts, [{ host: '0.0.0.0', port: 4588 }]);
    assert.equal(CONFIG.LISTEN_PORT, 4588);
    assert.throws(() => normalizeAppGeneralSettings({ values: { LISTEN_HOST: 'example.com', LISTEN_PORT: '80' } }), (error) => error.apiCode === 'LISTEN_HOST_INVALID');
});
