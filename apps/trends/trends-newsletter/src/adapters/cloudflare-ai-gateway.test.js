import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSharedCopy } from './cloudflare-ai-gateway.js';

const env = {
    CLOUDFLARE_ACCOUNT_ID: 'account-id', CLOUDFLARE_AI_GATEWAY_ID: 'newsletter-dev',
    CLOUDFLARE_AI_GATEWAY_TOKEN: 'runtime-secret', CLOUDFLARE_AI_BYOK_ALIAS: 'development',
    NEWSLETTER_AI_PROVIDER: 'openai', NEWSLETTER_AI_MODEL: 'gpt-test'
};

test('calls the authenticated Cloudflare AI Gateway BYOK provider endpoint server-side', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, options) => {
        captured = { url: new URL(url), options };
        return Response.json({ choices: [{ message: { content: JSON.stringify({ greeting: '좋은 아침입니다.', introduction: '오늘의 트렌드를 확인해 보세요.' }) } }] });
    };
    try {
        const result = await generateSharedCopy(env, '2026-11-02');
        assert.deepEqual(result, {
            copy: { greeting: '좋은 아침입니다.', introduction: '오늘의 트렌드를 확인해 보세요.' }, model: 'gpt-test'
        });
        assert.equal(captured.url.origin, 'https://gateway.ai.cloudflare.com');
        assert.equal(captured.url.pathname, '/v1/account-id/newsletter-dev/openai/chat/completions');
        assert.equal(captured.options.headers['cf-aig-authorization'], 'Bearer runtime-secret');
        assert.equal(captured.options.headers['cf-aig-byok-alias'], 'development');
        const request = JSON.parse(captured.options.body);
        assert.equal(request.model, 'gpt-test');
        assert.equal(request.reasoning_effort, 'none');
        assert.equal(request.max_completion_tokens, 220);
        assert.equal('temperature' in request, false);
        assert.equal('max_tokens' in request, false);
        assert.match(request.messages[1].content, /2026-11-02/);
        assert.doesNotMatch(request.messages[1].content, /https?:\/\//);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('requires complete Development BYOK configuration and rejects malformed model output', async () => {
    await assert.rejects(generateSharedCopy({ ...env, CLOUDFLARE_AI_GATEWAY_TOKEN: '' }, '2026-11-02'), /BYOK configuration is incomplete/);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'not json' } }] });
    try { await assert.rejects(generateSharedCopy(env, '2026-11-02'), /did not return JSON/); }
    finally { globalThis.fetch = originalFetch; }
});
