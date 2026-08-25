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
            metadata: {
                discovery_source_lane: 'news',
                discovery_news_transport: 'query_news',
                discovery_hint: '네이버 뉴스'
            },
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
    assert.equal(result.replacement, null);
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'dismissed');
    assert.equal((await service.list()).count, 1);
});

test('dismiss는 같은 출처를 요청해 만든 새 카드 한 건을 응답한다', async () => {
    const { store, primary } = await fixture();
    const replacement = createRecommendation({
        recommendation_id: 'recommendation:center:dismiss-replacement',
        candidate: {
            ...createRecommendation().candidate,
            candidate_id: 'candidate:center:dismiss-replacement',
            dedupe_key: 'content:dismiss-replacement',
            title: '새 네이버 뉴스 소재',
            metadata: {
                discovery_source_lane: 'news',
                discovery_news_transport: 'query_news',
                discovery_hint: '네이버 뉴스'
            },
            expires_at: '2026-08-26T00:00:00.000Z'
        },
        expires_at: '2026-08-26T00:00:00.000Z'
    });
    const service = createRecommendationCenterService({
        eventStore: store,
        handoffService: { async prepare() {}, async decide() {} },
        refreshService: { async refresh(input) {
            assert.equal(input.reason, 'user_dismiss_replacement');
            assert.deepEqual(input.preferred_source, { lane: 'news', news_transport: 'query_news' });
            await store.createRecommendation(replacement, { operation_id: 'create-dismiss-replacement' });
            return { status: 'evaluated', recommendation_count: 1 };
        } },
        now: () => new Date(NOW),
        operationIdFactory: () => 'recommendation_ui:dismiss-replacement-test'
    });

    const result = await service.interact({ recommendation_id: primary.recommendation_id, interaction: 'dismiss' });
    assert.equal(result.status, 'dismissed');
    assert.equal(result.replacement.recommendation_id, replacement.recommendation_id);
    assert.equal(result.replacement.hint, '네이버 뉴스');
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'dismissed');
});

test('새로운 발견은 탐색 추천만 rotated 처리하고 부정 피드백 없이 다시 평가한다', async () => {
    const { store, primary } = await fixture();
    const guidance = createRecommendation({
        recommendation_id: 'recommendation:center:guidance',
        candidate: {
            ...createRecommendation().candidate,
            candidate_id: 'candidate:center:guidance',
            kind: 'setup_guidance',
            dedupe_key: 'guidance:settings',
            expires_at: '2026-08-26T00:00:00.000Z'
        },
        expires_at: '2026-08-26T00:00:00.000Z'
    });
    await store.createRecommendation(guidance, { operation_id: 'create-guidance' });
    let refreshCalls = 0;
    const replacement = createRecommendation({
        recommendation_id: 'recommendation:center:replacement',
        candidate: {
            ...createRecommendation().candidate,
            candidate_id: 'candidate:center:replacement',
            dedupe_key: 'content:replacement',
            expires_at: '2026-08-26T00:00:00.000Z'
        },
        expires_at: '2026-08-26T00:00:00.000Z'
    });
    const service = createRecommendationCenterService({
        eventStore: store,
        handoffService: { async prepare() {}, async decide() {} },
        refreshService: { async refresh(input) {
            refreshCalls += 1;
            assert.equal(input.force, true);
            await store.createRecommendation(replacement, { operation_id: 'create-replacement' });
            return { status: 'evaluated' };
        } },
        now: () => new Date(NOW),
        operationIdFactory: () => 'recommendation_ui:discover-test'
    });

    const result = await service.discover({});
    assert.equal(result.rotated_count, 2);
    assert.equal(refreshCalls, 1);
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'rotated');
    assert.equal((await store.getRecommendation('owner-local', guidance.recommendation_id)).status, 'available');
});

test('새 발견을 확보하지 못하면 기존 탐색 추천을 유지한다', async () => {
    const { store, primary } = await fixture();
    const service = createRecommendationCenterService({
        eventStore: store,
        handoffService: { async prepare() {}, async decide() {} },
        refreshService: { async refresh() { throw new Error('provider unavailable'); } },
        now: () => new Date(NOW)
    });
    const result = await service.discover({});
    assert.equal(result.rotated_count, 0);
    assert.equal((await store.getRecommendation('owner-local', primary.recommendation_id)).status, 'available');
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
