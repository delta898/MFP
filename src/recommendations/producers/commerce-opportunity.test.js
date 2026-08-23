const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const {
    MAX_COMMERCE_CANDIDATES,
    collectFreshTrendEntries,
    createCommerceOpportunityProducer
} = require('./commerce-opportunity');

const NOW = '2026-08-24T06:00:00.000Z';

function trendSnapshot(keyword = '아이폰 18 프로', overrides = {}) {
    return {
        schema_version: 1,
        snapshot_id: `ks_trends_${keyword.replace(/\s/g, '_')}`,
        kind: 'trends',
        provider_id: 'trend-provider',
        transport: 'builtin_api',
        freshness: 'fresh',
        observed_at: '2026-08-24T05:30:00.000Z',
        expires_at: '2026-08-24T07:00:00.000Z',
        items: [{
            id: `trend-${keyword}`, title: keyword, summary: '검색 관심 흐름',
            observed_at: '2026-08-24T05:30:00.000Z', url: '', source: 'trend-source', publisher: '',
            keyword, categories: ['IT·컴퓨터'], change_type: 'up', change_amount: 4, score: 4,
            display_order: 1
        }],
        ...overrides
    };
}

function ownerSignal(product = '삼성 오디세이 G7 게이밍 모니터', overrides = {}) {
    return {
        domain: 'shopping', stage: 'published', strength: 'strong', subject: product,
        timestamp: '2026-08-24T05:00:00.000Z', evidence: { kind: 'event', id: 'event:shopping:published:1' },
        ...overrides
    };
}

function producer() {
    return createCommerceOpportunityProducer({ now: () => new Date(NOW) });
}

test('creates a valid candidate from explicit shopping product and matching fresh Trends', async () => {
    const result = await producer().produce({
        owner_user_id: 'owner-local',
        commerce_intent: { intent: 'shopping_content', product: '아이폰 18 프로' },
        knowledge: [trendSnapshot()]
    });
    assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0];
    assert.equal(candidate.kind, 'commerce_opportunity');
    assert.equal(candidate.handoff, null);
    assert.equal(candidate.expires_at, '2026-08-24T07:00:00.000Z');
    assert.deepEqual(candidate.evidence.map((item) => [item.kind, item.strength]), [
        ['knowledge', 'weak'], ['owner_activity', 'explicit']
    ]);
    assert.equal(validateRecommendationCandidate(candidate).ok, true);
    assert.doesNotMatch(`${candidate.title} ${candidate.summary} ${candidate.explanation}`, /판매 급증|수익 기회|인기 상품/);
});

test('creates owner-grounded commerce opportunity for matching shopping activity', async () => {
    const result = await producer().produce({ owner_user_id: 'owner-local' }, {
        owner_user_id: 'owner-local',
        knowledge: [trendSnapshot('오디세이 G7')],
        memory: { owner_memory: {
            owner_user_id: 'owner-local',
            activity: { signals: [ownerSignal()] }
        } }
    });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].metadata.anchor_lane, 'owner_activity');
    assert.equal(result.candidates[0].evidence[1].stage, 'published');
});

test('returns zero for Trends-only, blog-only, generated shopping and mismatched product cases', async () => {
    const trendsOnly = await producer().produce({ owner_user_id: 'owner-local', knowledge: [trendSnapshot()] });
    const blogOnly = await producer().produce({ owner_user_id: 'owner-local', knowledge: [trendSnapshot('게임')] }, {
        owner_activity: { signals: [ownerSignal('게임', { domain: 'blog' })] }
    });
    const generated = await producer().produce({ owner_user_id: 'owner-local', knowledge: [trendSnapshot('갤럭시 링')] }, {
        owner_activity: { signals: [ownerSignal('갤럭시 링', { stage: 'generated' })] }
    });
    const mismatch = await producer().produce({
        owner_user_id: 'owner-local',
        commerce_intent: { intent: 'shopping_content', product: '아이폰 18 프로' },
        knowledge: [trendSnapshot('삼성 냉장고')]
    });
    assert.deepEqual([trendsOnly, blogOnly, generated, mismatch].map((result) => result.candidates.length), [0, 0, 0, 0]);
});

test('rejects expired and malformed snapshots without exposing provider data', async () => {
    const expired = trendSnapshot('아이폰 18 프로', { expires_at: '2026-08-24T05:59:59.000Z' });
    const malformed = { ...trendSnapshot(), api_key: 'must-not-escape' };
    const result = await producer().produce({
        owner_user_id: 'owner-local',
        commerce_intent: { intent: 'shopping_content', product: '아이폰 18 프로' },
        knowledge: [expired, malformed]
    });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(collectFreshTrendEntries([expired, malformed], NOW), []);
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape/);
});

test('deduplicates identities deterministically and caps output', async () => {
    const products = ['상품 알파 100', '상품 베타 200', '상품 감마 300', '상품 델타 400'];
    const signals = products.map((product, index) => ownerSignal(product, {
        timestamp: `2026-08-24T05:0${index}:00.000Z`,
        evidence: { kind: 'artifact', id: `shopping:${index}` }
    }));
    const knowledge = products.flatMap((product) => [trendSnapshot(product), trendSnapshot(product)]);
    const result = await producer().produce({ owner_user_id: 'owner-local', knowledge }, {
        owner_activity: { signals }
    });
    assert.equal(result.candidates.length, MAX_COMMERCE_CANDIDATES);
    assert.deepEqual(result.candidates.map((item) => item.metadata.product), products.slice(0, 3));
});

test('rejects conflicting owner memory instead of borrowing another owner activity', async () => {
    const result = await producer().produce({ owner_user_id: 'owner-a', knowledge: [trendSnapshot('오디세이 G7')] }, {
        owner_user_id: 'owner-a',
        memory: { owner_memory: { owner_user_id: 'owner-b', activity: { signals: [ownerSignal()] } } }
    });
    assert.deepEqual(result.candidates, []);
});
