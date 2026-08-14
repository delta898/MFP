const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapabilityRegistry } = require('../capabilities');

test('adds the built-in Naver provider to content idea routing', async () => {
    const requests = [];
    const registry = createCapabilityRegistry({
        CONFIG: {
            knowledge: { providers: [], routing: { content_ideas: [] } }
        },
        Logger: { info() {}, warn() {} },
        License: {
            async issueTrendsAccessToken() {
                return { success: true, accessToken: 'fixture-token', expiresAt: '2099-01-01T00:00:00.000Z' };
            }
        },
        axios: {
            async get(url, options = {}) {
                requests.push({ url, options });
                if (url.endsWith('/api/v1/trends/meta')) {
                    return {
                        data: {
                            success: true,
                            categories: ['IT·컴퓨터'],
                            availableDates: ['2026-08-14'],
                            dateRange: { min: '2026-08-14', max: '2026-08-14' }
                        }
                    };
                }
                return {
                    data: {
                        success: true,
                        items: [{
                            keyword: 'AI 글쓰기',
                            category: 'IT·컴퓨터',
                            trend_date: '2026-08-14',
                            change_type: 'new',
                            change_amount: null,
                            change_raw: 'new',
                            display_order: 1
                        }]
                    }
                };
            }
        }
    });

    assert.deepEqual(registry.knowledgeRouting.content_ideas, ['naver-trends']);
    const snapshots = await registry.knowledgeRegistry.fetchForRoute('content_ideas', {
        kind: 'trends',
        limit: 5
    });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].provider_id, 'naver-trends');
    assert.equal(snapshots[0].items[0].metadata.source, 'naver_trend');
    assert.equal(snapshots[0].items[0].metadata.evidence_stage, 'observed');
    assert.equal(requests.length, 2);
});

test('an explicit disabled Naver provider overrides the built-in default', async () => {
    const registry = createCapabilityRegistry({
        CONFIG: {
            knowledge: {
                providers: [{
                    id: 'naver-trends',
                    kind: 'trends',
                    transport: 'builtin_api',
                    enabled: false,
                    config: { vendor: 'naver_trend_posting' }
                }],
                routing: { content_ideas: ['naver-trends'] }
            }
        },
        Logger: { info() {}, warn() {} }
    });

    const snapshots = await registry.knowledgeRegistry.fetchForRoute('content_ideas', { kind: 'trends' });
    assert.deepEqual(snapshots, []);
});
