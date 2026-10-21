'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogQueueManagementApplication } = require('./application');

function createFixture(topics) {
    const changes = [];
    const topicStore = {
        async readByStatus(status) {
            return { items: topics.filter((topic) => topic.status === status) };
        },
        async updateEditableFields(rowIndex, fields) {
            changes.push({ rowIndex, fields });
        },
        async updateStatus(rowIndex, status, reason) {
            const topic = topics.find((item) => item.rowIndex === rowIndex);
            topic.status = status;
            changes.push({ rowIndex, status, reason });
        }
    };
    return {
        changes,
        application: createBlogQueueManagementApplication({
            topicStore,
            diagnoseTopic: async () => ({ ready: true, issues: [] })
        })
    };
}

test('topic edit changes requested fields while retaining omitted settings and current location', async () => {
    const topic = {
        rowIndex: 5, rowNumber: 7, subject: '가을 여행', status: '발행 준비 완료',
        keywords: ['가을 여행'], image_mode: 'generate', external_reference: false,
        content_guide: { additional_instructions: '실제 여행 경험 위주', reference_urls: ['https://example.com'] },
        options: { platforms: ['naver'], post_status: 'draft', writing_strategy: 'experience' }
    };
    const { application, changes } = createFixture([topic]);
    application.supportsTopicUpdating = true;
    const result = await application.updateTopicDetails({
        subject: '가을 여행', location: 'queue', platforms: ['wordpress']
    });

    assert.equal(result.rowNumber, 7);
    assert.equal(result.status, '발행 준비 완료');
    assert.equal(changes[0].rowIndex, 5);
    assert.deepEqual(changes[0].fields.platforms, ['wordpress']);
    assert.deepEqual(changes[0].fields.keywords, ['가을 여행']);
    assert.equal(changes[0].fields.instruction, '실제 여행 경험 위주');
    assert.deepEqual(changes[0].fields.referenceUrl, ['https://example.com']);
    assert.equal(changes[0].fields.imageMode, 'generate');
    assert.equal(changes[0].fields.externalReference, false);
    assert.equal(changes[0].fields.postStatus, 'draft');
});

test('topic edit asks for a row number when a subject matches multiple saved/queued entries', async () => {
    const { application, changes } = createFixture([
        { rowIndex: 1, rowNumber: 3, subject: '가을 여행', status: '발행 준비 완료' },
        { rowIndex: 2, rowNumber: 4, subject: '가을 여행', status: '대기' }
    ]);
    await assert.rejects(
        application.updateTopicDetails({ subject: '가을 여행', keywords: ['단풍'] }),
        error => error.apiCode === 'TOPIC_UPDATE_AMBIGUOUS'
    );
    assert.deepEqual(changes, []);
});

test('queue application moves one uniquely named item from the queue into saved topics', async () => {
    const { application, changes } = createFixture([
        { rowIndex: 4, subject: '가을 여행', status: '발행 준비 완료' }
    ]);

    const result = await application.moveTopic({ subject: '가을 여행', source: 'queue', destination: 'saved' });

    assert.deepEqual(result, {
        subject: '가을 여행', source: 'queue', destination: 'saved', rowIndex: 4, rowNumber: 6
    });
    assert.equal(changes[0].status, '대기');
});

test('queue application moves a saved item into the queue after readiness validation', async () => {
    const { application, changes } = createFixture([
        { rowIndex: 8, subject: '겨울 여행', status: '대기' }
    ]);

    const result = await application.moveTopic({ subject: '겨울 여행', source: 'saved', destination: 'queue' });

    assert.equal(result.destination, 'queue');
    assert.equal(result.rowIndex, 8);
    assert.equal(changes[0].status, '발행 준비 완료');
});

test('queue application refuses to guess when the requested topic is ambiguous', async () => {
    const { application, changes } = createFixture([
        { rowIndex: 1, subject: '가을 여행', status: '발행 준비 완료' },
        { rowIndex: 2, subject: '가을 여행', status: '발행 준비 완료' }
    ]);

    await assert.rejects(
        application.moveTopic({ subject: '가을 여행', source: 'queue', destination: 'saved' }),
        error => error.apiCode === 'TOPIC_MOVE_AMBIGUOUS'
    );
    assert.deepEqual(changes, []);
});

test('queue application can disambiguate duplicate subjects by the listed row number', async () => {
    const { application, changes } = createFixture([
        { rowIndex: 1, rowNumber: 3, subject: '가을 여행', status: '발행 준비 완료' },
        { rowIndex: 2, rowNumber: 4, subject: '가을 여행', status: '발행 준비 완료' }
    ]);

    const result = await application.moveTopic({ subject: '가을 여행', rowNumber: 4, source: 'queue', destination: 'saved' });

    assert.equal(result.rowNumber, 4);
    assert.equal(changes[0].rowIndex, 2);
});

test('queue application refuses a move while a blog publishing run is active', async () => {
    const changes = [];

    const busyApplication = createBlogQueueManagementApplication({
        topicStore: {
            async readByStatus(status) {
                return { items: [{ rowIndex: 4, subject: '가을 여행', status }] };
            },
            async updateStatus(rowIndex, status) { changes.push({ rowIndex, status }); }
        },
        isBusy: () => true
    });

    await assert.rejects(
        busyApplication.moveTopic({ subject: '가을 여행', source: 'queue', destination: 'saved' }),
        error => error.apiCode === 'CONTINUOUS_RUNNER_BUSY'
    );
    assert.deepEqual(changes, []);
});
