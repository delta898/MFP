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

test('AI model catalog contains current Google models and excludes obsolete selections', () => {
    const catalog = getAiModelCatalog();
    const textCodes = catalog.text.map((item) => item.code);
    const imageCodes = catalog.image.map((item) => item.code);

    assert.deepEqual(textCodes.filter((code) => code.startsWith('gemini-')), [
        'gemini-3.1-pro-preview',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite'
    ]);
    assert.deepEqual(imageCodes.filter((code) => code.startsWith('gemini-')), [
        'gemini-3.1-flash-image',
        'gemini-3-pro-image'
    ]);

    const obsoleteCodes = [
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image'
    ];
    const supportedCodes = new Set([...textCodes, ...imageCodes]);
    obsoleteCodes.forEach((code) => assert.equal(supportedCodes.has(code), false));
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
