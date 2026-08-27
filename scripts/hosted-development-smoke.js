#!/usr/bin/env node
'use strict';

const { loadProjectEnvironment } = require('./project-environment');

const FUNCTION_NAMES = Object.freeze([
    'send-license-code',
    'issue-trends-access-token',
    'keyword-research',
    'knowledge-gateway',
    'serpapi-news-collector'
]);

function normalizeText(value) {
    return String(value || '').trim();
}

function resolveSmokeConfig(env = process.env) {
    const environment = normalizeText(env.BLOGGENIUS_ENV).toLowerCase();
    const url = normalizeText(env.BLOGGENIUS_DEVELOPMENT_SUPABASE_URL).replace(/\/+$/, '');
    const publishableKey = normalizeText(env.BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY);
    const productionUrl = normalizeText(env.BLOGGENIUS_PRODUCTION_SUPABASE_URL).replace(/\/+$/, '');
    if (environment !== 'development') throw new Error('BLOGGENIUS_ENV must be development');
    if (!url) throw new Error('development Supabase URL is required');
    if (!publishableKey) throw new Error('development public Supabase key is required');
    if (!/^https:\/\//i.test(url)) throw new Error('development Supabase URL must use HTTPS');
    if (productionUrl && url === productionUrl) throw new Error('development URL matches production');
    return Object.freeze({ url, publishableKey });
}

async function runHostedDevelopmentSmoke(options = {}) {
    const fetchImpl = options.fetch || fetch;
    const config = resolveSmokeConfig(options.env || process.env);
    const headers = { apikey: config.publishableKey };
    const checks = [];

    const restResponse = await fetchImpl(`${config.url}/rest/v1/`, { headers });
    const restBody = typeof restResponse.text === 'function'
        ? await restResponse.text()
        : '';
    const publicKeyRestriction = [401, 403].includes(restResponse.status)
        && /secret api key required|admin(?:istrative)? key required/i.test(restBody);
    checks.push({
        name: 'rest_gateway',
        // Legacy anon keys may read the OpenAPI root (200). New publishable keys are
        // intentionally denied schema discovery; only that explicit restriction is accepted.
        ok: restResponse.status === 200 || publicKeyRestriction,
        status: restResponse.status
    });

    for (const name of FUNCTION_NAMES) {
        const response = await fetchImpl(`${config.url}/functions/v1/${name}`, {
            method: 'GET',
            headers
        });
        checks.push({
            name: `function:${name}`,
            ok: [401, 405].includes(response.status),
            status: response.status
        });
    }

    return Object.freeze({
        target: 'development',
        connection: 'supabase_http',
        safeMode: true,
        paidProviderCalls: false,
        mutations: false,
        passed: checks.every((check) => check.ok),
        checks: Object.freeze(checks.map(Object.freeze))
    });
}

function formatSmoke(result) {
    const lines = [
        'BlogGenius development Supabase safe smoke',
        `Decision: ${result.passed ? 'PASSED' : 'FAILED'}`,
        'Connection: public Supabase HTTP contract',
        'Paid provider calls: blocked',
        'Database mutations: none'
    ];
    for (const check of result.checks) {
        lines.push(`${check.ok ? 'PASS' : 'FAIL'} ${check.name} (${check.status})`);
    }
    return `${lines.join('\n')}\n`;
}

if (require.main === module) {
    runHostedDevelopmentSmoke({ env: loadProjectEnvironment() })
        .then((result) => {
            process.stdout.write(formatSmoke(result));
            process.exitCode = result.passed ? 0 : 1;
        })
        .catch((error) => {
            process.stderr.write(`Development Supabase smoke failed: ${error.message}\n`);
            process.exitCode = 1;
        });
}

module.exports = {
    FUNCTION_NAMES,
    resolveSmokeConfig,
    runHostedDevelopmentSmoke,
    formatSmoke
};
