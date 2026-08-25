const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createRecommendationRefreshService,
    discoveryDedupeKeys,
    discoveryOffsets,
    recentCorpusObservationIds
} = require('./recommendation-refresh.service');

function fixture(options = {}) {
    let producerCalls = 0;
    let evaluatorCalls = 0;
    const collectorInputs = [];
    const service = createRecommendationRefreshService({
        eventStore: {
            getLocalOwnerIdentity: () => ({ owner_user_id: 'owner-local' }),
            async listRecommendations() { return options.history || []; }
        },
        memoryRetrievalService: {
            async buildContextPacket() {
                return { owner_memory: { owner_user_id: 'owner-local' } };
            }
        },
        operationalStateCollector: {
            async collect() {
                return { owner_user_id: 'owner-local', readiness: { config_ready: true } };
            }
        },
        contentKnowledgeCollector: {
            async collect(input) {
                collectorInputs.push(input);
                return { trends: [], news_queries: [] };
            }
        },
        producerRunner: {
            async run(_input, context) {
                producerCalls += 1;
                assert.equal(context.memory.owner_memory.owner_user_id, 'owner-local');
                return { candidates: [{ candidate_id: 'candidate:one', kind: 'content_opportunity' }] };
            }
        },
        policyEvaluator: {
            async evaluate(input, context) {
                evaluatorCalls += 1;
                assert.equal(input.candidates.length, 1);
                assert.equal(context.license_features.cmd_shopping, true);
                return { recommendations: [{ recommendation_id: 'recommendation:one' }] };
            }
        },
        licenseStatusReader: async () => ({ success: true, remaining: -1, features: { cmd_shopping: true } }),
        now: () => new Date('2026-08-25T00:00:00.000Z')
    });
    return { service, counts: () => ({ producerCalls, evaluatorCalls }), collectorInputs };
}

test('refresh는 memory, operational, Knowledge를 결합해 producer와 policy를 한 번 실행한다', async () => {
    const { service, counts } = fixture();
    const result = await service.refresh();
    assert.deepEqual(result, { status: 'evaluated', candidate_count: 1, recommendation_count: 1, degraded: false });
    assert.deepEqual(counts(), { producerCalls: 1, evaluatorCalls: 1 });
});

test('refresh TTL은 Dashboard 재조회에서 외부 평가를 반복하지 않고 force만 우회한다', async () => {
    const { service, counts } = fixture();
    await service.refresh();
    assert.equal((await service.refresh()).status, 'cached');
    await service.refresh({ force: true });
    assert.deepEqual(counts(), { producerCalls: 2, evaluatorCalls: 2 });
});

test('발견 이력은 News, Trends, 사용자 기록별 순환 offset으로 계산한다', () => {
    const item = (lane, sourceLanes = []) => ({ candidate: {
        kind: 'content_opportunity',
        metadata: { discovery_source_lane: lane, source_lanes: sourceLanes }
    } });
    assert.deepEqual(discoveryOffsets([
        item('news'), item('news'), item('trends'), item('owner_history'),
        item('', ['discovery']), item('', ['trends']), item('', ['owner_activity']),
        { candidate: { kind: 'commerce_opportunity', metadata: { discovery_source_lane: 'news' } } }
    ]), { news: 3, trends: 2, owner: 2 });
});

test('발견 dedupe 제외는 active 상태와 정책 cooldown 안의 이력에만 적용한다', () => {
    const item = (key, status, lastEventAt, expiresAt, kind = 'content_opportunity') => ({
        status,
        last_event_at: lastEventAt,
        expires_at: expiresAt,
        candidate: { kind, dedupe_key: key }
    });
    const at = '2026-08-25T12:00:00.000Z';
    assert.deepEqual(discoveryDedupeKeys([
        item('active', 'available', '2026-08-25T10:00:00.000Z', '2026-08-26T10:00:00.000Z'),
        item('active-expired', 'available', '2026-08-23T10:00:00.000Z', '2026-08-24T10:00:00.000Z'),
        item('rotated-recent', 'rotated', '2026-08-25T10:00:00.000Z', '2026-08-26T10:00:00.000Z'),
        item('rotated-old', 'rotated', '2026-08-23T10:00:00.000Z', '2026-08-24T10:00:00.000Z'),
        item('dismissed-recent', 'dismissed', '2026-08-20T10:00:00.000Z', '2026-08-21T10:00:00.000Z'),
        item('dismissed-old', 'dismissed', '2026-08-17T10:00:00.000Z', '2026-08-18T10:00:00.000Z'),
        item('completed-recent', 'action_completed', '2026-08-13T10:00:00.000Z', '2026-08-14T10:00:00.000Z'),
        item('completed-old', 'action_completed', '2026-08-10T10:00:00.000Z', '2026-08-11T10:00:00.000Z'),
        item('commerce-active', 'available', '2026-08-25T10:00:00.000Z', '2026-08-26T10:00:00.000Z', 'commerce_opportunity'),
        item('operational-active', 'available', '2026-08-25T10:00:00.000Z', '2026-08-26T10:00:00.000Z', 'setup_guidance')
    ], at), [
        'active', 'rotated-recent', 'dismissed-recent', 'completed-recent', 'commerce-active'
    ]);
});

test('최근 corpus observation id는 owner-scoped recommendation evidence에서만 bounded 추출한다', () => {
    const item = (kind, transport, provider, id) => ({ candidate: {
        kind,
        metadata: { discovery_news_transport: transport },
        evidence: [{ kind: 'knowledge', source_ref: { provider_id: provider, id } }]
    } });
    assert.deepEqual(recentCorpusObservationIds([
        item('content_opportunity', 'stored_corpus', 'provider-a', 'obs_new'),
        item('content_opportunity', 'query_news', 'provider-b', 'news_1'),
        item('content_opportunity', 'stored_corpus', 'provider-a', 'obs_new'),
        item('commerce_opportunity', 'stored_corpus', 'provider-a', 'obs_commerce'),
        item('content_opportunity', 'stored_corpus', 'provider-c', 'obs_old')
    ], 2), ['obs_new', 'obs_old']);
});

test('refresh는 최근 corpus observation id를 Knowledge collector exclusion으로 전달한다', async () => {
    const history = [{ candidate: {
        kind: 'content_opportunity',
        dedupe_key: 'content_opportunity:old',
        metadata: { discovery_source_lane: 'news', discovery_news_transport: 'stored_corpus' },
        evidence: [{ kind: 'knowledge', source_ref: { provider_id: 'provider-a', id: 'obs_recent' } }]
    } }];
    const { service, collectorInputs } = fixture({ history });
    await service.refresh();
    assert.deepEqual(collectorInputs[0].recently_shown_ids, ['obs_recent']);
    assert.equal(collectorInputs[0].discovery_offsets.news, 1);
});
