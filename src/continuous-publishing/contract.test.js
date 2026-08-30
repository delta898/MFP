const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TOPIC_STATUS,
    TOPIC_OWNED_FIELDS,
    AUTOMATION_OWNED_FIELDS,
    TERMINAL_TOPIC_STATUSES,
    isQueueReadyStatus,
    isTerminalTopicStatus
} = require('./contract');

test('continuous publishing keeps topic and automation ownership disjoint', () => {
    const overlap = TOPIC_OWNED_FIELDS.filter((field) => AUTOMATION_OWNED_FIELDS.includes(field));

    assert.deepEqual(overlap, []);
    assert.equal(TOPIC_OWNED_FIELDS.includes('platforms'), true);
    assert.equal(TOPIC_OWNED_FIELDS.includes('post_status'), true);
    assert.equal(TOPIC_OWNED_FIELDS.includes('schedule_date'), true);
    assert.equal(AUTOMATION_OWNED_FIELDS.includes('interval_minutes'), true);
});

test('only explicitly ready topics are eligible for the queue consumer', () => {
    assert.equal(isQueueReadyStatus(TOPIC_STATUS.READY), true);
    assert.equal(isQueueReadyStatus(TOPIC_STATUS.WAITING), false);
    assert.equal(isQueueReadyStatus(TOPIC_STATUS.RUNNING), false);
    assert.equal(isQueueReadyStatus(' 발행 준비 완료 '), true);
});

test('published, drafted, and platform-scheduled states are terminal outcomes', () => {
    assert.deepEqual(TERMINAL_TOPIC_STATUSES, [
        '발행 완료',
        '임시 저장 완료',
        '예약 포스팅 등록 완료'
    ]);
    assert.equal(isTerminalTopicStatus(TOPIC_STATUS.SCHEDULED), true);
    assert.equal(isTerminalTopicStatus(TOPIC_STATUS.NEEDS_ATTENTION), false);
    assert.equal(isTerminalTopicStatus(TOPIC_STATUS.FAILED), false);
});
