const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createDeliveryStateStore,
    createRecommendationDeliveryScheduler,
    normalizeDeliveryState
} = require('./scheduler');

const NOW = Date.parse('2026-08-25T00:00:00.000Z');

function fixture(options = {}) {
    let nowMs = NOW;
    let refreshCalls = 0;
    const scheduled = [];
    const saved = [];
    let resolver = null;
    const scheduler = createRecommendationDeliveryScheduler({
        refreshService: {
            async refresh() {
                refreshCalls += 1;
                if (options.pending) return new Promise((resolve) => { resolver = resolve; });
                if (options.error) throw new Error('provider unavailable');
                return { status: 'evaluated', degraded: options.degraded === true };
            }
        },
        stateStore: {
            async load() { return normalizeDeliveryState(options.state); },
            async save(state) { saved.push({ ...state }); return normalizeDeliveryState(state); }
        },
        now: () => new Date(nowMs),
        intervalMinutes: 60,
        startupDelayMs: 0,
        baseBackoffMs: 5000,
        setTimeout(fn, delay) {
            const handle = { fn, delay, unref() {} };
            scheduled.push(handle);
            return handle;
        },
        clearTimeout(handle) {
            if (handle) handle.cleared = true;
        }
    });
    return {
        scheduler,
        scheduled,
        saved,
        refreshCalls: () => refreshCalls,
        advance(ms) { nowMs += ms; },
        resolve(value) { resolver?.(value || { status: 'evaluated', degraded: false }); }
    };
}

test('future persisted schedule은 재시작해도 외부 평가 없이 남은 시간만 예약한다', async () => {
    const future = new Date(NOW + 30 * 60 * 1000).toISOString();
    const f = fixture({ state: { next_run_at: future, last_status: 'success' } });
    await f.scheduler.start();
    assert.equal(f.scheduled[0].delay, 30 * 60 * 1000);
    assert.equal(f.refreshCalls(), 0);
});

test('overdue startup은 짧은 지연 뒤 한 번 catch-up하고 정상 주기를 예약한다', async () => {
    const f = fixture({ state: { next_run_at: new Date(NOW - 1000).toISOString() } });
    await f.scheduler.start();
    assert.equal(f.scheduled[0].delay, 0);
    await f.scheduled[0].fn();
    assert.equal(f.refreshCalls(), 1);
    assert.equal(f.scheduler.getStatus().last_status, 'success');
    assert.equal(f.scheduled.at(-1).delay, 60 * 60 * 1000);
});

test('degraded와 failure는 지수 backoff를 적용하고 마지막 성공을 덮어쓰지 않는다', async () => {
    const degraded = fixture({ degraded: true, state: { last_success_at: '2026-08-24T00:00:00.000Z' } });
    await degraded.scheduler.start();
    const first = await degraded.scheduler.runNow('test');
    assert.equal(first.status, 'degraded');
    assert.equal(degraded.scheduled.at(-1).delay, 5000);
    assert.equal(degraded.scheduler.getStatus().last_success_at, '2026-08-24T00:00:00.000Z');

    const failed = fixture({ error: true, state: { failure_count: 1 } });
    await failed.scheduler.start();
    const second = await failed.scheduler.runNow('test');
    assert.equal(second.status, 'failed');
    assert.equal(failed.scheduled.at(-1).delay, 10000);
});

test('동시 delivery trigger는 하나의 refresh promise를 공유한다', async () => {
    const f = fixture({ pending: true });
    await f.scheduler.start();
    const first = f.scheduler.runNow('first');
    const second = f.scheduler.runNow('second');
    assert.equal(f.refreshCalls(), 1);
    f.resolve();
    assert.equal(await first, await second);
    assert.equal(f.refreshCalls(), 1);
});

test('delivery state는 임시 파일 작성 뒤 rename으로 원자 교체한다', async () => {
    const calls = [];
    const store = createDeliveryStateStore({
        fs: { promises: {
            async readFile() { throw new Error('missing'); },
            async mkdir(target, options) { calls.push(['mkdir', target, options]); },
            async writeFile(target, body, encoding) { calls.push(['write', target, JSON.parse(body), encoding]); },
            async rename(from, to) { calls.push(['rename', from, to]); }
        } },
        path: { dirname: () => '/app/data' },
        persistPath: '/app/data/recommendation-delivery-state.json'
    });
    assert.deepEqual(await store.load(), normalizeDeliveryState());
    await store.save({ last_status: 'success', next_run_at: '2026-08-25T01:00:00.000Z' });
    assert.equal(calls[0][0], 'mkdir');
    assert.equal(calls[1][0], 'write');
    assert.match(calls[1][1], /recommendation-delivery-state\.json\.tmp-/);
    assert.deepEqual(calls[2], [
        'rename',
        calls[1][1],
        '/app/data/recommendation-delivery-state.json'
    ]);
});

test('stop은 예약 timer를 제거해 reload 중 중복 scheduler를 막는다', async () => {
    const f = fixture();
    await f.scheduler.start();
    const handle = f.scheduled[0];
    f.scheduler.stop();
    assert.equal(handle.cleared, true);
    assert.equal(f.scheduler.getStatus().started, false);
});
