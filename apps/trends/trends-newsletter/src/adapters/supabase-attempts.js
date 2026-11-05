import { validateNewsletterTarget } from '../readiness.js';

export async function recordNewsletterAttempt(env, attempt) {
    const { url, environment } = validateNewsletterTarget(env);
    const secretKey = String(env.SUPABASE_SECRET_KEY).trim();
    const response = await fetch(new URL('/rest/v1/rpc/save_trends_newsletter_attempt', url), {
        method: 'POST',
        headers: {
            apikey: secretKey,
            authorization: `Bearer ${secretKey}`,
            'content-type': 'application/json',
            'content-profile': 'public',
            'accept-profile': 'public'
        },
        body: JSON.stringify({
            p_signal_id: attempt.signalId,
            p_trend_date: attempt.trendDate,
            p_workflow_id: attempt.workflowId,
            p_status: attempt.status,
            p_collection_status: attempt.collectionStatus,
            p_edition_status: attempt.editionStatus,
            p_collection_report: attempt.collectionReport,
            p_edition_snapshot: attempt.editionSnapshot ?? null,
            p_error_code: attempt.errorCode ?? null
        }),
        signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`${environment} newsletter attempt write failed with HTTP ${response.status}.`);
    return response.json();
}
