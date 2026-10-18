const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendationProducerRunner } = require('./runtime');

const NOW = '2026-08-23T12:00:00.000Z';

function candidate(id, producerId, owner = 'owner-local', overrides = {}) {
    return {
        candidate_id: `candidate:${id}`,
        kind: 'workflow_hint',
        producer_id: producerId,
        owner_user_id: owner,
        title: `안내 ${id}`,
        summary: `요약 ${id}`,
        explanation: `시스템 상태 근거 ${id}`,
        evidence: [{
            evidence_id: `evidence:${id}`,
            kind: 'system_state',
            stage: 'observed',
            strength: 'medium',
            summary: `관찰 ${id}`,
            observed_at: NOW,
            expires_at: '2026-08-24T12:00:00.000Z',
            source_ref: {
                kind: 'setting',
                id: `setting:${id}`,
                label: '설정 상태',
                provider_id: '',
                transport: '',
                url: '',
                timestamp: NOW
            },
            features: {}
        }],
        handoff: null,
        dedupe_key: `workflow:${id}`,
        created_at: NOW,
        expires_at: '2026-08-24T12:00:00.000Z',
        metadata: {},
        ...overrides
    };
}

function producer(id, produce, kinds = ['workflow_hint']) {
    return { id, version: 1, kinds, produce };
}

test('producer runtime preserves declaration order across concurrent execution', async () => {
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:ordered',
        producers: [
            producer('slow-producer-v1', async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { candidates: [candidate('slow', 'slow-producer-v1')] };
            }),
            producer('fast-producer-v1', async () => ({
                candidates: [candidate('fast', 'fast-producer-v1')]
            }))
        ]
    });

    const result = await runner.run({}, { owner_user_id: 'owner-local' });
    assert.deepEqual(result.candidates.map((item) => item.candidate_id), ['candidate:slow', 'candidate:fast']);
    assert.deepEqual(result.diagnostics.completed_producer_ids, ['slow-producer-v1', 'fast-producer-v1']);
    assert.deepEqual(result.diagnostics.failed, []);
    assert.equal('policy' in result.candidates[0], false);
});

test('one producer failure is isolated without exposing exception text', async () => {
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:failure',
        producers: [
            producer('failed-producer-v1', async () => {
                throw new Error('secret upstream response must not escape');
            }),
            producer('healthy-producer-v1', async () => ({
                candidates: [candidate('healthy', 'healthy-producer-v1')]
            }))
        ]
    });

    const result = await runner.run({ owner_user_id: 'owner-local' });
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.diagnostics.failed, [{ producer_id: 'failed-producer-v1', code: 'PRODUCER_FAILED' }]);
    assert.doesNotMatch(JSON.stringify(result), /secret upstream response/);
});

test('missing or conflicting owner context short-circuits all producers', async () => {
    let calls = 0;
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:owner',
        producers: [producer('owner-producer-v1', async () => {
            calls += 1;
            return { candidates: [] };
        })]
    });

    const missing = await runner.run();
    const conflict = await runner.run(
        { owner_user_id: 'owner-a' },
        { memory: { owner_memory: { owner_user_id: 'owner-b' } } }
    );
    assert.equal(calls, 0);
    assert.equal(missing.diagnostics.failed[0].code, 'OWNER_CONTEXT_MISSING');
    assert.equal(conflict.diagnostics.failed[0].code, 'OWNER_CONTEXT_CONFLICT');
});

test('invalid result, producer, kind, owner and contract candidates are isolated', async () => {
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:invalid',
        producers: [
            producer('shape-producer-v1', async () => ({ candidates: [], policy: {} })),
            producer('invalid-producer-v1', async () => ({ candidates: [
                candidate('producer', 'another-producer'),
                candidate('kind', 'invalid-producer-v1', 'owner-local', { kind: 'content_opportunity' }),
                candidate('owner', 'invalid-producer-v1', 'another-owner'),
                candidate('contract', 'invalid-producer-v1', 'owner-local', { evidence: [] })
            ] }))
        ]
    });

    const result = await runner.run({ owner_user_id: 'owner-local' });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.diagnostics.invalid.map((item) => item.code), [
        'PRODUCER_RESULT_INVALID',
        'CANDIDATE_PRODUCER_MISMATCH',
        'CANDIDATE_KIND_UNDECLARED',
        'CANDIDATE_OWNER_MISMATCH',
        'CANDIDATE_CONTRACT_INVALID'
    ]);
});

test('duplicate identities and configured bounds are deterministic', async () => {
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:bounds',
        maxCandidatesPerProducer: 3,
        maxCandidatesPerRun: 2,
        producers: [producer('bounded-producer-v1', async () => ({ candidates: [
            candidate('first', 'bounded-producer-v1'),
            candidate('first', 'bounded-producer-v1', 'owner-local', { dedupe_key: 'workflow:another' }),
            candidate('same-dedupe', 'bounded-producer-v1', 'owner-local', { dedupe_key: 'workflow:first' }),
            candidate('truncated', 'bounded-producer-v1')
        ] }))]
    });

    const result = await runner.run({ owner_user_id: 'owner-local' });
    assert.deepEqual(result.candidates.map((item) => item.candidate_id), ['candidate:first']);
    assert.equal(result.diagnostics.duplicate_count, 2);
    assert.equal(result.diagnostics.truncated_count, 1);
});

test('total output bound applies across producers without changing declaration order', async () => {
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:total-bound',
        maxCandidatesPerRun: 2,
        producers: [
            producer('first-producer-v1', async () => ({ candidates: [
                candidate('first-a', 'first-producer-v1'),
                candidate('first-b', 'first-producer-v1')
            ] })),
            producer('second-producer-v1', async () => ({ candidates: [
                candidate('second-a', 'second-producer-v1')
            ] }))
        ]
    });

    const result = await runner.run({ owner_user_id: 'owner-local' });
    assert.deepEqual(result.candidates.map((item) => item.candidate_id), [
        'candidate:first-a',
        'candidate:first-b'
    ]);
    assert.equal(result.diagnostics.truncated_count, 1);
});

test('producer declarations require unique ids, versions, kinds and functions', () => {
    assert.throws(() => createRecommendationProducerRunner({ producers: [
        producer('same-v1', async () => ({ candidates: [] })),
        producer('same-v1', async () => ({ candidates: [] }))
    ] }), /unique/);
    assert.throws(() => createRecommendationProducerRunner({ producers: [{
        id: 'bad id', version: 1, kinds: ['workflow_hint'], produce() {}
    }] }), /id/);
    assert.throws(() => createRecommendationProducerRunner({ producers: [{
        id: 'bad-version', version: 0, kinds: ['workflow_hint'], produce() {}
    }] }), /version/);
    assert.throws(() => createRecommendationProducerRunner({ producers: [{
        id: 'bad-kind', version: 1, kinds: ['unknown'], produce() {}
    }] }), /kinds/);
});
