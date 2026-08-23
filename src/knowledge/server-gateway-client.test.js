const test = require('node:test');
const assert = require('node:assert/strict');

const {
    KNOWLEDGE_GATEWAY_FUNCTION,
    createKnowledgeServerGatewayClient,
    readGatewayError
} = require('./server-gateway-client');

test('invokes the fixed gateway with authenticated context and returns only the snapshot', async () => {
    const calls = [];
    const snapshot = { schema_version: 1, snapshot_id: 'ks_1' };
    const client = createKnowledgeServerGatewayClient({
        License: {
            async resolveAuthenticatedServerContext() {
                return { success: true, licenseKey: 'license-secret', hwid: 'hardware-secret' };
            }
        },
        client: {
            functions: {
                async invoke(name, options) {
                    calls.push({ name, options });
                    return { data: { success: true, snapshot }, error: null };
                }
            }
        }
    });

    assert.equal(await client.fetchSnapshot({ kind: 'news', purpose: 'content_ideas', query: { topic: 'AI' } }), snapshot);
    assert.equal(calls[0].name, KNOWLEDGE_GATEWAY_FUNCTION);
    assert.deepEqual(calls[0].options.body, {
        schema_version: 1,
        kind: 'news',
        purpose: 'content_ideas',
        query: { topic: 'AI' },
        licenseKey: 'license-secret',
        hwid: 'hardware-secret'
    });
});

test('maps gateway errors without exposing remote messages', async () => {
    const wrapped = await readGatewayError({
        context: {
            status: 429,
            async json() {
                return { code: 'RATE_LIMITED', message: 'provider-key=secret' };
            }
        }
    });
    assert.equal(wrapped.code, 'RATE_LIMITED');
    assert.equal(wrapped.status, 429);
    assert.doesNotMatch(wrapped.message, /provider-key|secret/);
});
