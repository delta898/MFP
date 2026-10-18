const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createPendingWorkflowProducer } = require('./pending-workflow');

const NOW = '2026-08-24T03:00:00.000Z';

test('pending workflow emits one non-actionable candidate without confirmation details', async () => {
    const producer = createPendingWorkflowProducer();
    const result = await producer.produce({
        owner_user_id: 'owner-local',
        operational_state: {
            owner_user_id: 'owner-local', observed_at: NOW,
            pending_confirmations: [
                { id: 'confirmation-1', status: 'pending', created_at: '2026-08-24T01:00:00.000Z', params: { api_key: 'hidden' } },
                { id: 'confirmation-2', status: 'proposed', created_at: '2026-08-24T02:00:00.000Z', previews: ['secret'] },
                { id: 'confirmation-3', status: 'approved', created_at: '2026-08-24T02:30:00.000Z' }
            ]
        }
    });
    assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0];
    assert.equal(candidate.metadata.pending_count, 2);
    assert.equal(candidate.handoff, null);
    assert.deepEqual(validateRecommendationCandidate(candidate).errors, []);
    assert.doesNotMatch(JSON.stringify(candidate), /api_key|hidden|previews|secret/);
});

test('terminal-only or foreign-owner pending state produces no candidate', async () => {
    const producer = createPendingWorkflowProducer();
    const terminal = await producer.produce({
        owner_user_id: 'owner-local',
        operational_state: {
            owner_user_id: 'owner-local', observed_at: NOW,
            pending_confirmations: [{ id: 'confirmation-1', status: 'rejected', created_at: NOW }]
        }
    });
    const foreign = await producer.produce({
        owner_user_id: 'owner-local',
        operational_state: {
            owner_user_id: 'owner-other', observed_at: NOW,
            pending_confirmations: [{ id: 'confirmation-2', status: 'pending', created_at: NOW }]
        }
    });
    assert.deepEqual(terminal.candidates, []);
    assert.deepEqual(foreign.candidates, []);
});
