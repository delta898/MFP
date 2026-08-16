const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordResearchSupabaseClient, readFunctionError } = require('./supabase-client');

test('Supabase keyword gateway adds authenticated context to each observation request', async () => {
    const calls = [];
    const client = createKeywordResearchSupabaseClient({
        License: { resolveAuthenticatedServerContext: async () => ({ success: true, licenseKey: 'license-key', hwid: 'hardware-id' }) },
        client: {
            functions: {
                invoke: async (...args) => {
                    calls.push(args);
                    const operation = args[1].body.operation;
                    return {
                        data: operation === 'search_ad'
                            ? { success: true, search_ad: [{ keyword: '제주 여행', rows: [] }] }
                            : { success: true, weekly_documents: [{ keyword: '제주 여행', result: { count: 1 } }] },
                        error: null
                    };
                }
            }
        }
    });

    const searchAd = await client.fetchSearchAdCandidates({ keywords: ['제주 여행'] });
    const weeklyDocuments = await client.fetchWeeklyDocuments({ keywords: ['제주 여행'] });

    assert.equal(searchAd[0].keyword, '제주 여행');
    assert.equal(weeklyDocuments[0].result.count, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], 'keyword-research');
    assert.equal(calls[0][1].body.operation, 'search_ad');
    assert.equal(calls[1][1].body.operation, 'weekly_documents');
    assert.equal(calls[0][1].body.licenseKey, 'license-key');
    assert.equal(calls[0][1].body.hwid, 'hardware-id');
});

test('Supabase keyword gateway stops before invocation when license context is unavailable', async () => {
    let invoked = false;
    const client = createKeywordResearchSupabaseClient({
        License: { resolveAuthenticatedServerContext: async () => ({ success: false, message: 'inactive' }) },
        client: { functions: { invoke: async () => { invoked = true; } } }
    });
    await assert.rejects(client.fetchSearchAdCandidates({}), /inactive/);
    assert.equal(invoked, false);
});

test('Supabase function rate-limit errors become stable user messages', async () => {
    const response = new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429 });
    const error = await readFunctionError({ context: response });
    assert.equal(error.status, 429);
    assert.match(error.message, /요청이 많습니다/);
});
