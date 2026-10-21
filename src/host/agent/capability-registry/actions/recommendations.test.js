const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRecommendationCapabilities } = require('./recommendations');

test('recommendation action forwards bounded count and returns the service evidence', async () => {
    const calls = [];
    const [capability] = createAgentRecommendationCapabilities({
        recommendationRequestService: {
            async getRecommendations(input, context) {
                calls.push({ input, context });
                return { recommendations: [{ summary: '저장된 여행 글감을 보완해 보세요.', id: 'rec-1' }], knowledge: [{ kind: 'activity' }] };
            }
        }
    });
    const context = { user: { id: 'user-1' } };
    const validation = capability.validate({ limit: 20 });
    assert.deepEqual(validation.normalizedParams, { limit: 5 });
    assert.equal((await capability.preview(validation.normalizedParams)).after.limit, 5);

    const result = await capability.execute(validation.normalizedParams, context);
    assert.deepEqual(calls, [{ input: { limit: 5 }, context }]);
    assert.match(result.message, /저장된 여행 글감/);
    assert.equal(result.data.recommendations[0].id, 'rec-1');
    assert.deepEqual(result.data.knowledge, [{ kind: 'activity' }]);
    assert.deepEqual(result.sideEffects, []);
});

test('recommendation action reports no result and missing service without claiming work', async () => {
    const [emptyAction] = createAgentRecommendationCapabilities({
        recommendationRequestService: { async getRecommendations() { return { recommendations: [] }; } }
    });
    const empty = await emptyAction.execute({});
    assert.deepEqual(empty.data.recommendations, []);
    assert.match(empty.message, /추천이 없습니다/);

    const [unavailableAction] = createAgentRecommendationCapabilities();
    const unavailable = await unavailableAction.execute({});
    assert.deepEqual(unavailable.data.recommendations, []);
    assert.match(unavailable.message, /준비되지 않았습니다/);
});
