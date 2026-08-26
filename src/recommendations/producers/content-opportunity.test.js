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

function corpusNewsSnapshot(items) {
    return {
        ...newsSnapshot(items),
        snapshot_id: 'ks_corpus',
        provider_id: 'serpapi-corpus'
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
    assert.deepEqual(candidate.handoff, {
        type: 'presentation',
        label: '소재 적용하기',
        target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
        payload: { query: 'AI 에이전트' }
    });
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

test('serendipity mode creates one current headline per independent domain and skips prior exposure', async () => {
    const domains = ['과학 발견', '생활 변화', '여행 문화'];
    const queries = domains.map((topic, index) => ({
        topic,
        normalized_topic: topic.replace(/\s/g, ''),
        lane: 'discovery',
        bases: [{ lane: 'discovery', basis: { domain_index: index } }]
    }));
    const newsQueries = queries.map((query, index) => ({
        query,
        snapshots: [newsSnapshot([
            article(`news-${index}-1`, `${query.topic} 첫 소재`, `https://news.example.com/${index}/1`),
            article(`news-${index}-2`, `${query.topic} 다음 소재`, `https://news.example.com/${index}/2`)
        ])]
    }));
    const producer = createContentOpportunityProducer({ now: () => new Date(NOW) });
    const first = await producer.produce({
        owner_user_id: 'owner-local',
        serendipity: true,
        content_knowledge: { query_plan: { queries }, news_queries: newsQueries }
    });
    assert.equal(first.candidates.length, 3);
    assert.deepEqual(first.candidates.map((candidate) => candidate.metadata.discovery_domain), domains);

    const second = await producer.produce({
        owner_user_id: 'owner-local',
        serendipity: true,
        excluded_dedupe_keys: first.candidates.map((candidate) => candidate.dedupe_key),
        content_knowledge: { query_plan: { queries }, news_queries: newsQueries }
    });
    assert.equal(second.candidates.length, 3);
    assert.equal(second.candidates.every((candidate) => candidate.title.includes('다음 소재')), true);
});

test('serendipity mode fills three cards from healthy domains when one domain is empty', async () => {
    const queries = ['과학 발견', '생활 변화', '여행 문화'].map((topic, index) => ({
        topic, normalized_topic: topic.replace(/\s/g, ''), lane: 'discovery',
        bases: [{ lane: 'discovery', basis: { domain_index: index } }]
    }));
    const newsQueries = queries.map((query, index) => ({
        query,
        snapshots: index === 2 ? [] : [newsSnapshot([
            article(`fallback-${index}-1`, `${query.topic} 첫 소재`, `https://news.example.com/fallback/${index}/1`),
            article(`fallback-${index}-2`, `${query.topic} 두 번째 소재`, `https://news.example.com/fallback/${index}/2`)
        ])]
    }));
    const result = await createContentOpportunityProducer({ now: () => new Date(NOW) }).produce({
        owner_user_id: 'owner-local', serendipity: true,
        content_knowledge: { query_plan: { queries }, news_queries: newsQueries }
    });
    assert.equal(result.candidates.length, 3);
    assert.equal(new Set(result.candidates.map((candidate) => candidate.metadata.discovery_domain)).size, 2);
});

test('serendipity mode expands published owner history with a different grounded headline', async () => {
    const discoveryQuery = {
        topic: '과학 발견', normalized_topic: '과학발견', lane: 'discovery',
        bases: [{ lane: 'discovery', basis: { domain_index: 0 } }]
    };
    const trendQuery = {
        topic: '오늘의 트렌드', normalized_topic: '오늘의트렌드', lane: 'trends',
        bases: [{ lane: 'trends', basis: {
            item_id: 'trend-mix', item_title: '오늘의 트렌드', observed_at: '2026-08-23T15:00:00.000Z',
            snapshot_expires_at: '2026-08-24T01:00:00.000Z', provider_id: 'naver-trends',
            transport: 'builtin_api', categories: [], change_type: 'up', change_amount: 1, score: 1
        } }]
    };
    const ownerQuery = {
        topic: '예전에 쓴 소재', normalized_topic: '예전에쓴소재', lane: 'owner_activity',
        bases: [{ lane: 'owner_activity', basis: {
            stage: 'published', strength: 'strong', timestamp: '2026-08-22T20:00:00.000Z',
            source_kind: 'event', source_id: 'event:owner:1'
        } }]
    };
    const result = await createContentOpportunityProducer({ now: () => new Date(NOW) }).produce({
        owner_user_id: 'owner-local', serendipity: true,
        content_knowledge: {
            query_plan: { queries: [discoveryQuery, ownerQuery, trendQuery] },
            news_queries: [
                {
                    query: discoveryQuery,
                    snapshots: [newsSnapshot([article('mix-news', '뜻밖의 뉴스 한 조각', 'https://news.example.com/mix')])]
                },
                {
                    query: ownerQuery,
                    snapshots: [newsSnapshot([
                        article('owner-same', '예전에 쓴 소재', 'https://news.example.com/owner/same'),
                        article('owner-news', '관련 제도의 최근 변화', 'https://news.example.com/owner/expanded')
                    ])]
                }
            ]
        }
    });

    assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.discovery_source_lane), [
        'trends', 'news', 'owner_history'
    ]);
    assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.discovery_hint), [
        '트렌드 키워드', '네이버 뉴스', '내 글에서 확장'
    ]);
    assert.equal(result.candidates[1].metadata.discovery_news_transport, 'query_news');
    assert.equal(result.candidates[2].title, '관련 제도의 최근 변화');
    assert.equal(result.candidates[2].metadata.origin_topic, '예전에 쓴 소재');
    assert.equal(result.candidates[2].evidence.some((evidence) => evidence.kind === 'owner_activity'), true);
    assert.equal(result.candidates[2].evidence.some((evidence) => evidence.kind === 'knowledge'), true);
    assert.deepEqual(result.candidates[2].handoff.payload, { query: '관련 제도의 최근 변화' });
    assert.equal(result.candidates.every((candidate) => validateRecommendationCandidate(candidate).ok), true);
});

