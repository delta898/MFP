const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyTextRuntimePolicy,
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    resolveOpenAiImageRequest
} = require('./model-runtime-policy');
const {
    extractKieOpenAiChatContent,
    getKieOpenAiChatEndpoint
} = require('./kie-openai-chat');
const {
    KIE_RESPONSES_ENDPOINT,
    buildKieResponsesRequest,
    extractKieResponsesText
} = require('./kie-responses');

test('current Gemini Flash models strip deprecated temperature while older Gemini keeps it', () => {
    const newest = applyTextRuntimePolicy({
        provider: 'google',
        code: 'gemini-3.7-flash'
    }, {
        temperature: 0.2
    });
    const latest = applyTextRuntimePolicy({
        provider: 'google',
        code: 'gemini-3.6-flash'
    }, {
        temperature: 0.2,
        maxTokens: 160
    });
    const older = applyTextRuntimePolicy({
        provider: 'google',
        code: 'gemini-3.5-flash'
    }, {
        temperature: 0.2
    });

    assert.equal('temperature' in newest.options, false);
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

test('KIE OpenAI chat uses its route-selected model contract', () => {
    const request = buildOpenAiChatRequest({
        provider: 'kie',
        code: 'gemini-3-5-flash-openai'
    }, 'Write', {
        maxTokens: 300,
        temperature: 0.2,
        responseMimeType: 'application/json'
    });

    assert.equal(request.definition.transport, 'kie_openai_chat');
    assert.deepEqual(request.body, {
        messages: [{ role: 'user', content: 'Write' }],
        max_tokens: 300,
        temperature: 0.2
    });
    assert.equal(
        getKieOpenAiChatEndpoint('gemini-3-5-flash-openai'),
        'https://api.kie.ai/gemini-3-5-flash-openai/v1/chat/completions'
    );
    assert.throws(
        () => getKieOpenAiChatEndpoint('../foreign-host'),
        /모델 경로가 올바르지 않습니다/
    );
});

test('KIE adapter accepts OpenAI responses and the documented Gemini-shaped fallback', () => {
    assert.equal(extractKieOpenAiChatContent({
        choices: [{ message: { content: 'OpenAI response' } }]
    }), 'OpenAI response');
    assert.equal(extractKieOpenAiChatContent({
        candidates: [{
            content: {
                parts: [{ text: 'Gemini ' }, { text: 'response' }]
            }
        }]
    }), 'Gemini response');
});

test('KIE Responses adapter builds the documented non-streaming GPT request', () => {
    const request = buildKieResponsesRequest({
        provider: 'kie',
        code: 'gpt-5-6-terra'
    }, 'Write', {
        maxTokens: 300,
        temperature: 0.2,
        reasoningEffort: 'medium',
        responseMimeType: 'application/json'
    });

    assert.equal(request.definition.transport, 'kie_responses');
    assert.equal(KIE_RESPONSES_ENDPOINT, 'https://api.kie.ai/codex/v1/responses');
    assert.deepEqual(request.body, {
        model: 'gpt-5-6-terra',
        stream: false,
        input: 'Write',
        reasoning: { effort: 'medium' }
    });
});

test('KIE Responses adapter defaults reasoning low and extracts message output text', () => {
    const request = buildKieResponsesRequest({
        provider: 'kie',
        code: 'gpt-5-6-luna'
    }, 'Write');
    assert.deepEqual(request.body.reasoning, { effort: 'low' });

    assert.equal(extractKieResponsesText({
        output: [
            { type: 'reasoning', summary: [] },
            {
                type: 'message',
                content: [
                    { type: 'output_text', text: 'Hello ' },
                    { type: 'refusal', refusal: 'ignored' },
                    { type: 'output_text', text: 'world' }
                ]
            }
        ]
    }), 'Hello world');
    assert.equal(extractKieResponsesText({ output_text: 'Top level' }), 'Top level');
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
