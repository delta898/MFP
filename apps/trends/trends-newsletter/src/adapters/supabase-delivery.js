import { validateDevelopmentTarget } from '../readiness.js';

export async function deliverDevelopmentBatch(env, trendDate, afterId = null) {
    const { url } = validateDevelopmentTarget(env);
    const token = String(env.TRENDS_NEWSLETTER_WORKER_TOKEN || '').trim();
    if (!token) throw new Error('Development newsletter delivery token is missing.');

    const response = await fetch(new URL('/functions/v1/trends-mailing-list', url), {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'deliver_batch', trendDate, afterId }),
        signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) {
        throw new Error(`Development newsletter delivery batch failed with HTTP ${response.status}.`);
    }
    const result = await response.json();
    if (result?.success !== true || result.trendDate !== trendDate
        || typeof result.hasMore !== 'boolean'
        || (result.hasMore && typeof result.nextCursor !== 'string')
        || !result.delivery || typeof result.delivery.status !== 'string') {
        throw new Error('Development newsletter delivery returned an invalid batch result.');
    }
    return {
        trendDate,
        hasMore: result.hasMore,
        nextCursor: result.hasMore ? result.nextCursor : null,
        delivery: result.delivery
    };
}

export async function loadDevelopmentDeliveryContext(env, trendDate) {
    const { url } = validateDevelopmentTarget(env);
    const key = String(env.SUPABASE_SECRET_KEY || '').trim();
    if (!key) throw new Error('Development Supabase server key is missing.');
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
    if (!response.ok) throw new Error(`Development newsletter delivery context failed with HTTP ${response.status}.`);
    const context = await response.json();
    if (context !== null && (!context.run || !context.edition
        || context.run.trend_date !== trendDate
        || context.edition.trend_date !== trendDate)) {
        throw new Error('Development newsletter delivery context is invalid.');
    }
    return context;
}
