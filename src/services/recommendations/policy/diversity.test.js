const test = require('node:test');
const assert = require('node:assert/strict');
const { selectDiverseCandidates, similarity } = require('./diversity');

const NOW = '2026-08-24T12:00:00.000Z';

function entry(id, kind, score, topic = '') {
    return {
        candidate: {
            candidate_id: `candidate:${id}`, kind, title: topic || id,
            metadata: topic ? { topic } : {}
        },
        score,
        breakdown: {},
        policy_id: 'proactive-guidance-ranking-v1',
        policy_version: 1
    };
}

function policyContext(history = []) {
    return { history: { known: true, items: history } };
}

test('reserves one candidate per kind before score fill and ranks selected by score', () => {
    const input = [
        entry('content-1', 'content_opportunity', 0.95, 'AI 자동화'),
        entry('content-2', 'content_opportunity', 0.90, '제주 여행'),
        entry('content-3', 'content_opportunity', 0.85, '건강 식단'),
        entry('recovery', 'recovery_action', 0.70),
        entry('setup', 'setup_guidance', 0.60),
        entry('workflow', 'workflow_hint', 0.55),
        entry('commerce', 'commerce_opportunity', 0.50, '오디세이 G7 모니터')
    ];
    const result = selectDiverseCandidates(input, { now: NOW, policyContext: policyContext() });
    assert.equal(result.selected.length, 6);
    assert.deepEqual(new Set(result.selected.map((item) => item.candidate.kind)), new Set([
        'content_opportunity', 'recovery_action', 'setup_guidance', 'workflow_hint', 'commerce_opportunity'
    ]));
    assert.deepEqual(result.selected.map((item) => item.rank), [1, 2, 3, 4, 5, 6]);
    assert.equal(result.deferred.find((item) => item.candidate.candidate_id === 'candidate:content-3').deferred_reason, 'kind_limit');
});

test('similar content candidates are deferred with the selected identity', () => {
    assert.equal(similarity('아이폰 18 프로 출시 정보', '아이폰 18 프로 출시'), 0.8);
    const result = selectDiverseCandidates([
        entry('first', 'content_opportunity', 0.8, '아이폰 18 프로 출시 정보'),
        entry('similar', 'content_opportunity', 0.7, '아이폰 18 프로 출시')
    ], { now: NOW, policyContext: policyContext() });
    assert.equal(result.selected.length, 1);
    assert.equal(result.deferred[0].deferred_reason, 'similar_candidate');
    assert.equal(result.deferred[0].similar_to, 'candidate:first');
});

test('selection is deterministic when input order changes', () => {
    const input = [
        entry('a', 'content_opportunity', 0.8, '주제 알파'),
        entry('b', 'commerce_opportunity', 0.7, '상품 베타'),
        entry('c', 'workflow_hint', 0.6)
    ];
    const first = selectDiverseCandidates(input, { now: NOW, policyContext: policyContext() });
    const second = selectDiverseCandidates([...input].reverse(), { now: NOW, policyContext: policyContext() });
    assert.deepEqual(first.selected.map((item) => [item.candidate.candidate_id, item.rank]),
        second.selected.map((item) => [item.candidate.candidate_id, item.rank]));
});

test('rolling materialization cap reduces capacity independently from delivery', () => {
    const history = Array.from({ length: 9 }, (_, index) => ({
        recommendation_id: `rec-${index}`, available_at: `2026-08-24T0${index}:00:00.000Z`
    }));
    const result = selectDiverseCandidates([
        entry('a', 'content_opportunity', 0.8, '주제 알파'),
        entry('b', 'commerce_opportunity', 0.7, '상품 베타')
    ], { now: NOW, policyContext: policyContext(history) });
    assert.equal(result.selected.length, 1);
    assert.equal(result.deferred[0].deferred_reason, 'daily_cap');
    assert.equal(result.stats.daily_remaining_before_run, 1);
});

test('explicit user discovery bypasses only the rolling daily cap', () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
        recommendation_id: `rec-${index}`, available_at: '2026-08-24T11:00:00.000Z'
    }));
    const result = selectDiverseCandidates([
        entry('a', 'content_opportunity', 0.8, '주제 알파'),
        entry('b', 'content_opportunity', 0.7, '주제 베타'),
        entry('c', 'content_opportunity', 0.6, '주제 감마')
    ], {
        now: NOW,
        policyContext: policyContext(history),
        perRunLimit: 3,
        perKindLimit: 3,
        dailyLimitEnabled: false
    });
    assert.equal(result.selected.length, 3);
    assert.equal(result.stats.daily_limit_enabled, false);
    assert.equal(result.stats.daily_remaining_before_run, null);
});

test('per-run limit defers excess candidates with a distinct reason', () => {
    const result = selectDiverseCandidates([
        entry('a', 'content_opportunity', 0.8, '주제 알파'),
        entry('b', 'commerce_opportunity', 0.7, '상품 베타')
    ], { now: NOW, policyContext: policyContext(), perRunLimit: 1 });
    assert.equal(result.selected.length, 1);
    assert.equal(result.deferred[0].deferred_reason, 'run_limit');
});
