const test = require('node:test');
const assert = require('node:assert/strict');

const providerPromise = import('../supabase/functions/_shared/knowledge-provider-serpapi-google-news.ts');

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

test('query-free Korean headlines use fixed Google News localization and normalize observations', async () => {
    const { createSerpApiGoogleNewsProvider } = await providerPromise;
    const calls = [];
    const provider = createSerpApiGoogleNewsProvider({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        getEnv: (name) => name === 'SERPAPI_API_KEY' ? 'fixture-secret' : '',
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return response({
                news_results: [{
                    title: '새로운 생활 기술이 바꾸는 하루',
                    snippet: '일상에 적용되는 새로운 기술을 소개합니다.',
                    link: 'https://news.example.test/articles/1#section',
                    source: { name: 'Example News' },
                    iso_date: '2026-08-25T11:00:00.000Z'
                }]
            });
        }
    });

    const result = await provider.collect({
        schema_version: 1, lane: 'headlines_kr', trigger: 'manual'
    });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname, 'https://serpapi.com/search.json');
    assert.equal(url.searchParams.get('engine'), 'google_news');
    assert.equal(url.searchParams.get('hl'), 'ko');
    assert.equal(url.searchParams.get('gl'), 'kr');
    assert.equal(url.searchParams.has('q'), false);
    assert.equal(url.searchParams.get('api_key'), 'fixture-secret');
    assert.equal(calls[0].init.headers.Accept, 'application/json');

    assert.equal(result.accepted_count, 1);
    assert.equal(result.rejected_count, 0);
    assert.equal(result.observations[0].url, 'https://news.example.test/articles/1');
    assert.equal(result.observations[0].locale, 'ko-KR');
    assert.equal(result.observations[0].country, 'KR');
    assert.equal(result.observations[0].expires_at, '2026-09-08T12:00:00.000Z');
    assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
});

test('focused lanes use only code-owned queries and locale mappings', async () => {
    const { createSerpApiGoogleNewsProvider, SERPAPI_GOOGLE_NEWS_LANES } = await providerPromise;
    const urls = [];
    const provider = createSerpApiGoogleNewsProvider({
        getEnv: () => 'fixture-secret',
        fetchImpl: async (url) => {
            urls.push(new URL(String(url)));
            return response({ news_results: [] });
        }
    });
    await provider.collect({ schema_version: 1, lane: 'technology', trigger: 'scheduled' });
    assert.equal(urls[0].searchParams.get('q'), SERPAPI_GOOGLE_NEWS_LANES.technology.query);
    assert.equal(urls[0].searchParams.get('hl'), 'ko');
    assert.equal(urls[0].searchParams.get('gl'), 'kr');

    await assert.rejects(() => provider.collect({
        schema_version: 1,
        lane: 'custom',
        trigger: 'manual',
        query: 'user supplied query'
    }), /collection_request_query_not_allowed/);
});

test('provider flattens bounded stories and rejects duplicates, unsafe and stale material', async () => {
    const { createSerpApiGoogleNewsProvider } = await providerPromise;
    const provider = createSerpApiGoogleNewsProvider({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        getEnv: () => 'fixture-secret',
        fetchImpl: async () => response({
            news_results: [
                {
                    title: '첫 기사', link: 'https://press.example.test/1', source: 'Press One',
                    iso_date: '2026-08-25T11:00:00.000Z'
                },
                {
                    title: '중복 URL', link: 'https://press.example.test/1#duplicate', source: 'Press One',
                    iso_date: '2026-08-25T10:00:00.000Z'
                },
                {
                    title: '첫 기사', link: 'https://press.example.test/duplicate-title', source: 'Press Two',
                    iso_date: '2026-08-25T10:00:00.000Z'
                },
                {
                    title: '안전하지 않은 URL', link: 'http://press.example.test/http', source: 'Press',
                    iso_date: '2026-08-25T10:00:00.000Z'
                },
                {
                    title: '오래된 기사', link: 'https://press.example.test/old', source: 'Press',
                    iso_date: '2026-08-01T10:00:00.000Z'
                },
                {
                    title: '묶음 기사',
                    stories: [{
                        title: '두 번째 기사', link: 'https://press.example.test/2', source: { name: 'Press Two' },
                        iso_date: '2026-08-25T09:00:00.000Z'
                    }]
                }
            ]
        })
    });

    const result = await provider.collect({
        schema_version: 1, lane: 'headlines_kr', trigger: 'scheduled'
    });
    assert.equal(result.fetched_count, 7);
    assert.equal(result.accepted_count, 2);
    assert.equal(result.rejected_count, 5);
    assert.deepEqual(result.observations.map((item) => item.title), ['첫 기사', '두 번째 기사']);
});

test('provider classifies configuration, quota and invalid response without raw upstream messages', async () => {
    const { createSerpApiGoogleNewsProvider } = await providerPromise;
    let calls = 0;
    const missing = createSerpApiGoogleNewsProvider({
        getEnv: () => '',
        fetchImpl: async () => { calls += 1; return response({}); }
    });
    await assert.rejects(
        () => missing.collect({ schema_version: 1, lane: 'headlines_kr', trigger: 'manual' }),
        (error) => error.code === 'SERPAPI_NOT_CONFIGURED' && error.attemptedUpstream === false
    );
    assert.equal(calls, 0);

    const rateLimited = createSerpApiGoogleNewsProvider({
        getEnv: () => 'fixture-secret', fetchImpl: async () => response({ detail: 'raw' }, 429)
    });
    await assert.rejects(
        () => rateLimited.collect({ schema_version: 1, lane: 'headlines_kr', trigger: 'manual' }),
        (error) => error.code === 'SERPAPI_RATE_LIMITED' && error.attemptedUpstream === true
    );

    const invalid = createSerpApiGoogleNewsProvider({
        getEnv: () => 'fixture-secret', fetchImpl: async () => response({ unexpected: [] })
    });
    await assert.rejects(
        () => invalid.collect({ schema_version: 1, lane: 'headlines_kr', trigger: 'manual' }),
        (error) => error.code === 'SERPAPI_INVALID_RESPONSE'
    );
});
