const test = require('node:test');
const assert = require('node:assert/strict');

const providerPromise = import('../supabase/functions/_shared/knowledge-provider-serpapi-account.ts');

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return payload; }
    };
}

test('Account API provider returns bounded usage diagnostics without identity or credentials', async () => {
    const { createSerpApiAccountProvider } = await providerPromise;
    const urls = [];
    const provider = createSerpApiAccountProvider({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        getEnv: () => 'developer-secret',
        fetchImpl: async (url) => {
            urls.push(new URL(String(url)));
            return response({
                api_key: 'developer-secret',
                account_id: 'private-account',
                account_email: 'private@example.com',
                account_status: 'Active',
                searches_per_month: 250,
                total_searches_left: 198,
                this_month_usage: 52,
                extra_credits: 0,
                plan_renewal_date: '2026-09-17'
            });
        }
    });

    const result = await provider.check();
    assert.equal(urls[0].origin + urls[0].pathname, 'https://serpapi.com/account.json');
    assert.equal(urls[0].searchParams.get('api_key'), 'developer-secret');
    assert.deepEqual(result, {
        checked_at: '2026-08-25T12:00:00.000Z',
        searches_limit: 250,
        searches_used: 52,
        searches_remaining: 198,
        renewal_date: '2026-09-17'
    });
    assert.equal(JSON.stringify(result).includes('developer-secret'), false);
    assert.equal(JSON.stringify(result).includes('private@example.com'), false);
});

test('Account API provider accepts accounts without a renewal date', async () => {
    const { createSerpApiAccountProvider } = await providerPromise;
    const provider = createSerpApiAccountProvider({
        getEnv: () => 'fixture-secret',
        fetchImpl: async () => response({
            account_status: 'Active', searches_per_month: 250,
            total_searches_left: 250, this_month_usage: 0, extra_credits: 0,
            plan_renewal_date: null
        })
    });
    const result = await provider.check();
    assert.equal(result.renewal_date, '');
});

test('Account API provider classifies auth, inactive and malformed responses with stable codes', async () => {
    const { createSerpApiAccountProvider } = await providerPromise;
    const cases = [
        { response: response({}, 401), code: 'SERPAPI_AUTH_FAILED' },
        { response: response({ account_status: 'Paused' }), code: 'SERPAPI_ACCOUNT_INACTIVE' },
        {
            response: response({
                account_status: 'Active', searches_per_month: 250,
                total_searches_left: 'many', this_month_usage: 1, extra_credits: 0
            }),
            code: 'SERPAPI_ACCOUNT_SEARCHES_REMAINING_INVALID'
        }
    ];
    for (const item of cases) {
        const provider = createSerpApiAccountProvider({
            getEnv: () => 'fixture-secret', fetchImpl: async () => item.response
        });
        await assert.rejects(() => provider.check(), (error) => error.code === item.code);
    }
});

test('Account API provider fails closed on missing credentials and network failure', async () => {
    const { createSerpApiAccountProvider } = await providerPromise;
    await assert.rejects(
        () => createSerpApiAccountProvider({ getEnv: () => '' }).check(),
        (error) => error.code === 'SERPAPI_NOT_CONFIGURED'
    );
    await assert.rejects(
        () => createSerpApiAccountProvider({
            getEnv: () => 'fixture-secret', fetchImpl: async () => { throw new Error('raw network'); }
        }).check(),
        (error) => error.code === 'SERPAPI_ACCOUNT_UPSTREAM_FAILED'
    );
});

