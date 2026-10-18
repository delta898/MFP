const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlanFromActions } = require('./planner-rules');

test('planner rules module loads and builds plans for content ideas', () => {
    const plan = buildPlanFromActions({
        message_id: 'message-1',
        actions: [{
            id: 'action-1',
            type: 'content.generate',
            domain: 'content.idea',
            name: 'suggest',
            params: {},
            requires_confirmation: false
        }],
        routing: { content_ideas: ['local-memory'] }
    });

    assert.equal(plan.steps.length, 1);
    assert.deepEqual(plan.steps[0].preconditions, [{
        type: 'knowledge_provider_available',
        route: 'content_ideas',
        provider_ids: ['local-memory']
    }]);
});
