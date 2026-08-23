const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../supabase/functions/_shared/knowledge-provider-naver-news.ts');

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

test('Naver news provider short-circuits an empty topic without credentials or upstream', async () => {
    const { createNaverNewsRoute } = await modulePromise;
    let calls = 0;
    const route = createNaverNewsRoute({
        now: () => new Date('2026-08-23T09:00:00.000Z'),
        getEnv: () => '',
        fetchImpl: async () => {
            calls += 1;
            throw new Error('must not fetch');
        }
    });

    assert.equal(route.shouldFetch({ topic: '  ' }), false);
    const snapshot = await route.fetchSnapshot({ topic: '' });
    assert.equal(calls, 0);
    assert.equal(snapshot.provider_id, 'naver-news');
    assert.equal(snapshot.kind, 'news');
    assert.deepEqual(snapshot.items, []);
});

test('Naver news provider normalizes, filters and deduplicates recent articles', async () => {
    const { createNaverNewsRoute } = await modulePromise;
    const calls = [];
    const now = new Date('2026-08-23T09:00:00.000Z');
    const route = createNaverNewsRoute({
        now: () => now,
        getEnv: (name) => ({
            NAVER_CLIENT_ID: 'fixture-client',
            NAVER_CLIENT_SECRET: 'fixture-secret'
        })[name] || '',
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return response({
                items: [
                    {
                        title: '<b>AI</b> &amp; 로봇 신제품',
                        description: '기업이 &#39;새 제품&#39;을 공개했다.',
                        originallink: 'https://www.example.com/news/1#section',
                        link: 'https://n.news.naver.com/article/001/1',
                        pubDate: 'Sun, 23 Aug 2026 17:30:00 +0900'
                    },
                    {
                        title: 'AI & 로봇 신제품',
                        description: '중복 제목',
                        originallink: 'https://duplicate.example.net/news/2',
                        link: 'https://n.news.naver.com/article/002/2',
                        pubDate: 'Sun, 23 Aug 2026 17:20:00 +0900'
                    },
                    {
                        title: 'HTTP 원문을 가진 기사',
                        description: '네이버 HTTPS 링크를 사용한다.',
                        originallink: 'http://news.publisher.co.kr/article/3',
                        link: 'https://n.news.naver.com/article/003/3',
                        pubDate: 'Sun, 23 Aug 2026 17:00:00 +0900'
                    },
                    {
                        title: '너무 오래된 기사',
                        description: '제외 대상',
                        originallink: 'https://old.example.com/4',
                        link: 'https://n.news.naver.com/article/004/4',
                        pubDate: 'Sat, 01 Aug 2026 10:00:00 +0900'
                    },
                    {
                        title: 'HTTPS 링크가 없는 기사',
                        description: '제외 대상',
                        originallink: 'http://plain.example.com/5',
                        link: 'http://plain.example.com/5',
                        pubDate: 'Sun, 23 Aug 2026 16:00:00 +0900'
                    }
                ]
            });
        }
    });

    const snapshot = await route.fetchSnapshot({ topic: ' AI 로봇 ', limit: 10 });
    assert.equal(calls.length, 1);
    const requestUrl = new URL(calls[0].url);
    assert.equal(requestUrl.origin + requestUrl.pathname, 'https://openapi.naver.com/v1/search/news.json');
    assert.equal(requestUrl.searchParams.get('query'), 'AI 로봇');
    assert.equal(requestUrl.searchParams.get('sort'), 'date');
    assert.equal(requestUrl.searchParams.get('display'), '30');
    assert.equal(calls[0].init.headers['X-Naver-Client-Id'], 'fixture-client');
    assert.equal(calls[0].init.headers['X-Naver-Client-Secret'], 'fixture-secret');

    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].title, 'AI & 로봇 신제품');
    assert.equal(snapshot.items[0].summary, "기업이 '새 제품'을 공개했다.");
    assert.equal(snapshot.items[0].url, 'https://www.example.com/news/1');
    assert.equal(snapshot.items[0].publisher, 'example.com');
    assert.equal(snapshot.items[1].url, 'https://n.news.naver.com/article/003/3');
    assert.equal(snapshot.items[1].publisher, 'news.publisher.co.kr');
    assert.match(snapshot.items[0].id, /^news_[A-Za-z0-9_-]+$/);
});

test('Naver news provider never substitutes API Hub credentials for Developers credentials', async () => {
    const { createNaverNewsRoute } = await modulePromise;
    const route = createNaverNewsRoute({
        now: () => new Date('2026-08-23T09:00:00.000Z'),
        getEnv: (name) => ({
            NAVER_API_HUB_CLIENT_ID: 'hub-client',
            NAVER_API_HUB_CLIENT_SECRET: 'hub-secret'
        })[name] || '',
        fetchImpl: async () => { throw new Error('must not fetch'); }
    });

    await assert.rejects(
        () => route.fetchSnapshot({ topic: 'AI', limit: 5 }),
        (error) => error.code === 'NAVER_NEWS_NOT_CONFIGURED'
    );
});

test('Naver news provider produces stable article IDs and respects the result limit', async () => {
    const { createNaverNewsRoute } = await modulePromise;
    const payload = {
        items: [1, 2, 3].map((number) => ({
            title: `기사 ${number}`,
            description: `요약 ${number}`,
            originallink: `https://press.example.com/${number}`,
            link: `https://n.news.naver.com/${number}`,
            pubDate: `Sun, 23 Aug 2026 1${8 - number}:00:00 +0900`
        }))
    };
    const options = {
        now: () => new Date('2026-08-23T10:00:00.000Z'),
        getEnv: (name) => name === 'NAVER_CLIENT_ID' || name === 'NAVER_CLIENT_SECRET' ? 'configured' : '',
        fetchImpl: async () => response(payload)
    };
    const first = await createNaverNewsRoute(options).fetchSnapshot({ topic: '테스트', limit: 2 });
    const second = await createNaverNewsRoute(options).fetchSnapshot({ topic: '테스트', limit: 2 });

    assert.equal(first.items.length, 2);
    assert.deepEqual(first.items.map((item) => item.id), second.items.map((item) => item.id));
});

test('Naver news provider fails safely for missing credentials and invalid upstream', async () => {
    const { createNaverNewsRoute } = await modulePromise;
    const missing = createNaverNewsRoute({ getEnv: () => '', fetchImpl: async () => response({}) });
    await assert.rejects(
        () => missing.fetchSnapshot({ topic: 'AI' }),
        (error) => error.code === 'NAVER_NEWS_NOT_CONFIGURED'
    );

    const invalid = createNaverNewsRoute({
        getEnv: (name) => name === 'NAVER_CLIENT_ID' || name === 'NAVER_CLIENT_SECRET' ? 'configured' : '',
        fetchImpl: async () => response({ unexpected: [] })
    });
    await assert.rejects(
        () => invalid.fetchSnapshot({ topic: 'AI' }),
        (error) => error.code === 'NAVER_NEWS_INVALID_RESPONSE'
    );

    const failed = createNaverNewsRoute({
        getEnv: () => 'configured',
        fetchImpl: async () => response({}, 429)
    });
    await assert.rejects(
        () => failed.fetchSnapshot({ topic: 'AI' }),
        (error) => error.code === 'NAVER_NEWS_RATE_LIMITED'
    );
});
