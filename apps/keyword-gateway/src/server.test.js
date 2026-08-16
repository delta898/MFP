const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
    resolveGatewayConfig,
    validateGatewayConfig,
    createTtlSingleFlightCache,
    createKeywordGatewayServer
} = require('./server');

function toBase64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function createToken(overrides = {}, secret = 'test-secret') {
    const now = Math.floor(Date.now() / 1000);
    const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = toBase64Url(JSON.stringify({
        iss: 'bloggenius-license',
        aud: 'keyword-gateway',
        sub: 'license-subject',
        scope: 'keyword:analyze',
        iat: now,
        exp: now + 900,
        ...overrides
    }));
    const input = `${header}.${payload}`;
    const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
    return `${input}.${signature}`;
}

function testConfig(overrides = {}) {
    return {
        ...resolveGatewayConfig({
            KEYWORD_ACCESS_TOKEN_SECRET: 'test-secret',
            KEYWORD_MAX_INPUT_COUNT: '3',
            KEYWORD_MAX_RELATED_CANDIDATES: '8'
        }),
        ...overrides
    };
}

async function withServer(options, callback) {
    const server = createKeywordGatewayServer({
        config: testConfig(options.config),
        clients: options.clients || {},
        analyze: options.analyze,
        now: options.now
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const { port } = server.address();
        await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('gateway policy values are configurable and default candidates cannot exceed the maximum', () => {
    const config = resolveGatewayConfig({
        KEYWORD_MAX_INPUT_COUNT: '5',
        KEYWORD_MAX_RELATED_CANDIDATES: '12',
        KEYWORD_DEFAULT_RELATED_CANDIDATES: '50'
    });
    assert.equal(config.maxInputCount, 5);
    assert.equal(config.maxRelatedCandidates, 12);
    assert.equal(config.defaultRelatedCandidates, 12);
});

test('production startup validation requires token and Naver credentials', () => {
    assert.throws(() => validateGatewayConfig(resolveGatewayConfig({})), /configuration is incomplete/);
    assert.doesNotThrow(() => validateGatewayConfig(resolveGatewayConfig({
        KEYWORD_ACCESS_TOKEN_SECRET: 'x'.repeat(32),
        NAVER_SEARCHAD_API_KEY: 'api-key',
        NAVER_SEARCHAD_SECRET_KEY: 'secret-key',
        NAVER_SEARCHAD_CUSTOMER_ID: 'customer',
        NAVER_API_HUB_CLIENT_ID: 'client',
        NAVER_API_HUB_CLIENT_SECRET: 'client-secret'
    })));
});

test('TTL cache coalesces concurrent loads and reuses the result', async () => {
    let loads = 0;
    let resolveLoad;
    const cache = createTtlSingleFlightCache({ ttlMs: 60000, maxEntries: 10 });
    const loader = () => {
        loads += 1;
        return new Promise((resolve) => { resolveLoad = resolve; });
    };
    const first = cache.getOrLoad('keyword', loader);
    const second = cache.getOrLoad('keyword', loader);
    await Promise.resolve();
    resolveLoad({ total: 10 });
    assert.deepEqual(await Promise.all([first, second]), [{ total: 10 }, { total: 10 }]);
    assert.deepEqual(await cache.getOrLoad('keyword', loader), { total: 10 });
    assert.equal(loads, 1);
});

test('analyze endpoint rejects missing tokens', async () => {
    await withServer({ analyze: async () => ({}) }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/keyword-research/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: '제주 여행', keywords: ['제주 여행'] })
        });
        assert.equal(response.status, 401);
        assert.equal((await response.json()).code, 'UNAUTHORIZED');
    });
});

test('analyze endpoint rejects tokens issued for another audience or scope', async () => {
    await withServer({ analyze: async () => ({}) }, async (baseUrl) => {
        for (const token of [
            createToken({ aud: 'trends-api' }),
            createToken({ scope: 'trends:read' }),
            createToken({ exp: Math.floor(Date.now() / 1000) - 1 })
        ]) {
            const response = await fetch(`${baseUrl}/api/v1/keyword-research/analyze`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ subject: '제주 여행', keywords: ['제주 여행'] })
            });
            assert.equal(response.status, 401);
        }
    });
});

test('analyze endpoint applies server candidate policy before orchestration', async () => {
    let received;
    await withServer({
        analyze: async (request, clients, policy) => {
            received = { request, clients, policy };
            return { selected_keyword: request.keywords[0] };
        }
    }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/keyword-research/analyze`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${createToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subject: '제주 여행',
                keywords: ['제주 여행'],
                related_limit: 99
            })
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).analysis.selected_keyword, '제주 여행');
    });
    assert.equal(received.request.related_limit, 8);
    assert.equal(received.request.candidate_limit, 8);
    assert.deepEqual(received.policy, { maxInputCount: 3, maxRelatedCandidates: 8 });
});

test('analyze endpoint rate limits by anonymized license subject', async () => {
    await withServer({
        config: { rateLimitPerMinute: 1, ipRateLimitPerMinute: 10 },
        analyze: async () => ({ selected_keyword: '제주 여행' })
    }, async (baseUrl) => {
        const request = () => fetch(`${baseUrl}/api/v1/keyword-research/analyze`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${createToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subject: '제주 여행', keywords: ['제주 여행'] })
        });
        assert.equal((await request()).status, 200);
        const limited = await request();
        assert.equal(limited.status, 429);
        assert.equal((await limited.json()).code, 'RATE_LIMITED');
    });
});
