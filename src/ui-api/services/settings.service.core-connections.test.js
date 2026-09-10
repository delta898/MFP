const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    createSettingsService,
    normalizeCoreConnectionSettings,
    normalizeAiRoleSettings,
    normalizeAppInputSettings,
    redactAiRoleSecretFields,
    redactAiProviderProfiles
} = require('./settings.service');

function createHarness(initialConfig = {}) {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-core-connections-'));
    const configPath = path.join(configDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));
    const CONFIG = {
        GOOGLE_SHEET_URL: initialConfig.general?.google_sheet_url || '',
        NAVER_ID: initialConfig.platforms?.naver?.user_id || '',
        WORDPRESS_URL: initialConfig.platforms?.wordpress?.url || '',
        WORDPRESS_USER_ID: initialConfig.platforms?.wordpress?.user_id || '',
        WORDPRESS_APP_PASSWORD: initialConfig.platforms?.wordpress?.app_password || '',
        ...initialConfig
    };
    const activities = [];
    const service = createSettingsService({
        fs,
        path,
        CONFIG,
        resolveWritableConfigPath: () => configPath,
        buildMajorSettings: () => ({
            fields: {
                GOOGLE_SHEET_URL: CONFIG.GOOGLE_SHEET_URL,
                NAVER_ID: CONFIG.NAVER_ID,
                WORDPRESS_URL: CONFIG.WORDPRESS_URL,
                WORDPRESS_USER_ID: CONFIG.WORDPRESS_USER_ID,
                WORDPRESS_APP_PASSWORD: CONFIG.WORDPRESS_APP_PASSWORD
            }
        }),
        dashboardActivityRecorder: (activity) => activities.push(activity)
    });
    return { CONFIG, activities, configPath, service };
}

