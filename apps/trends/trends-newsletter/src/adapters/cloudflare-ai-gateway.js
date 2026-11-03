const MAX_RESPONSE_BYTES = 16_000;

export async function generateSharedCopy(env, trendDate) {
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const gatewayId = String(env.CLOUDFLARE_AI_GATEWAY_ID || '').trim();
    const gatewayToken = String(env.CLOUDFLARE_AI_GATEWAY_TOKEN || '').trim();
    const provider = String(env.NEWSLETTER_AI_PROVIDER || '').trim().toLowerCase();
    const byokAlias = String(env.CLOUDFLARE_AI_BYOK_ALIAS || '').trim();
    const model = String(env.NEWSLETTER_AI_MODEL || '').trim();
    if (!accountId || !gatewayId || !gatewayToken || !provider || !byokAlias || !model) {
        throw new Error('Development AI Gateway BYOK configuration is incomplete.');
    }
    const endpoint = new URL(`/v1/${encodeURIComponent(accountId)}/${encodeURIComponent(gatewayId)}/${encodeURIComponent(provider)}/chat/completions`, 'https://gateway.ai.cloudflare.com');
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'cf-aig-authorization': `Bearer ${gatewayToken}`,
            'cf-aig-byok-alias': byokAlias,
            'content-type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({
            model,
            reasoning_effort: 'none',
            max_completion_tokens: 220,
            messages: [
                {
                    role: 'system',
                    content: 'Write concise, friendly Korean copy for a Naver trends newsletter. Return only JSON with string fields greeting and introduction. Do not include links, HTML, markdown, invented facts, or a subject line. Keep greeting within 100 characters and introduction within 360 characters.'
                },
                { role: 'user', content: `뉴스레터 기준일: ${trendDate}. 독자에게 아침 인사를 건네고, 오늘의 관심 트렌드를 살펴볼 수 있도록 짧게 안내해 주세요.` }
            ]
        }),
        signal: AbortSignal.timeout(25_000)
    });
    if (!response.ok) throw new Error(`Cloudflare AI Gateway request failed with HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error('Cloudflare AI Gateway response exceeded the size limit.');
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || new TextEncoder().encode(content).byteLength > MAX_RESPONSE_BYTES) {
        throw new Error('Cloudflare AI Gateway returned an invalid response.');
    }
    let copy;
    try { copy = JSON.parse(content); } catch { throw new Error('Cloudflare AI Gateway did not return JSON copy.'); }
    return { copy, model };
}
