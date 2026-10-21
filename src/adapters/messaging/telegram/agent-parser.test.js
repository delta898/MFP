const test = require('node:test');
const assert = require('node:assert/strict');
const {
    routeTelegramMessage,
    tryParseDeterministicEnvelope
} = require('./agent-parser');

test('Telegram natural language can only route through the Agent action catalog', async () => {
    const responses = [
        JSON.stringify({ route: 'reply', reply: { text: '안녕하세요!', recommendation: '글감도 함께 정리할 수 있어요.' } }),
        JSON.stringify({
            route: 'legacy',
            legacy_actions: [{ action: 'register_topic', params: { theme: '제주 산책' } }],
            meta: { explicit_params: ['theme'] }
        }),
        JSON.stringify({
            route: 'agent',
            actions: [{ action_id: 'content.idea.suggest', params: { limit: 1 } }]
        }),
        JSON.stringify({ route: 'legacy', legacy_actions: [{ action: 'delete_everything', params: {} }] }),
        JSON.stringify({ route: 'legacy', legacy_actions: [{ action: 'update_config', params: { config_updates: { ADMIN_MODE: true } } }] })
    ];
    let calls = 0;
    const context = {
        capabilityRegistry: {
            listAgentActions: () => [{
                id: 'content.idea.suggest',
                type: 'content.generate',
                domain: 'content.idea',
                name: 'suggest',
                effect: 'generated_output',
                confirmPolicy: 'never',
                agentExposure: {
                    title: '글감 추천',
                    description: '새 글감을 제안합니다.',
                    useWhen: '사용자가 블로그 글감 후보를 요청합니다.',
                    avoidWhen: '사용자가 글감 저장이나 발행을 요청합니다.',
                    examples: ['글감 아이디어 추천해줘']
                }
            }]
        },
        modelCaller: async () => {
            calls += 1;
            return responses.shift();
        },
        logger: { debug() {} }
    };

    const reply = await routeTelegramMessage('하이!', { ...context, conversationId: 'telegram:1', messageId: '1' });
    assert.equal(reply.route, 'reply');
    assert.equal(reply.reply.text, '안녕하세요!');
    assert.equal(reply.reply.recommendation, '글감도 함께 정리할 수 있어요.');

    const removedLegacyRoute = await routeTelegramMessage('제주 산책 글감 저장해줘', context);
    assert.equal(removedLegacyRoute.route, 'unsupported');
    assert.equal(Object.hasOwn(removedLegacyRoute, 'legacy_actions'), false);

    const agent = await routeTelegramMessage('글감 아이디어 추천해줘', context);
    assert.equal(agent.route, 'agent');
    assert.equal(agent.actions[0].action_id, 'content.idea.suggest');

    const invalidLegacy = await routeTelegramMessage('모든 데이터 삭제해줘', context);
    assert.equal(invalidLegacy.route, 'unsupported');
    assert.equal(Object.hasOwn(invalidLegacy, 'legacy_actions'), false);
    const invalidConfig = await routeTelegramMessage('관리자 모드 켜줘', context);
    assert.equal(invalidConfig.route, 'unsupported');
    assert.equal(Object.hasOwn(invalidConfig, 'legacy_actions'), false);
    assert.equal(calls, 5);

    assert.equal(tryParseDeterministicEnvelope('지금 몇시야?', { conversationId: 'telegram:1' }), null);
    assert.equal(tryParseDeterministicEnvelope('너는 무엇을 할 수 있니?', { conversationId: 'telegram:1' }), null);
    assert.equal(tryParseDeterministicEnvelope('/help', { conversationId: 'telegram:1' }).actions[0].name, 'get_help');
    assert.equal(tryParseDeterministicEnvelope('/start', { conversationId: 'telegram:1' }).actions[0].name, 'get_help');
});

test('사용자 규칙은 정확히 일치할 때 저장된 catalog action을 바로 선택한다', async () => {
    let modelCalls = 0;
    const context = {
        conversationId: 'telegram:rules', messageId: 'msg-1', logger: { debug() {} },
        memory: {
            user_rules: [{
                id: 'rule-1', trigger: '[ideas]', status: 'active',
                action_id: 'content.idea.suggest',
                action_params: { query: '가을 여행', limit: 3 }
            }]
        },
        capabilityRegistry: {
            listAgentActions: () => [{
                id: 'content.idea.suggest', domain: 'content.idea', type: 'content.generate',
                name: 'suggest',
                effect: 'generated_output', confirmPolicy: 'never',
                agentExposure: { title: '글감 추천', inputSchema: { type: 'object', properties: {}, additionalProperties: true } }
            }]
        },
        modelCaller: async () => { modelCalls += 1; return '{}'; }
    };

    const exact = await routeTelegramMessage('[ideas]', context);
    assert.equal(exact.route, 'agent');
    assert.equal(exact.actions[0].action_id, 'content.idea.suggest');
    assert.deepEqual(exact.actions[0].params, { query: '가을 여행', limit: 3 });
    assert.equal(exact.actions[0].reason, '사용자가 저장한 “[ideas]” 실행 규칙');

    const expanded = await routeTelegramMessage('[ideas] 새 주제로', context);
    assert.equal(expanded.route, 'unsupported');
    assert.equal(modelCalls, 1);
});

