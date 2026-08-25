const test = require('node:test');
const assert = require('node:assert/strict');

const providerPromise = import('../supabase/functions/_shared/knowledge-provider-serpapi-corpus.ts');

function row(id, lane, publisher, minutesAgo = 10, overrides = {}) {
    const now = Date.parse('2026-08-25T12:00:00.000Z');
    return {
        observation_id: id,
        kind: 'news',
        provider_id: 'serpapi-corpus',
        source: 'serpapi-google-news',
        lane,
        locale: lane === 'headlines_global' ? 'en-US' : 'ko-KR',
        country: lane === 'headlines_global' ? 'US' : 'KR',
        title: `소재 ${id}`,
        summary: `요약 ${id}`,
        url: `https://news.example.com/${id}`,
        publisher,
        published_at: new Date(now - minutesAgo * 60_000).toISOString(),
        observed_at: new Date(now - 5 * 60_000).toISOString(),
        expires_at: new Date(now + 24 * 60 * 60_000).toISOString(),
        ...overrides
    };
}

test('stored corpus route maps a bounded RPC response to a strict News Snapshot', async () => {
    const { createSerpApiCorpusRoute } = await providerPromise;
    const calls = [];
    const route = createSerpApiCorpusRoute({ now: () => new Date('2026-08-25T12:00:00.000Z') });
    const snapshot = await route.readSnapshot({
        async rpc(name, params) {
            calls.push({ name, params });
            return { data: [row('one', 'technology', 'a.example')], error: null };
        }
    }, {
        lanes: ['technology'], locales: ['ko-KR'], countries: ['KR'],
        exclude_ids: ['obs_old'], limit: 3
    });

    assert.equal(route.execution, 'stored_corpus');
    assert.equal(calls[0].name, 'read_knowledge_observations');
    assert.deepEqual(calls[0].params, {
        p_provider_id: 'serpapi-corpus', p_kind: 'news', p_lanes: ['technology'],
        p_locales: ['ko-KR'], p_countries: ['KR'], p_exclude_ids: ['obs_old'], p_limit: 50
    });
    assert.equal(snapshot.provider_id, 'serpapi-corpus');
    assert.equal(snapshot.transport, 'server_gateway');
    assert.deepEqual(snapshot.items, [{
        id: 'one', title: '소재 one', summary: '요약 one',
        observed_at: '2026-08-25T11:55:00.000Z', url: 'https://news.example.com/one',
        source: 'serpapi-google-news', publisher: 'a.example',
        published_at: '2026-08-25T11:50:00.000Z'
    }]);
    assert.equal(Object.hasOwn(snapshot.items[0], 'lane'), false);
});

test('diversity selection rotates lanes and caps a publisher before relaxing', async () => {
    const { createSerpApiCorpusRoute } = await providerPromise;
    const route = createSerpApiCorpusRoute({ now: () => new Date('2026-08-25T12:00:00.000Z') });
    const rows = [
        row('t1', 'technology', 'same.example'),
        row('t2', 'technology', 'same.example'),
        row('t3', 'technology', 'same.example'),
        row('b1', 'business', 'business.example'),
        row('b2', 'business', 'business-two.example'),
        row('s1', 'science', 'science.example')
    ];
    const snapshot = await route.readSnapshot({
        async rpc() { return { data: rows, error: null }; }
    }, { lanes: ['technology', 'business', 'science'], limit: 6 });
    assert.deepEqual(snapshot.items.slice(0, 5).map((item) => item.id), ['t1', 'b1', 's1', 't2', 'b2']);
    assert.equal(snapshot.items[5].id, 't3');
});

test('corpus adapter drops invalid, expired, future and duplicate rows', async () => {
    const { createSerpApiCorpusRoute } = await providerPromise;
    const route = createSerpApiCorpusRoute({ now: () => new Date('2026-08-25T12:00:00.000Z') });
    const snapshot = await route.readSnapshot({
        async rpc() {
            return { data: [
                row('valid', 'technology', 'valid.example'),
                row('duplicate-url', 'business', 'other.example', 10, { url: 'https://news.example.com/valid' }),
                row('expired', 'science', 'expired.example', 10, { expires_at: '2026-08-25T11:59:00.000Z' }),
                row('future', 'travel_local', 'future.example', -30),
                row('unsafe', 'business', 'unsafe.example', 10, { url: 'http://news.example.com/unsafe' }),
                row('unknown-lane', 'unknown', 'unknown.example')
            ], error: null };
        }
    }, { limit: 20 });
    assert.deepEqual(snapshot.items.map((item) => item.id), ['valid']);
});

test('corpus adapter defensively honors exclusions and requested filters', async () => {
    const { createSerpApiCorpusRoute } = await providerPromise;
    const route = createSerpApiCorpusRoute({ now: () => new Date('2026-08-25T12:00:00.000Z') });
    const snapshot = await route.readSnapshot({
        async rpc() {
            return { data: [
                row('wanted', 'technology', 'wanted.example'),
                row('excluded', 'technology', 'excluded.example'),
                row('wrong-lane', 'business', 'business.example'),
                row('wrong-locale', 'headlines_global', 'global.example')
            ], error: null };
        }
    }, {
        lanes: ['technology'], locales: ['ko-KR'], countries: ['KR'],
        exclude_ids: ['excluded'], limit: 20
    });
    assert.deepEqual(snapshot.items.map((item) => item.id), ['wanted']);
});

test('corpus adapter fails closed on RPC errors and malformed results', async () => {
    const { createSerpApiCorpusRoute } = await providerPromise;
    const route = createSerpApiCorpusRoute();
    for (const response of [{ data: null, error: { code: 'DB_ERROR' } }, { data: {}, error: null }]) {
        await assert.rejects(
            () => route.readSnapshot({ async rpc() { return response; } }, {}),
            (error) => error.code === 'CORPUS_READ_FAILED'
        );
    }
});
