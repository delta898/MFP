const test = require('node:test');
const assert = require('node:assert/strict');
const { rankRecommendationCandidates } = require('./ranking');

function candidate(id, kind = 'content_opportunity') {
    return {
        candidate_id: `candidate:${id}`, kind, title: id, metadata: { topic: id }, handoff: null,
        created_at: '2026-08-24T10:00:00.000Z', expires_at: '2026-08-25T10:00:00.000Z',
        evidence: [{ kind: 'owner_activity', stage: 'saved', strength: 'medium' }]
    };
}

test('ranking scores only eligibility-approved candidates', () => {
    const result = rankRecommendationCandidates({
        policy_context: {
            observed_at: '2026-08-24T12:00:00.000Z',
            history: { known: true, items: [] }
        },
        entries: [
            { candidate: candidate('eligible'), eligibility: { eligible: true } },
            { candidate: candidate('blocked'), eligibility: { eligible: false, suppression_reasons: ['active_duplicate'] } }
        ]
    });
    assert.deepEqual(result.selected.map((item) => item.candidate.candidate_id), ['candidate:eligible']);
    assert.equal(result.stats.input_count, 1);
});