test('저장된 규칙의 실행 대상이 catalog에서 사라지면 다른 action으로 우회하지 않는다', async () => {
    let modelCalls = 0;
    const result = await routeTelegramMessage('[post]', {
        conversationId: 'telegram:rules',
        memory: { user_rules: [{ id: 'r1', trigger: '[post]', action_id: 'blog.missing', action_params: {} }] },
        capabilityRegistry: { listAgentActions: () => [] },
        modelCaller: async () => { modelCalls += 1; return '{}'; }
    });
    assert.equal(result.route, 'reply');
    assert.match(result.reply.text, /현재 등록되어 있지 않아 실행하지 않았습니다/);
    assert.equal(modelCalls, 0);
});

test('Telegram router prompt derives allowable Agent actions from the runtime registry', async () => {
    let prompt = '';
    await routeTelegramMessage('무슨 일을 할 수 있어?', {
        conversationId: 'telegram:1',
        messageId: '2',
        logger: { debug() {} },
        capabilityRegistry: {
            listAgentActions: () => [{
                id: 'content.idea.suggest',
                type: 'content.generate',
                domain: 'content.idea',
                name: 'suggest',
                effect: 'generated_output',
                confirmPolicy: 'never',
                agentExposure: {
                    kind: 'application_workflow',
                    title: '글감 추천',
                    description: '블로그 글감을 제안합니다.',
                    useWhen: '사용자가 블로그 글감 후보를 요청합니다.',
                    avoidWhen: '사용자가 키워드 지표나 실제 저장을 요청합니다.',
                    inputSchema: { type: 'object', properties: { limit: { type: 'integer', maximum: 5 } }, additionalProperties: false },
                    inputPolicy: { limit: { kind: 'optional', prompt: '결과 개수를 지정할 수 있습니다.' } },
                    outputDescription: '주제에 맞는 글감 후보를 반환합니다.',
                    examples: []
                }
            }]
        },
        modelCaller: async (value) => {
            prompt = value;
            return JSON.stringify({ route: 'reply', reply: { text: '무엇을 도와드릴까요?' } });
        }
    });
    assert.match(prompt, /content\.idea\.suggest/);
    assert.match(prompt, /application_workflow/);
    assert.match(prompt, /사용 시점=사용자가 블로그 글감 후보를 요청합니다/);
    assert.match(prompt, /사용하지 않을 때=사용자가 키워드 지표나 실제 저장을 요청합니다/);
    assert.match(prompt, /effect=generated_output, confirmation=never/);
    assert.match(prompt, /inputSchema=.*"limit"/);
    assert.match(prompt, /사용자가 선택 항목을 지정했지만 값이 불명확하면 먼저 물어보고/);
    assert.match(prompt, /주제에 맞는 글감 후보를 반환합니다/);
    assert.match(prompt, /다른 action의 결과를 임의로 다음 입력에 연결하지 않습니다/);
    assert.doesNotMatch(prompt, /content\.title\.suggest/);
    assert.doesNotMatch(prompt, /\[액션 매핑 규칙\]/);
    assert.doesNotMatch(prompt, /legacy_actions|Legacy 호환 작업/);
    assert.match(prompt, /필수 정보가 빠졌거나 후보가 겹쳐 안전하게 선택할 수 없으면 action을 실행하지 말고 route="reply"/);
});

test('Telegram router rejects removed legacy routes instead of dispatching them', async () => {
    const result = await routeTelegramMessage('발행 대기열 항목을 보여줘', {
        conversationId: 'telegram:queue',
        logger: { debug() {} },
        capabilityRegistry: { listAgentActions: () => [] },
        modelCaller: async () => JSON.stringify({
            route: 'legacy',
            legacy_actions: [{ action: 'query_data', params: { query_type: 'topics' } }]
        })
    });

    assert.equal(result.route, 'unsupported');
    assert.equal(Object.hasOwn(result, 'legacy_actions'), false);
});

