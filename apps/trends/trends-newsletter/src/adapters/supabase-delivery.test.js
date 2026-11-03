import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverDevelopmentBatch, loadDevelopmentDeliveryContext } from './supabase-delivery.js';

const env = {
    BLOGGENIUS_ENV: 'development',
    SUPABASE_PROJECT_REF: 'bvtlwjbmjnfphxlrkzhm',
    SUPABASE_URL: 'https://bvtlwjbmjnfphxlrkzhm.supabase.co',
    SUPABASE_SECRET_KEY: 'development-secret',
    TRENDS_NEWSLETTER_WORKER_TOKEN: 'internal-worker-token'
};

test('sends only date and cursor to the private Development Edge Function', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => {
        captured = { url: String(url), init };
        return Response.json({
            success: true,
            trendDate: '2026-11-02',
            hasMore: true,
            nextCursor: '3f9a8b80-4993-4fdd-a600-077e32ad7c19',
            delivery: { status: 'sending', sent: 10 }
        });
    };
    try {
        const result = await deliverDevelopmentBatch(env, '2026-11-02', null);
        assert.equal(captured.url, 'https://bvtlwjbmjnfphxlrkzhm.supabase.co/functions/v1/trends-mailing-list');
        assert.equal(captured.init.headers.authorization, 'Bearer internal-worker-token');
        assert.deepEqual(JSON.parse(captured.init.body), { action: 'deliver_batch', trendDate: '2026-11-02', afterId: null });
        assert.deepEqual(result, {
            trendDate: '2026-11-02',
            hasMore: true,
            nextCursor: '3f9a8b80-4993-4fdd-a600-077e32ad7c19',
            delivery: { status: 'sending', sent: 10 }
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('does not allow a Production target or missing internal token', async () => {
    await assert.rejects(deliverDevelopmentBatch({ ...env, BLOGGENIUS_ENV: 'production' }, '2026-11-02'), /restricted to the Development/);
    await assert.rejects(deliverDevelopmentBatch({ ...env, TRENDS_NEWSLETTER_WORKER_TOKEN: '' }, '2026-11-02'), /token is missing/);
});

test('rejects non-success or malformed delivery responses', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response('failed', { status: 503 });
        await assert.rejects(deliverDevelopmentBatch(env, '2026-11-02'), /HTTP 503/);
        globalThis.fetch = async () => Response.json({ success: true, trendDate: '2026-11-02' });
        await assert.rejects(deliverDevelopmentBatch(env, '2026-11-02'), /invalid batch result/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('loads the private Development delivery context using the mailing schema profile', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => {
        captured = { url: String(url), init };
        return Response.json({
            run: { trend_date: '2026-11-02', delivery_status: 'sent' },
            edition: { trend_date: '2026-11-02', status: 'ready' }
        });
    };
    try {
        const result = await loadDevelopmentDeliveryContext(env, '2026-11-02');
        assert.equal(captured.url, 'https://bvtlwjbmjnfphxlrkzhm.supabase.co/rest/v1/rpc/get_trends_newsletter_delivery_context');
        assert.equal(captured.init.headers['content-profile'], 'mailing');
        assert.equal(captured.init.headers['accept-profile'], 'mailing');
        assert.deepEqual(JSON.parse(captured.init.body), { p_trend_date: '2026-11-02' });
        assert.equal(result.run.delivery_status, 'sent');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
