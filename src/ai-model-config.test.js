const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getAiModelCatalog,
    resolveAiModelConfig,
    buildModelSelectionFromFields,
    toStoredModelSelection
} = require('./ai-model-config');

test('AI model catalog is code-owned and returned as an isolated copy', () => {
    const first = getAiModelCatalog();
    const second = getAiModelCatalog();

    assert.ok(first.text.length > 0);
    assert.ok(first.image.length > 0);
    first.text[0].name = 'changed';

    assert.notEqual(second.text[0].name, 'changed');
});

test('AI model catalog contains supported Google models and excludes unavailable selections', () => {
    const catalog = getAiModelCatalog();
    const textCodes = catalog.text.map((item) => item.code);
    const geminiTextCodes = catalog.text
        .filter((item) => item.provider === 'gemini')
        .map((item) => item.code);
    const imageCodes = catalog.image.map((item) => item.code);

    assert.deepEqual(geminiTextCodes, [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite'
    ]);
    assert.deepEqual(imageCodes.filter((code) => code.startsWith('gemini-')), [
        'gemini-3.1-flash-image',
        'gemini-3-pro-image',
        'gemini-2.5-flash-image'
    ]);

    const obsoleteCodes = [
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview'
    ];
    const supportedCodes = new Set([...textCodes, ...imageCodes]);
    obsoleteCodes.forEach((code) => assert.equal(supportedCodes.has(code), false));
});

test('provider and model presets follow explicit product sort order', () => {
    const catalog = getAiModelCatalog();

    assert.deepEqual(catalog.providers.text.map((item) => item.id), [
        'openai',
        'anthropic',
        'gemini',
        'kie'
    ]);
    assert.deepEqual(catalog.providers.image.map((item) => item.id), [
        'openai',
        'gemini',
        'imagen4',
        'kie'
    ]);
    assert.deepEqual(
        catalog.text.filter((item) => item.provider === 'anthropic').map((item) => item.code),
        [
            'claude-fable-5',
            'claude-opus-5',
            'claude-sonnet-5',
            'claude-opus-4-6',
            'claude-sonnet-4-6',
            'claude-opus-4-5',
            'claude-sonnet-4-5',
            'claude-haiku-4-5'
        ]
    );
    assert.deepEqual(
        catalog.image.filter((item) => item.provider === 'imagen4').map((item) => item.code),
        [
            'imagen-4.0-ultra-generate-001',
            'imagen-4.0-generate-001',
            'imagen-4.0-fast-generate-001'
        ]
    );
    assert.deepEqual(
        catalog.text.filter((item) => item.provider === 'kie').map((item) => item.code),
        [
            'gpt-5-6-sol',
            'gpt-5-6-terra',
            'gpt-5-6-luna',
            'gemini-3-6-flash-openai',
            'gemini-3-5-flash-openai',
            'gemini-3.1-pro'
        ]
    );
    assert.deepEqual(
        catalog.image.filter((item) => item.provider === 'kie').map((item) => item.code),
        ['nano-banana-2']
    );
});

