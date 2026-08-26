const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapabilityRegistry } = require('../capabilities');

test('registers Naver news as a server gateway provider without enabling Stage 6 routing', async () => {
    const registry = createCapabilityRegistry({
        CONFIG: {
            knowledge: { providers: [], routing: { content_ideas: [] } }
        },
        Logger: { info() {}, warn() {} }
    });

    const definition = registry.knowledgeRegistry.get('naver-news');
    assert.equal(definition.kind, 'news');
    assert.equal(definition.transport, 'server_gateway');
    assert.equal(definition.enabled, true);
    assert.deepEqual(registry.knowledgeRouting.content_ideas, ['naver-trends']);
    assert.deepEqual(registry.knowledgeRouting.recommendation_content_news, ['naver-news']);
    assert.deepEqual(registry.knowledgeRouting.recommendation_serendipity_corpus, ['serpapi-corpus']);
    assert.deepEqual(
        await registry.knowledgeRegistry.fetchForRoute('content_ideas', { kind: 'news', topic: 'AI' }),
        []
    );
});

test('Naver news server gateway definition can consume a strict snapshot', async () => {
    const requests = [];
    const registry = createCapabilityRegistry({
        CONFIG: { knowledge: { providers: [], routing: {} } },
        Logger: { info() {}, warn() {} },
        serverGatewayClient: {
            async fetchSnapshot(request) {
                requests.push(request);
                return {
                    schema_version: 1,
                    snapshot_id: 'ks_news_fixture',
                    kind: 'news',
                    provider_id: 'naver-news',
                    transport: 'server_gateway',
                    freshness: 'fresh',
                    observed_at: '2026-08-23T09:00:00.000Z',
                    expires_at: '2026-08-23T09:15:00.000Z',
                    items: [{
                        id: 'news_fixture',
                        title: 'AI 뉴스',
                        summary: '요약',
                        observed_at: '2026-08-23T09:00:00.000Z',
                        url: 'https://news.example.com/article',
                        source: 'naver-search-news',
                        publisher: 'news.example.com',
                        published_at: '2026-08-23T08:00:00.000Z'
                    }]
                };
            }
        }
    });

    const snapshots = await registry.knowledgeRegistry.fetchForRoute(
        'recommendation_content_news',
        { kind: 'news', topic: 'AI', limit: 5 }
    );
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].items[0].title, 'AI 뉴스');
    assert.deepEqual(requests[0], {
        kind: 'news',
        purpose: 'content_ideas',
        query: { topic: 'AI', locale: 'ko-KR', country: 'KR', limit: 5 }
    });
});

test('SerpApi corpus is registered on a dormant serendipity route', async () => {
    const requests = [];
    const registry = createCapabilityRegistry({
        CONFIG: { knowledge: { providers: [], routing: {} } },
        Logger: { info() {}, warn() {} },
        serverGatewayClient: {
            async fetchSnapshot(request) {
                requests.push(request);
                return {
                    schema_version: 1,
                    snapshot_id: 'ks_corpus_fixture',
                    kind: 'news',
                    provider_id: 'serpapi-corpus',
                    transport: 'server_gateway',
                    freshness: 'fresh',
                    observed_at: '2026-08-25T09:00:00.000Z',
                    expires_at: '2026-08-25T09:05:00.000Z',
                    items: []
                };
            }
        }
    });
    const definition = registry.knowledgeRegistry.get('serpapi-corpus');
    assert.equal(definition.kind, 'news');
    assert.equal(definition.transport, 'server_gateway');
    assert.equal(definition.config.purpose, 'serendipity');

    const snapshots = await registry.knowledgeRegistry.fetchForRoute(
        'recommendation_serendipity_corpus',
        { kind: 'news', exclude_ids: ['obs_old'], limit: 3 }
    );
    assert.equal(snapshots.length, 1);
    assert.deepEqual(requests[0], {
        kind: 'news',
        purpose: 'serendipity',
        query: {
            lanes: ['headlines_kr', 'technology', 'business', 'science', 'culture_lifestyle', 'travel_local'],
            locales: ['ko-KR'], countries: ['KR'], exclude_ids: ['obs_old'], limit: 3
        }
    });
});

test('an explicit disabled Naver news provider overrides the built-in default', () => {
    const registry = createCapabilityRegistry({
        CONFIG: {
            knowledge: {
                providers: [{
                    id: 'naver-news',
                    kind: 'news',
                    transport: 'server_gateway',
                    enabled: false,
                    config: { purpose: 'content_ideas' }
                }],
                routing: {}
            }
        },
        Logger: { info() {}, warn() {} }
    });
    assert.equal(registry.knowledgeRegistry.get('naver-news').enabled, false);
});
