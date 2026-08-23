const test = require('node:test');
const assert = require('node:assert/strict');
const {
    COMPONENT_WEIGHTS,
    compareScoredCandidates,
    scoreRecommendationCandidate,
    timeRemainingRatio
} = require('./scoring');

const NOW = '2026-08-24T12:00:00.000Z';

function evidence(overrides = {}) {
    return {
        evidence_id: 'evidence:score:1', kind: 'owner_activity', stage: 'saved', strength: 'medium',
        summary: '근거', observed_at: '2026-08-24T10:00:00.000Z', expires_at: null,
        source_ref: { kind: 'artifact', id: 'topic:1', label: '', provider_id: '', transport: '', url: '', timestamp: '2026-08-24T10:00:00.000Z' },
        features: {}, ...overrides
    };
}

function candidate(overrides = {}) {
    return {
        candidate_id: 'candidate:score:1', kind: 'content_opportunity', title: 'AI 자동화',
        created_at: '2026-08-24T10:00:00.000Z', expires_at: '2026-08-25T10:00:00.000Z',
        evidence: [evidence()], handoff: null, metadata: {}, ...overrides
    };
}

test('score is canonical, bounded and fully explained by weighted components', () => {
    const result = scoreRecommendationCandidate(candidate(), { now: NOW, eligibility: { eligible: true } });
    assert.equal(result.policy_id, 'proactive-guidance-ranking-v1');
    assert.equal(result.policy_version, 1);
    assert.equal(result.score >= 0 && result.score <= 1, true);
    assert.deepEqual(Object.keys(result.breakdown.components), Object.keys(COMPONENT_WEIGHTS));
    const sum = Object.values(result.breakdown.components).reduce((total, item) => total + item.contribution, 0);
    assert.equal(Math.abs(result.score - sum) < 0.00001, true);
});

test('explicit owner evidence outranks weak external-only grounding', () => {
    const explicit = scoreRecommendationCandidate(candidate({ evidence: [evidence({ strength: 'explicit', stage: 'observed' })] }), { now: NOW });
    const external = scoreRecommendationCandidate(candidate({ evidence: [evidence({
        kind: 'knowledge', strength: 'weak', stage: 'observed', expires_at: '2026-08-24T13:00:00.000Z',
        source_ref: { kind: 'knowledge', id: 'trend:1', provider_id: 'provider', transport: 'builtin_api', timestamp: '2026-08-24T10:00:00.000Z' }
    })] }), { now: NOW });
    assert.equal(explicit.score > external.score, true);
});

test('operational urgency is bounded and affects otherwise equivalent candidates', () => {
    const recovery = scoreRecommendationCandidate(candidate({ kind: 'recovery_action' }), { now: NOW });
    const content = scoreRecommendationCandidate(candidate({ kind: 'content_opportunity' }), { now: NOW });
    assert.equal(recovery.breakdown.components.operational_urgency.value, 1);
    assert.equal(recovery.score > content.score, true);
});

test('freshness uses remaining candidate and expiring evidence lifetime', () => {
    assert.equal(timeRemainingRatio('2026-08-24T10:00:00.000Z', '2026-08-24T14:00:00.000Z', NOW), 0.5);
    const fresh = scoreRecommendationCandidate(candidate({
        created_at: '2026-08-24T11:00:00.000Z', expires_at: '2026-08-25T11:00:00.000Z'
    }), { now: NOW });
    const nearlyExpired = scoreRecommendationCandidate(candidate({
        created_at: '2026-08-23T12:00:00.000Z', expires_at: '2026-08-24T12:10:00.000Z'
    }), { now: NOW });
    assert.equal(fresh.score > nearlyExpired.score, true);
});

test('breakdown never copies raw evidence features or text', () => {
    const result = scoreRecommendationCandidate(candidate({ evidence: [evidence({
        summary: 'must-not-escape', features: { api_key: 'must-not-escape' }
    })] }), { now: NOW });
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape|api_key/);
});

test('stable comparison uses kind then candidate identity for exact score ties', () => {
    const entries = [
        { candidate: candidate({ candidate_id: 'candidate:z', kind: 'content_opportunity' }), score: 0.5 },
        { candidate: candidate({ candidate_id: 'candidate:b', kind: 'recovery_action' }), score: 0.5 },
        { candidate: candidate({ candidate_id: 'candidate:a', kind: 'recovery_action' }), score: 0.5 }
    ].sort(compareScoredCandidates);
    assert.deepEqual(entries.map((item) => item.candidate.candidate_id), ['candidate:a', 'candidate:b', 'candidate:z']);
});
