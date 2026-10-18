const test = require('node:test');
const assert = require('node:assert/strict');
const { recordRecommendationFeedback } = require('./recommendation-feedback-adapter');

test('helpful records observation without lifecycle state change command', async () => {
    const commands = [];
    const result = await recordRecommendationFeedback({
        eventStore: { async transitionRecommendation(command) { commands.push(command); return { recommendation: { status: 'available' } }; } },
        owner_user_id: 'owner-local', recommendation_id: 'rec_1', feedback: 'helpful', operation_id: 'callback-1', occurred_at: '2026-08-23T03:00:00.000Z', source: 'telegram'
    });
    assert.equal(result.recorded, true);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].event_type, 'recommendation.feedback_recorded');
});

test('not_helpful records feedback and then dismisses', async () => {
    const commands = [];
    await recordRecommendationFeedback({
        eventStore: { async transitionRecommendation(command) { commands.push(command); return {}; } },
        owner_user_id: 'owner-local', recommendation_id: 'rec_1', feedback: 'not_helpful', operation_id: 'callback-1', occurred_at: '2026-08-23T03:00:00.000Z'
    });
    assert.deepEqual(commands.map((item) => item.event_type), ['recommendation.feedback_recorded', 'recommendation.dismissed']);
});
