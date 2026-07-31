const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyTextRuntimePolicy,
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    resolveOpenAiImageRequest
} = require('./model-runtime-policy');

test('Gemini 3.6 strips deprecated temperature while older Gemini keeps it', () => {
    const latest = applyTextRuntimePolicy({
        provider: 'gemini',
        code: 'gemini-3.6-flash'
    }, {
        temperature: 0.2,
        maxTokens: 160
    });
    const older = applyTextRuntimePolicy({
        provider: 'gemini',
        code: 'gemini-3.5-flash'
    }, {
        temperature: 0.2
    });

    assert.equal('temperature' in latest.options, false);
    assert.equal(latest.options.maxTokens, 160);
    assert.equal(older.options.temperature, 0.2);
});

test('OpenAI chat policy uses current token and structured-output fields', () => {
    const request = buildOpenAiChatRequest({
        provider: 'openai',
        code: 'gpt-5.6-terra'
    }, 'Return JSON', {
        maxTokens: 500,
        temperature: 0.4,
        responseMimeType: 'application/json'
    });

    assert.deepEqual(request.body, {
        model: 'gpt-5.6-terra',
        messages: [{ role: 'user', content: 'Return JSON' }],
        max_completion_tokens: 500,
        response_format: { type: 'json_object' }
    });
});

test('Anthropic compatibility keeps its supported legacy chat fields', () => {
    const request = buildOpenAiChatRequest({
        provider: 'anthropic',
        code: 'claude-sonnet-5'
    }, 'Write', {
        maxTokens: 300,
        temperature: 0.2,
        responseMimeType: 'application/json'
    });

    assert.deepEqual(request.body, {
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'Write' }],
        max_tokens: 300,
        temperature: 0.2
    });
});

test('direct OpenAI-compatible text keeps max_tokens and removed presets remain callable', () => {
    const request = buildOpenAiChatRequest({
        provider: 'direct',
        code: 'local-chat',
        catalog_status: 'unavailable'
    }, 'Write', {
        maxTokens: 300
    });

    assert.deepEqual(request.body, {
        model: 'local-chat',
        messages: [{ role: 'user', content: 'Write' }],
        max_tokens: 300
    });
    assert.equal(request.definition.status, '');
});

test('GPT Image 2 uses native image policy and preserves aspect ratio', () => {
    const request = resolveOpenAiImageRequest({
        provider: 'openai',
        code: 'gpt-image-2'
    }, {
        prompt: 'blog hero',
        aspectRatio: '4:3',
        imageSize: '2K'
    });

    assert.equal(request.definition.transport, 'openai_images');
    assert.deepEqual(request.body, {
        model: 'gpt-image-2',
        prompt: 'blog hero',
        size: '2048x1536',
        quality: 'auto'
    });
});

test('direct image models retain conservative OpenAI-compatible request fields', () => {
    const request = resolveOpenAiImageRequest({
        provider: 'direct',
        code: 'local-image'
    }, {
        prompt: 'square',
        aspectRatio: '4:3',
        imageSize: '2K'
    });

    assert.deepEqual(request.body, {
        model: 'local-image',
        prompt: 'square',
        size: '1024x1024',
        response_format: 'b64_json'
    });
    assert.equal(getModelRuntimeDefinition('image', {
        provider: 'direct',
        code: 'local-image'
    }).transport, 'openai_images');
});