test('Telegram semantic routing can choose a matching action or ask before resolving ambiguity', async () => {
    const catalog = [
        {
            id: 'content.keyword.analyze', type: 'content.query', domain: 'content.keyword', name: 'analyze', effect: 'read_only', confirmPolicy: 'never',
            agentExposure: {
                title: '키워드 분석', description: '검색량과 경쟁 지표를 조회합니다.',
                useWhen: '특정 키워드의 검색 수요나 경쟁 지표를 묻습니다.',
                avoidWhen: '글감이나 제목 후보를 요청합니다.',
                inputSchema: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'], additionalProperties: false },
                outputDescription: '키워드 지표를 반환합니다.'
            }
        },
        {
            id: 'content.idea.suggest', type: 'content.generate', domain: 'content.idea', name: 'suggest', effect: 'generated_output', confirmPolicy: 'never',
            agentExposure: {
                title: '글감 추천', description: '블로그 주제에 맞는 글감을 제안합니다.',
                useWhen: '사용자가 블로그 글감이나 주제 후보를 요청합니다.',
                avoidWhen: '검색 지표를 묻거나 추천 대상이 불명확합니다.',
                inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
                outputDescription: '블로그 글감 후보를 반환합니다.'
            }
        }
    ];
    const prompts = [];
    const outputs = [
        JSON.stringify({ route: 'agent', actions: [{ action_id: 'content.keyword.analyze', params: { keyword: '오사카 여행' }, reason: '검색 지표를 요청함' }] }),
        JSON.stringify({ route: 'reply', reply: { text: '검색 지표를 분석할까요, 블로그 글감을 추천할까요?' } })
    ];
    const context = {
        conversationId: 'telegram:semantic',
        capabilityRegistry: { listAgentActions: () => catalog },
        logger: { debug() {} },
        modelCaller: async (prompt) => { prompts.push(prompt); return outputs.shift(); }
    };

    const selected = await routeTelegramMessage('오사카 여행 키워드 분석해줘', context);
    assert.equal(selected.route, 'agent');
    assert.equal(selected.actions[0].action_id, 'content.keyword.analyze');

    const clarified = await routeTelegramMessage('오사카 여행 관련해서 뭐가 좋을까?', context);
    assert.equal(clarified.route, 'reply');
    assert.equal(clarified.actions.length, 0);
    assert.match(clarified.reply.text, /검색 지표를 분석할까요/);
    assert.match(prompts[1], /사용 시점=/);
    assert.match(prompts[1], /사용하지 않을 때=/);
    assert.match(prompts[1], /MUST/);
    assert.match(prompts[1], /선택 항목/);
});

test('Telegram router converts missing required action input into a focused clarification', async () => {
    const capability = {
        id: 'content.register_topic.execute', type: 'content.register', domain: 'content.register_topic', name: 'execute',
        agentExposure: {
            title: '글감 저장 또는 대기열 등록',
            inputSchema: {
                type: 'object',
                properties: {
                    theme: { type: 'string' },
                    action: { type: 'string', enum: ['save', 'enqueue'] },
                    platforms: { type: 'array', items: { type: 'string' } }
                },
                required: ['theme', 'action'],
                allOf: [{ if: { properties: { action: { const: 'enqueue' } }, required: ['action'] }, then: { required: ['platforms'] } }],
                additionalProperties: false
            },
            requiredInputQuestions: { platforms: '발행 대기열에 넣을 플랫폼을 선택해 주세요: 네이버 블로그 또는 워드프레스 중 어디인가요?' }
        }
    };
    const result = await routeTelegramMessage('가을 여행 주제를 발행 대기열에 넣어줘', {
        conversationId: 'telegram:clarification',
        capabilityRegistry: {
            listAgentActions: () => [capability],
            getAgentAction: (id) => id === capability.id ? capability : null
        },
        logger: { debug() {} },
        modelCaller: async () => JSON.stringify({
            route: 'agent',
            actions: [{ action_id: capability.id, params: { theme: '가을 여행', action: 'enqueue' } }]
        })
    });

    assert.equal(result.route, 'reply');
    assert.deepEqual(result.actions, []);
    assert.match(result.reply.text, /플랫폼을 선택/);
});

test('Telegram router proceeds without optional topic keywords and appends the declared suggestion', async () => {
    const capability = {
        id: 'content.register_topic.execute', type: 'content.register', domain: 'content.register_topic', name: 'execute',
        agentExposure: {
            title: '글감 저장',
            inputSchema: {
                type: 'object',
                properties: { theme: { type: 'string' }, action: { type: 'string', enum: ['save', 'enqueue'] }, keywords: { type: 'array', items: { type: 'string' } } },
                required: ['theme', 'action'], additionalProperties: false
            },
            optionalInputSuggestions: { keywords: '키워드는 선택 사항이지만, 글감 검색과 원고 작성에 도움이 됩니다.' }
        }
    };
    const result = await routeTelegramMessage('가을 여행 글감을 보관해줘', {
        conversationId: 'telegram:optional-input',
        capabilityRegistry: {
            listAgentActions: () => [capability],
            getAgentAction: (id) => id === capability.id ? capability : null
        },
        logger: { debug() {} },
        modelCaller: async () => JSON.stringify({
            route: 'agent',
            actions: [{ action_id: capability.id, params: { theme: '가을 여행', action: 'save' } }]
        })
    });

    assert.equal(result.route, 'agent');
    assert.equal(result.actions.length, 1);
    assert.match(result.reply.recommendation, /키워드는 선택 사항/);
});
