const test = require('node:test');
const assert = require('node:assert/strict');

const {
    extractGeminiText,
    resolveGeminiThinkingConfig,
    resolveGeminiTextEndpoint
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

test('Gemini text endpoint follows the model selected for the current request', () => {
    const configuredTextEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';
    assert.equal(
        resolveGeminiTextEndpoint(configuredTextEndpoint, 'gemini-3.5-flash'),
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'
    );
    assert.equal(resolveGeminiTextEndpoint(configuredTextEndpoint, ''), configuredTextEndpoint);
});
