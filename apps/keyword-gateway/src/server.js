const http = require('http');
const { URL } = require('url');
const { analyzeKeywords, parseKeywords } = require('../../../src/keyword-research/keyword-analyzer');
const { createNaverSearchAdClient } = require('../../../src/keyword-research/naver-search-ad-client');
const { createNaverBlogSearchClient } = require('../../../src/keyword-research/naver-blog-search-client');
const { verifyLicenseAccessToken } = require('../../../shared/license-access-token');

function toInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInt(value, fallback, min, max) {
    return Math.min(max, Math.max(min, toInt(value, fallback)));
}

function resolveGatewayConfig(env = process.env) {
    const maxRelatedCandidates = clampInt(env.KEYWORD_MAX_RELATED_CANDIDATES, 8, 1, 100);
    return {
        host: String(env.KEYWORD_GATEWAY_HOST || '127.0.0.1').trim() || '127.0.0.1',
        port: clampInt(env.KEYWORD_GATEWAY_PORT, 4582, 1, 65535),
        tokenSecret: String(env.KEYWORD_ACCESS_TOKEN_SECRET || '').trim(),
        tokenIssuer: String(env.KEYWORD_ACCESS_TOKEN_ISSUER || 'bloggenius-license').trim(),
        tokenAudience: String(env.KEYWORD_ACCESS_TOKEN_AUDIENCE || 'keyword-gateway').trim(),
        maxInputCount: clampInt(env.KEYWORD_MAX_INPUT_COUNT, 3, 1, 10),
        maxRelatedCandidates,
        defaultRelatedCandidates: clampInt(env.KEYWORD_DEFAULT_RELATED_CANDIDATES, 8, 1, maxRelatedCandidates),
        minSearchVolume: clampInt(env.KEYWORD_MIN_SEARCH_VOLUME, 300, 0, 100000000),
        rateLimitPerMinute: clampInt(env.KEYWORD_RATE_LIMIT_PER_MINUTE, 20, 1, 10000),
        ipRateLimitPerMinute: clampInt(env.KEYWORD_IP_RATE_LIMIT_PER_MINUTE, 60, 1, 10000),
        maxConcurrentRequests: clampInt(env.KEYWORD_MAX_CONCURRENT_REQUESTS, 8, 1, 100),
        maxBodyBytes: clampInt(env.KEYWORD_MAX_BODY_BYTES, 32768, 1024, 1048576),
        requestTimeoutMs: clampInt(env.KEYWORD_REQUEST_TIMEOUT_MS, 30000, 1000, 120000),
        searchAdCacheTtlMs: clampInt(env.KEYWORD_SEARCHAD_CACHE_TTL_MS, 21600000, 1000, 86400000),
        blogCacheTtlMs: clampInt(env.KEYWORD_BLOG_CACHE_TTL_MS, 3600000, 1000, 86400000),
        cacheMaxEntries: clampInt(env.KEYWORD_CACHE_MAX_ENTRIES, 2000, 10, 100000),
        naver: {
            searchAdApiKey: String(env.NAVER_SEARCHAD_API_KEY || '').trim(),
            searchAdSecretKey: String(env.NAVER_SEARCHAD_SECRET_KEY || '').trim(),
            searchAdCustomerId: String(env.NAVER_SEARCHAD_CUSTOMER_ID || '').trim(),
            apiHubClientId: String(env.NAVER_API_HUB_CLIENT_ID || '').trim(),
            apiHubClientSecret: String(env.NAVER_API_HUB_CLIENT_SECRET || '').trim(),
            openApiClientId: String(env.NAVER_CLIENT_ID || env.NAVER_SEARCH_CLIENT_ID || '').trim(),
            openApiClientSecret: String(env.NAVER_CLIENT_SECRET || env.NAVER_SEARCH_CLIENT_SECRET || '').trim()
        }
    };
}

