'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const contractPromise = import('../supabase/functions/_shared/knowledge-gateway-contract.ts');

function request(query) {
    return {
        schema_version: 1,
        kind: 'blog_reference',
        purpose: 'writing_reference',
        query,
        licenseKey: 'license',
        hwid: 'hardware'
    };
}

test('blog reference request accepts only bounded Korean semantic input', async () => {
    const { normalizeKnowledgeGatewayRequest } = await contractPromise;
    assert.deepEqual(normalizeKnowledgeGatewayRequest(request({
        topic: '디지털 메모', locale: 'ko-KR', country: 'KR', limit: 999
    })).query, {
        topic: '디지털 메모', locale: 'ko-KR', country: 'KR', limit: 5
    });
    assert.equal(normalizeKnowledgeGatewayRequest(request({ topic: '기본 개수' })).query.limit, 3);
    assert.throws(() => normalizeKnowledgeGatewayRequest(request({ endpoint: 'https://example.com' })), /query_field_invalid/);
    assert.throws(() => normalizeKnowledgeGatewayRequest({
        ...request({ topic: '테스트' }), kind: 'news'
    }), /route_invalid/);
});

test('blog reference snapshots allow only safe minimal result fields', async () => {
    const { validateServerKnowledgeSnapshot } = await contractPromise;
    const raw = {
        schema_version: 1,
        snapshot_id: 'ks_reference',
        kind: 'blog_reference',
        provider_id: 'naver-blog-reference',
        transport: 'server_gateway',
        freshness: 'fresh',
        observed_at: '2026-08-29T01:00:00.000Z',
        expires_at: '2026-08-29T01:10:00.000Z',
        items: [{
            id: 'reference_1', title: '참고 글', summary: '',
            observed_at: '2026-08-29T01:00:00.000Z',
            url: 'https://blog.naver.com/example/1', source: 'naver-search-blog',
            publisher: 'blog.naver.com', published_at: '2026-08-29T00:00:00.000Z'
        }]
    };
    const validated = validateServerKnowledgeSnapshot(raw, {
        kind: 'blog_reference', providerId: 'naver-blog-reference'
    });
    assert.equal(validated.items[0].title, '참고 글');
    assert.throws(() => validateServerKnowledgeSnapshot({
        ...raw,
        items: [{ ...raw.items[0], headers: { authorization: 'secret' } }]
    }, { kind: 'blog_reference', providerId: 'naver-blog-reference' }), /not_allowed/);
});
