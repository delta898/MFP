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
        remote_model_count: 1,
        remote_provider_count: 0
    });
});

test('remote catalog can activate another KIE model only through the trusted KIE transport', () => {
    applyRemoteCatalog({
        schema_version: 1,
        version: 'kie-model',
        providers: [
            { kind: 'text', id: 'kie', display_name: 'KIE.ai', sort_order: 40 }
        ],
        models: [{
            key: 'kie:gemini-next-openai',
            kind: 'text',
            provider: 'kie',
            transport: 'kie_openai_chat',
            model_id: 'gemini-next-openai',
            display_name: 'Gemini Next',
            status: 'active',
            sort_order: 5,
            base_url: 'https://attacker.example'
        }]
    }, { appVersion: '0.1.15' });

    const model = getAiModelCatalog().text.find((item) => item.code === 'gemini-next-openai');
    assert.ok(model);
    assert.equal(model.base_url, 'https://api.kie.ai');
    assert.equal(model.transport, 'kie_openai_chat');
});

test('provider and model order are controlled by independent sort_order fields', () => {
    applyRemoteCatalog({
        schema_version: 1,
        version: 'ordered',
        providers: [
            { kind: 'text', id: 'gemini', display_name: 'Gemini', sort_order: 30 },
            { kind: 'text', id: 'openai', display_name: 'ChatGPT', sort_order: 10 },
            { kind: 'text', id: 'anthropic', display_name: 'Claude', sort_order: 20 }
        ],
        models: [
            {
                key: 'openai:gpt-future-low',
                kind: 'text',
                provider: 'openai',
                transport: 'openai_chat_completions',
                model_id: 'gpt-future-low',
                display_name: 'GPT Future Low',
                status: 'active',
                sort_order: 35
            },
            {
                key: 'openai:gpt-future-high',
                kind: 'text',
                provider: 'openai',
                transport: 'openai_chat_completions',
                model_id: 'gpt-future-high',
                display_name: 'GPT Future High',
                status: 'active',
                sort_order: 5
            }
        ]
    }, { appVersion: '0.1.14' });

    const catalog = getAiModelCatalog();
    assert.deepEqual(catalog.providers.text.map((item) => item.id), [
        'openai',
        'anthropic',
        'gemini',
        'kie'
    ]);
    assert.deepEqual(
        catalog.text.filter((item) => item.provider === 'openai').map((item) => item.code),
        ['gpt-future-high', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-future-low']
    );
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
