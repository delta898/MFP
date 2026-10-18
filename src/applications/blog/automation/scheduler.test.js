'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TEST_DELAY_MS, createContinuousPublishingScheduler } = require('./scheduler');

function createFixture(overrides = {}) {
    const timers = [];
    let current = new Date(2026, 7, 31, 9, 0, 0, 0);
    const settings = { enabled: true, allowed_start_time: '09:00', allowed_end_time: '18:00', interval_minutes: 10 };
    const runs = [];
    const scheduler = createContinuousPublishingScheduler({
        now: () => new Date(current),
        readSettings: () => ({ ...settings }),
        setTimeout(fn, delay) {
            const timer = { fn, delay, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) { timer.cleared = true; },
        async runOnce(context) {
            runs.push(context);
            return overrides.result || { state: 'completed', message: '완료', resultStatus: 'draft' };
        }
    });
    return { scheduler, timers, runs, settings, setNow(value) { current = new Date(value); } };
}

test('scheduler starts from now plus interval and never catches up missed runs', () => {
    const fixture = createFixture();
    const status = fixture.scheduler.start();
    assert.equal(status.state, 'scheduled');
    assert.equal(status.next_run_at, new Date(2026, 7, 31, 9, 10, 0, 0).toISOString());
    assert.equal(fixture.timers[0].delay, 10 * 60 * 1000);
});

test('disabled settings do not leave a recurring timer', () => {
    const fixture = createFixture();
    fixture.settings.enabled = false;
    const status = fixture.scheduler.start();
    assert.equal(status.recurring_scheduled, false);
    assert.equal(status.next_run_at, null);
});

test('development test action schedules exactly one run after 30 seconds', async () => {
    const fixture = createFixture();
    const status = fixture.scheduler.scheduleTestRun();
    assert.equal(status.test_scheduled, true);
    assert.equal(fixture.timers[0].delay, TEST_DELAY_MS);
    await fixture.timers[0].fn();
    assert.deepEqual(fixture.runs, [{ source: 'test' }]);
    assert.equal(fixture.scheduler.getStatus().test_scheduled, false);
});

test('duplicate test timers are rejected with a stable conflict', () => {
    const fixture = createFixture();
    fixture.scheduler.scheduleTestRun();
    assert.throws(
        () => fixture.scheduler.scheduleTestRun(),
        (error) => error.status === 409 && error.apiCode === 'CONTINUOUS_AUTOMATION_TEST_ALREADY_SCHEDULED'
    );
});
