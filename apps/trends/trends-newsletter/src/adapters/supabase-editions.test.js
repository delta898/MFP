import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDevelopmentEdition, markDevelopmentEditionHeld, saveDevelopmentEdition } from './supabase-editions.js';
import { DEVELOPMENT_SUPABASE_PROJECT_REF } from '../readiness.js';

const env = {
    BLOGGENIUS_ENV: 'development',
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    SUPABASE_URL: `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    SUPABASE_SECRET_KEY: 'test-only'
};

test('loads one shared edition through the service-only public RPC', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, options) => {
        captured = { url: new URL(url), options };
        return Response.json({ status: 'ready', trend_date: '2026-11-02' });
    };
    try {
        const result = await loadDevelopmentEdition(env, '2026-11-02');
        assert.equal(result.status, 'ready');
        assert.equal(captured.url.pathname, '/rest/v1/rpc/get_trends_newsletter_edition');
        assert.equal(captured.options.headers['content-profile'], 'public');
        assert.deepEqual(JSON.parse(captured.options.body), { p_trend_date: '2026-11-02' });
    } finally { globalThis.fetch = originalFetch; }
});

test('saves a date-keyed shared edition and records only a bounded failure code', async () => {
    const originalFetch = globalThis.fetch;
    const captured = [];
    globalThis.fetch = async (url, options) => {
        captured.push({ url: new URL(url), options });
        return Response.json({ status: 'ready' });
    };
    try {
        const edition = {
            trendDate: '2026-11-02', greeting: '좋은 아침입니다.', introduction: '오늘 트렌드를 확인해 보세요.',
            featuredPost: { id: 7, title: '글', url: 'https://blog.gongzza.com/post/', excerpt: '', imageUrl: null, publishedAt: '2026-11-02T00:00:00.000Z' },
            downloadUrl: 'https://www-dev.bloggenius.kr/download/', downloadBannerUrl: 'https://www-dev.bloggenius.kr/assets/share-card.svg',
            aiProvider: 'cloudflare-ai-gateway', aiModel: '@cf/test/model', promptVersion: 'shared-edition-v1'
        };
        await saveDevelopmentEdition(env, edition);
        await markDevelopmentEditionHeld(env, '2026-11-02', 'generation_failed');
        assert.equal(captured[0].url.pathname, '/rest/v1/rpc/save_trends_newsletter_edition');
        assert.equal(JSON.parse(captured[0].options.body).p_featured_post.id, 7);
        assert.equal(captured[1].url.pathname, '/rest/v1/rpc/mark_trends_newsletter_edition_held');
        assert.deepEqual(JSON.parse(captured[1].options.body), { p_trend_date: '2026-11-02', p_reason_code: 'generation_failed' });
    } finally { globalThis.fetch = originalFetch; }
});

test('refuses to call any Supabase project other than Development', async () => {
    await assert.rejects(loadDevelopmentEdition({ ...env, SUPABASE_PROJECT_REF: 'production-ref' }, '2026-11-02'), /does not match/);
});
