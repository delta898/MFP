import { validateNewsletterTarget } from '../readiness.js';

function supabaseHeaders(secretKey) {
    return {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/json',
        'content-profile': 'public',
        'accept-profile': 'public'
    };
}

async function callRpc(env, name, body) {
    const { url, environment } = validateNewsletterTarget(env);
    const secretKey = String(env.SUPABASE_SECRET_KEY).trim();
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
        method: 'POST',
        headers: supabaseHeaders(secretKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`${environment} newsletter edition ${name} RPC failed with HTTP ${response.status}.`);
    return response.json();
}

export async function loadNewsletterEdition(env, trendDate) {
    return callRpc(env, 'get_trends_newsletter_edition', { p_trend_date: trendDate });
}

export async function saveNewsletterEdition(env, edition) {
    return callRpc(env, 'save_trends_newsletter_edition', {
        p_trend_date: edition.trendDate,
        p_greeting: edition.greeting,
        p_introduction: edition.introduction,
        p_featured_post: edition.featuredPost,
        p_download_url: edition.downloadUrl,
        p_download_banner_url: edition.downloadBannerUrl,
        p_ai_provider: edition.aiProvider,
        p_ai_model: edition.aiModel,
        p_prompt_version: edition.promptVersion,
        p_replace_ready: env.BLOGGENIUS_ENV === 'development'
            && String(env.NEWSLETTER_REGENERATE_ON_SIGNAL).trim().toLowerCase() === 'true'
    });
}

export async function markNewsletterEditionHeld(env, trendDate, reason) {
    return callRpc(env, 'mark_trends_newsletter_edition_held', {
        p_trend_date: trendDate,
        p_reason_code: reason
    });
}
