'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../supabase/functions/_shared/knowledge-provider-naver-blog-reference.ts');

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

test('Naver blog reference provider keeps credentials server-side and returns bounded latest results', async () => {
    const { createNaverBlogReferenceRoute } = await modulePromise;
    const calls = [];
    const route = createNaverBlogReferenceRoute({
        now: () => new Date('2026-08-29T01:00:00.000Z'),
        getEnv: (name) => ({
            NAVER_CLIENT_ID: 'fixture-client',
            NAVER_CLIENT_SECRET: 'fixture-secret'
        })[name] || '',
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return response({
                items: [
                    { title: '<b>두 번째</b> 글', link: 'https://blog.naver.com/example/2', postdate: '20260828' },
                    { title: '가장 최신 &amp; 글', link: 'https://example.com/latest#part', postdate: '20260829' },
                    { title: '중복 링크', link: 'https://example.com/latest', postdate: '20260827' },
                    { title: '안전하지 않은 링크', link: 'http://example.com/plain', postdate: '20260829' },
                    { title: '잘못된 날짜', link: 'https://example.com/invalid', postdate: '20261340' }
                ]
            });
        }
    });

    const snapshot = await route.fetchSnapshot({ topic: ' 디지털 메모 ', limit: 2 });
    const requestUrl = new URL(calls[0].url);
    assert.equal(requestUrl.origin + requestUrl.pathname, 'https://openapi.naver.com/v1/search/blog.json');
    assert.equal(requestUrl.searchParams.get('query'), '디지털 메모');
    assert.equal(requestUrl.searchParams.get('display'), '10');
    assert.equal(requestUrl.searchParams.get('sort'), 'sim');
    assert.equal(calls[0].init.headers['X-Naver-Client-Id'], 'fixture-client');
    assert.equal(calls[0].init.headers['X-Naver-Client-Secret'], 'fixture-secret');
    assert.equal(snapshot.kind, 'blog_reference');
    assert.equal(snapshot.provider_id, 'naver-blog-reference');
    assert.deepEqual(snapshot.items.map((item) => item.title), ['가장 최신 & 글', '두 번째 글']);
    assert.equal(snapshot.items[0].url, 'https://example.com/latest');
    assert.equal(snapshot.items[0].published_at, '2026-08-29T00:00:00.000Z');
});

test('Naver blog reference provider fails safely without Developers credentials', async () => {
    const { createNaverBlogReferenceRoute } = await modulePromise;
    const route = createNaverBlogReferenceRoute({ getEnv: () => '', fetchImpl: async () => response({}) });
    await assert.rejects(
        () => route.fetchSnapshot({ topic: '테스트', limit: 3 }),
        (error) => error.code === 'NAVER_BLOG_NOT_CONFIGURED'
    );
});

test('Naver blog reference provider short-circuits empty topics without upstream access', async () => {
    const { createNaverBlogReferenceRoute } = await modulePromise;
    let calls = 0;
    const route = createNaverBlogReferenceRoute({
        getEnv: () => '',
        fetchImpl: async () => {
            calls += 1;
            throw new Error('must not fetch');
        }
    });
    const snapshot = await route.fetchSnapshot({ topic: '' });
    assert.equal(calls, 0);
    assert.deepEqual(snapshot.items, []);
});
