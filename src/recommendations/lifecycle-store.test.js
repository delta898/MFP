const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendation } = require('./core/test-fixtures');
const {
    VolatileRecommendationRepository,
    RecommendationLifecycleStore,
    createVolatileRecommendationStore
} = require('./lifecycle-store');

async function createdStore(overrides = {}, context = {}) {
    const store = createVolatileRecommendationStore({ reason: 'test' });
    const recommendation = createRecommendation(overrides);
    const result = await store.createRecommendation(recommendation, { operation_id: 'create-1', ...context });
    return { store, recommendation: result.recommendation, result };
}

test('create는 recommendation과 created event를 저장한다', async () => {
    const { store, result } = await createdStore();
    assert.equal(result.deduplicated, false);
    assert.match(result.event_id, /^recommendation_event:/);
    assert.equal((await store.listAvailableRecommendations('owner-local', { now: '2026-08-23T02:00:00.000Z' })).length, 1);
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'volatile', reason: 'test' });
});

test('같은 recommendation id와 active dedupe key 생성을 중복 제거한다', async () => {
    const { store, recommendation } = await createdStore();
    const sameId = await store.createRecommendation(recommendation, { operation_id: 'create-retry' });
    assert.equal(sameId.deduplicated, true);

    const other = createRecommendation({ recommendation_id: 'recommendation:other' });
    const sameOpportunity = await store.createRecommendation(other, { operation_id: 'create-other' });
    assert.equal(sameOpportunity.deduplicated, true);
    assert.equal(sameOpportunity.recommendation.recommendation_id, recommendation.recommendation_id);
});

test('terminal recommendation 이후에는 같은 dedupe key의 새 opportunity를 허용한다', async () => {
    const { store, recommendation } = await createdStore();
    await store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.dismissed',
        operation_id: 'dismiss-1',
        occurred_at: '2026-08-23T03:00:00.000Z'
    });
    const other = createRecommendation({ recommendation_id: 'recommendation:other' });
    const result = await store.createRecommendation(other, { operation_id: 'create-other' });
    assert.equal(result.deduplicated, false);
    assert.equal(result.recommendation.recommendation_id, 'recommendation:other');
});

test('transition retry는 상태가 바뀐 뒤에도 event id로 중복 제거한다', async () => {
    const { store, recommendation } = await createdStore();
    const command = {
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.snoozed',
        operation_id: 'snooze-1',
        occurred_at: '2026-08-23T03:00:00.000Z',
        snoozed_until: '2026-08-23T04:00:00.000Z'
    };
    const first = await store.transitionRecommendation(command);
    const retry = await store.transitionRecommendation(command);
    assert.equal(first.deduplicated, false);
    assert.equal(retry.deduplicated, true);
    assert.equal(retry.recommendation.status, 'snoozed');
});

test('owner가 다르면 id 조회와 dedupe가 격리된다', async () => {
    const { store, recommendation } = await createdStore();
    assert.equal(await store.getRecommendation('owner-other', recommendation.recommendation_id), null);
    assert.equal(await store.findActiveByDedupeKey('owner-other', recommendation.candidate.dedupe_key, recommendation.available_at), null);
});

test('민감 metadata와 잘못된 transition은 event 저장 전에 거부한다', async () => {
    const { store, recommendation } = await createdStore();
    await assert.rejects(store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.opened',
        operation_id: 'open-1',
        occurred_at: '2026-08-23T03:00:00.000Z',
        metadata: { api_key: 'secret' }
    }), /secret/);
    await assert.rejects(store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.action_completed',
        operation_id: 'complete-1',
        occurred_at: '2026-08-23T03:00:00.000Z'
    }), /허용되지/);
});

test('feedback event는 strict enum을 요구하고 projection state를 유지한다', async () => {
    const { store, recommendation } = await createdStore();
    await assert.rejects(store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.feedback_recorded',
        operation_id: 'feedback-bad',
        occurred_at: '2026-08-23T03:00:00.000Z',
        feedback: 'accepted'
    }), /helpful/);
    const result = await store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.feedback_recorded',
        operation_id: 'feedback-good',
        occurred_at: '2026-08-23T03:00:00.000Z',
        feedback: 'helpful'
    });
    assert.equal(result.recommendation.status, 'available');
});

test('ordinary list는 만료 상태를 쓰지 않고 노출만 차단한다', async () => {
    const { store, recommendation } = await createdStore();
    assert.equal((await store.listAvailableRecommendations('owner-local', { now: '2026-08-25T00:00:00.000Z' })).length, 0);
    assert.equal((await store.getRecommendation('owner-local', recommendation.recommendation_id)).status, 'available');
});

test('reconciliation은 snooze 재활성화와 만료를 명시적 event로 처리한다', async () => {
    const { store, recommendation } = await createdStore();
    await store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.snoozed',
        operation_id: 'snooze-1',
        occurred_at: '2026-08-23T02:00:00.000Z',
        snoozed_until: '2026-08-23T03:00:00.000Z'
    });
    const reactivated = await store.reconcileDueRecommendations('owner-local', { now: '2026-08-23T04:00:00.000Z' });
    assert.equal(reactivated[0].recommendation.status, 'available');
    const expired = await store.reconcileDueRecommendations('owner-local', { now: '2026-08-25T00:00:00.000Z' });
    assert.equal(expired[0].recommendation.status, 'expired');
});

test('reconciliation은 action_in_progress를 자동 만료하지 않는다', async () => {
    const { store, recommendation } = await createdStore();
    await store.transitionRecommendation({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.action_started',
        operation_id: 'start-1',
        occurred_at: '2026-08-23T03:00:00.000Z'
    });
    assert.deepEqual(await store.reconcileDueRecommendations('owner-local', {
        now: '2026-08-25T00:00:00.000Z'
    }), []);
    assert.equal((await store.getRecommendation('owner-local', recommendation.recommendation_id)).status, 'action_in_progress');
});

test('동시 transition은 recommendation별 queue에서 순서화된다', async () => {
    const repository = new VolatileRecommendationRepository({ reason: 'test' });
    const originalSave = repository.saveEventAndProjection.bind(repository);
    repository.saveEventAndProjection = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return originalSave(...args);
    };
    const store = new RecommendationLifecycleStore({ repository });
    const recommendation = createRecommendation();
    await store.createRecommendation(recommendation, { operation_id: 'create-1' });
    const started = store.transitionRecommendation({
        owner_user_id: 'owner-local', recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.action_started', operation_id: 'start-1', occurred_at: '2026-08-23T03:00:00.000Z'
    });
    const completed = store.transitionRecommendation({
        owner_user_id: 'owner-local', recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.action_completed', operation_id: 'complete-1', occurred_at: '2026-08-23T03:01:00.000Z'
    });
    await Promise.all([started, completed]);
    assert.equal((await store.getRecommendation('owner-local', recommendation.recommendation_id)).status, 'action_completed');
});
