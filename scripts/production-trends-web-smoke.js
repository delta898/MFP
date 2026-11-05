'use strict';

const crypto = require('node:crypto');

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

function createProductionReadSmokeToken(secret, nowSeconds = Math.floor(Date.now() / 1000)) {
    const signingSecret = String(secret || '').trim();
    if (!signingSecret) throw new Error('TRENDS_READ_TOKEN_SECRET is required for authenticated API smoke.');
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signingInput = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
        iss: 'bloggenius-license',
        aud: 'trends-api',
        sub: crypto.randomUUID(),
        scope: 'trends:read',
        iat: nowSeconds,
        exp: nowSeconds + 300
    })}`;
    const signature = crypto.createHmac('sha256', signingSecret).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
}

async function runAuthenticatedApiSmoke(fetchImpl = fetch, env = process.env) {
    const token = createProductionReadSmokeToken(env.TRENDS_READ_TOKEN_SECRET);
    const results = [];
    for (const host of EXPECTED.api) {
        const url = `${host}/api/v1/trends/meta`;
        results.push(await checkWithRetry(async () => {
            const response = await fetchImpl(url, {
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
                redirect: 'manual',
                signal: AbortSignal.timeout(15000)
            });
            if (!response.ok) throw new Error(`${url} returned HTTP ${response.status} for a Production read token.`);
            const body = await response.json();
            if (body?.success !== true || !Array.isArray(body?.categories) || !Array.isArray(body?.availableDates)) {
                throw new Error(`${url} rejected or could not use the Production read-token contract.`);
            }
            return { url, status: response.status };
        }));
    }
    return results;
}

async function runSmoke(kind, fetchImpl = fetch, env = process.env) {
    if (kind === 'api-auth') return runAuthenticatedApiSmoke(fetchImpl, env);
    const urls = EXPECTED[kind];
    if (!urls) throw new Error('Usage: node scripts/production-trends-web-smoke.js api|api-auth|site');
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
    runSmoke(process.argv[2], fetch, process.env).then((results) => console.info(JSON.stringify({ environment: 'production', checks: results })))
        .catch((error) => { console.error(`[Production web smoke] ${error.message}`); process.exitCode = 1; });
}

module.exports = { EXPECTED, checkUrl, checkWithRetry, createProductionReadSmokeToken, runAuthenticatedApiSmoke, runSmoke };
