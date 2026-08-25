const test = require('node:test');
const assert = require('node:assert/strict');

const contractPromise = import('../supabase/functions/_shared/serpapi-collection-contract.ts');
const servicePromise = import('../supabase/functions/_shared/serpapi-collection-service.ts');

async function observation() {
    const contract = await contractPromise;
    const url = 'https://news.example.test/article/1';
    return await contract.normalizeSerpApiObservation({
        schema_version: 1,
        observation_id: await contract.buildSerpApiObservationId(url),
        kind: 'news',
        provider_id: 'serpapi-google-news',
        source: 'google-news',
        lane: 'headlines_kr',
        locale: 'ko-KR',
        country: 'KR',
        title: '테스트 기사',
        summary: '테스트 요약',
        url,
        publisher: 'Example News',
        published_at: '2026-08-25T10:00:00.000Z',
        observed_at: '2026-08-25T11:00:00.000Z',
        expires_at: '2026-09-08T11:00:00.000Z'
    });
}

function request() {
    return { schema_version: 1, lane: 'headlines_kr', trigger: 'manual' };
}

test('collector service persists observations before a sanitized successful run', async () => {
    const { createSerpApiCollectionService } = await servicePromise;
    const item = await observation();
    const events = [];
    const service = createSerpApiCollectionService({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        randomUUID: () => 'fixture-run',
        collector: {
            async collect() {
                events.push('collect');
                return {
                    provider_id: 'serpapi-google-news', lane: 'headlines_kr', attempted_upstream: true,
                    fetched_count: 1, accepted_count: 1, rejected_count: 0, observations: [item]
                };
            }
        },
        store: {
            async upsertObservations(providerId, observations) {
                events.push('upsert');
                assert.equal(providerId, 'serpapi-google-news');
                assert.equal(observations.length, 1);
                return { accepted_count: 1, inserted_count: 1, refreshed_count: 0 };
            },
            async recordRun(run) {
                events.push('run');
                assert.equal(run.status, 'succeeded');
            }
        }
    });

    const run = await service.run(request());
    assert.deepEqual(events, ['collect', 'upsert', 'run']);
    assert.equal(run.run_id, 'kcr_fixture-run');
    assert.equal(run.inserted_count, 1);
    assert.equal(run.error_code, '');
});

test('provider failure records only a stable code and whether upstream was attempted', async () => {
    const { createSerpApiCollectionService } = await servicePromise;
    const runs = [];
    const providerFailure = Object.assign(new Error('raw response with secret'), {
        code: 'SERPAPI_RATE_LIMITED', attemptedUpstream: true
    });
    const service = createSerpApiCollectionService({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        randomUUID: () => 'failed-run',
        collector: { async collect() { throw providerFailure; } },
        store: {
            async upsertObservations() { throw new Error('must not upsert'); },
            async recordRun(run) { runs.push(run); }
        }
    });

    await assert.rejects(() => service.run(request()), (error) => {
        assert.equal(error.code, 'SERPAPI_RATE_LIMITED');
        assert.equal(JSON.stringify(error.run).includes('raw response'), false);
        return true;
    });
    assert.equal(runs[0].status, 'failed');
    assert.equal(runs[0].attempted_upstream, true);
    assert.equal(runs[0].error_code, 'SERPAPI_RATE_LIMITED');
});

test('observation store failure records a failed run without claiming inserts', async () => {
    const { createSerpApiCollectionService } = await servicePromise;
    const item = await observation();
    const runs = [];
    const service = createSerpApiCollectionService({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        randomUUID: () => 'store-failure',
        collector: {
            async collect() {
                return {
                    provider_id: 'serpapi-google-news', lane: 'headlines_kr', attempted_upstream: true,
                    fetched_count: 1, accepted_count: 1, rejected_count: 0, observations: [item]
                };
            }
        },
        store: {
            async upsertObservations() { throw new Error('database internals'); },
            async recordRun(run) { runs.push(run); }
        }
    });

    await assert.rejects(() => service.run(request()), (error) => error.code === 'OBSERVATION_STORE_FAILED');
    assert.equal(runs[0].accepted_count, 1);
    assert.equal(runs[0].inserted_count, 0);
    assert.equal(runs[0].error_code, 'OBSERVATION_STORE_FAILED');
});

test('run persistence failure is fail-closed and never returns untracked success', async () => {
    const { createSerpApiCollectionService } = await servicePromise;
    const service = createSerpApiCollectionService({
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        randomUUID: () => 'run-store-failure',
        collector: {
            async collect() {
                return {
                    provider_id: 'serpapi-google-news', lane: 'headlines_kr', attempted_upstream: true,
                    fetched_count: 0, accepted_count: 0, rejected_count: 0, observations: []
                };
            }
        },
        store: {
            async upsertObservations() { throw new Error('must not upsert empty result'); },
            async recordRun() { throw new Error('run store unavailable'); }
        }
    });

    await assert.rejects(
        () => service.run(request()),
        (error) => error.code === 'COLLECTION_RUN_STORE_FAILED'
    );
});

