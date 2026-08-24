const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentKnowledgeCollector } = require('./content-knowledge-collector');

function trendSnapshot() {
    return {
        schema_version: 1, snapshot_id: 'ks_trends', kind: 'trends', provider_id: 'naver-trends',
        transport: 'builtin_api', freshness: 'fresh', observed_at: '2026-08-24T00:00:00.000Z',
        expires_at: '2026-08-24T01:00:00.000Z', items: [{
            id: 'trend-1', title: 'AI 에이전트', summary: '상승', observed_at: '2026-08-23T15:00:00.000Z',
            url: '', source: 'naver-trend-posting', publisher: '', keyword: 'AI 에이전트', categories: ['IT'],
            change_type: 'up', change_amount: 2, score: 2, display_order: 1
        }]
    };
}

function newsSnapshot(topic) {
    return {
        schema_version: 1, snapshot_id: `ks_news_${topic.replace(/\s/g, '_')}`, kind: 'news',
        provider_id: 'naver-news', transport: 'server_gateway', freshness: 'fresh',
        observed_at: '2026-08-24T00:10:00.000Z', expires_at: '2026-08-24T00:25:00.000Z',
        items: [{
            id: `news-${topic}`, title: `${topic} 보도`, summary: '요약',
            observed_at: '2026-08-24T00:10:00.000Z', published_at: '2026-08-23T23:00:00.000Z',
            url: `https://news.example.com/${encodeURIComponent(topic)}`, source: 'naver-search-news', publisher: 'Example'
        }]
    };
}

test('fetches Trends once and News at most once per three evidence lanes', async () => {
    const calls = [];
    const collector = createContentKnowledgeCollector({
        now: () => new Date('2026-08-24T00:10:00.000Z'),
        knowledgeRegistry: {
            async fetchForRoute(route, query) {
                calls.push({ route, query });
                if (query.kind === 'trends') return [trendSnapshot()];
                return [newsSnapshot(query.topic)];
            }
        }
    });
    const result = await collector.collect({ query: '생성형 AI' }, {
        owner_activity: { signals: [{
            subject: '워드프레스 자동화', stage: 'published', strength: 'strong',
            timestamp: '2026-08-23T20:00:00.000Z', evidence: { kind: 'event', id: 'event:1' }
        }] }
    });

    assert.equal(calls.filter((call) => call.query.kind === 'trends').length, 1);
    assert.equal(calls.filter((call) => call.query.kind === 'news').length, 3);
    assert.equal(result.news_queries.length, 3);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(calls.filter((call) => call.query.kind === 'news').every((call) => call.query.topic));
});

test('uses supplied strict Trends and isolates one News query failure', async () => {
    const calls = [];
    const collector = createContentKnowledgeCollector({
        now: () => new Date('2026-08-24T00:10:00.000Z'),
        knowledgeRegistry: {
            async fetchForRoute(route, query) {
                calls.push({ route, query });
                if (query.topic === '실패 주제') throw new Error('secret upstream body');
                return [newsSnapshot(query.topic)];
            }
        }
    });
    const result = await collector.collect({ query: '실패 주제', knowledge: [trendSnapshot()] });

    assert.equal(calls.some((call) => call.query.kind === 'trends'), false);
    assert.equal(result.news_queries.length, 2);
    assert.equal(result.news_queries[0].snapshots.length, 0);
    assert.deepEqual(result.diagnostics, [{ source: 'news:explicit', code: 'KNOWLEDGE_FETCH_FAILED' }]);
    assert.doesNotMatch(JSON.stringify(result), /secret upstream body/);
});

test('serendipity collection spends its three News queries on independent discovery domains', async () => {
    const calls = [];
    const collector = createContentKnowledgeCollector({
        now: () => new Date('2026-08-24T00:10:00.000Z'),
        knowledgeRegistry: {
            async fetchForRoute(_route, query) {
                calls.push(query);
                if (query.kind === 'trends') return [trendSnapshot()];
                return [newsSnapshot(query.topic)];
            }
        }
    });
    const result = await collector.collect({ serendipity: true, discovery_offset: 1 }, {});
    const newsTopics = calls.filter((call) => call.kind === 'news').map((call) => call.topic);
    assert.deepEqual(newsTopics, ['음식 취향', '환경 기후', '건강 습관']);
    assert.equal(result.news_queries.every((entry) => entry.query.lane === 'discovery'), true);
});
