const test = require('node:test');
const assert = require('node:assert/strict');

const { createKnowledgeRegistry } = require('./registry');

test('registry validates gateway snapshots and isolates one provider failure', async () => {
    const warnings = [];
    const registry = createKnowledgeRegistry({
        now: () => '2026-08-23T00:00:00.000Z',
        providerDefinitions: [
            { id: 'gateway-news', kind: 'news', transport: 'server_gateway', enabled: true },
            { id: 'legacy-trends', kind: 'trends', transport: 'builtin_api', enabled: true }
        ],
        transports: {
            server_gateway: {
                async fetch() {
                    const error = new Error('remote payload leaked secret=abc');
                    error.code = 'INVALID_UPSTREAM_RESPONSE';
                    throw error;
                }
            },
            builtin_api: {
                async fetch() {
                    return [{ title: '정상 트렌드' }];
                }
            }
        },
        logger: { info() {}, warn(message) { warnings.push(message); } }
    });

    const results = await registry.fetchAll();
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
        provider_id: 'gateway-news',
        kind: 'news',
        transport: 'server_gateway',
        items: [],
        error: 'server gateway fetch failed',
        error_code: 'INVALID_UPSTREAM_RESPONSE'
    });
    assert.equal(results[1].items[0].title, '정상 트렌드');
    assert.doesNotMatch(warnings[0], /secret|abc|remote payload/);
});

test('registry rejects a gateway snapshot that changes its provider identity', async () => {
    const registry = createKnowledgeRegistry({
        providerDefinitions: [{
            id: 'gateway-news', kind: 'news', transport: 'server_gateway', enabled: true
        }],
        transports: {
            server_gateway: {
                async fetch() {
                    return {
                        schema_version: 1,
                        snapshot_id: 'ks_other',
                        kind: 'news',
                        provider_id: 'foreign-provider',
                        transport: 'server_gateway',
                        freshness: 'fresh',
                        observed_at: '2026-08-23T00:00:00Z',
                        expires_at: '2026-08-23T01:00:00Z',
                        items: []
                    };
                }
            }
        }
    });
    const [result] = await registry.fetchAll();
    assert.equal(result.error, 'server gateway fetch failed');
    assert.equal(result.items.length, 0);
});
