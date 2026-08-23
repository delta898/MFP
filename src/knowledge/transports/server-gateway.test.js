const test = require('node:test');
const assert = require('node:assert/strict');

const { createServerGatewayTransport, normalizeGatewayQuery } = require('./server-gateway');

test('server gateway sends only bounded semantic query fields', async () => {
    const calls = [];
    const snapshot = { schema_version: 1, snapshot_id: 'ks_fixture' };
    const transport = createServerGatewayTransport({
        client: {
            async fetchSnapshot(request) {
                calls.push(request);
                return snapshot;
            }
        }
    });
    assert.equal(await transport.fetch({
        kind: 'news',
        config: { purpose: 'content_ideas', api_key: 'must-not-pass', locale: 'ko-KR' }
    }, {
        topic: 'AI 뉴스',
        limit: 999,
        locale: 'attacker-locale',
        country: 'XX',
        ownerProfile: { secret: true },
        url: 'https://attacker.example'
    }), snapshot);
    assert.deepEqual(calls[0], {
        kind: 'news',
        purpose: 'content_ideas',
        query: { topic: 'AI 뉴스', locale: 'ko-KR', country: 'KR', limit: 20 }
    });
});

test('server gateway rejects unknown kinds and purposes', async () => {
    const transport = createServerGatewayTransport({ client: { async fetchSnapshot() { return {}; } } });
    await assert.rejects(() => transport.fetch({ kind: 'weather', config: {} }), /kind is not allowed/);
    await assert.rejects(() => transport.fetch({ kind: 'news', config: { purpose: 'admin' } }), /purpose is not allowed/);
    assert.deepEqual(normalizeGatewayQuery({}, {}), {
        topic: '', locale: 'ko-KR', country: 'KR', limit: 10
    });
});
