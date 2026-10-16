'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveGatewayModel,
    resolveGatewayModels,
    supportsGatewayFeature
} = require('./gateway-model-resolver');

const catalog = {
    text: [
        { provider: 'openai', code: 'model-a', transport: 'openai_chat', capabilities: { structured_output: true } },
        { provider: 'google', code: 'model-b', transport: 'gemini', capabilities: { structured_output: true } }
    ],
    image: [{ provider: 'openai', code: 'image-a', transport: 'openai_images' }]
};
const support = { routes: [
    { kind: 'text', provider: 'openai', transport: 'openai_chat', jsonMode: true },
    { kind: 'text', provider: 'google', transport: 'different_transport', jsonMode: true },
    { kind: 'image', provider: 'openai', transport: 'openai_images' }
] };

test('Blog Writing trusts the Gateway-filtered catalog as the model availability source', () => {
    assert.deepEqual(resolveGatewayModels('text', catalog, support), catalog.text);
    assert.deepEqual(resolveGatewayModel('text', { provider: 'openai', code: 'model-a' }, catalog, support), {
        provider: 'openai', modelId: 'model-a'
    });
    assert.deepEqual(resolveGatewayModel('text', { provider: 'google', code: 'model-b' }, catalog, support), {
        provider: 'google', modelId: 'model-b'
    });
    assert.equal(resolveGatewayModel('image', { provider: 'openai', code: 'model-a' }, catalog, support), null);
});

test('Blog Writing model resolver gates JSON mode on route and Catalog capability', () => {
    assert.equal(supportsGatewayFeature('text', { provider: 'openai', modelId: 'model-a' }, 'jsonResponse', support, catalog), true);
    assert.equal(supportsGatewayFeature('text', { provider: 'openai', modelId: 'model-a' }, 'jsonResponse', support, {
        ...catalog, text: [{ ...catalog.text[0], capabilities: { structured_output: false } }]
    }), false);
    assert.equal(supportsGatewayFeature('image', { provider: 'openai', modelId: 'image-a' }, 'jsonResponse', support, catalog), false);
});
