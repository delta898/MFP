const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendationPolicyEvaluator } = require('./evaluator');

const NOW = '2026-08-24T15:00:00.000Z';

function candidate(id, overrides = {}) {
    return {
        candidate_id: `candidate:${id}`, kind: 'content_opportunity', producer_id: 'content-opportunity-v1',
        owner_user_id: 'owner-local', title: `후보 ${id}`, summary: `요약 ${id}`, explanation: `근거 ${id}`,
        evidence: [{
            evidence_id: `evidence:${id}`, kind: 'owner_activity', stage: 'saved', strength: 'medium',
            summary: '저장 활동', observed_at: '2026-08-24T14:00:00.000Z', expires_at: null,
            source_ref: { kind: 'artifact', id: `topic:${id}`, label: '', provider_id: '', transport: '', url: '', timestamp: '2026-08-24T14:00:00.000Z' },
            features: {}
        }],
        handoff: null, dedupe_key: `content:${id}`, created_at: '2026-08-24T14:00:00.000Z',
        expires_at: '2026-08-25T14:00:00.000Z', metadata: { topic: id }, ...overrides
    };
}

function policyContext(overrides = {}) {
    return {
        owner_user_id: 'owner-local', observed_at: NOW,
        capabilities: { known: true, ids: [] }, presentation: { known: true, surfaces: [] },
        license: { known: true, features: { cmd_shopping: false } },
        settings: { known: true, values: {} },
        quota: { publishing: { known: true, unlimited: false, remaining: 0 } },
        history: { known: true, items: [] }, diagnostics: [], ...overrides
    };
}

function evaluator(options = {}) {
    return createRecommendationPolicyEvaluator({
        evaluationIdFactory: () => 'policy_eval:test',
        contextCollector: { async collect() { return policyContext(options.context); } },
        materializer: options.materializer,
        rankingOptions: options.rankingOptions
    });
}

test('materializes only eligible ranked candidates with canonical policy snapshots', async () => {
    const calls = [];
    const result = await evaluator({
        materializer: { async materialize(item, policy, context) {
            calls.push({ item, policy, context });
            return {
                recommendation: { recommendation_id: `rec:${item.candidate_id}`, candidate: item, policy },
                persisted: true,
                deduplicated: false
            };
        } }
    }).evaluate({ candidates: [
        candidate('content'),
        candidate('commerce', { kind: 'commerce_opportunity', producer_id: 'commerce-opportunity-v1' })
    ] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].item.candidate_id, 'candidate:content');
    assert.equal(calls[0].policy.eligible, true);
    assert.equal(calls[0].policy.rank, 1);
    assert.equal(calls[0].context.operation_id, 'policy_eval:test');
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.suppressed[0].policy.suppression_reasons[0], 'license_feature_disabled:cmd_shopping');
});

test('ranking deferrals become canonical suppressed policy decisions and are not materialized', async () => {
    let calls = 0;
    const result = await evaluator({
        rankingOptions: { perRunLimit: 1 },
        materializer: { async materialize(item, policy) {
            calls += 1;
            return { recommendation: { candidate: item, policy }, persisted: true };
        } }
    }).evaluate({ candidates: [candidate('a'), candidate('b')] });
    assert.equal(calls, 1);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].policy.eligible, false);
    assert.equal(result.suppressed[0].policy.rank, 0);
    assert.equal(result.suppressed[0].policy.suppression_reasons[0], 'ranking:run_limit');
});

test('duplicate candidate or dedupe identities are suppressed deterministically', async () => {
    const result = await evaluator({
        materializer: { async materialize(item, policy) {
            return { recommendation: { candidate: item, policy }, persisted: true };
        } }
    }).evaluate({ candidates: [
        candidate('b', { dedupe_key: 'content:same' }),
        candidate('a', { dedupe_key: 'content:same' })
    ] });
    assert.deepEqual(result.recommendations.map((item) => item.candidate_id), ['candidate:a']);
    assert.equal(result.suppressed[0].candidate_id, 'candidate:b');
    assert.deepEqual(result.suppressed[0].policy.suppression_reasons, ['evaluation_duplicate']);
});

test('explicit discovery may rotate a previously shown candidate without weakening other cooldowns', async () => {
    const materialized = [];
    const policyEvaluator = evaluator({
        context: { history: { known: true, items: [{
            dedupe_key: 'content:again', status: 'rotated',
            last_event_at: '2026-08-24T14:30:00.000Z',
            expires_at: '2026-08-25T14:00:00.000Z'
        }] } },
        materializer: { async materialize(item, policy) {
            materialized.push(item.candidate_id);
            return { recommendation: { candidate: item, policy }, persisted: true };
        } }
    });
    const suppressed = await policyEvaluator.evaluate({ candidates: [candidate('again')] });
    assert.deepEqual(suppressed.recommendations, []);

    const rotated = await policyEvaluator.evaluate(
        { candidates: [candidate('again')] },
        {},
        { eligibilityOptions: { cooldowns: { rotated: 0 } } }
    );
    assert.equal(rotated.recommendations.length, 1);
    assert.deepEqual(materialized, ['candidate:again']);
});

test('one materialization failure is isolated without exception leakage', async () => {
    const result = await evaluator({
        materializer: { async materialize(item, policy) {
            if (item.candidate_id === 'candidate:a') throw new Error('secret write failure');
            return { recommendation: { candidate: item, policy }, persisted: false, reason: 'store_unavailable' };
        } }
    }).evaluate({ candidates: [candidate('a'), candidate('b')] });
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.volatile.length, 1);
    assert.deepEqual(result.diagnostics, [{ candidate_id: 'candidate:a', code: 'MATERIALIZATION_FAILED' }]);
    assert.doesNotMatch(JSON.stringify(result), /secret write failure/);
});

test('missing materializer returns diagnostics and never claims a Recommendation was created', async () => {
    const result = await evaluator({}).evaluate({ candidates: [candidate('a')] });
    assert.deepEqual(result.recommendations, []);
    assert.deepEqual(result.volatile, []);
    assert.deepEqual(result.diagnostics, [{ candidate_id: 'candidate:a', code: 'MATERIALIZER_UNAVAILABLE' }]);
});

test('invalid raw candidates are bounded and never reach materialization', async () => {
    let calls = 0;
    const result = await evaluator({
        materializer: { async materialize() { calls += 1; } }
    }).evaluate({ candidates: [{ candidate_id: 'bad candidate', api_key: 'must-not-escape' }] });
    assert.equal(calls, 0);
    assert.equal(result.suppressed[0].policy.suppression_reasons[0], 'candidate_invalid');
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape|api_key/);
});