test('published owner history is not repeated without a different grounded headline', async () => {
    const ownerQuery = {
        topic: '이미 발행한 글', normalized_topic: '이미발행한글', lane: 'owner_activity',
        bases: [{ lane: 'owner_activity', basis: {
            stage: 'published', strength: 'strong', timestamp: '2026-08-22T20:00:00.000Z',
            source_kind: 'event', source_id: 'event:owner:published'
        } }]
    };
    const result = await createContentOpportunityProducer({ now: () => new Date(NOW) }).produce({
        owner_user_id: 'owner-local', serendipity: true,
        content_knowledge: { query_plan: { queries: [ownerQuery] }, news_queries: [] }
    });

    assert.deepEqual(result.candidates, []);
});

test('unfinished owner history remains available as an 이어 쓸 소재', async () => {
    const ownerQuery = {
        topic: '저장해 둔 여행 소재', normalized_topic: '저장해둔여행소재', lane: 'owner_activity',
        bases: [{ lane: 'owner_activity', basis: {
            stage: 'saved', strength: 'medium', timestamp: '2026-08-22T20:00:00.000Z',
            source_kind: 'event', source_id: 'event:owner:saved'
        } }]
    };
    const result = await createContentOpportunityProducer({ now: () => new Date(NOW) }).produce({
        owner_user_id: 'owner-local', serendipity: true,
        content_knowledge: { query_plan: { queries: [ownerQuery] }, news_queries: [] }
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].title, '저장해 둔 여행 소재');
    assert.equal(result.candidates[0].metadata.discovery_hint, '이어 쓸 소재');
    assert.match(result.candidates[0].explanation, /아직 발행하지 않은/);
});

test('serendipity creates a grounded corpus news card without claiming live freshness', async () => {
    const result = await createContentOpportunityProducer({ now: () => new Date(NOW) }).produce({
        owner_user_id: 'owner-local',
        serendipity: true,
        content_knowledge: {
            query_plan: { queries: [] },
            news_queries: [],
            corpus_snapshots: [corpusNewsSnapshot([
                article('corpus-news-1', '며칠 지나 다시 보는 우주 소재', 'https://corpus.example.com/space')
            ])]
        }
    });
    assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0];
    assert.equal(candidate.title, '며칠 지나 다시 보는 우주 소재');
    assert.equal(candidate.summary, '뜻밖에 만난 뉴스 소재입니다.');
    assert.doesNotMatch(`${candidate.summary} ${candidate.explanation}`, /최신/);
    assert.equal(candidate.metadata.discovery_source_lane, 'news');
    assert.equal(candidate.metadata.discovery_news_transport, 'stored_corpus');
    assert.equal(candidate.metadata.discovery_hint, '발견 뉴스');
    assert.equal(candidate.evidence[0].source_ref.provider_id, 'serpapi-corpus');
    assert.equal(candidate.evidence[0].source_ref.id, 'corpus-news-1');
    assert.deepEqual(candidate.handoff.payload, { query: '며칠 지나 다시 보는 우주 소재' });
    assert.deepEqual(validateRecommendationCandidate(candidate).errors, []);
});

test('serendipity mode fills an unavailable source slot without repeating a topic', async () => {
    const queries = ['과학 발견', '생활 변화', '여행 문화'].map((topic, index) => ({
        topic, normalized_topic: topic.replace(/\s/g, ''), lane: 'discovery',
        bases: [{ lane: 'discovery', basis: { domain_index: index } }]
    }));
    const newsQueries = queries.map((query, index) => ({
        query,
        snapshots: [newsSnapshot([article(`news-only-${index}`, `뉴스 소재 ${index + 1}`, `https://news.example.com/news-only/${index}`)])]
    }));
    const result = await createContentOpportunityProducer({ now: () => new Date(NOW) }).produce({
        owner_user_id: 'owner-local', serendipity: true,
        content_knowledge: { query_plan: { queries }, news_queries: newsQueries }
    });

    assert.equal(result.candidates.length, 3);
    assert.equal(result.candidates.every((candidate) => candidate.metadata.discovery_source_lane === 'news'), true);
    assert.equal(new Set(result.candidates.map((candidate) => candidate.metadata.topic)).size, 3);
});
