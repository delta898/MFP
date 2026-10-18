const test = require('node:test');
const assert = require('node:assert/strict');
const {
    routeTelegramMessage,
    tryParseDeterministicEnvelope
} = require('./agent-parser');

test('Telegram natural language is classified into one unified route contract', async () => {
    const responses = [
        JSON.stringify({ route: 'reply', reply: { text: '안녕하세요!', recommendation: '글감도 함께 정리할 수 있어요.' } }),
        JSON.stringify({
            route: 'legacy',
            legacy_actions: [{ action: 'register_topic', params: { theme: '제주 산책' } }],
            meta: { explicit_params: ['theme'] }
        }),
        JSON.stringify({
            route: 'agent',
            actions: [{ id: 'act_1', type: 'content.generate', domain: 'content.idea', name: 'suggest', params: { limit: 1 } }]
        }),
        JSON.stringify({ route: 'legacy', legacy_actions: [{ action: 'delete_everything', params: {} }] }),
        JSON.stringify({ route: 'legacy', legacy_actions: [{ action: 'update_config', params: { config_updates: { ADMIN_MODE: true } } }] })
    ];
    let calls = 0;
    const context = {
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

    const legacy = await routeTelegramMessage('제주 산책 글감 저장해줘', context);
    assert.equal(legacy.route, 'legacy');
    assert.equal(legacy.legacy_actions[0].action, 'register_topic');
    assert.deepEqual(legacy.meta.explicit_params, ['theme']);

    const agent = await routeTelegramMessage('글감 아이디어 추천해줘', context);
    assert.equal(agent.route, 'agent');
    assert.equal(agent.actions[0].domain, 'content.idea');

    const invalidLegacy = await routeTelegramMessage('모든 데이터 삭제해줘', context);
    assert.equal(invalidLegacy.route, 'unsupported');
    assert.deepEqual(invalidLegacy.legacy_actions, []);
    const invalidConfig = await routeTelegramMessage('관리자 모드 켜줘', context);
    assert.equal(invalidConfig.route, 'unsupported');
    assert.deepEqual(invalidConfig.legacy_actions, []);
    assert.equal(calls, 5);

    const deterministic = tryParseDeterministicEnvelope('지금 몇시야?', { conversationId: 'telegram:1' });
    assert.equal(deterministic.route, 'agent');
});
