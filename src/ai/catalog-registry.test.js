const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyRemoteCatalog,
    clearRemoteCatalog,
    findModelDefinition,
    getAiModelCatalog,
    getCatalogStatus,
    validateRemoteCatalog
} = require('./catalog-registry');
const { toStoredModelSelection } = require('../ai-model-config');

test.afterEach(() => {
    clearRemoteCatalog();
});

test('remote catalog can add a model through an allowlisted transport', () => {
    applyRemoteCatalog({
        schema_version: 1,
        version: '2026-08-01.1',
        models: [{
            key: 'openai:gpt-future',
            kind: 'text',
            provider: 'openai',
            transport: 'openai_chat_completions',
            model_id: 'gpt-future',
            display_name: 'GPT Future',
            status: 'active',
            capabilities: {
                temperature: false,
                unknown_remote_control: true
            },
            base_url: 'https://attacker.example/v1'
        }]
    }, { appVersion: '0.1.14' });

    const model = getAiModelCatalog().text.find((item) => item.code === 'gpt-future');
    assert.ok(model);
    assert.equal(model.base_url, 'https://api.openai.com/v1');
    assert.deepEqual(model.capabilities, { temperature: false });
    assert.deepEqual(getCatalogStatus(), {
        source: 'remote',
        version: '2026-08-01.1',
        schema_version: 1,
        remote_model_count: 1
    });
});

test('remote catalog rejects unknown provider transport routes', () => {
    assert.throws(() => validateRemoteCatalog({
        schema_version: 1,
        version: 'bad',
        models: [{
            key: 'evil:model',
            kind: 'text',
            provider: 'evil',
            transport: 'arbitrary_http',
            model_id: 'model',
            display_name: 'Unsafe Model'
        }]
    }, { appVersion: '0.1.14' }), /호환 가능한/);
});

test('remote catalog cannot replace a stable key with another model id', () => {
    assert.throws(() => validateRemoteCatalog({
        schema_version: 1,
        version: 'key-swap',
        models: [{
            key: 'openai:gpt-5.6-sol',
            kind: 'text',
            provider: 'openai',
            transport: 'openai_chat_completions',
            model_id: 'different-model',
            display_name: 'Different Model'
        }]
    }, { appVersion: '0.1.14' }), /호환 가능한/);
});

test('hidden remote override is not selectable but remains resolvable', () => {
    applyRemoteCatalog({
        schema_version: 1,
        version: 'hide-one',
        models: [{
            key: 'openai:gpt-5.6-sol',
            kind: 'text',
            provider: 'openai',
            transport: 'openai_chat_completions',
            model_id: 'gpt-5.6-sol',
            display_name: 'GPT-5.6 Sol',
            status: 'hidden'
        }]
    }, { appVersion: '0.1.14' });

    assert.equal(getAiModelCatalog().text.some((item) => item.code === 'gpt-5.6-sol'), false);
    assert.equal(findModelDefinition('text', 'openai', 'gpt-5.6-sol').status, 'hidden');
    assert.deepEqual(toStoredModelSelection({
        provider: 'openai',
        code: 'gpt-5.6-sol',
        api_key: 'secret'
    }), {
        provider: 'openai',
        code: 'gpt-5.6-sol',
        api_key: 'secret'
    });
});

test('catalog and model minimum app versions are enforced', () => {
    assert.throws(() => validateRemoteCatalog({
        schema_version: 1,
        version: 'future',
        minimum_app_version: '1.0.0',
        models: []
    }, { appVersion: '0.1.14' }), /1.0.0 이상/);

    assert.throws(() => validateRemoteCatalog({
        schema_version: 1,
        version: 'mixed',
        models: [{
            key: 'openai:future',
            kind: 'text',
            provider: 'openai',
            transport: 'openai_chat_completions',
            model_id: 'future',
            display_name: 'Future',
            minimum_app_version: '1.0.0'
        }]
    }, { appVersion: '0.1.14' }), /호환 가능한/);
});
