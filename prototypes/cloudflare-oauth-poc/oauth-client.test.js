const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
    AUTHORIZATION_URL,
    MEMBERSHIPS_URL,
    TOKEN_URL,
    WORKER_SCRIPTS_URL,
    createCloudflareOAuthClient,
    listCloudflareMemberships,
    listCloudflareWorkerScripts,
    selectCloudflareAccount
} = require('./oauth-client');

function makeResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return payload; }
    };
}

test('authorization request uses Cloudflare endpoints and PKCE S256', () => {
    const client = createCloudflareOAuthClient({
        clientId: 'public-client-id',
        redirectUri: 'http://127.0.0.1:43127/oauth/callback',
        scopes: ['workers-scripts.read', 'workers-scripts.read']
    });

    const flow = client.beginAuthorization();
    const url = new URL(flow.authorizationUrl);

    assert.equal(url.origin + url.pathname, AUTHORIZATION_URL);
    assert.equal(url.searchParams.get('client_id'), 'public-client-id');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:43127/oauth/callback');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('state'), flow.state);
    assert.equal(url.searchParams.get('scope'), 'workers-scripts.read');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
});

test('token exchange sends PKCE verifier and no client secret', async () => {
    let request;
    const client = createCloudflareOAuthClient({
        clientId: 'public-client-id',
        redirectUri: 'http://127.0.0.1:43127/oauth/callback',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return makeResponse({ access_token: 'test-access-token', token_type: 'bearer' });
        }
    });

    const flow = client.beginAuthorization();
    const result = await client.exchangeCode({ code: 'temporary-code', state: flow.state });
    const form = new URLSearchParams(request.options.body);
    const verifier = form.get('code_verifier');
    const expectedChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    assert.equal(result.access_token, 'test-access-token');
    assert.equal(request.url, TOKEN_URL);
    assert.equal(request.options.method, 'POST');
    assert.equal(form.get('client_id'), 'public-client-id');
    assert.equal(form.get('code'), 'temporary-code');
    assert.equal(form.get('redirect_uri'), 'http://127.0.0.1:43127/oauth/callback');
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.has('client_secret'), false);
    assert.equal(new URL(flow.authorizationUrl).searchParams.get('code_challenge'), expectedChallenge);
});

test('invalid or replayed state is rejected without a token request', async () => {
    let requestCount = 0;
    const client = createCloudflareOAuthClient({
        clientId: 'public-client-id',
        redirectUri: 'http://127.0.0.1:43127/oauth/callback',
        fetchImpl: async () => { requestCount += 1; return makeResponse({}); }
    });
    const flow = client.beginAuthorization();

    await assert.rejects(client.exchangeCode({ code: 'code', state: 'wrong-state' }), /invalid, expired, or already used/);
    await client.exchangeCode({ code: 'code', state: flow.state });
    await assert.rejects(client.exchangeCode({ code: 'code', state: flow.state }), /invalid, expired, or already used/);
    assert.equal(requestCount, 1);
});

test('expired state is rejected', async () => {
    let timestamp = 1_000;
    const client = createCloudflareOAuthClient({
        clientId: 'public-client-id',
        redirectUri: 'http://127.0.0.1:43127/oauth/callback',
        now: () => timestamp,
        stateTtlMs: 100,
        fetchImpl: async () => { throw new Error('must not fetch'); }
    });
    const flow = client.beginAuthorization();
    timestamp += 101;

    await assert.rejects(client.exchangeCode({ code: 'code', state: flow.state }), /invalid, expired, or already used/);
});

test('Cloudflare token errors are returned without exposing request data', async () => {
    const client = createCloudflareOAuthClient({
        clientId: 'public-client-id',
        redirectUri: 'http://127.0.0.1:43127/oauth/callback',
        fetchImpl: async () => makeResponse({ error: 'invalid_grant' }, 400)
    });
    const flow = client.beginAuthorization();

    await assert.rejects(
        client.exchangeCode({ code: 'temporary-code', state: flow.state }),
        /Cloudflare OAuth token exchange failed: invalid_grant/
    );
});

test('membership lookup uses the OAuth bearer token and returns linked accounts', async () => {
    let request;
    const memberships = [{ account: { id: 'account-id', name: 'Example account' }, status: 'accepted' }];
    const result = await listCloudflareMemberships('temporary-access-token', {
        fetchImpl: async (url, options) => {
            request = { url, options };
            return makeResponse({ success: true, result: memberships });
        }
    });

    assert.equal(request.url, MEMBERSHIPS_URL);
    assert.equal(request.options.headers.Authorization, 'Bearer temporary-access-token');
    assert.deepEqual(result, memberships);
});

test('membership lookup reports API errors without including the access token', async () => {
    await assert.rejects(
        listCloudflareMemberships('temporary-access-token', {
            fetchImpl: async () => makeResponse({ success: false, errors: [{ message: 'Forbidden' }] }, 403)
        }),
        (error) => error.message.includes('Forbidden') && !error.message.includes('temporary-access-token')
    );
});

test('account selection requires membership authorization and avoids guessing across accounts', () => {
    const memberships = [
        { account: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'First account' } },
        { account: { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Second account' } }
    ];

    assert.throws(() => selectCloudflareAccount(memberships), /Multiple Cloudflare accounts are available.*CF_ACCOUNT_ID.*aaaaaaaa/);
    assert.equal(selectCloudflareAccount(memberships, memberships[1].account.id), memberships[1].account);
    assert.equal(selectCloudflareAccount([memberships[0]]), memberships[0].account);
    assert.throws(() => selectCloudflareAccount(memberships, 'cccccccccccccccccccccccccccccccc'), /not in the authorized membership list/);
});

test('Worker script listing sends a bearer read request for a validated account', async () => {
    let request;
    const scripts = [{ id: 'site-worker', has_assets: true }, { id: 'api-worker', has_assets: false }];
    const result = await listCloudflareWorkerScripts('temporary-access-token', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
        fetchImpl: async (url, options) => {
            request = { url, options };
            return makeResponse({ success: true, result: scripts });
        }
    });

    assert.equal(request.url, `${WORKER_SCRIPTS_URL}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/scripts`);
    assert.equal(request.options.headers.Authorization, 'Bearer temporary-access-token');
    assert.deepEqual(result, scripts);
    assert.deepEqual(result.filter((script) => script.has_assets === true).map((script) => script.id), ['site-worker']);
});

test('Worker script listing rejects invalid account IDs before making a request', async () => {
    let requestCount = 0;
    await assert.rejects(
        listCloudflareWorkerScripts('temporary-access-token', 'not-an-account-id', {
            fetchImpl: async () => { requestCount += 1; return makeResponse({}); }
        }),
        /32 hexadecimal characters/
    );
    assert.equal(requestCount, 0);
});

test('Worker script API errors do not include the access token', async () => {
    await assert.rejects(
        listCloudflareWorkerScripts('temporary-access-token', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
            fetchImpl: async () => makeResponse({ success: false, errors: [{ message: 'Forbidden' }] }, 403)
        }),
        (error) => error.message.includes('Forbidden') && !error.message.includes('temporary-access-token')
    );
});
