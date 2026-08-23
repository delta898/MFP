const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createContentOpportunityProducer } = require('./content-opportunity');
const { createRecommendationProducerRunner } = require('./runtime');

const NOW = '2026-08-24T00:10:00.000Z';

function newsSnapshot(items) {
    return {
        schema_version: 1, snapshot_id: 'ks_news', kind: 'news', provider_id: 'naver-news',
        transport: 'server_gateway', freshness: 'fresh', observed_at: NOW,
        expires_at: '2026-08-24T00:25:00.000Z', items
    };
}

function article(id, title, url) {
    return {
        id, title, summary: '요약', observed_at: NOW, published_at: '2026-08-23T23:00:00.000Z',
        url, source: 'naver-search-news', publisher: 'Example News'
    };
}

function combinedKnowledge() {
    const topic = 'AI 에이전트';
    return {
        news_queries: [{
            query: {
                topic, normalized_topic: 'ai에이전트', lane: 'explicit',
                bases: [
                    { lane: 'explicit', basis: { observed_at: NOW, source_id: 'request:current' } },
                    { lane: 'owner_activity', basis: {
                        stage: 'published', strength: 'strong', timestamp: '2026-08-23T20:00:00.000Z',
                        source_kind: 'event', source_id: 'event:publish:1'
                    } },
                    { lane: 'trends', basis: {
                        item_id: 'trend-1', item_title: topic, observed_at: '2026-08-23T15:00:00.000Z',
                        snapshot_expires_at: '2026-08-24T01:00:00.000Z', provider_id: 'naver-trends',
                        transport: 'builtin_api', categories: ['IT'], change_type: 'up', change_amount: 2,
                        score: 2, url: ''
                    } }
                ]
            },
            snapshots: [newsSnapshot([
                article('news-1', 'AI 에이전트 산업 변화', 'https://news.example.com/1'),
                article('news-1-copy', 'AI 에이전트 산업 변화', 'https://news.example.com/1-copy'),
                article('news-2', '기업의 AI 에이전트 도입', 'https://news.example.com/2'),
                article('news-3', 'AI 에이전트 기술 공개', 'https://news.example.com/3'),
                article('news-4', 'AI 에이전트 추가 기사', 'https://news.example.com/4')
            ])]
        }]
    };
}

test('combines explicit, owner, Trends and deduplicated News evidence into one valid candidate', async () => {
    const producer = createContentOpportunityProducer({ now: () => new Date(NOW) });
    const result = await producer.produce({
        owner_user_id: 'owner-local', content_knowledge: combinedKnowledge()
    });

    assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0];
    assert.deepEqual(candidate.metadata.source_lanes, ['explicit', 'owner_activity', 'trends']);
    assert.equal(candidate.metadata.article_count, 3);
    assert.deepEqual(candidate.evidence.map((item) => item.kind), [
        'owner_activity', 'owner_activity', 'knowledge', 'knowledge', 'knowledge', 'knowledge'
    ]);
    assert.match(candidate.explanation, /현재 입력한 주제/);
    assert.match(candidate.explanation, /외부 Trends/);
    assert.match(candidate.explanation, /관련 보도 3건/);
    assert.equal(candidate.handoff, null);
    assert.deepEqual(validateRecommendationCandidate(candidate).errors, []);
});

test('candidate identity is stable while generated timestamps may change', async () => {
    const first = createContentOpportunityProducer({ now: () => new Date(NOW) });
    const second = createContentOpportunityProducer({ now: () => new Date('2026-08-24T00:11:00.000Z') });
    const input = { owner_user_id: 'owner-local', content_knowledge: combinedKnowledge() };
    const firstCandidate = (await first.produce(input)).candidates[0];
    const secondCandidate = (await second.produce(input)).candidates[0];
    assert.equal(firstCandidate.candidate_id, secondCandidate.candidate_id);
    assert.equal(firstCandidate.dedupe_key, secondCandidate.dedupe_key);
    assert.notEqual(firstCandidate.created_at, secondCandidate.created_at);
});

test('does not fabricate a candidate when a query has no evidence', async () => {
    const producer = createContentOpportunityProducer({ now: () => new Date(NOW) });
    const result = await producer.produce({
        owner_user_id: 'owner-local',
        content_knowledge: { news_queries: [{ query: { topic: '근거 없음', normalized_topic: '근거없음', bases: [] }, snapshots: [] }] }
    });
    assert.deepEqual(result.candidates, []);
});

test('composes the collector and common runtime through injected Knowledge registry', async () => {
    const registry = {
        async fetchForRoute(route, query) {
            if (query.kind === 'trends') return [];
            return [newsSnapshot([article('news-live', '생성형 AI 서비스 공개', 'https://news.example.com/live')])];
        }
    };
    const producer = createContentOpportunityProducer({ knowledgeRegistry: registry, now: () => new Date(NOW) });
    const runner = createRecommendationProducerRunner({
        producers: [producer], runIdFactory: () => 'producer_run:content-integration'
    });
    const result = await runner.run({ owner_user_id: 'owner-local', query: '생성형 AI' });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].metadata.article_count, 1);
    assert.deepEqual(result.diagnostics.failed, []);
    assert.deepEqual(result.diagnostics.invalid, []);
});
