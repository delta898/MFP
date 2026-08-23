const test = require('node:test');
const assert = require('node:assert/strict');

const {
    materializeLegacyKnowledgeSnapshot,
    normalizeKnowledgeSnapshot
} = require('./snapshot');

function baseSnapshot(overrides = {}) {
    return {
        schema_version: 1,
        snapshot_id: 'ks_fixture',
        kind: 'trends',
        provider_id: 'gateway-trends',
        transport: 'server_gateway',
        freshness: 'fresh',
        observed_at: '2026-08-23T00:00:00.000Z',
        expires_at: '2026-08-23T01:00:00.000Z',
        items: [{
            id: 'trend-1',
            title: 'AI 글쓰기',
            summary: '최근 상승',
            observed_at: '2026-08-23T00:00:00.000Z',
            url: '',
            source: 'developer-trends',
            publisher: '',
            keyword: 'AI 글쓰기',
            categories: ['IT'],
            change_type: 'up',
            change_amount: 12,
            score: 12
        }],
        ...overrides
    };
}

test('normalizes bounded Trends and News knowledge snapshots', () => {
    const trends = normalizeKnowledgeSnapshot(baseSnapshot(), {
        kind: 'trends', provider_id: 'gateway-trends', transport: 'server_gateway'
    });
    assert.equal(trends.items[0].keyword, 'AI 글쓰기');
    assert.deepEqual(trends.items[0].categories, ['IT']);

    const news = normalizeKnowledgeSnapshot(baseSnapshot({
        kind: 'news',
        provider_id: 'gateway-news',
        items: [{
            id: 'news-1',
            title: '새 AI 모델 공개',
            summary: '공식 발표 내용',
            observed_at: '2026-08-23T00:00:00.000Z',
            published_at: '2026-08-22T23:00:00.000Z',
            url: 'https://news.example.test/article/1',
            source: 'news-search',
            publisher: 'Example News'
        }]
    }), { kind: 'news', provider_id: 'gateway-news', transport: 'server_gateway' });
    assert.equal(news.items[0].publisher, 'Example News');
});

test('rejects raw payloads, credentials, unknown fields, and unsafe URLs', () => {
    assert.throws(() => normalizeKnowledgeSnapshot(baseSnapshot({ api_key: 'secret' })), /not allowed/);
    assert.throws(() => normalizeKnowledgeSnapshot(baseSnapshot({
        items: [{ ...baseSnapshot().items[0], metadata: { raw_response: {} } }]
    })), /not allowed/);
    assert.throws(() => normalizeKnowledgeSnapshot(baseSnapshot({
        kind: 'news',
        items: [{
            id: 'news-1', title: 'News', summary: '', observed_at: '2026-08-23T00:00:00Z',
            published_at: '2026-08-23T00:00:00Z', url: 'http://example.test', publisher: 'Publisher'
        }]
    })), /HTTPS URL/);
    assert.throws(() => normalizeKnowledgeSnapshot(baseSnapshot({ snapshot_id: 'foreign-id' })), /identity/);
});

test('legacy providers gain a snapshot envelope without rewriting their item DTOs', () => {
    const item = { title: '기존 트렌드', metadata: { keyword: '기존 트렌드', vendor_field: true } };
    const snapshot = materializeLegacyKnowledgeSnapshot({
        id: 'naver-trends', kind: 'trends', transport: 'builtin_api', config: {}
    }, [item], { now: '2026-08-23T00:00:00.000Z' });
    assert.equal(snapshot.schema_version, 1);
    assert.equal(snapshot.provider_id, 'naver-trends');
    assert.equal(snapshot.items[0], item);
    assert.equal(snapshot.expires_at, '2026-08-23T00:15:00.000Z');
});
