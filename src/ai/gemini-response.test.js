const test = require('node:test');
const assert = require('node:assert/strict');

const {
    extractGeminiText,
    resolveGeminiThinkingConfig,
    resolveGeminiEndpointFromConfig,
    describeGeminiEndpoint
} = require('./gemini-response');

test('Gemini response joins every visible text part', () => {
    const text = extractGeminiText({
        candidates: [{
            content: {
                parts: [
                    { text: '{"drafts":[' },
                    { text: '"하나","둘","셋"]}' }
                ]
            }
        }]
    });
    assert.equal(text, '{"drafts":[\n"하나","둘","셋"]}');
});

test('Gemini response excludes thought parts when visible output exists', () => {
    const text = extractGeminiText({
        candidates: [{
            content: {
                parts: [
                    { thought: true, text: '내부 추론' },
                    { text: '{"drafts":["하나","둘","셋"]}' }
                ]
            }
        }]
    });
    assert.equal(text, '{"drafts":["하나","둘","셋"]}');
});

test('Gemini 3 maps common reasoning effort to native thinking level', () => {
    assert.deepEqual(
        resolveGeminiThinkingConfig('gemini-3.7-flash', 'low'),
        { thinkingLevel: 'low' }
    );
    assert.equal(resolveGeminiThinkingConfig('gemini-2.5-flash', 'low'), null);
    assert.equal(resolveGeminiThinkingConfig('gemini-3.6-flash', 'unknown'), null);
});

test('Gemini thinking policy promotes unsupported minimal effort to the nearest supported level', () => {
    assert.deepEqual(
        resolveGeminiThinkingConfig('gemini-3.7-flash', 'minimal', {
            thinking_levels: ['low', 'medium', 'high']
        }),
        { thinkingLevel: 'low' }
    );
    assert.deepEqual(
        resolveGeminiThinkingConfig('gemini-3.6-flash', 'minimal', {
            thinking_levels: ['minimal', 'low', 'medium', 'high']
        }),
        { thinkingLevel: 'minimal' }
    );
});

test('Gemini endpoint ignores user-supplied base URLs for code-owned providers', () => {
    const fixed = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent';
    assert.equal(
        resolveGeminiEndpointFromConfig({ provider: 'google', baseUrl: 'https://attacker.example/v1', code: 'gemini-3-flash' }),
        fixed
    );
    assert.equal(
        resolveGeminiEndpointFromConfig({ provider: 'google', baseUrl: '', code: 'gemini-3-flash' }),
        fixed
    );
    assert.equal(
        resolveGeminiEndpointFromConfig({ provider: 'openai', baseUrl: 'https://attacker.example/v1', code: 'gemini-3-flash' }),
        fixed
    );
});

test('Gemini endpoint diagnostics remove credentials, query parameters, and fragments', () => {
    assert.equal(
        describeGeminiEndpoint('https://user:password@example.com/v1/models/test:generateContent?key=secret#fragment'),
        'https://example.com/v1/models/test:generateContent'
    );
    assert.equal(
        describeGeminiEndpoint('not a url?key=secret'),
        'not a url'
    );
});

test('Gemini endpoint honors custom base URLs only for direct providers', () => {
    assert.equal(
        resolveGeminiEndpointFromConfig({ provider: 'direct', baseUrl: 'https://my-gateway.example/v1/', code: 'my-model' }),
        'https://my-gateway.example/v1/models/my-model:generateContent'
    );
    assert.throws(
        () => resolveGeminiEndpointFromConfig({ provider: 'direct', baseUrl: '', code: 'my-model' }),
        /Base URL/
    );
    assert.throws(
        () => resolveGeminiEndpointFromConfig({ provider: 'google', baseUrl: '', code: '' }),
        /모델 코드/
    );
});
