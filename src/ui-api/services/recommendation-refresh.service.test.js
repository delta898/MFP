const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendationRefreshService } = require('./recommendation-refresh.service');

function fixture() {
    let producerCalls = 0;
    let evaluatorCalls = 0;
    const service = createRecommendationRefreshService({
        eventStore: { getLocalOwnerIdentity: () => ({ owner_user_id: 'owner-local' }) },
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
            async collect() {
                return { trends: [], news_queries: [] };
            }
        },
        producerRunner: {
            async run(_input, context) {
                producerCalls += 1;
                assert.equal(context.memory.owner_memory.owner_user_id, 'owner-local');
                return { candidates: [{ candidate_id: 'candidate:one' }] };
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
    return { service, counts: () => ({ producerCalls, evaluatorCalls }) };
}

test('refresh는 memory, operational, Knowledge를 결합해 producer와 policy를 한 번 실행한다', async () => {
    const { service, counts } = fixture();
    const result = await service.refresh();
    assert.deepEqual(result, { status: 'evaluated', candidate_count: 1, recommendation_count: 1 });
    assert.deepEqual(counts(), { producerCalls: 1, evaluatorCalls: 1 });
});

test('refresh TTL은 Dashboard 재조회에서 외부 평가를 반복하지 않고 force만 우회한다', async () => {
    const { service, counts } = fixture();
    await service.refresh();
    assert.equal((await service.refresh()).status, 'cached');
    await service.refresh({ force: true });
    assert.deepEqual(counts(), { producerCalls: 2, evaluatorCalls: 2 });
});
