const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createKeywordResearchSupabaseClient,
    readFunctionError
} = require('./supabase-client');

test('Supabase keyword client adds authenticated license context to one function invocation', async () => {
    let captured;
    const client = createKeywordResearchSupabaseClient({
        License: {
            resolveAuthenticatedServerContext: async () => ({
                success: true,
                licenseKey: 'license-key',
                hwid: 'hardware-id'
            })
        },
        client: {
            functions: {
                invoke: async (...args) => {
                    captured = args;
                    return { data: { success: true, analysis: { selected_keyword: '제주 여행' } }, error: null };
                }
            }
        }
    });
    const result = await client.analyze({
        subject: '제주 여행',
        keywords: ['제주 여행'],
        licenseKey: 'caller-value'
    });
    assert.equal(result.selected_keyword, '제주 여행');
    assert.equal(captured[0], 'keyword-research');
    assert.equal(captured[1].body.licenseKey, 'license-key');
    assert.equal(captured[1].body.hwid, 'hardware-id');
});

test('Supabase keyword client stops before invocation when license context is unavailable', async () => {
    let invoked = false;
    const client = createKeywordResearchSupabaseClient({
        License: { resolveAuthenticatedServerContext: async () => ({ success: false, message: 'inactive' }) },
        client: { functions: { invoke: async () => { invoked = true; } } }
    });
    await assert.rejects(client.analyze({}), /inactive/);
    assert.equal(invoked, false);
});

test('Supabase function rate-limit errors become stable user messages', async () => {
    const response = new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429 });
    const error = await readFunctionError({ context: response });
    assert.equal(error.status, 429);
    assert.match(error.message, /요청이 많습니다/);
});
