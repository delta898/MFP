import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDevelopmentNewsletterAttempt } from './supabase-attempts.js';
import { DEVELOPMENT_SUPABASE_PROJECT_REF } from '../readiness.js';

const env = {
    BLOGGENIUS_ENV: 'development',
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    SUPABASE_URL: `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    SUPABASE_SECRET_KEY: 'test-only'
};

test('records an independent attempt by its signal ID through a private RPC', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url: new URL(url), options };
        return Response.json({ id: 'attempt-id' });
    };
    try {
        const attempt = {
            signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9',
            workflowId: 'collection-2026-11-02-f53d0eb8-93d5-4d4a-82b6-2392d13c22f9',
            trendDate: '2026-11-02', status: 'running', collectionStatus: 'complete',
            editionStatus: 'drafting', collectionReport: { uniqueTotal: 640 }
        };
        assert.deepEqual(await recordDevelopmentNewsletterAttempt(env, attempt), { id: 'attempt-id' });
        assert.equal(request.url.pathname, '/rest/v1/rpc/save_trends_newsletter_attempt');
        assert.equal(request.options.headers['content-profile'], 'public');
        assert.deepEqual(JSON.parse(request.options.body), {
            p_signal_id: attempt.signalId, p_trend_date: attempt.trendDate,
            p_workflow_id: attempt.workflowId, p_status: 'running',
            p_collection_status: 'complete', p_edition_status: 'drafting',
            p_collection_report: { uniqueTotal: 640 }, p_edition_snapshot: null, p_error_code: null
        });
    } finally { globalThis.fetch = originalFetch; }
});

test('cannot record an attempt against Production Supabase', async () => {
    await assert.rejects(recordDevelopmentNewsletterAttempt({ ...env, BLOGGENIUS_ENV: 'production' }, {}), /restricted to the Development/);
});
