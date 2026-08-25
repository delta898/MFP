const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeKnowledgeSnapshot } = require('../src/knowledge/contracts/snapshot');

const contractPromise = import('../supabase/functions/_shared/serpapi-collection-contract.ts');

async function validObservation(overrides = {}) {
    const contract = await contractPromise;
    const url = overrides.url || 'https://news.example.test/articles/serendipity#section';
    return {
        schema_version: 1,
        observation_id: await contract.buildSerpApiObservationId(url),
        kind: 'news',
        provider_id: 'serpapi-google-news',
        source: 'google-news',
        lane: 'headlines_kr',
        title: '뜻밖에 발견한 새로운 생활 기술',
        summary: '생활 방식의 변화를 소개하는 기사입니다.',
        url,
        publisher: 'Example News',
        published_at: '2026-08-25T00:00:00.000Z',
        observed_at: '2026-08-25T01:00:00.000Z',
        expires_at: '2026-09-08T01:00:00.000Z',
        ...overrides
    };
}

function validRun(overrides = {}) {
    return {
        schema_version: 1,
        run_id: 'kcr_fixture',
        provider_id: 'serpapi-google-news',
        lane: 'headlines_kr',
        trigger: 'scheduled',
        status: 'succeeded',
        attempted_upstream: true,
        fetched_count: 20,
        accepted_count: 14,
        inserted_count: 8,
        refreshed_count: 6,
        rejected_count: 6,
        error_code: '',
        started_at: '2026-08-25T01:00:00.000Z',
        completed_at: '2026-08-25T01:00:02.000Z',
        ...overrides
    };
}

test('collection requests accept only code-owned lanes and triggers', async () => {
    const { normalizeSerpApiCollectionRequest } = await contractPromise;
    assert.deepEqual(normalizeSerpApiCollectionRequest({
        schema_version: 1, lane: 'technology', trigger: 'manual'
    }), { schema_version: 1, lane: 'technology', trigger: 'manual' });

    assert.throws(() => normalizeSerpApiCollectionRequest({
        schema_version: 1, lane: 'custom', trigger: 'scheduled', query: 'anything'
    }), /not_allowed/);
    assert.throws(() => normalizeSerpApiCollectionRequest({
        schema_version: 1, lane: 'custom', trigger: 'scheduled'
    }), /lane_invalid/);
});

test('observations are normalized, bounded and convertible to strict News items', async () => {
    const { normalizeSerpApiObservation, serpApiObservationToNewsItem } = await contractPromise;
    const observation = await normalizeSerpApiObservation(await validObservation());
    assert.equal(observation.url, 'https://news.example.test/articles/serendipity');
    assert.match(observation.observation_id, /^ko_[A-Za-z0-9_-]+$/);
    assert.equal(observation.expires_at, '2026-09-08T01:00:00.000Z');

    const item = serpApiObservationToNewsItem(observation);
    assert.deepEqual(Object.keys(item), [
        'id', 'title', 'summary', 'observed_at', 'url', 'source', 'publisher', 'published_at'
    ]);
    assert.equal(item.source, 'google-news');

    const snapshot = normalizeKnowledgeSnapshot({
        schema_version: 1,
        snapshot_id: 'ks_serpapi_fixture',
        kind: 'news',
        provider_id: 'serpapi-corpus',
        transport: 'server_gateway',
        freshness: 'fresh',
        observed_at: observation.observed_at,
        expires_at: observation.expires_at,
        items: [item]
    }, { kind: 'news', provider_id: 'serpapi-corpus', transport: 'server_gateway' });
    assert.equal(snapshot.items[0].id, observation.observation_id);
});

test('observation identity derives from the canonical credential-free HTTPS URL', async () => {
    const { buildSerpApiObservationId, normalizeSerpApiObservation } = await contractPromise;
    const first = await buildSerpApiObservationId('https://news.example.test/a#one');
    const second = await buildSerpApiObservationId('https://news.example.test/a#two');
    assert.equal(first, second);

    await assert.rejects(async () => normalizeSerpApiObservation(await validObservation({
        observation_id: 'ko_forged'
    })), /observation_id_invalid/);
    await assert.rejects(async () => normalizeSerpApiObservation(await validObservation({
        url: 'https://user:password@news.example.test/a'
    })), /url_unsafe/);
});

test('observations reject expired, future, old, raw and owner-specific material', async () => {
    const { normalizeSerpApiObservation } = await contractPromise;
    await assert.rejects(async () => normalizeSerpApiObservation(await validObservation({
        expires_at: '2026-09-08T01:00:00.001Z'
    })), /expiry_invalid/);
    await assert.rejects(async () => normalizeSerpApiObservation(await validObservation({
        published_at: '2026-08-25T01:11:00.000Z'
    })), /published_at_future/);
    await assert.rejects(async () => normalizeSerpApiObservation(await validObservation({
        published_at: '2026-08-10T00:00:00.000Z'
    })), /published_at_too_old/);
    await assert.rejects(async () => normalizeSerpApiObservation({
        ...(await validObservation()), raw_response: { api_key: 'secret' }
    }), /not_allowed/);
    await assert.rejects(async () => normalizeSerpApiObservation({
        ...(await validObservation()), owner_id: 'owner-1'
    }), /not_allowed/);
});

test('collection runs expose bounded aggregate operations without raw failure text', async () => {
    const { normalizeSerpApiCollectionRun } = await contractPromise;
    const run = normalizeSerpApiCollectionRun(validRun());
    assert.equal(run.inserted_count, 8);
    assert.equal(run.refreshed_count, 6);

    assert.throws(() => normalizeSerpApiCollectionRun(validRun({
        accepted_count: 10, inserted_count: 8, refreshed_count: 6
    })), /counts_invalid/);
    assert.throws(() => normalizeSerpApiCollectionRun(validRun({
        status: 'failed', error_code: 'request failed: secret=123'
    })), /error_code_invalid/);
    assert.throws(() => normalizeSerpApiCollectionRun(validRun({
        status: 'failed', error_code: ''
    })), /failure_error_required/);
    assert.throws(() => normalizeSerpApiCollectionRun(validRun({
        status: 'skipped', attempted_upstream: false, fetched_count: 1,
        accepted_count: 0, inserted_count: 0, refreshed_count: 0, rejected_count: 0
    })), /skipped_counts_invalid/);
});
