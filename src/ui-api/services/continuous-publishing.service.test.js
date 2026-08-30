const test = require('node:test');
const assert = require('node:assert/strict');

const { createContinuousPublishingService } = require('./continuous-publishing.service');

function createService(state = {}) {
    return createContinuousPublishingService({
        async ensureSheetsReadyForUi() {
            state.preflightCalls = (state.preflightCalls || 0) + 1;
        },
        Utils: {
            async appendGoogleSheetTopics(rows, options) {
                state.appendedRows = rows;
                state.appendOptions = options;
                return { success: true, rowNumbers: [12], rowIndices: [10] };
            },
            async readGoogleSheetTopicsAll(options) {
                state.readOptions = options;
                return {
                    items: [{ rowIndex: 2, rowNumber: 4, status: '발행 준비 완료', subject: '먼저 쓸 글' }],
                    total: 1,
                    limit: options.limit,
                    offset: 0
                };
            },
            async updateGoogleSheetTopicEditableFields(rowIndex, fields) {
                state.updatedRowIndex = rowIndex;
                state.updatedFields = fields;
            },
            async updateGoogleSheetStatus(rowIndex, status, message, options) {
                state.statusUpdate = { rowIndex, status, message, options };
            },
            clearSheetCache(prefix) {
                state.clearedPrefix = prefix;
            }
        }
    });
}

test('save captures a waiting topic without AI, license, or publishing dependencies', async () => {
    const state = {};
    const service = createService(state);

    const result = await service.captureTopic({ action: 'save', subject: '보관할 아이디어' });

    assert.equal(result.status, '대기');
    assert.equal(result.rowNumber, 12);
    assert.equal(state.appendedRows[0].status, '대기');
    assert.deepEqual(state.appendOptions, { defaultStatus: '대기', postAppendDelayMs: 0 });
});

test('enqueue captures a ready topic with its own delivery plan', async () => {
    const state = {};
    const service = createService(state);

    const result = await service.captureTopic({
        action: 'enqueue',
        subject: '곧 발행할 아이디어',
        platforms: ['naver'],
        postStatus: 'draft'
    });

    assert.equal(result.status, '발행 준비 완료');
    assert.deepEqual(state.appendedRows[0].options.platforms, ['naver']);
    assert.equal(state.appendedRows[0].options.post_status, 'draft');
});

test('enqueue rejects an incomplete delivery plan before touching the sheet', async () => {
    const state = {};
    const service = createService(state);

    await assert.rejects(
        () => service.captureTopic({ action: 'enqueue', subject: '대상 없는 글' }),
        (error) => error.apiCode === 'PLATFORM_REQUIRED'
    );
    assert.equal(state.preflightCalls, undefined);
    assert.equal(state.appendedRows, undefined);
});

test('capture rejects an unknown action before touching the sheet', async () => {
    const state = {};
    const service = createService(state);

    await assert.rejects(
        () => service.captureTopic({ action: 'publish', subject: '범위 밖 실행' }),
        (error) => error.apiCode === 'TOPIC_CAPTURE_ACTION_INVALID'
    );
    assert.equal(state.preflightCalls, undefined);
});

test('ready queue is the FIFO projection of Topics ready rows', async () => {
    const state = {};
    const service = createService(state);
    const searchParams = new URLSearchParams({ limit: '500' });

    const result = await service.getReadyQueue({ searchParams });

    assert.equal(result.total, 1);
    assert.deepEqual(state.readOptions, {
        status: '발행 준비 완료',
        limit: 100,
        offset: 0,
        sortBy: 'rowNumber',
        sortDir: 'asc'
    });
});

test('ready topic update validates and preserves the row identity', async () => {
    const state = {};
    const service = createService(state);

    const result = await service.updateReadyTopic({
        rowIndex: 2,
        subject: '수정한 글감',
        keywords: '제주, 산책',
        platforms: ['naver', 'wordpress'],
        postStatus: 'draft',
        writingStrategy: 'discovery',
        imageMode: 'none'
    });

    assert.equal(result.rowNumber, 4);
    assert.equal(state.updatedRowIndex, 2);
    assert.deepEqual(state.updatedFields.platforms, ['naver', 'wordpress']);
    assert.equal(state.updatedFields.status, '발행 준비 완료');
    assert.equal(state.updatedFields.postStatus, 'draft');
    assert.equal(state.clearedPrefix, 'topics');
});

test('remove returns the same topic to waiting without deleting it', async () => {
    const state = {};
    const service = createService(state);

    const result = await service.removeReadyTopic({ rowIndex: 2 });

    assert.equal(result.status, '대기');
    assert.deepEqual(state.statusUpdate, {
        rowIndex: 2,
        status: '대기',
        message: '연속 발행 대기열에서 제외',
        options: { throwOnError: true }
    });
    assert.equal(state.clearedPrefix, 'topics');
});

test('queue mutation refuses a stale row that is no longer ready', async () => {
    const state = {};
    const service = createService(state);

    await assert.rejects(
        () => service.removeReadyTopic({ rowIndex: 99 }),
        (error) => error.status === 409 && error.apiCode === 'QUEUE_ITEM_NOT_READY'
    );
    assert.equal(state.statusUpdate, undefined);
});