function validateGatewayConfig(config) {
    const missing = [];
    if (String(config?.tokenSecret || '').length < 32) missing.push('KEYWORD_ACCESS_TOKEN_SECRET');
    if (!config?.naver?.searchAdApiKey) missing.push('NAVER_SEARCHAD_API_KEY');
    if (!config?.naver?.searchAdSecretKey) missing.push('NAVER_SEARCHAD_SECRET_KEY');
    if (!config?.naver?.searchAdCustomerId) missing.push('NAVER_SEARCHAD_CUSTOMER_ID');
    const hasBlogCredentials = Boolean(
        (config?.naver?.apiHubClientId && config?.naver?.apiHubClientSecret)
        || (config?.naver?.openApiClientId && config?.naver?.openApiClientSecret)
    );
    if (!hasBlogCredentials) missing.push('NAVER_API_HUB_CLIENT_ID/SECRET');
    if (missing.length > 0) {
        throw new Error(`Keyword Gateway configuration is incomplete: ${missing.join(', ')}`);
    }
    return config;
}

function createTtlSingleFlightCache(options = {}) {
    const ttlMs = Math.max(1000, Number(options.ttlMs) || 60000);
    const maxEntries = Math.max(1, Number(options.maxEntries) || 1000);
    const now = options.now || (() => Date.now());
    const entries = new Map();
    const pending = new Map();

    function prune() {
        const current = now();
        for (const [key, entry] of entries) {
            if (entry.expiresAt <= current) entries.delete(key);
        }
        while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
    }

    return {
        async getOrLoad(key, loader) {
            const normalizedKey = String(key || '');
            const cached = entries.get(normalizedKey);
            if (cached && cached.expiresAt > now()) return cached.value;
            if (pending.has(normalizedKey)) return pending.get(normalizedKey);
            const task = Promise.resolve().then(loader);
            pending.set(normalizedKey, task);
            try {
                const value = await task;
                prune();
                entries.set(normalizedKey, { value, expiresAt: now() + ttlMs });
                return value;
            } finally {
                pending.delete(normalizedKey);
            }
        },
        size() { return entries.size; }
    };
}

function createFixedWindowRateLimiter(limitPerMinute, now = () => Date.now()) {
    const entries = new Map();
    return {
        tryConsume(key) {
            const current = now();
            const windowStart = Math.floor(current / 60000) * 60000;
            const previous = entries.get(key);
            const next = previous?.windowStart === windowStart
                ? { windowStart, count: previous.count + 1 }
                : { windowStart, count: 1 };
            entries.set(key, next);
            return {
                allowed: next.count <= limitPerMinute,
                retryAfterSeconds: Math.max(1, Math.ceil((windowStart + 60000 - current) / 1000))
            };
        }
    };
}

function createConcurrencyGate(limit) {
    let active = 0;
    return {
        tryEnter() {
            if (active >= limit) return false;
            active += 1;
            return true;
        },
        leave() { active = Math.max(0, active - 1); }
    };
}

function extractBearerToken(req) {
    const match = String(req?.headers?.authorization || '').trim().match(/^Bearer\s+(.+)$/i);
    return match ? String(match[1]).trim() : '';
}

function clientIp(req) {
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || String(req?.socket?.remoteAddress || 'unknown');
}

function sendJson(res, status, payload, headers = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...headers
    });
    res.end(body);
}

async function readJsonBody(req, maxBytes) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) {
            const error = new Error('request_body_too_large');
            error.code = 'BODY_TOO_LARGE';
            throw error;
        }
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
}

