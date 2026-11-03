import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './index.js';

const origin = 'https://www.bloggenius.kr';
const env = {
    TRENDS_ENV: 'test',
    SUPABASE_URL: 'https://supabase.example.test',
    SUPABASE_SECRET_KEY: 'server-only-test-key',
    TRENDS_PUBLIC_ALLOWED_ORIGINS: origin,
    TRENDS_PUBLIC_RATE_LIMIT_PER_MINUTE: '60'
};

function makeRequest(path, { method = 'GET', originHeader = origin, ip = '203.0.113.10' } = {}) {
    const headers = new Headers();
    if (originHeader) headers.set('origin', originHeader);
    if (ip) headers.set('cf-connecting-ip', ip);
    return new Request(`https://trendapi.example.test${path}`, { method, headers });
}

function makeSubscriptionRequest(path, body, options = {}) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (options.originHeader !== '') headers.set('origin', options.originHeader || origin);
    if (options.ip !== '') headers.set('cf-connecting-ip', options.ip || '203.0.113.11');
    return new Request(`https://trendapi.example.test${path}`, { method: options.method || 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('public metadata is CORS-restricted and exposes only display metadata', async () => {
    let upstreamCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        upstreamCalls += 1;
        assert.equal(init.method, 'POST');
        return Response.json({ categories: ['IT·컴퓨터'], availableDates: ['2026-11-01'], dateRange: { min: '2026-11-01', max: '2026-11-01' }, sources: ['naver'], totalRows: 99 });
    };
    try {
        const denied = await handleRequest(makeRequest('/api/v1/public/trends/meta', { originHeader: 'https://not-bloggenius.example' }), env);
        assert.equal(denied.status, 403);
        assert.equal(upstreamCalls, 0);

        const preflight = await handleRequest(makeRequest('/api/v1/public/trends/meta', { method: 'OPTIONS' }), env);
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
        assert.equal(upstreamCalls, 0);

        const response = await handleRequest(makeRequest('/api/v1/public/trends/meta'), env);
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.deepEqual(body.categories, ['IT·컴퓨터']);
        assert.deepEqual(body.availableDates, ['2026-11-01']);
        assert.equal('sources' in body, false);
        assert.equal('totalRows' in body, false);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.match(response.headers.get('cache-control'), /max-age=60/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('public trend queries require one date and one to three categories, then apply a bounded read', async () => {
    let requestedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return Response.json([{ trend_date: '2026-11-01', category: 'IT·컴퓨터', keyword: 'AI 검색', change_raw: '▲ 42', change_type: 'up', change_amount: 42, display_order: 1 }]);
    };
    try {
        const noDate = await handleRequest(makeRequest('/api/v1/public/trends?category=IT'), env);
        assert.equal(noDate.status, 400);
        const tooMany = await handleRequest(makeRequest('/api/v1/public/trends?trend_date=2026-11-01&category=a&category=b&category=c&category=d'), env);
        assert.equal(tooMany.status, 400);
        const unsafeFilter = await handleRequest(makeRequest('/api/v1/public/trends?trend_date=2026-11-01&category=a&source=internal'), env);
        assert.equal(unsafeFilter.status, 400);

        const response = await handleRequest(makeRequest('/api/v1/public/trends?trend_date=2026-11-01&category=IT%C2%B7%EC%BB%B4%ED%93%A8%ED%84%B0&category=%EB%A7%9B%EC%A7%91'), env);
        const body = await response.json();
        const upstream = new URL(requestedUrl);
        assert.equal(response.status, 200);
        assert.equal(body.count, 1);
        assert.equal(body.items[0].keyword, 'AI 검색');
        assert.equal(upstream.searchParams.get('trend_date'), 'eq.2026-11-01');
        assert.equal(upstream.searchParams.get('source'), 'eq.naver_creator_advisor');
        assert.match(upstream.searchParams.get('category'), /^in\./);
        assert.equal(upstream.searchParams.get('limit'), '150');
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('existing authenticated endpoint remains protected', async () => {
    const response = await handleRequest(makeRequest('/api/v1/trends/meta'), env);
    assert.equal(response.status, 401);
});

test('collector completion signals are authenticated, environment-bound, and use a retryable Workflow ID per Development signal', async () => {
    const created = [];
    const integrationEnv = {
        ...env,
        TRENDS_ENV: 'development',
        TRENDS_API_TOKEN: 'collector-only-test-token',
        TRENDS_NEWSLETTER_COLLECTION_WORKFLOW: {
            create: async (input) => {
                if (created.some((item) => item.id === input.id)) throw new Error('instance already exists');
                created.push(input);
                return { id: input.id };
            },
            get: async (id) => ({ id, status: async () => ({ status: 'complete' }) })
        }
    };
    const makeSignal = (body, { token = 'collector-only-test-token', target = 'development' } = {}) => new Request(
        'https://trendapi.example.test/internal/newsletter/collection-complete',
        { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-trends-environment': target, 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    const signal = {
        environment: 'development', trendDate: '2026-11-02', signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', source: 'naver_creator_advisor',
        expectedCategories: 32, itemsPerCategory: 20, itemCount: 640
    };

    const unauthorized = await handleRequest(makeSignal(signal, { token: 'wrong' }), integrationEnv);
    assert.equal(unauthorized.status, 401);
    const wrongTarget = await handleRequest(makeSignal(signal, { target: 'production' }), integrationEnv);
    assert.equal(wrongTarget.status, 409);
    const incomplete = await handleRequest(makeSignal({ ...signal, itemCount: 639 }), integrationEnv);
    assert.equal(incomplete.status, 400);
    const invalidDate = await handleRequest(makeSignal({ ...signal, trendDate: '2026-02-30' }), integrationEnv);
    assert.equal(invalidDate.status, 400);

    const response = await handleRequest(makeSignal(signal), integrationEnv);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).duplicate, false);
    const repeated = await handleRequest(makeSignal(signal), integrationEnv);
    assert.equal(repeated.status, 202);
    assert.equal((await repeated.json()).duplicate, true);
    const intentionalRetry = await handleRequest(makeSignal({ ...signal, signalId: '0549d3ab-2f5a-4c62-8e98-9e6d1c705a10' }), integrationEnv);
    assert.equal(intentionalRetry.status, 202);
    assert.deepEqual(created, [{
        id: 'collection-2026-11-02-f53d0eb8-93d5-4d4a-82b6-2392d13c22f9',
        params: { environment: 'development', trendDate: '2026-11-02', signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', source: 'naver_creator_advisor', signalItemCount: 640 }
    }, {
        id: 'collection-2026-11-02-0549d3ab-2f5a-4c62-8e98-9e6d1c705a10',
        params: { environment: 'development', trendDate: '2026-11-02', signalId: '0549d3ab-2f5a-4c62-8e98-9e6d1c705a10', source: 'naver_creator_advisor', signalItemCount: 640 }
    }]);
});

test('Development requires a UUID signal ID before creating a retryable Workflow', async () => {
    const integrationEnv = {
        ...env,
        TRENDS_ENV: 'development',
        TRENDS_API_TOKEN: 'collector-only-test-token',
        TRENDS_NEWSLETTER_COLLECTION_WORKFLOW: { create: async () => { throw new Error('must not create'); } }
    };
    const response = await handleRequest(new Request('https://trendapi.example.test/internal/newsletter/collection-complete', {
        method: 'POST',
        headers: { authorization: 'Bearer collector-only-test-token', 'x-trends-environment': 'development', 'content-type': 'application/json' },
        body: JSON.stringify({
            environment: 'development', trendDate: '2026-11-02', source: 'naver_creator_advisor',
            expectedCategories: 32, itemsPerCategory: 20, itemCount: 640
        })
    }), integrationEnv);
    assert.equal(response.status, 400);
});

test('Production Workflow IDs remain date-keyed and deduplicate distinct signals', async () => {
    const created = [];
    const integrationEnv = {
        ...env,
        TRENDS_ENV: 'production',
        TRENDS_API_TOKEN: 'collector-only-test-token',
        TRENDS_NEWSLETTER_COLLECTION_WORKFLOW: {
            create: async (input) => {
                if (created.some((item) => item.id === input.id)) throw new Error('instance already exists');
                created.push(input);
                return { id: input.id };
            },
            get: async (id) => ({ id, status: async () => ({ status: 'complete' }) })
        }
    };
    const requestFor = (signalId) => new Request('https://trendapi.example.test/internal/newsletter/collection-complete', {
        method: 'POST',
        headers: { authorization: 'Bearer collector-only-test-token', 'x-trends-environment': 'production', 'content-type': 'application/json' },
        body: JSON.stringify({
            environment: 'production', trendDate: '2026-11-02', signalId,
            source: 'naver_creator_advisor', expectedCategories: 32, itemsPerCategory: 20, itemCount: 640
        })
    });

    const first = await handleRequest(requestFor('f53d0eb8-93d5-4d4a-82b6-2392d13c22f9'), integrationEnv);
    const duplicate = await handleRequest(requestFor('0549d3ab-2f5a-4c62-8e98-9e6d1c705a10'), integrationEnv);
    assert.equal(first.status, 202);
    assert.equal((await first.json()).duplicate, false);
    assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].id, 'collection-2026-11-02');
    assert.equal(created[0].params.signalId, 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9');
});

test('newsletter signup forwards only validated consented values through the private function token', async () => {
    const integrationEnv = {
        ...env,
        TRENDS_NEWSLETTER_FUNCTION_URL: 'https://demo-project.supabase.co/functions/v1/trends-mailing-list',
        TRENDS_NEWSLETTER_WORKER_TOKEN: 'private-worker-function-token',
    };
    const originalFetch = globalThis.fetch;
    let forwarded;
    globalThis.fetch = async (url, init) => {
        forwarded = { url: String(url), init };
        return Response.json({ success: true, message: 'pending' });
    };
    try {
        const bad = await handleRequest(makeSubscriptionRequest('/api/v1/public/subscriptions', {
            email: 'person@example.com', categories: [], consent: true,
        }), integrationEnv);
        assert.equal(bad.status, 400);
        assert.equal(forwarded, undefined);

        const unknownCategory = await handleRequest(makeSubscriptionRequest('/api/v1/public/subscriptions', {
            email: 'person@example.com', categories: ['not-a-naver-category'], consent: true,
        }, { ip: '203.0.113.13' }), integrationEnv);
        assert.equal(unknownCategory.status, 400);
        assert.equal(forwarded, undefined);

        const response = await handleRequest(makeSubscriptionRequest('/api/v1/public/subscriptions', {
            email: 'Person@Example.com', categories: ['IT·컴퓨터', '게임'], consent: true,
        }), integrationEnv);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.match(response.headers.get('access-control-allow-methods'), /POST/);
        assert.equal(forwarded.url, integrationEnv.TRENDS_NEWSLETTER_FUNCTION_URL);
        assert.equal(forwarded.init.headers.authorization, 'Bearer private-worker-function-token');
        assert.deepEqual(JSON.parse(forwarded.init.body), {
            action: 'subscribe', email: 'person@example.com', categories: ['IT·컴퓨터', '게임'], consent: true,
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('newsletter routes reject untrusted origins and fail closed when backend secrets are absent', async () => {
    const denied = await handleRequest(makeSubscriptionRequest('/api/v1/public/subscriptions', {}, { originHeader: 'https://attacker.example' }), env);
    assert.equal(denied.status, 403);

    const missingConfig = await handleRequest(makeSubscriptionRequest('/api/v1/public/subscriptions', {
        email: 'person@example.com', categories: ['게임'], consent: true,
    }, { ip: '203.0.113.12' }), env);
    assert.equal(missingConfig.status, 503);
});

test('confirmation and unsubscribe tokens are forwarded to their matching lifecycle actions', async () => {
    const integrationEnv = {
        ...env,
        TRENDS_NEWSLETTER_FUNCTION_URL: 'https://demo-project.supabase.co/functions/v1/trends-mailing-list',
        TRENDS_NEWSLETTER_WORKER_TOKEN: 'private-worker-function-token',
    };
    const originalFetch = globalThis.fetch;
    const actions = [];
    globalThis.fetch = async (_url, init) => {
        actions.push(JSON.parse(init.body));
        return Response.json({ success: true, message: 'ok' });
    };
    try {
        for (const [path, action, ip] of [
            ['/api/v1/public/subscriptions/confirm', 'confirm', '203.0.113.21'],
            ['/api/v1/public/subscriptions/unsubscribe', 'unsubscribe', '203.0.113.22'],
        ]) {
            const response = await handleRequest(makeSubscriptionRequest(path, { token: 'x'.repeat(43) }, { ip }), integrationEnv);
            assert.equal(response.status, 200);
        }
        assert.deepEqual(actions, [{ action: 'confirm', token: 'x'.repeat(43) }, { action: 'unsubscribe', token: 'x'.repeat(43) }]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
