const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendation } = require('../../recommendations/core/test-fixtures');
const { createVolatileRecommendationStore } = require('../../recommendations/lifecycle-store');
const { createRecommendationCenterService, SNOOZE_MS } = require('./recommendation-center.service');

const NOW = '2026-08-23T03:00:00.000Z';

async function fixture() {
    const store = createVolatileRecommendationStore({ reason: 'test volatile' });
    store.getLocalOwnerIdentity = () => ({ owner_user_id: 'owner-local' });
    const primary = createRecommendation({
        recommendation_id: 'recommendation:center:primary',
        candidate: {
            ...createRecommendation().candidate,
            expires_at: '2026-08-26T00:00:00.000Z'
        },
        available_at: '2026-08-23T02:00:00.000Z',
        expires_at: '2026-08-26T00:00:00.000Z',
        last_event_at: '2026-08-23T02:00:00.000Z'
    });
    const secondary = createRecommendation({
        recommendation_id: 'recommendation:center:secondary',
        candidate: {
            ...createRecommendation().candidate,
            candidate_id: 'candidate:center:secondary',
            dedupe_key: 'center:secondary',
            title: '두 번째 추천',
            expires_at: '2026-08-26T00:00:00.000Z',
            handoff: null
        },
        available_at: '2026-08-23T01:00:00.000Z',
        expires_at: '2026-08-26T00:00:00.000Z',
        last_event_at: '2026-08-23T01:00:00.000Z'
    });
    await store.createRecommendation(primary, { operation_id: 'create-primary' });
    await store.createRecommendation(secondary, { operation_id: 'create-secondary' });
    const calls = [];
    const handoffService = {
        async prepare(input, context) {
            calls.push({ method: 'prepare', input, context });
            return { ok: true, status: 'presentation', recommendation_id: input.recommendationId, action: { type: 'presentation' } };
        },
        async decide(input, context) {
            calls.push({ method: 'decide', input, context });
            return { ok: true, status: input.decision === 'reject' ? 'rejected' : 'executed' };
        }
    };
    let operation = 0;
    const service = createRecommendationCenterService({
        eventStore: store,
        handoffService,
        now: () => new Date(NOW),
        operationIdFactory: () => `recommendation_ui:test:${++operation}`
    });
    return { service, store, calls, primary, secondary };
}

test('list는 local owner의 actionable recommendation만 public DTO로 정렬한다', async () => {
    const { service } = await fixture();
    const result = await service.list({ limit: 1 });
    assert.equal(result.count, 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].recommendation_id, 'recommendation:center:primary');
    assert.equal(result.items[0].owner_user_id, undefined);
    assert.equal(result.items[0].policy, undefined);
    assert.equal(result.items[0].action.capability_id, undefined);
    assert.equal(result.items[0].action.params, undefined);
    assert.deepEqual(result.store, { mode: 'volatile', reason: 'test volatile' });
});

test('빈 센터는 bounded refresh 평가 후 새 recommendation을 다시 조회한다', async () => {
    const store = createVolatileRecommendationStore({ reason: 'test volatile' });
    store.getLocalOwnerIdentity = () => ({ owner_user_id: 'owner-local' });
    const recommendation = createRecommendation({
        recommendation_id: 'recommendation:center:generated',
        candidate: {
            ...createRecommendation().candidate,
            expires_at: '2026-08-26T00:00:00.000Z'
        },
        expires_at: '2026-08-26T00:00:00.000Z'
    });
    let refreshCalls = 0;
    const service = createRecommendationCenterService({
        eventStore: store,
        handoffService: { async prepare() {}, async decide() {} },
        refreshService: {
            async refresh() {
                refreshCalls += 1;
                await store.createRecommendation(recommendation, { operation_id: 'center-refresh-test' });
                return { status: 'evaluated', candidate_count: 1, recommendation_count: 1 };
            }
        },
        now: () => new Date(NOW)
    });

    const result = await service.list();
    assert.equal(refreshCalls, 1);
    assert.equal(result.count, 1);
    assert.equal(result.items[0].recommendation_id, recommendation.recommendation_id);
});

test('open은 observational event 뒤 owner-scoped handoff만 호출한다', async () => {
    const { service, calls, store, primary } = await fixture();
    const result = await service.interact({ recommendation_id: primary.recommendation_id, interaction: 'open' });
    assert.equal(result.status, 'presentation');
    assert.deepEqual(calls[0].input, { ownerUserId: 'owner-local', recommendationId: primary.recommendation_id });
    assert.equal(calls[0].context.channel, 'app');
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'available');
});

test('snooze는 server-owned 24시간 뒤로 숨기고 due reconciliation으로 복귀한다', async () => {
    const { service, store, primary } = await fixture();
    const result = await service.interact({ recommendation_id: primary.recommendation_id, interaction: 'snooze' });
    assert.equal(result.status, 'snoozed');
    assert.equal(Date.parse(result.recommendation.snoozed_until), Date.parse(NOW) + SNOOZE_MS);
    assert.equal((await service.list()).count, 1);
    await store.reconcileDueRecommendations('owner-local', { now: '2026-08-24T04:00:00.000Z' });
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'available');
});

test('dismiss는 not_helpful feedback 뒤 terminal dismiss를 기록한다', async () => {
    const { service, store, primary } = await fixture();
    const result = await service.interact({ recommendation_id: primary.recommendation_id, interaction: 'dismiss' });
    assert.equal(result.status, 'dismissed');
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'dismissed');
    assert.equal((await service.list()).count, 1);
});

test('request owner, capability와 params 주입은 API 경계에서 거부한다', async () => {
    const { service, primary, calls } = await fixture();
    await assert.rejects(service.interact({
        recommendation_id: primary.recommendation_id,
        interaction: 'open',
        owner_user_id: 'owner-other',
        capability_id: 'settings.blog_auto.disable',
        params: { enabled: false }
    }), (error) => error.apiCode === 'RECOMMENDATION_REQUEST_UNSAFE');
    assert.equal(calls.length, 0);
});

test('confirmation은 local owner와 allowlisted fields만 handoff에 전달한다', async () => {
    const { service, primary, calls } = await fixture();
    const result = await service.decide({
        recommendation_id: primary.recommendation_id,
        confirmation_id: 'confirm_test-1',
        decision: 'accept'
    });
    assert.equal(result.status, 'executed');
    assert.deepEqual(calls[0].input, {
        ownerUserId: 'owner-local',
        recommendationId: primary.recommendation_id,
        confirmationId: 'confirm_test-1',
        decision: 'accept'
    });
});

test('expired recommendation은 reconciliation 후 목록과 action에서 제외한다', async () => {
    const { service, store, primary } = await fixture();
    await store.reconcileDueRecommendations('owner-local', { now: '2026-08-27T00:00:00.000Z' });
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'expired');
    await assert.rejects(
        service.interact({ recommendation_id: primary.recommendation_id, interaction: 'open' }),
        (error) => error.apiCode === 'RECOMMENDATION_STATE_CHANGED'
    );
});
