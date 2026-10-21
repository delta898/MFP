'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogQueueManagementCapabilities } = require('./queue-management');

function createCapabilities(overrides = {}) {
    const application = {
        supportsQueueListing: true,
        supportsTopicMoving: true,
        supportsTopicUpdating: true,
        async getReadyQueue() {
            return {
                items: [{ rowNumber: 12, subject: '가을 여행', keywords: ['오사카 여행'] }],
                saved_items: [{ rowNumber: 15, subject: '겨울 여행', keywords: [] }]
            };
        },
        async moveTopic(input) {
            return { ...input, rowNumber: 12 };
        },
        async updateTopicDetails(input) {
            return { ...input, rowNumber: 12, subject: input.newSubject || input.subject };
        },
        ...overrides
    };
    return createBlogQueueManagementCapabilities({ blogQueueManagementApplication: application });
}

test('queue listing reads persisted application state and returns selectable topic labels', async () => {
    const capability = createCapabilities().find((item) => item.id === 'content.queue.list_topics');
    const result = await capability.execute({ scope: 'queue', limit: 10 });

    assert.match(result.message, /발행 대기열 \(1건\)/);
    assert.match(result.message, /가을 여행 \(#12\) — 키워드: 오사카 여행/);
    assert.doesNotMatch(result.message, /겨울 여행/);
});

test('queue movement requires a concrete subject and distinct source and destination', () => {
    const capability = createCapabilities().find((item) => item.id === 'content.queue.move_topic');
    assert.equal(capability.effect, 'local_change');
    assert.equal(capability.confirmPolicy, 'never');
    assert.equal(capability.validate({ source: 'queue', destination: 'saved' }).ok, false);
    assert.equal(capability.validate({ subject: '가을 여행', source: 'queue', destination: 'saved' }).ok, true);
    assert.equal(capability.validate({ rowNumber: 12, source: 'queue', destination: 'saved' }).ok, true);
});

test('queue movement delegates the status change to the Application', async () => {
    let movedInput;
    const capability = createCapabilities({
        async moveTopic(input) {
            movedInput = input;
            return { ...input, rowNumber: 12 };
        }
    }).find((item) => item.id === 'content.queue.move_topic');

    const result = await capability.execute({ subject: '가을 여행', source: 'queue', destination: 'saved' });

    assert.deepEqual(movedInput, { subject: '가을 여행', source: 'queue', destination: 'saved' });
    assert.match(result.message, /가을 여행.*글감 저장소/);
    assert.deepEqual(result.sideEffects, ['topic_status_updated']);
});

test('topic update requires a target and at least one edit, then delegates to the Application', async () => {
    const capability = createCapabilities().find((item) => item.id === 'content.queue.update_topic');
    assert.equal(capability.validate({ subject: '가을 여행' }).ok, false);
    assert.equal(capability.validate({ subject: '가을 여행', platforms: ['wordpress'] }).ok, true);
    let received;
    const updateAction = createCapabilities({
        async updateTopicDetails(input) {
            received = input;
            return { subject: '가을 여행', rowNumber: 12, status: '발행 준비 완료' };
        }
    }).find((item) => item.id === 'content.queue.update_topic');
    const result = await updateAction.execute({ subject: '가을 여행', location: 'queue', platforms: ['wordpress'] });
    assert.equal(received.location, 'queue');
    assert.deepEqual(received.platforms, ['wordpress']);
    assert.match(result.message, /가을 여행.*수정했습니다/);
    assert.deepEqual(result.sideEffects, ['topic_content_updated']);
});
