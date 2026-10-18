const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyTextRuntimePolicy,
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    normalizeReasoningEffort,
    resolveSupportedReasoningEffort,
    withAutomaticReasoningEffort
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
const { resolveGeminiThinkingConfig } = require('./gemini-response');
const { applyRemoteCatalog, clearRemoteCatalog } = require('./catalog-registry');

const MODEL_FIXTURES = [
    ['text', 'google', 'gemini-3.7-flash', 'gemini_generate_content', 'Gemini 3.7 Flash', { temperature: false, thinking_levels: ['low', 'medium', 'high'] }],
    ['text', 'google', 'gemini-3.6-flash', 'gemini_generate_content', 'Gemini 3.6 Flash', { temperature: false, thinking_levels: ['minimal', 'low', 'medium', 'high'] }],
    ['text', 'google', 'gemini-3.5-flash', 'gemini_generate_content', 'Gemini 3.5 Flash', { temperature: true }],
    ['text', 'openai', 'gpt-5.6-terra', 'openai_chat_completions', 'GPT-5.6 Terra', { structured_output: true }],
    ['text', 'openai', 'gpt-6-astra', 'openai_chat_completions', 'GPT-6 Astra', { reasoning_efforts: ['low', 'medium', 'high', 'xhigh'] }],
    ['text', 'anthropic', 'claude-sonnet-5', 'anthropic_openai_compat', 'Claude Sonnet 5', { temperature: false }],
    ['text', 'kie', 'gpt-5-6-terra', 'kie_responses', 'GPT-5.6 Terra', {}]
];

test.beforeEach(() => {
    applyRemoteCatalog({
        schema_version: 1,
        version: 'model-runtime-policy-fixtures',
        models: MODEL_FIXTURES.map(([kind, provider, code, transport, name, capabilities]) => ({
            key: `${provider}:${code}`, kind, provider, model_id: code, transport,
            display_name: name, status: 'active', capabilities
        }))
    }, { appVersion: '99.0.0' });
});
test.afterEach(clearRemoteCatalog);

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

test('Gemini runtime capabilities adapt a common minimal effort per model', () => {
    const gemini37 = getModelRuntimeDefinition('text', {
        provider: 'google',
        code: 'gemini-3.7-flash'
    });
    const gemini36 = getModelRuntimeDefinition('text', {
        provider: 'google',
        code: 'gemini-3.6-flash'
    });

    assert.deepEqual(
        resolveGeminiThinkingConfig(gemini37.code, 'minimal', gemini37.capabilities),
        { thinkingLevel: 'low' }
    );
    assert.deepEqual(
        resolveGeminiThinkingConfig(gemini36.code, 'minimal', gemini36.capabilities),
        { thinkingLevel: 'minimal' }
    );
});

test('runtime model definition replaces stale display names with the catalog name', () => {
    const definition = getModelRuntimeDefinition('text', {
        provider: 'google',
        name: 'Gemini 3.1 Flash Lite Preview',
        code: 'gemini-3.6-flash'
    });

    assert.equal(definition.name, 'Gemini 3.6 Flash');
    assert.equal(definition.code, 'gemini-3.6-flash');
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
        temperature: 0.4,
        response_format: { type: 'json_object' }
    });
});

test('GPT-6.1 Sol uses its Chat Completions model ID and supported reasoning level', () => {
    const request = buildOpenAiChatRequest({
        provider: 'openai',
        code: 'gpt-6.1-sol'
    }, 'Write', { reasoningEffort: 'medium' });

    assert.equal(request.definition.transport, 'openai_chat_completions');
    assert.equal(request.body.model, 'gpt-6.1-sol');
    assert.equal(request.body.reasoning_effort, 'medium');
});

test('automatic reasoning uses medium for writing, low for light tasks, and migrates minimal', () => {
    assert.equal(withAutomaticReasoningEffort({}, 'writing').reasoningEffort, 'medium');
    assert.equal(withAutomaticReasoningEffort({}, 'chat').reasoningEffort, 'low');
    assert.equal(withAutomaticReasoningEffort({ reasoningEffort: 'high' }, 'chat').reasoningEffort, 'high');
    assert.equal(normalizeReasoningEffort('minimal'), 'low');
});

test('direct OpenAI sends reasoning effort and safely downgrades unsupported levels', () => {
    const request = buildOpenAiChatRequest({
        provider: 'openai',
        code: 'gpt-6-astra'
    }, 'Write', {
        reasoningEffort: 'minimal',
        temperature: 0.4
    });

    assert.deepEqual(request.body, {
        model: 'gpt-6-astra',
        messages: [{ role: 'user', content: 'Write' }],
        temperature: 0.4,
        reasoning_effort: 'low'
    });
    assert.equal(
        resolveSupportedReasoningEffort('max', ['low', 'medium', 'high', 'xhigh'], 'low'),
        'xhigh'
    );
});

test('Anthropic compatibility removes unsupported Sonnet 5 temperature', () => {
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
        max_tokens: 300
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

    const maximum = buildKieResponsesRequest({
        provider: 'kie',
        code: 'gpt-6-astra'
    }, 'Write', { reasoningEffort: 'max' });
    assert.deepEqual(maximum.body.reasoning, { effort: 'max' });

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
