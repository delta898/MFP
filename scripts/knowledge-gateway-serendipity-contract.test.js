const test = require('node:test');
const assert = require('node:assert/strict');

const contractPromise = import('../supabase/functions/_shared/knowledge-gateway-contract.ts');

function request(query) {
    return {
        schema_version: 1,
        kind: 'news',
        purpose: 'serendipity',
        query,
        licenseKey: 'license',
        hwid: 'hardware'
    };
}

test('serendipity request accepts only bounded corpus filters', async () => {
    const { normalizeKnowledgeGatewayRequest } = await contractPromise;
    const normalized = normalizeKnowledgeGatewayRequest(request({
        lanes: ['technology', 'technology', 'science'],
        locales: ['ko-KR', 'en-US'],
        countries: ['KR', 'US'],
        exclude_ids: ['obs_1', 'obs_1', 'obs_2'],
        limit: 999
    }));
    assert.deepEqual(normalized.query, {
        lanes: ['technology', 'science'], locales: ['ko-KR', 'en-US'], countries: ['KR', 'US'],
        exclude_ids: ['obs_1', 'obs_2'], limit: 20
    });
});

test('serendipity request rejects arbitrary search and oversized exclusion input', async () => {
    const { normalizeKnowledgeGatewayRequest } = await contractPromise;
    assert.throws(() => normalizeKnowledgeGatewayRequest(request({ topic: 'user-driven search' })), /query_field_invalid/);
    assert.throws(() => normalizeKnowledgeGatewayRequest(request({ lanes: ['unknown'] })), /lanes_invalid/);
    assert.throws(() => normalizeKnowledgeGatewayRequest(request({ exclude_ids: [{ id: 'obs_1' }] })), /exclude_ids_invalid/);
    assert.throws(() => normalizeKnowledgeGatewayRequest(request({ exclude_ids: ['x'.repeat(181)] })), /exclude_ids_invalid/);
    assert.throws(() => normalizeKnowledgeGatewayRequest(request({ exclude_ids: Array.from({ length: 101 }, (_, i) => `id_${i}`) })), /exclude_ids_invalid/);
});

test('existing content idea request remains compatible and rejects discovery-only fields', async () => {
    const { normalizeKnowledgeGatewayRequest } = await contractPromise;
    const normalized = normalizeKnowledgeGatewayRequest({
        schema_version: 1, kind: 'news', purpose: 'content_ideas',
        query: { topic: 'AI', locale: 'ko-KR', country: 'KR', limit: 5 },
        licenseKey: 'license', hwid: 'hardware'
    });
    assert.deepEqual(normalized.query, { topic: 'AI', locale: 'ko-KR', country: 'KR', limit: 5 });
    assert.throws(() => normalizeKnowledgeGatewayRequest({
        schema_version: 1, kind: 'news', purpose: 'content_ideas',
        query: { topic: 'AI', locale: 'en-US', country: 'US' },
        licenseKey: 'license', hwid: 'hardware'
    }), /locale_invalid/);
    assert.throws(() => normalizeKnowledgeGatewayRequest({
        schema_version: 1, kind: 'news', purpose: 'content_ideas',
        query: { exclude_ids: ['obs_1'] }, licenseKey: 'license', hwid: 'hardware'
    }), /query_field_invalid/);
});
