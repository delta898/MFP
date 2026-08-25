const test = require('node:test');
const assert = require('node:assert/strict');

const servicePromise = import('../supabase/functions/_shared/serpapi-collection-operations-service.ts');

const request = { schema_version: 1, lane: 'headlines_kr', trigger: 'scheduled' };
const account = {
    checked_at: '2026-08-25T12:00:00.000Z',
    searches_limit: 250,
    searches_used: 50,
    searches_remaining: 200,
    renewal_date: '2026-09-17'
};

function baseStore(events, overrides = {}) {
    return {
        async acquireLease() {
            events.push('lease');
            return { acquired: true, reason: '', retry_after_seconds: 0 };
        },
        async releaseLease() { events.push('release'); return { released: true }; },
        async recordAccountStatus() { events.push('account-store'); return { recorded: true }; },
        async reserveBudget() {
            events.push('budget');
            return { reserved: true, duplicate: false, count: 1, limit: 200, reason: '' };
        },
        async recordProviderSuccess() { events.push('provider-success'); },
        async recordProviderFailure() { events.push('provider-failure'); },
        async recordRun(run) { events.push(`run:${run.status}`); },
        ...overrides
    };
}

function options(events, overrides = {}) {
    return {
        now: () => new Date('2026-08-25T12:00:00.000Z'),
        randomUUID: (() => {
            let value = 0;
            return () => `fixture-${++value}`;
        })(),
        accountProvider: { async check() { events.push('account'); return account; } },
        collectorService: {
            async run() {
                events.push('collect');
                return { status: 'succeeded', attempted_upstream: true };
            }
        },
        store: baseStore(events),
        ...overrides
    };
}

test('operations service gates account and budget before one collector call', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    const events = [];
    const service = createSerpApiCollectionOperationsService(options(events));
    const run = await service.run(request, 'kco_scheduled_20260825_0020_headlines_kr');
    assert.equal(run.status, 'succeeded');
    assert.deepEqual(events, [
        'lease', 'account', 'account-store', 'budget', 'collect', 'provider-success', 'release'
    ]);
});

test('protected Account reserve skips without consuming local budget', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    const events = [];
    const configured = options(events, {
        accountProvider: {
            async check() { events.push('account'); return { ...account, searches_remaining: 50 }; }
        }
    });
    const service = createSerpApiCollectionOperationsService(configured);
    const run = await service.run(request, 'kco_scheduled_reserve');
    assert.equal(run.status, 'skipped');
    assert.equal(run.error_code, 'SERPAPI_ACCOUNT_RESERVE_PROTECTED');
    assert.deepEqual(events, ['lease', 'account', 'account-store', 'run:skipped', 'release']);
});

test('duplicate and exhausted operations skip without collector execution', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    for (const budget of [
        { reserved: false, duplicate: true, count: 12, limit: 200, reason: 'duplicate' },
        { reserved: false, duplicate: false, count: 200, limit: 200, reason: 'exhausted' }
    ]) {
        const events = [];
        const store = baseStore(events, {
            async reserveBudget() { events.push('budget'); return budget; }
        });
        const service = createSerpApiCollectionOperationsService(options(events, { store }));
        const run = await service.run(request, `kco_test_${budget.reason}`);
        assert.equal(run.status, 'skipped');
        assert.equal(run.error_code, budget.duplicate
            ? 'COLLECTION_OPERATION_DUPLICATE'
            : 'COLLECTION_BUDGET_EXHAUSTED');
        assert.equal(events.includes('collect'), false);
        assert.equal(events.at(-1), 'release');
    }
});

test('lease backoff skips before Account API and budget access', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    const events = [];
    const store = baseStore(events, {
        async acquireLease() {
            events.push('lease');
            return { acquired: false, reason: 'backoff', retry_after_seconds: 3600 };
        }
    });
    const service = createSerpApiCollectionOperationsService(options(events, { store }));
    const run = await service.run(request, 'kco_backoff');
    assert.equal(run.error_code, 'COLLECTION_PROVIDER_BACKOFF');
    assert.deepEqual(events, ['lease', 'run:skipped']);
});

test('Account API failure records sanitized failure and releases the lease', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    const events = [];
    const providerError = Object.assign(new Error('raw account response'), {
        code: 'SERPAPI_ACCOUNT_UPSTREAM_FAILED'
    });
    const configured = options(events, {
        accountProvider: { async check() { events.push('account'); throw providerError; } }
    });
    const service = createSerpApiCollectionOperationsService(configured);
    await assert.rejects(() => service.run(request, 'kco_account_failure'), (error) => {
        assert.equal(error.code, 'SERPAPI_ACCOUNT_UPSTREAM_FAILED');
        assert.equal(JSON.stringify(error.run).includes('raw account'), false);
        return true;
    });
    assert.deepEqual(events, ['lease', 'account', 'provider-failure', 'run:failed', 'release']);
});

test('control or budget store failure stops before Google News', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    for (const target of ['recordAccountStatus', 'reserveBudget']) {
        const events = [];
        const store = baseStore(events, {
            async [target]() { events.push(target); throw new Error('database internals'); }
        });
        const service = createSerpApiCollectionOperationsService(options(events, { store }));
        await assert.rejects(() => service.run(request, `kco_store_${target}`), (error) => {
            assert.equal(error.code, target === 'reserveBudget'
                ? 'COLLECTION_BUDGET_STORE_FAILED'
                : 'COLLECTION_CONTROL_STORE_FAILED');
            return true;
        });
        assert.equal(events.includes('collect'), false);
        assert.equal(events.at(-1), 'release');
    }
});

test('a reserved Google News failure records provider backoff and keeps the reservation spent', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    const events = [];
    const providerFailure = Object.assign(new Error('raw provider response'), {
        code: 'SERPAPI_UPSTREAM_FAILED',
        run: { status: 'failed', error_code: 'SERPAPI_UPSTREAM_FAILED' }
    });
    const configured = options(events, {
        collectorService: {
            async run() { events.push('collect'); throw providerFailure; }
        }
    });
    const service = createSerpApiCollectionOperationsService(configured);
    await assert.rejects(
        () => service.run(request, 'kco_provider_failure'),
        (error) => error.code === 'SERPAPI_UPSTREAM_FAILED'
    );
    assert.deepEqual(events, [
        'lease', 'account', 'account-store', 'budget', 'collect', 'provider-failure', 'release'
    ]);
});

test('malformed budget state fails closed before Google News', async () => {
    const { createSerpApiCollectionOperationsService } = await servicePromise;
    const events = [];
    const store = baseStore(events, {
        async reserveBudget() {
            events.push('budget');
            return { reserved: true, duplicate: true, count: 201, limit: 201, reason: 'unsafe' };
        }
    });
    const service = createSerpApiCollectionOperationsService(options(events, { store }));
    await assert.rejects(
        () => service.run(request, 'kco_bad_budget'),
        (error) => error.code === 'COLLECTION_BUDGET_STORE_FAILED'
    );
    assert.equal(events.includes('collect'), false);
    assert.equal(events.at(-1), 'release');
});