function normalizeCacheKey(value) {
    return String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function createGatewayClients(config, options = {}) {
    const searchAdBase = options.searchAdClient || createNaverSearchAdClient({
        apiKey: config.naver.searchAdApiKey,
        secretKey: config.naver.searchAdSecretKey,
        customerId: config.naver.searchAdCustomerId,
        httpClient: options.httpClient,
        logger: options.logger
    });
    const blogBase = options.blogSearchClient || createNaverBlogSearchClient({
        apiHubClientId: config.naver.apiHubClientId,
        apiHubClientSecret: config.naver.apiHubClientSecret,
        openApiClientId: config.naver.openApiClientId,
        openApiClientSecret: config.naver.openApiClientSecret,
        httpClient: options.httpClient
    });
    const searchAdCache = createTtlSingleFlightCache({ ttlMs: config.searchAdCacheTtlMs, maxEntries: config.cacheMaxEntries });
    const blogCache = createTtlSingleFlightCache({ ttlMs: config.blogCacheTtlMs, maxEntries: config.cacheMaxEntries });
    return {
        searchAdClient: {
            isConfigured: () => searchAdBase.isConfigured(),
            fetchKeywordRows: (keyword) => searchAdCache.getOrLoad(normalizeCacheKey(keyword), () => searchAdBase.fetchKeywordRows(keyword))
        },
        blogSearchClient: {
            isConfigured: () => blogBase.isConfigured(),
            fetchBlogTotal: (keyword) => blogCache.getOrLoad(normalizeCacheKey(keyword), () => blogBase.fetchBlogTotal(keyword))
        }
    };
}

function createKeywordGatewayServer(options = {}) {
    const config = options.config || resolveGatewayConfig(options.env);
    const clients = options.clients || createGatewayClients(config, options);
    const licenseLimiter = createFixedWindowRateLimiter(config.rateLimitPerMinute, options.now);
    const ipLimiter = createFixedWindowRateLimiter(config.ipRateLimitPerMinute, options.now);
    const concurrency = createConcurrencyGate(config.maxConcurrentRequests);
    const analyze = options.analyze || analyzeKeywords;

    return http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (req.method === 'GET' && url.pathname === '/health') {
            return sendJson(res, 200, { success: true, service: 'keyword-gateway' });
        }
        if (req.method !== 'POST' || url.pathname !== '/api/v1/keyword-research/analyze') {
            return sendJson(res, 404, { success: false, code: 'NOT_FOUND', message: 'not_found' });
        }

        const claims = verifyLicenseAccessToken(extractBearerToken(req), {
            secret: config.tokenSecret,
            issuer: config.tokenIssuer,
            audience: config.tokenAudience,
            scope: 'keyword:analyze'
        });
        if (!claims) return sendJson(res, 401, { success: false, code: 'UNAUTHORIZED', message: 'unauthorized' });

        for (const limit of [
            ipLimiter.tryConsume(`ip:${clientIp(req)}`),
            licenseLimiter.tryConsume(`license:${claims.sub}`)
        ]) {
            if (!limit.allowed) {
                return sendJson(res, 429, { success: false, code: 'RATE_LIMITED', message: 'rate_limited' }, {
                    'Retry-After': String(limit.retryAfterSeconds)
                });
            }
        }
        if (!concurrency.tryEnter()) {
            return sendJson(res, 503, { success: false, code: 'BUSY', message: 'server_busy' });
        }

        req.setTimeout(config.requestTimeoutMs);
        try {
            const body = await readJsonBody(req, config.maxBodyBytes);
            const keywords = parseKeywords(body.keywords || body.keyword);
            const requestedLimit = toInt(body.related_limit ?? body.relatedLimit, config.defaultRelatedCandidates);
            const relatedLimit = Math.min(config.maxRelatedCandidates, Math.max(1, requestedLimit));
            const result = await analyze({
                keywords,
                subject: String(body.subject || '').trim(),
                related_assist: body.related_assist ?? body.relatedAssist ?? true,
                related_limit: relatedLimit,
                candidate_limit: relatedLimit,
                min_search_volume: Math.max(config.minSearchVolume, toInt(body.min_search_volume, config.minSearchVolume))
            }, clients, {
                maxInputCount: config.maxInputCount,
                maxRelatedCandidates: config.maxRelatedCandidates
            });
            return sendJson(res, 200, { success: true, analysis: result });
        } catch (error) {
            const badRequest = error?.code === 'BODY_TOO_LARGE'
                || error instanceof SyntaxError
                || /필요|최대|사이|이상|파싱/.test(String(error?.message || ''));
            return sendJson(res, badRequest ? 400 : 502, {
                success: false,
                code: badRequest ? 'INVALID_REQUEST' : 'UPSTREAM_FAILED',
                message: badRequest ? String(error.message) : 'keyword_upstream_failed'
            });
        } finally {
            concurrency.leave();
        }
    });
}

if (require.main === module) {
    const config = validateGatewayConfig(resolveGatewayConfig());
    const server = createKeywordGatewayServer({ config });
    server.listen(config.port, config.host, () => {
        console.log(`[KeywordGateway] listening on http://${config.host}:${config.port}`);
    });
}

module.exports = {
    resolveGatewayConfig,
    validateGatewayConfig,
    createTtlSingleFlightCache,
    createFixedWindowRateLimiter,
    createGatewayClients,
    createKeywordGatewayServer
};
