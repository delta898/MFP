'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createModelCatalogService } = require('./catalog');

test('Gateway catalog loads its cached snapshot, coalesces refresh, and keeps last-known-good data on failure', async () => {
    const applied = [];
    const logs = [];
    let fetchCount = 0;
    let resolveFetch;
    const service = createModelCatalogService({
        refreshTtlMs: 1000,
        loadCachedCatalog: () => ({ version: 'cached', models: [] }),
        async fetchCatalog() {
            fetchCount += 1;
            if (fetchCount === 1) return new Promise((resolve) => { resolveFetch = resolve; });
            throw new Error('offline');
        },
        applySnapshot(payload) { applied.push(payload); return { version: payload.version }; },
        getSnapshot: () => applied.at(-1),
        getStatus: () => ({ source: 'supabase', version: applied.at(-1)?.version || '', remote_model_count: 0 }),
        logger: {
            info(message) { logs.push({ level: 'info', message }); },
            warn(message) { logs.push({ level: 'warn', message }); },
            debug(message) { logs.push({ level: 'debug', message }); }
        }
    });

    assert.equal(service.getCatalog().version, 'cached');
    const first = service.refresh(true);
    const second = service.refresh(true);
    assert.equal(fetchCount, 1);
    resolveFetch({ version: 'fresh', models: [] });
    assert.equal((await first).version, 'fresh');
    assert.equal((await second).version, 'fresh');
    assert.equal(service.getCatalog().version, 'fresh');

    const failedRefresh = await service.refresh(true);
    assert.equal(failedRefresh.version, 'fresh');
    assert.match(failedRefresh.refresh_error, /offline/);
    assert.equal(service.getCatalog().version, 'fresh');
    assert.ok(logs.some((entry) => entry.message.includes('로컬 캐시 적용 (version=cached')));
    assert.ok(logs.some((entry) => entry.message.includes('적용 완료 (version=fresh')));
    assert.ok(logs.some((entry) => entry.level === 'warn' && entry.message.includes('갱신 실패, 마지막 정상 카탈로그 유지')));
});

test('Gateway catalog reports an unavailable catalog when no cached snapshot exists', async () => {
    const service = createModelCatalogService({
        loadCachedCatalog: () => null,
        async fetchCatalog() { throw new Error('Supabase is unavailable'); },
        applySnapshot() { throw new Error('not used'); },
        getSnapshot: () => ({ text: [], image: [], providers: { text: [], image: [] } }),
        getStatus: () => ({ source: 'unavailable', version: '' })
    });
    const result = await service.refresh(true);
    assert.equal(result.source, 'unavailable');
    assert.match(result.refresh_error, /Supabase is unavailable/);
});
