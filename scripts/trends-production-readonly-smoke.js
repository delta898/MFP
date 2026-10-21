const PRODUCTION_BASE_URL = 'https://trendapi.hangadac.com';
const REQUEST_TIMEOUT_MS = 10_000;

async function get(path) {
    const response = await fetch(`${PRODUCTION_BASE_URL}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    return response;
}

async function main() {
    console.log(`[Trends Production Smoke] GET ${PRODUCTION_BASE_URL}/health`);
    const healthResponse = await get('/health');
    const health = await healthResponse.json();
    if (!healthResponse.ok || health.success !== true || health.service !== 'trends-api'
        || health.environment !== 'production') {
        throw new Error(`Production health check failed (HTTP ${healthResponse.status})`);
    }
    console.log('[Trends Production Smoke] health=ok environment=production');

    console.log(`[Trends Production Smoke] GET ${PRODUCTION_BASE_URL}/api/v1/trends/meta (without credentials)`);
    const protectedResponse = await get('/api/v1/trends/meta');
    if (protectedResponse.status !== 401) {
        throw new Error(`Expected unauthenticated metadata request to return 401; received ${protectedResponse.status}`);
    }
    console.log('[Trends Production Smoke] read endpoint authentication boundary=ok (HTTP 401)');
}

main().catch((error) => {
    console.error(`[Trends Production Smoke] failed: ${error.message}`);
    process.exitCode = 1;
});
