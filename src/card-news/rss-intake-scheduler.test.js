const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CARD_NEWS_RSS_INITIAL_DELAY_MS,
    CARD_NEWS_RSS_INTERVAL_MS,
    createCardNewsRssIntakeScheduler
} = require('./rss-intake-scheduler');

test('RSS intake scheduler waits one minute, then schedules every thirty minutes', async () => {
    const scheduled = [];
    const scheduler = createCardNewsRssIntakeScheduler({
        intake: { async collect(trigger) { assert.equal(trigger, 'scheduled'); } },
        logger: { info() {} },
        setTimer(callback, delay) {
            const timer = { callback, delay, unref() {} };
            scheduled.push(timer);
            return timer;
        },
        clearTimer() {}
    });

    assert.equal(scheduler.start(), true);
    assert.equal(scheduler.start(), false);
    assert.equal(scheduled[0].delay, CARD_NEWS_RSS_INITIAL_DELAY_MS);

    await scheduled[0].callback();
    assert.equal(scheduled[1].delay, CARD_NEWS_RSS_INTERVAL_MS);
});

test('RSS intake scheduler stops pending work and retries only on the next regular interval', async () => {
    const scheduled = [];
    const cleared = [];
    const warnings = [];
    const scheduler = createCardNewsRssIntakeScheduler({
        intake: { async collect() { throw new Error('temporary'); } },
        logger: { info() {}, warn(message) { warnings.push(message); } },
        setTimer(callback, delay) {
            const timer = { callback, delay };
            scheduled.push(timer);
            return timer;
        },
        clearTimer(timer) { cleared.push(timer); }
    });

    scheduler.start();
    await scheduled[0].callback();
    assert.match(warnings[0], /temporary/);
    assert.equal(scheduled[1].delay, CARD_NEWS_RSS_INTERVAL_MS);
    assert.equal(scheduler.stop(), true);
    assert.equal(cleared[0], scheduled[1]);
    assert.equal(scheduler.stop(), false);
});
