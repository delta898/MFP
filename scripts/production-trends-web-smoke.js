'use strict';

const EXPECTED = Object.freeze({
    api: [
        'https://trendapi.hangadac.com',
        'https://trendapi.bloggenius.kr'
    ],
    site: ['https://www.bloggenius.kr/']
});

async function checkUrl(url, kind, fetchImpl = fetch) {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
    if (kind === 'api') {
        const body = await response.json();
        if (body?.success !== true || body?.service !== 'trends-api' || body?.environment !== 'production') {
            throw new Error(`${url} did not report a healthy Production Trends API.`);
        }
    } else {
        const body = await response.text();
        if (!body.includes('<html') && !body.includes('<!doctype html')) {
            throw new Error(`${url} did not return an HTML document.`);
        }
    }
    return { url, status: response.status };
}

async function checkWithRetry(check) {
    let lastError;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
        try { return await check(); }
        catch (error) {
            lastError = error;
            if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
    throw lastError;
}

async function runSmoke(kind, fetchImpl = fetch) {
    const urls = EXPECTED[kind];
    if (!urls) throw new Error('Usage: node scripts/production-trends-web-smoke.js api|site');
    const results = [];
    for (const url of urls) {
        if (kind === 'api') {
            results.push(await checkWithRetry(() => checkUrl(`${url}/health`, 'api', fetchImpl)));
            results.push(await checkWithRetry(async () => {
                const metadataUrl = `${url}/api/v1/public/trends/meta`;
                const metadataResponse = await fetchImpl(metadataUrl, {
                    headers: { Origin: 'https://www.bloggenius.kr' },
                    redirect: 'manual',
                    signal: AbortSignal.timeout(15000)
                });
                if (!metadataResponse.ok) throw new Error(`${metadataUrl} returned HTTP ${metadataResponse.status}.`);
                const metadata = await metadataResponse.json();
                if (metadata?.success !== true || !Array.isArray(metadata?.categories) || !Array.isArray(metadata?.availableDates)) {
                    throw new Error(`${url} did not return usable public trend metadata.`);
                }
                return { url: metadataUrl, status: metadataResponse.status };
            }));
        } else {
            results.push(await checkWithRetry(() => checkUrl(url, kind, fetchImpl)));
        }
    }
    return results;
}

if (require.main === module) {
    runSmoke(process.argv[2]).then((results) => console.info(JSON.stringify({ environment: 'production', checks: results })))
        .catch((error) => { console.error(`[Production web smoke] ${error.message}`); process.exitCode = 1; });
}

module.exports = { EXPECTED, checkUrl, checkWithRetry, runSmoke };
