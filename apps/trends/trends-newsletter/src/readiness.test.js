import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEVELOPMENT_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_PROJECT_REF,
    NAVER_TRENDS_CATEGORIES,
    evaluateTrendsReadiness,
    getReadinessExpectations,
    previousKoreaDate,
    readNewsletterTrendRows,
    readNewsletterDeliveryMode,
    recordNewsletterCollectionResult,
    validateNewsletterTarget
} from './readiness.js';

function completeRows() {
    return NAVER_TRENDS_CATEGORIES.flatMap((category) => Array.from({ length: 20 }, (_, index) => ({
        source: 'naver_creator_advisor', trend_date: '2026-11-01', category, keyword: `${category} keyword ${index + 1}`
    })));
}

test('accepts exactly twenty unique keywords in each expected category', () => {
    const result = evaluateTrendsReadiness(completeRows(), '2026-11-01');
    assert.equal(result.status, 'ready');
    assert.equal(result.expectedTotal, 640);
    assert.equal(result.uniqueTotal, 640);
    assert.deepEqual(result.missingCategories, []);
});

test('rejects an incomplete category even when another category has extra rows', () => {
    const rows = completeRows();
    rows.splice(0, 1);
    const otherCategory = rows.find((row) => row.category === NAVER_TRENDS_CATEGORIES[1]);
    rows.push({ ...otherCategory, keyword: 'extra category keyword' });
    const result = evaluateTrendsReadiness(rows, '2026-11-01');
    assert.equal(result.status, 'incomplete');
    assert.equal(result.incompleteCategories[NAVER_TRENDS_CATEGORIES[0]], 19);
});

test('rejects wrong date, wrong source, unexpected categories, and duplicate keywords', () => {
    const rows = completeRows();
    rows[0] = { ...rows[0], keyword: rows[1].keyword };
    rows.push({ source: 'other', trend_date: '2026-11-01', category: NAVER_TRENDS_CATEGORIES[0], keyword: 'other source' });
    rows.push({ source: 'naver_creator_advisor', trend_date: '2026-11-01', category: 'unexpected', keyword: 'unexpected' });
    rows.push({ source: 'naver_creator_advisor', trend_date: '2026-10-31', category: NAVER_TRENDS_CATEGORIES[0], keyword: 'wrong date' });
    const result = evaluateTrendsReadiness(rows, '2026-11-01');
    assert.equal(result.status, 'incomplete');
    assert.deepEqual(result.unexpectedCategories, ['unexpected']);
    assert.equal(result.invalidRows, 2);
});

test('uses the previous Korea calendar day across a UTC date boundary', () => {
    assert.equal(previousKoreaDate(new Date('2026-11-01T22:40:00.000Z')), '2026-11-01');
});

test('allows the expected categories and item count to be configured', () => {
    assert.deepEqual(getReadinessExpectations({ NEWSLETTER_EXPECTED_CATEGORIES: 'A,B', NEWSLETTER_ITEMS_PER_CATEGORY: '3' }), {
        categories: ['A', 'B'], itemsPerCategory: 3
    });
    assert.throws(() => getReadinessExpectations({ NEWSLETTER_EXPECTED_CATEGORIES: 'A,A' }), /unique/);
    assert.throws(() => getReadinessExpectations({ NEWSLETTER_ITEMS_PER_CATEGORY: '0' }), /between/);
});

test('selects a Supabase target from its declared environment and rejects mismatches', () => {
    const devEnv = {
        BLOGGENIUS_ENV: 'development',
        SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
        SUPABASE_URL: `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
        SUPABASE_SECRET_KEY: 'test-only'
    };
    assert.equal(validateNewsletterTarget(devEnv).projectRef, DEVELOPMENT_SUPABASE_PROJECT_REF);
    const productionEnv = {
        BLOGGENIUS_ENV: 'production',
        SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF,
        SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        SUPABASE_SECRET_KEY: 'test-only'
    };
    assert.equal(validateNewsletterTarget(productionEnv).projectRef, PRODUCTION_SUPABASE_PROJECT_REF);
    assert.throws(() => validateNewsletterTarget({ ...devEnv, BLOGGENIUS_ENV: 'staging' }), /supported/);
    assert.throws(() => validateNewsletterTarget({ ...devEnv, SUPABASE_URL: 'https://hocfjolcthvtgfaxjmse.supabase.co' }), /does not match/);
    assert.throws(() => validateNewsletterTarget({ ...devEnv, SUPABASE_SECRET_KEY: '' }), /does not match/);
});

test('binds Production newsletter calls to the exact Production Supabase project and email mode', async () => {
    const production = {
        BLOGGENIUS_ENV: 'production',
        SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF,
        SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        SUPABASE_SECRET_KEY: 'test-only',
        TRENDS_NEWSLETTER_WORKER_TOKEN: 'test-worker-token'
    };
    assert.equal(validateNewsletterTarget(production).profile.siteOrigin, 'https://www.bloggenius.kr');
    assert.throws(() => validateNewsletterTarget({ ...production, SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF }), /does not match/);
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, options) => {
        captured = { url: new URL(url), options };
        return Response.json({ success: true, environment: 'production', mode: 'disabled' });
    };
    try {
        assert.equal(await readNewsletterDeliveryMode(production), 'disabled');
        assert.equal(captured.url.hostname, `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
        assert.equal(JSON.parse(captured.options.body).action, 'delivery_mode');
    } finally { globalThis.fetch = originalFetch; }
});

test('reads the selected target trends table and applies the trends schema profile', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, options) => {
        captured = { url: new URL(url), options };
        return Response.json([]);
    };
    try {
        const rows = await readNewsletterTrendRows({
            BLOGGENIUS_ENV: 'development',
            SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
            SUPABASE_URL: `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
            SUPABASE_SECRET_KEY: 'test-only'
        }, '2026-11-01');
        assert.deepEqual(rows, []);
        assert.equal(captured.url.pathname, '/rest/v1/items');
        assert.equal(captured.url.searchParams.get('source'), 'eq.naver_creator_advisor');
        assert.equal(captured.url.searchParams.get('trend_date'), 'eq.2026-11-01');
        assert.equal(captured.url.searchParams.get('limit'), '1000');
        assert.equal(captured.options.headers['accept-profile'], 'trends');
        assert.equal(captured.options.headers.apikey, 'test-only');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('persists the collection result through the target-validated public RPC', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, options) => {
        captured = { url: new URL(url), options };
        return Response.json('run-id');
    };
    try {
        const result = await recordNewsletterCollectionResult({
            BLOGGENIUS_ENV: 'development',
            SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
            SUPABASE_URL: `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
            SUPABASE_SECRET_KEY: 'test-only'
        }, {
            status: 'ready', trendDate: '2026-11-02', expectedCategories: 32,
            expectedItemsPerCategory: 20, expectedTotal: 640, uniqueTotal: 640
        });
        assert.equal(result, 'run-id');
        assert.equal(captured.url.pathname, '/rest/v1/rpc/record_trends_newsletter_collection');
        assert.equal(captured.options.headers['content-profile'], 'public');
        const body = JSON.parse(captured.options.body);
        assert.equal(body.p_trend_date, '2026-11-02');
        assert.equal(body.p_collection_status, 'complete');
        assert.equal(body.p_actual_total, 640);
        assert.equal('p_delivery_status' in body, false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