test('AI model catalog contains current OpenAI and Anthropic models with trusted transports', () => {
    const catalog = getAiModelCatalog();
    const findModel = (provider, code) => [...catalog.text, ...catalog.image]
        .find((item) => item.provider === provider && item.code === code);

    assert.equal(findModel('openai', 'gpt-5.6-sol').transport, 'openai_chat_completions');
    assert.equal(findModel('openai', 'gpt-5.6-terra').provider, 'openai');
    assert.equal(findModel('openai', 'gpt-5.6-luna').base_url, 'https://api.openai.com/v1');
    assert.equal(findModel('anthropic', 'claude-fable-5').transport, 'anthropic_openai_compat');
    assert.equal(findModel('anthropic', 'claude-opus-5').provider, 'anthropic');
    assert.equal(findModel('anthropic', 'claude-sonnet-5').code, 'claude-sonnet-5');
    assert.equal(findModel('openai', 'gpt-image-2').transport, 'openai_images');
    assert.equal(findModel('kie', 'gpt-5-6-sol').transport, 'kie_responses');
    assert.equal(findModel('kie', 'gpt-5-6-terra').provider, 'kie');
    assert.equal(findModel('kie', 'gpt-5-6-luna').base_url, 'https://api.kie.ai');
    assert.equal(findModel('kie', 'gemini-3-6-flash-openai').transport, 'kie_openai_chat');
    assert.equal(findModel('kie', 'gemini-3-5-flash-openai').provider, 'kie');
    assert.equal(findModel('kie', 'gemini-3.1-pro').base_url, 'https://api.kie.ai');
    assert.equal(findModel('kie', 'nano-banana-2').transport, 'kie_market_image_jobs');
});

test('legacy ai_presets config cannot override the product catalog', () => {
    const resolved = resolveAiModelConfig({
        ai_presets: {
            text: [
                {
                    provider: 'custom-provider',
                    code: 'config-owned-model',
                    name: 'Config Owned Model'
                }
            ]
        },
        ai_settings: {
            TEXT_MODEL: {
                provider: 'gemini',
                code: 'gemini-3.1-flash-lite',
                api_key: 'secret'
            }
        }
    }, 'text');

    assert.equal(resolved.provider, 'gemini');
    assert.equal(resolved.code, 'gemini-3.1-flash-lite');
    assert.equal(resolved.name, 'Gemini 3.1 Flash-Lite');
});

test('known presets are stored as selection and secret values only', () => {
    const catalog = getAiModelCatalog();
    const resolved = buildModelSelectionFromFields('text', {
        TEXT_MODEL_PROVIDER: 'anthropic',
        TEXT_MODEL_PRESET_CODE: 'claude-sonnet-4-6',
        TEXT_MODEL_API_KEY: 'secret'
    }, catalog);

    assert.deepEqual(toStoredModelSelection(resolved, catalog), {
        provider: 'anthropic',
        code: 'claude-sonnet-4-6',
        api_key: 'secret'
    });
});

test('known KIE presets persist only provider, route code, and API key', () => {
    const stored = toStoredModelSelection({
        provider: 'kie',
        code: 'gemini-3-6-flash-openai',
        name: 'Ignore copied display name',
        base_url: 'https://attacker.example',
        api_key: 'kie-secret'
    });

    assert.deepEqual(stored, {
        provider: 'kie',
        code: 'gemini-3-6-flash-openai',
        api_key: 'kie-secret'
    });
});

test('direct models retain user-managed name and base URL', () => {
    const resolved = buildModelSelectionFromFields('text', {
        TEXT_MODEL_PROVIDER: 'direct',
        TEXT_MODEL_NAME: 'local-model',
        TEXT_MODEL_BASE_URL: 'http://127.0.0.1:11434/v1/',
        TEXT_MODEL_API_KEY: ''
    });

    assert.deepEqual(toStoredModelSelection(resolved), {
        provider: 'direct',
        name: 'local-model',
        code: 'local-model',
        base_url: 'http://127.0.0.1:11434/v1',
        api_key: ''
    });
});

test('models removed from the catalog remain selected until the user changes them', () => {
    const resolved = resolveAiModelConfig({
        ai_settings: {
            TEXT_MODEL: {
                provider: 'gemini',
                name: 'Retired Model',
                code: 'retired-model',
                base_url: '',
                api_key: 'secret'
            }
        }
    }, 'text');

    assert.equal(resolved.code, 'retired-model');
    assert.equal(resolved.catalog_status, 'unavailable');
    assert.deepEqual(toStoredModelSelection(resolved), {
        provider: 'gemini',
        name: 'Retired Model',
        code: 'retired-model',
        base_url: '',
        api_key: 'secret'
    });
});
