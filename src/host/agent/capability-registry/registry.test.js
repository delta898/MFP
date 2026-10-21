const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapabilityRegistry } = require('./registry');

function createRegistry(agentActionProviders = []) {
    return createCapabilityRegistry({
        modelConfiguration: { resolveChatModelSettings: () => ({ resolved: {}, source: 'writing' }) },
        agentActionProviders
    });
}

test('capability registry composes Application-owned Agent action providers without parser mappings', async () => {
    const applicationAction = {
        id: 'weather.forecast',
        type: 'weather.query',
        domain: 'weather',
        effect: 'read_only',
        confirmPolicy: 'never',
        agentExposure: {
            kind: 'application_workflow',
            title: '날씨 확인',
            description: '지정한 위치의 날씨를 확인합니다.',
            useWhen: '사용자가 특정 위치의 날씨나 예보를 묻습니다.',
            avoidWhen: '사용자가 알림 예약이나 과거 기상 기록을 요청합니다.',
            inputSchema: {
                type: 'object',
                properties: { location: { type: 'string', minLength: 1 } },
                required: ['location'],
                additionalProperties: false
            },
            outputDescription: '위치의 현재 날씨와 예보를 반환합니다.',
            examples: ['서울 날씨 알려줘']
        },
        validate(params = {}) {
            const location = String(params.location || '').trim();
            return { ok: Boolean(location), errors: location ? [] : ['위치가 필요합니다.'], normalizedParams: { location } };
        },
        async preview(params = {}) {
            return { summary: `${params.location}의 날씨를 확인합니다.` };
        },
        async execute(params = {}) {
            return { success: true, message: `${params.location} 날씨`, data: { location: params.location }, sideEffects: [] };
        }
    };
    const hiddenAction = {
        id: 'agent.internal.help', type: 'agent.query', domain: 'agent.internal', name: 'help',
        effect: 'read_only', confirmPolicy: 'never',
        agentExposure: {
            discoverable: false, title: '내부 도움말', description: '내부 안내를 렌더링합니다.',
            useWhen: '고정된 help 요청일 때 사용합니다.', avoidWhen: '일반 실행 요청에는 사용하지 않습니다.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputDescription: '안내를 반환합니다.'
        },
        validate: () => ({ ok: true, errors: [], normalizedParams: {} }),
        preview: async () => ({}), execute: async () => ({ success: true })
    };
    const registry = createRegistry([
        () => [applicationAction, hiddenAction]
    ]);

    assert.equal(registry.get('weather.forecast').name, 'forecast');
    assert.equal(registry.get('weather.forecast').id, 'weather.forecast');
    assert.equal(registry.listAgentActions().some((item) => item.id === 'weather.forecast'), true);
    assert.equal(registry.listAgentActions().some((item) => item.id === 'agent.internal.help'), false);
    assert.equal(registry.getAgentAction('agent.internal.help').id, 'agent.internal.help');
    assert.deepEqual(await registry.validateAction({ action_id: 'weather.forecast', params: { location: '서울' } }), {
        ok: true,
        errors: [],
        normalizedParams: { location: '서울' }
    });
    const result = await registry.executeAction({ action_id: 'weather.forecast', params: { location: '서울' } });
    assert.equal(result.data.location, '서울');
});

test('capability registry rejects malformed action providers during composition', () => {
    assert.throws(() => createRegistry([{ createAgentActions: () => ({}) }]), /must return an array/);
    assert.throws(() => createRegistry([{}]), /must be a function/);
    assert.throws(() => createRegistry([() => [{ id: 'weather.different', domain: 'weather', name: 'forecast' }]]), /consistent canonical id/);
});

test('capability registry rejects incomplete or invalid Agent action contracts at startup', () => {
    const base = {
        id: 'example.action',
        type: 'example.command',
        domain: 'example',
        name: 'action',
        effect: 'read_only',
        confirmPolicy: 'never',
        agentExposure: {
            title: '예시 기능',
            description: '예시 기능입니다.',
            useWhen: '예시 요청일 때 사용합니다.',
            avoidWhen: '다른 요청에는 사용하지 않습니다.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            outputDescription: '작업 결과를 반환합니다.'
        },
        validate: () => ({ ok: true, errors: [], normalizedParams: {} }),
        preview: async () => ({}),
        execute: async () => ({ success: true, message: '완료', data: {}, sideEffects: [] })
    };

    assert.throws(() => createRegistry([() => [{ ...base, agentExposure: { ...base.agentExposure, outputDescription: '' } }]]), /describe its result/);
    assert.throws(() => createRegistry([() => [{ ...base, agentExposure: { ...base.agentExposure, inputSchema: { type: 'unknown' } } }]]), /invalid inputSchema/);
    assert.throws(() => createRegistry([() => [{ ...base, agentExposure: { ...base.agentExposure, avoidWhen: '' } }]]), /when to use and avoid/);
    assert.throws(() => createRegistry([() => [{ ...base, effect: 'external_side_effect' }]]), /must require confirmation/);
});

test('capability registry validates shared input policy against the action schema', () => {
    const action = {
        id: 'example.options', type: 'example.command', domain: 'example', name: 'options',
        effect: 'read_only', confirmPolicy: 'never',
        agentExposure: {
            title: '예시', description: '예시입니다.', useWhen: '요청할 때', avoidWhen: '아닐 때',
            inputSchema: {
                type: 'object', properties: { subject: { type: 'string' }, category: { type: 'string' } },
                anyOf: [{ required: ['subject'] }], additionalProperties: false
            },
            inputPolicy: {
                subject: { kind: 'required', question: '주제를 알려주세요.' },
                category: { kind: 'optional', prompt: '카테고리를 지정할 수 있습니다.' }
            },
            outputDescription: '결과를 반환합니다.'
        },
        validate: () => ({ ok: true, errors: [], normalizedParams: {} }),
        preview: async () => ({}), execute: async () => ({ success: true })
    };

    assert.ok(createRegistry([() => [action]]).getAgentAction('example.options'));
    assert.throws(() => createRegistry([() => [{
        ...action, agentExposure: { ...action.agentExposure, inputPolicy: { missing: { kind: 'optional', prompt: '선택' } } }
    }]]), /unknown input missing/);
    assert.throws(() => createRegistry([() => [{
        ...action, agentExposure: { ...action.agentExposure, inputPolicy: { category: { kind: 'required', question: '필수' } } }
    }]]), /required by inputSchema/);
});
