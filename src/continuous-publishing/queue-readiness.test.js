const test = require('node:test');
const assert = require('node:assert/strict');

const { diagnoseQueueReadiness } = require('./queue-readiness');

function readyTopic(overrides = {}) {
    return {
        subject: '기준 글감',
        postStatus: 'draft',
        options: { platforms: ['naver'], post_status: 'draft' },
        ...overrides
    };
}

test('queue readiness accepts a complete per-item publishing plan', () => {
    const result = diagnoseQueueReadiness(readyTopic());

    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.plan, {
        subject: '기준 글감', targets: ['naver'], postStatus: 'draft', scheduleDate: ''
    });
});

test('queue readiness reports missing values without inferring defaults', () => {
    const result = diagnoseQueueReadiness({
        subject: '',
        postStatus: 'publish',
        post_status_explicit: false,
        options: {}
    });

    assert.equal(result.ready, false);
    assert.deepEqual(result.issues.map(({ code }) => code), [
        'SUBJECT_REQUIRED', 'PUBLISH_TARGET_REQUIRED', 'POST_STATUS_REQUIRED'
    ]);
    assert.deepEqual(result.plan.targets, []);
    assert.equal(result.plan.postStatus, '');
});

test('queue readiness identifies unsupported and multiple targets', () => {
    const site = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['site'], post_status: 'draft' } }));
    const multiple = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['naver', 'wordpress'], post_status: 'draft' } }));

    assert.equal(site.issues[0].code, 'PUBLISH_TARGET_UNSUPPORTED');
    assert.equal(multiple.issues[0].code, 'MULTIPLE_PUBLISH_TARGETS');
});

test('queue readiness rejects scheduled items without a future valid timestamp', () => {
    const options = { now: new Date('2026-10-08T10:00:00.000Z') };
    const missing = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['naver'], post_status: 'schedule' } }), options);
    const past = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['naver'], post_status: 'schedule', schedule_date: '2026-10-08T09:59:00.000Z'
    } }), options);
    const invalid = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['naver'], post_status: 'schedule', schedule_date: 'not-a-date'
    } }), options);

    assert.equal(missing.issues[0].code, 'SCHEDULE_DATE_REQUIRED');
    assert.equal(past.issues[0].code, 'SCHEDULE_DATE_PAST');
    assert.equal(invalid.issues[0].code, 'SCHEDULE_DATE_INVALID');
});
