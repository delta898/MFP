import test from 'node:test';
import assert from 'node:assert/strict';
import { beginNewsletterDeliveryCampaign, deliverNewsletterBatch, loadNewsletterDeliveryContext } from './supabase-delivery.js';
import { PRODUCTION_SUPABASE_PROJECT_REF } from '../readiness.js';

const env = {
    BLOGGENIUS_ENV: 'development',
    SUPABASE_PROJECT_REF: 'bvtlwjbmjnfphxlrkzhm',
    SUPABASE_URL: 'https://bvtlwjbmjnfphxlrkzhm.supabase.co',
    SUPABASE_SECRET_KEY: 'development-secret',
    TRENDS_NEWSLETTER_WORKER_TOKEN: 'internal-worker-token'
};
const productionEnv = {
    BLOGGENIUS_ENV: 'production',
    SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF,
    SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
    SUPABASE_SECRET_KEY: 'production-secret',
    TRENDS_NEWSLETTER_WORKER_TOKEN: 'production-worker-token'
};

test('sends date, revision, and cursor to the Edge Function selected by target configuration', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => {
        captured = { url: String(url), init };
        return Response.json({
            success: true,
            trendDate: '2026-11-02',
            deliveryRevision: 2,
            hasMore: true,
            nextCursor: '3f9a8b80-4993-4fdd-a600-077e32ad7c19',
            delivery: { status: 'sending', sent: 10 }
        });
    };
    try {
        const result = await deliverNewsletterBatch(env, '2026-11-02', 2, null);
        assert.equal(captured.url, 'https://bvtlwjbmjnfphxlrkzhm.supabase.co/functions/v1/trends-mailing-list');
        assert.equal(captured.init.headers.authorization, 'Bearer internal-worker-token');
        assert.deepEqual(JSON.parse(captured.init.body), { action: 'deliver_batch', trendDate: '2026-11-02', deliveryRevision: 2, afterId: null });
        assert.deepEqual(result, {
            trendDate: '2026-11-02',
            deliveryRevision: 2,
            hasMore: true,
            nextCursor: '3f9a8b80-4993-4fdd-a600-077e32ad7c19',
            delivery: { status: 'sending', sent: 10 }
        });
        await deliverNewsletterBatch(productionEnv, '2026-11-02', 2, null);
        assert.equal(captured.url, `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co/functions/v1/trends-mailing-list`);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('rejects mismatched targets, invalid revisions, or missing internal tokens', async () => {
    await assert.rejects(deliverNewsletterBatch({ ...env, SUPABASE_PROJECT_REF: 'wrong-project' }, '2026-11-02', 1), /does not match/);
    await assert.rejects(deliverNewsletterBatch(env, '2026-11-02', 0), /revision is invalid/);
    await assert.rejects(deliverNewsletterBatch({ ...env, TRENDS_NEWSLETTER_WORKER_TOKEN: '' }, '2026-11-02'), /token is missing/);
});

test('rejects non-success or malformed delivery responses', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response('failed', { status: 503 });
        await assert.rejects(deliverNewsletterBatch(env, '2026-11-02', 1), /HTTP 503/);
        globalThis.fetch = async () => Response.json({ success: true, trendDate: '2026-11-02' });
        await assert.rejects(deliverNewsletterBatch(env, '2026-11-02', 1), /invalid batch result/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('loads delivery context from the selected target using the mailing schema profile', async () => {
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
        const result = await loadNewsletterDeliveryContext(env, '2026-11-02');
        assert.equal(captured.url, 'https://bvtlwjbmjnfphxlrkzhm.supabase.co/rest/v1/rpc/get_trends_newsletter_delivery_context');
        assert.equal(captured.init.headers['content-profile'], 'mailing');
        assert.equal(captured.init.headers['accept-profile'], 'mailing');
        assert.deepEqual(JSON.parse(captured.init.body), { p_trend_date: '2026-11-02' });
        assert.equal(result.run.delivery_status, 'sent');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('allocates a normal delivery revision through the private mailing RPC', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => {
        captured = { url: String(url), init };
        return Response.json({ shouldDeliver: true, deliveryRevision: 1, forceResend: false, resumed: false });
    };
    try {
        const result = await beginNewsletterDeliveryCampaign(env, '2026-11-02', 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9');
        assert.equal(captured.url, 'https://bvtlwjbmjnfphxlrkzhm.supabase.co/rest/v1/rpc/begin_trends_newsletter_delivery');
        assert.equal(captured.init.headers['content-profile'], 'mailing');
        assert.equal(captured.init.headers.apikey, 'development-secret');
        assert.deepEqual(JSON.parse(captured.init.body), {
            p_trend_date: '2026-11-02', p_signal_id: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', p_force_resend: false
        });
        assert.equal(result.deliveryRevision, 1);
        assert.equal(result.shouldDeliver, true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('requests a new revision only when force resend is explicit', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (_url, init) => {
        captured = JSON.parse(init.body);
        return Response.json({ shouldDeliver: true, deliveryRevision: 2, forceResend: true, resumed: false });
    };
    try {
        const result = await beginNewsletterDeliveryCampaign(env, '2026-11-02', 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', true);
        assert.equal(captured.p_force_resend, true);
        assert.equal(result.deliveryRevision, 2);
        assert.equal(result.forceResend, true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('rejects an invalid campaign allocation response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ shouldDeliver: true, deliveryRevision: 0, forceResend: false });
    try {
        await assert.rejects(beginNewsletterDeliveryCampaign(env, '2026-11-02', 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9'), /invalid result/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
