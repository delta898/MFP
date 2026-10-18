const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendationProducerRunner } = require('./runtime');
const { createCommerceOpportunityProducer } = require('./commerce-opportunity');

test('common runtime accepts a grounded commerce candidate', async () => {
    const now = '2026-08-24T06:00:00.000Z';
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:commerce',
        producers: [createCommerceOpportunityProducer({ now: () => new Date(now) })]
    });
    const result = await runner.run({
        owner_user_id: 'owner-local',
        commerce_intent: { intent: 'shopping_content', product: '아이폰 18 프로' },
        knowledge: [{
            schema_version: 1, snapshot_id: 'ks_trends_commerce', kind: 'trends',
            provider_id: 'trend-provider', transport: 'builtin_api', freshness: 'fresh',
            observed_at: '2026-08-24T05:30:00.000Z', expires_at: '2026-08-24T07:00:00.000Z',
            items: [{
                id: 'trend-commerce-1', title: '아이폰 18 프로', summary: '검색 관심 흐름',
                observed_at: '2026-08-24T05:30:00.000Z', url: '', source: 'trend-source', publisher: '',
                keyword: '아이폰 18 프로', categories: ['IT·컴퓨터'], change_type: 'up',
                change_amount: 4, score: 4, display_order: 1
            }]
        }]
    });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].kind, 'commerce_opportunity');
    assert.deepEqual(result.diagnostics.failed, []);
    assert.deepEqual(result.diagnostics.invalid, []);
});