test('core connection normalization validates each independently saved scope', () => {
    assert.deepEqual(
        normalizeCoreConnectionSettings({
            scope: 'content',
            values: { GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/sheet-id_1234567890/edit' }
        }),
        {
            scope: 'content',
            fields: {
                GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/sheet-id_1234567890/edit',
                GOOGLE_SHEET_ID: 'sheet-id_1234567890'
            }
        }
    );
    assert.throws(
        () => normalizeCoreConnectionSettings({ scope: 'content', values: { GOOGLE_SHEET_URL: 'https://example.com/sheet' } }),
        (error) => error.apiCode === 'GOOGLE_SHEET_URL_INVALID'
    );
    assert.throws(
        () => normalizeCoreConnectionSettings({ scope: 'wordpress', values: { WORDPRESS_URL: 'ftp://example.com' } }),
        (error) => error.apiCode === 'WORDPRESS_CONNECTION_REQUIRED'
    );
});

test('AI role normalization accepts only the three role scopes', () => {
    assert.deepEqual(
        normalizeAiRoleSettings({ scope: 'chat', values: { CHAT_MODEL_SOURCE: 'writing', provider: 'google' } }),
        {
            scope: 'chat',
            source: 'writing',
            fields: {
                CHAT_MODEL_PROVIDER: 'google', CHAT_MODEL_PRESET_CODE: '', CHAT_MODEL_NAME: '',
                CHAT_MODEL_BASE_URL: '', CHAT_MODEL_API_KEY: '', CHAT_MODEL_SOURCE: 'writing'
            }
        }
    );
    assert.throws(
        () => normalizeAiRoleSettings({ scope: 'provider', values: {} }),
        (error) => error.apiCode === 'AI_ROLE_SCOPE_INVALID'
    );
});

test('AI role reads expose API Key registration only, never the stored secret', () => {
    const result = redactAiRoleSecretFields({ fields: {
        TEXT_MODEL_API_KEY: 'text-secret', IMAGE_MODEL_API_KEY: '', CHAT_MODEL_API_KEY: 'chat-secret'
    } });
    assert.equal(result.fields.TEXT_MODEL_API_KEY_CONFIGURED, true);
    assert.equal(result.fields.IMAGE_MODEL_API_KEY_CONFIGURED, false);
    assert.equal(result.fields.CHAT_MODEL_API_KEY_CONFIGURED, true);
    assert.equal(Object.hasOwn(result.fields, 'TEXT_MODEL_API_KEY'), false);
    assert.equal(Object.hasOwn(result.fields, 'CHAT_MODEL_API_KEY'), false);
});

test('AI role provider profiles expose their configuration state without API Key values', () => {
    const profiles = redactAiProviderProfiles({
        text: {
            openai: { provider: 'openai', code: 'gpt-5.6-sol', api_key: 'openai-secret' }
        }
    });
    assert.equal(profiles.text.openai.api_key_configured, true);
    assert.equal(Object.hasOwn(profiles.text.openai, 'api_key'), false);
    assert.equal(JSON.stringify(profiles).includes('openai-secret'), false);
});

test('AI role scope preserves unrelated configuration while updating the selected model', async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-ai-role-'));
    const configPath = path.join(configDir, 'config.json');
    const initial = {
        ai_settings: { TEXT_MODEL: { provider: 'direct', name: 'old', base_url: 'https://old.example/v1', api_key: 'old-key' } },
        platforms: { naver: { user_id: 'keep-naver' } }
    };
    fs.writeFileSync(configPath, JSON.stringify(initial, null, 2));
    const CONFIG = {};
    const service = createSettingsService({
        fs, path, CONFIG, resolveWritableConfigPath: () => configPath,
        buildMajorSettings: () => ({ fields: {
            TEXT_MODEL_PROVIDER: 'direct', TEXT_MODEL_NAME: 'old', TEXT_MODEL_BASE_URL: 'https://old.example/v1', TEXT_MODEL_API_KEY: 'old-key',
            IMAGE_MODEL_PROVIDER: 'direct', IMAGE_MODEL_NAME: 'image', IMAGE_MODEL_BASE_URL: 'https://image.example/v1', IMAGE_MODEL_API_KEY: 'image-key',
            CHAT_MODEL_SOURCE: 'writing', CHAT_MODEL_PROVIDER: 'direct', CHAT_MODEL_NAME: 'old', CHAT_MODEL_BASE_URL: 'https://old.example/v1', CHAT_MODEL_API_KEY: 'old-key'
        } }),
        dashboardActivityRecorder: () => {}
    });
    await service.saveAiRoleSettings({ scope: 'text', values: {
        provider: 'direct', name: 'new-text', baseUrl: 'https://new.example/v1', apiKey: 'new-key'
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.ai_settings.TEXT_MODEL.name, 'new-text');
    assert.equal(saved.ai_settings.TEXT_MODEL.base_url, 'https://new.example/v1');
    assert.deepEqual(saved.platforms, initial.platforms);
});

test('AI role scope reuses the selected provider profile key when the user leaves the key input blank', async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-ai-provider-profile-'));
    const configPath = path.join(configDir, 'config.json');
    const initial = {
        ai_settings: {
            MODEL_PROFILES: {
                text: { openai: { provider: 'openai', code: 'gpt-5.6-sol', api_key: 'openai-secret' } }
            }
        }
    };
    fs.writeFileSync(configPath, JSON.stringify(initial, null, 2));
    const CONFIG = {};
    const service = createSettingsService({
        fs, path, CONFIG, resolveWritableConfigPath: () => configPath,
        buildMajorSettings: () => ({ fields: {
            TEXT_MODEL_PROVIDER: 'google', TEXT_MODEL_PRESET_CODE: 'gemini-3.1-flash-lite', TEXT_MODEL_API_KEY: 'google-secret',
            IMAGE_MODEL_PROVIDER: 'direct', IMAGE_MODEL_NAME: 'image', IMAGE_MODEL_BASE_URL: 'https://image.example/v1', IMAGE_MODEL_API_KEY: 'image-key',
            CHAT_MODEL_SOURCE: 'writing', CHAT_MODEL_PROVIDER: 'google', CHAT_MODEL_PRESET_CODE: 'gemini-3.1-flash-lite', CHAT_MODEL_API_KEY: 'google-secret'
        } }),
        dashboardActivityRecorder: () => {}
    });
    await service.saveAiRoleSettings({ scope: 'text', values: {
        provider: 'openai', presetCode: 'gpt-5.6-sol', apiKey: ''
    } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.ai_settings.TEXT_MODEL.provider, 'openai');
    assert.equal(saved.ai_settings.TEXT_MODEL.api_key, 'openai-secret');
    assert.equal(saved.ai_settings.MODEL_PROFILES.text.openai.api_key, 'openai-secret');
});

test('content scope preserves unrelated settings and updates runtime sheet aliases', async () => {
    const initial = {
        general: { google_sheet_url: 'https://docs.google.com/spreadsheets/d/old-sheet-id_123456/edit', listen_port: 3000 },
        ai_settings: { TEXT_MODEL: { provider: 'google', api_key: 'keep-ai-key' } },
        automation: { publish: { blog_enabled: { enabled: true } } },
        mcp: { remote: { auth: {} } },
        NAVER_SEARCHAD_API_KEY: 'preserve-unrelated-value',
        platforms: { naver: { user_id: 'keep-naver', typing_speed: 'NORMAL' } }
    };
    const { CONFIG, activities, configPath, service } = createHarness(initial);
    const nextUrl = 'https://docs.google.com/spreadsheets/d/new-sheet-id_987654/edit';

    const result = await service.saveCoreConnectionSettings({
        scope: 'content', values: { GOOGLE_SHEET_URL: nextUrl }
    });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(saved.general.google_sheet_url, nextUrl);
    assert.equal(saved.general.listen_port, 3000);
    assert.deepEqual(saved.ai_settings, initial.ai_settings);
    assert.deepEqual(saved.automation, initial.automation);
    assert.deepEqual(saved.platforms, initial.platforms);
    assert.equal(saved.NAVER_SEARCHAD_API_KEY, 'preserve-unrelated-value');
    assert.equal(Object.hasOwn(saved.mcp.remote.auth, 'bearer_token'), false);
    assert.equal(CONFIG.GOOGLE_SHEET_URL, nextUrl);
    assert.equal(CONFIG.GOOGLE_SHEET_ID, 'new-sheet-id_987654');
    assert.equal(result.scope, 'content');
    assert.equal(activities[0].type, 'core_connection_saved');
});

test('naver and wordpress scopes update only their own provider fields', async () => {
    const initial = {
        platforms: {
            naver: { user_id: 'old-naver', typing_speed: 'FAST' },
            wordpress: { url: 'https://old.example', user_id: 'old-user', app_password: 'old-password' }
        },
        notification: { telegram: { enabled: true, bot_token: 'keep-token' } }
    };
    const { configPath, service } = createHarness(initial);

    await service.saveCoreConnectionSettings({ scope: 'naver', values: { NAVER_ID: 'new-naver' } });
    await service.saveCoreConnectionSettings({
        scope: 'wordpress',
        values: {
            WORDPRESS_URL: 'https://blog.example/',
            WORDPRESS_USER_ID: 'publisher',
            WORDPRESS_APP_PASSWORD: 'app password'
        }
    });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.deepEqual(saved.platforms.naver, { user_id: 'new-naver', typing_speed: 'FAST' });
    assert.deepEqual(saved.platforms.wordpress, {
        url: 'https://blog.example/', user_id: 'publisher', app_password: 'app password'
    });
    assert.deepEqual(saved.notification, initial.notification);
});

test('wordpress keeps an existing application password without returning it to the client', async () => {
    const initial = {
        platforms: {
            wordpress: { url: 'https://old.example', user_id: 'old-user', app_password: 'stored-secret' }
        }
    };
    const { configPath, service } = createHarness(initial);

    const result = await service.saveCoreConnectionSettings({
        scope: 'wordpress',
        values: { WORDPRESS_URL: 'https://blog.example/', WORDPRESS_USER_ID: 'publisher', WORDPRESS_APP_PASSWORD: '' }
    });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(saved.platforms.wordpress.app_password, 'stored-secret');
    assert.equal(result.fields.WORDPRESS_APP_PASSWORD, undefined);
    assert.equal(result.fields.WORDPRESS_APP_PASSWORD_CONFIGURED, true);
    assert.doesNotMatch(JSON.stringify(result), /stored-secret/);

    const readResult = await service.getMajorSettings();
    assert.equal(readResult.fields.WORDPRESS_APP_PASSWORD, undefined);
    assert.equal(readResult.fields.WORDPRESS_APP_PASSWORD_CONFIGURED, true);
    assert.doesNotMatch(JSON.stringify(readResult), /stored-secret/);
});

test('invalid existing config is not overwritten', async () => {
    const { configPath, service } = createHarness({});
    fs.writeFileSync(configPath, '{ invalid json');

    await assert.rejects(
        service.saveCoreConnectionSettings({ scope: 'naver', values: { NAVER_ID: 'safe-id' } }),
        (error) => error.status === 409 && error.apiCode === 'CONFIG_JSON_INVALID'
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), '{ invalid json');
});

test('app input owns only Naver typing speed and preserves unrelated config', async () => {
    const initial = {
        platforms: { naver: { user_id: 'publisher', typing_speed: 'NORMAL' } },
        general: { listen_port: 4577 },
        publish: { image_optimization_enabled: true }
    };
    const { CONFIG, configPath, service } = createHarness(initial);

    assert.deepEqual(normalizeAppInputSettings({ values: { TYPING_SPEED: 'human' } }), { fields: { TYPING_SPEED: 'HUMAN' } });
    assert.throws(
        () => normalizeAppInputSettings({ values: { TYPING_SPEED: 'instant' } }),
        (error) => error.apiCode === 'TYPING_SPEED_INVALID'
    );
    const result = await service.saveAppInputSettings({ values: { TYPING_SPEED: 'HUMAN' } });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(result.fields.TYPING_SPEED, 'HUMAN');
    assert.equal(saved.platforms.naver.typing_speed, 'HUMAN');
    assert.equal(saved.platforms.naver.user_id, 'publisher');
    assert.deepEqual(saved.general, initial.general);
    assert.deepEqual(saved.publish, initial.publish);
    assert.equal(CONFIG.TYPING_SPEED, 'HUMAN');
});

test('card news source settings preserve unrelated config and update runtime aliases', async () => {
    const initial = {
        content: { card_news: { builtin_sources: ['naver'], rss_sources: [] }, writing: { tone: 'keep' } },
        general: { listen_port: 4577 }
    };
    const { CONFIG, configPath, service } = createHarness(initial);
    CONFIG.CARD_NEWS_BUILTIN_SOURCES = ['naver'];
    CONFIG.CARD_NEWS_RSS_SOURCES = [];
    const rss = [{ name: '뉴스', url: 'https://example.com/feed.xml', enabled: true }];

    const result = await service.saveCardNewsSourceSettings({
        values: { CARD_NEWS_BUILTIN_SOURCES: ['wordpress'], CARD_NEWS_RSS_SOURCES: rss }
    });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.deepEqual(result.fields.CARD_NEWS_BUILTIN_SOURCES, ['wordpress']);
    assert.equal(result.fields.CARD_NEWS_RSS_SOURCES[0].name, '뉴스');
    assert.deepEqual(saved.content.writing, initial.content.writing);
    assert.deepEqual(saved.general, initial.general);
    assert.deepEqual(CONFIG.CARD_NEWS_BUILTIN_SOURCES, ['wordpress']);
    assert.equal(CONFIG.CARD_NEWS_RSS_SOURCES[0].url, 'https://example.com/feed.xml');
});

test('card news source settings reject invalid RSS without overwriting the config', async () => {
    const { configPath, service } = createHarness({ content: { card_news: { rss_sources: [] } } });
    const before = fs.readFileSync(configPath, 'utf8');
    await assert.rejects(
        service.saveCardNewsSourceSettings({ values: {
            CARD_NEWS_BUILTIN_SOURCES: [],
            CARD_NEWS_RSS_SOURCES: [{ url: 'http://example.com/feed.xml' }]
        } }),
        (error) => error.apiCode === 'CARD_NEWS_SOURCE_INVALID'
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});
