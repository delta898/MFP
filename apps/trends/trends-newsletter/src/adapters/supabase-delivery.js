import { validateNewsletterTarget } from '../readiness.js';

export async function beginNewsletterDeliveryCampaign(env, trendDate, signalId, forceResend = false) {
    const { url, environment } = validateNewsletterTarget(env);
    const key = String(env.SUPABASE_SECRET_KEY || '').trim();
    if (!key) throw new Error(`${environment} Supabase server key is missing.`);
    const response = await fetch(new URL('/rest/v1/rpc/begin_trends_newsletter_delivery', url), {
        method: 'POST',
        headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            'content-profile': 'mailing',
            'accept-profile': 'mailing'
        },
        body: JSON.stringify({ p_trend_date: trendDate, p_signal_id: signalId, p_force_resend: forceResend === true }),
        signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`${environment} newsletter campaign allocation failed with HTTP ${response.status}.`);
    const result = await response.json();
    if (typeof result?.shouldDeliver !== 'boolean' || !Number.isInteger(result.deliveryRevision)
        || result.deliveryRevision < 1 || result.forceResend !== (forceResend === true && result.shouldDeliver)) {
        throw new Error('Newsletter campaign allocation returned an invalid result.');
    }
    return result;
}
export async function deliverNewsletterBatch(env, trendDate, deliveryRevision, afterId = null) {
    const { url, environment } = validateNewsletterTarget(env);
    const token = String(env.TRENDS_NEWSLETTER_WORKER_TOKEN || '').trim();
    if (!token) throw new Error('Newsletter delivery token is missing.');
    if (!Number.isInteger(deliveryRevision) || deliveryRevision < 1) throw new Error('Newsletter delivery revision is invalid.');

    const response = await fetch(new URL('/functions/v1/trends-mailing-list', url), {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'deliver_batch', trendDate, deliveryRevision, afterId }),
        signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) {
        throw new Error(`${environment} newsletter delivery batch failed with HTTP ${response.status}.`);
    }
    const result = await response.json();
    if (result?.success !== true || result.trendDate !== trendDate || result.deliveryRevision !== deliveryRevision
        || typeof result.hasMore !== 'boolean'
        || (result.hasMore && typeof result.nextCursor !== 'string')
        || !result.delivery || typeof result.delivery.status !== 'string') {
        throw new Error('Newsletter delivery returned an invalid batch result.');
    }
    return {
        trendDate,
        deliveryRevision,
        hasMore: result.hasMore,
        nextCursor: result.hasMore ? result.nextCursor : null,
        delivery: result.delivery
    };
}

export async function loadNewsletterDeliveryContext(env, trendDate) {
    const { url, environment } = validateNewsletterTarget(env);
    const key = String(env.SUPABASE_SECRET_KEY || '').trim();
    if (!key) throw new Error(`${environment} Supabase server key is missing.`);
    const response = await fetch(new URL('/rest/v1/rpc/get_trends_newsletter_delivery_context', url), {
        method: 'POST',
        headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            'content-profile': 'mailing',
            'accept-profile': 'mailing'
        },
        body: JSON.stringify({ p_trend_date: trendDate }),
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`${environment} newsletter delivery context failed with HTTP ${response.status}.`);
    const context = await response.json();
    if (context !== null && (!context.run || !context.edition
        || context.run.trend_date !== trendDate
        || context.edition.trend_date !== trendDate)) {
        throw new Error('Newsletter delivery context is invalid.');
    }
    return context;
}

export async function sendNewsletterCanary(env, { trendDate, category, subject, html, text }) {
    const { url, environment } = validateNewsletterTarget(env);
    const token = String(env.TRENDS_NEWSLETTER_WORKER_TOKEN || '').trim();
    if (!token) throw new Error('Newsletter delivery token is missing.');
    const response = await fetch(new URL('/functions/v1/trends-mailing-list', url), {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send_canary', trendDate, category, subject, html, text }),
        signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Newsletter canary failed with HTTP ${response.status}.`);
    const result = await response.json();
    if (result?.success !== true || result.trendDate !== trendDate || result.category !== category
        || !['sent', 'held', 'failed'].includes(result.status)) throw new Error('Newsletter canary returned an invalid result.');
    return result;
}
