const test = require('node:test');
const assert = require('node:assert/strict');

const { createContinuousPublishingService } = require('./continuous-publishing.service');

function createService(state = {}) {
    return createContinuousPublishingService({
        CONFIG: state.CONFIG,
        automationSettingsRepository: state.automationSettingsRepository || {
            read() {
                return {
                    document: {
                        schema_version: 1, enabled: false, allowed_start_time: '00:00', allowed_end_time: '23:59',
                        interval_minutes: 60, notification_enabled: false, updated_at: null
                    },
                    source: 'default', warnings: []
                };
            }
        },
        now: state.now,
        setTimeout: state.setTimeout,
        clearTimeout: state.clearTimeout,
        TelegramService: state.TelegramService,
        SlackService: state.SlackService,
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
                if (Array.isArray(state.readItems)) {
                    return { items: state.readItems, total: state.readItems.length, limit: options.limit, offset: 0 };
                }
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
            async moveGoogleSheetTopicRow(move) {
                state.rowMove = move;
                return { success: true };
            },
            clearSheetCache(prefix) {
                state.clearedPrefix = prefix;
                state.clearedPrefixes = [...(state.clearedPrefixes || []), prefix];
            }
        },
        async executeBlogRowAction(requestBody, options) {
            state.runnerRequest = requestBody;
            state.runnerOptions = options;
            if (typeof state.executeRunner === 'function') return state.executeRunner(requestBody, options);
            return { success: true, data: { status: '발행 완료' } };
        },
        async executeBlogTopicsDelete(requestBody) {
            state.deleteRequest = requestBody;
            return state.deleteResult || { success: true, data: { deletedCount: 1 } };
        }
    });
}

test('automation settings remain device-local and do not activate the timer in development', () => {
    let savedDocument = null;
    const state = {
        CONFIG: {
            RUNTIME_ENVIRONMENT_PROFILE: {
                environment: 'development', configured: true,
                effects: { manualPublish: true, automatedPublish: false }
            }
        },
        now: () => new Date(2026, 7, 30, 10, 0, 0, 0),
        automationSettingsRepository: {
            read() {
                return {
                    document: savedDocument || {
                        schema_version: 1, enabled: false, allowed_start_time: '09:00', allowed_end_time: '18:00',
                        interval_minutes: 60, notification_enabled: false, updated_at: null
                    },
                    source: savedDocument ? 'saved' : 'default', warnings: []
                };
            },
            save(input) {
                savedDocument = { schema_version: 1, ...input, updated_at: '2026-08-30T01:00:00.000Z' };
                return { document: savedDocument, source: 'saved', warnings: [] };
            }
        }
    };
    const service = createService(state);

    const result = service.saveAutomationSettings({
        enabled: true,
        allowed_start_time: '09:00',
        allowed_end_time: '18:00',
        interval_minutes: 60,
        notification_enabled: true
    });

    assert.equal(result.settings.enabled, true);
    assert.equal(result.runtime.environment, 'development');
    assert.equal(result.runtime.environment_allows_automation, false);
    assert.equal(result.runtime.effective_enabled, false);
    assert.equal(result.runtime.status, 'blocked_by_environment');
    assert.equal(result.runtime.next_run_at_preview, new Date(2026, 7, 30, 11, 0, 0, 0).toISOString());
});

function createAutomationTestState(postStatus = 'draft', environment = 'development') {
    const timers = [];
    const state = {
        timers,
        CONFIG: {
            RUNTIME_ENVIRONMENT_PROFILE: {
                environment,
                configured: true,
                effects: {
                    manualPublish: environment !== 'local',
                    automatedDraft: environment !== 'local',
                    automatedPublish: environment === 'production'
                }
            }
        },
        now: () => new Date(2026, 7, 31, 10, 0, 0, 0),
        setTimeout(fn, delay) {
            const timer = { fn, delay, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimeout() {},
        readItems: [{
            rowIndex: 7,
            rowNumber: 9,
            status: '발행 준비 완료',
            subject: '자동 실행 글감',
            postStatus,
            options: { post_status: postStatus }
        }],
        automationEnabled: false,
        notificationEnabled: false,
        automationSettingsRepository: {
            read() {
                return {
                    document: { schema_version: 1, enabled: state.automationEnabled, allowed_start_time: '00:00', allowed_end_time: '23:59', interval_minutes: 10, notification_enabled: state.notificationEnabled },
                    source: 'saved', warnings: []
                };
            },
            save(input) { return { document: { schema_version: 1, ...input }, source: 'saved', warnings: [] }; }
        }
    };
    return state;
}

test('development 30-second test automatically processes draft plans only', async () => {
    const state = createAutomationTestState('draft');
    const service = createService(state);

    const accepted = service.scheduleAutomationTest();
    assert.equal(accepted.accepted, true);
    assert.equal(state.timers[0].delay, 30000);
    await state.timers[0].fn();

    assert.equal(state.runnerOptions.manualTrigger, false);
    assert.equal(state.runnerOptions.continuousAutomation, true);
    assert.equal(state.runnerOptions.isAutoCycle, true);
    assert.equal(service.getRunnerStatus().state, 'completed');
});

test('development automatic runner stops at the top ready row when it is public publish', async () => {
    const state = createAutomationTestState('publish');
    const service = createService(state);

    service.scheduleAutomationTest();
    await state.timers[0].fn();

    const result = service.getRunnerStatus();
    assert.equal(state.runnerRequest, undefined);
    assert.equal(result.state, 'needs_attention');
    assert.equal(result.resultStatus, 'blocked:publish');
});

test('local recurring timer simulates the top ready row without executing or mutating it', async () => {
    const state = createAutomationTestState('publish', 'local');
    state.automationEnabled = true;
    const service = createService(state);

    const scheduled = service.startAutomationScheduler();
    assert.equal(scheduled.recurring_scheduled, true);
    await state.timers[0].fn();

    const result = service.getRunnerStatus();
    assert.equal(state.runnerRequest, undefined);
    assert.equal(state.statusUpdate, undefined);
    assert.equal(state.rowMove, undefined);
    assert.equal(state.clearedPrefix, 'topics');
    assert.equal(result.state, 'simulated');
    assert.equal(result.resultStatus, 'publish');
});

test('automatic result notification follows the local setting and escapes topic text', async () => {
    const messages = [];
    const state = createAutomationTestState('draft');
    state.notificationEnabled = true;
    state.readItems[0].subject = '<위험한 & 글감>';
    state.CONFIG.NOTIFY_TELEGRAM_ENABLED = true;
    state.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN = 'fixture';
    state.CONFIG.NOTIFY_TELEGRAM_CHAT_ID = 'fixture';
    state.TelegramService = {
        async sendNotification(message) { messages.push(message); return { success: true }; }
    };
    const service = createService(state);

    service.scheduleAutomationTest();
    await state.timers[0].fn();

    assert.equal(messages.length, 1);
    assert.match(messages[0], /&lt;위험한 &amp; 글감&gt;/);
});

async function waitForRunner(service) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = service.getRunnerStatus();
        if (!status.busy) return status;
        await new Promise(resolve => setImmediate(resolve));
    }
    throw new Error('runner did not settle');
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
        title: '선택한 발행 제목',
        platforms: ['naver'],
        postStatus: 'draft'
    });

    assert.equal(result.status, '발행 준비 완료');
    assert.deepEqual(state.appendedRows[0].options.platforms, ['naver']);
    assert.equal(state.appendedRows[0].options.title, '선택한 발행 제목');
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

test('ready queue follows the physical order of Topics ready rows', async () => {
    const state = {
        readItems: [
            { rowIndex: 1, rowNumber: 3, status: '대기', subject: '저장한 글감' },
            { rowIndex: 2, rowNumber: 4, status: '발행 준비 완료', subject: '먼저 쓸 글' }
        ]
    };
    const service = createService(state);
    const searchParams = new URLSearchParams({ limit: '500' });

    const result = await service.getReadyQueue({ searchParams });

    assert.equal(result.total, 1);
    assert.deepEqual(result.status_summary, { saved: 1, ready: 1 });
    assert.deepEqual(result.saved_items.map(item => item.subject), ['저장한 글감']);
    assert.deepEqual(result.items.map(item => item.subject), ['먼저 쓸 글']);
    assert.equal(result.items[0].processing_estimate_at, null);
    assert.equal(result.automation_schedule.effective_enabled, false);
    assert.deepEqual(state.readOptions, {
        limit: 100000,
        offset: 0,
        sortBy: 'rowNumber',
        sortDir: 'asc'
    });
});

test('ready queue exposes processing estimates from the current automatic schedule', async () => {
    const firstRunAt = new Date(2026, 7, 30, 17, 50, 0, 0, 0).toISOString();
    const state = {
        CONFIG: {
            RUNTIME_ENVIRONMENT_PROFILE: {
                environment: 'production', configured: true,
                effects: { manualPublish: true, automatedPublish: true }
            }
        },
        now: () => new Date(2026, 7, 30, 17, 25, 0, 0),
        readItems: [
            { rowIndex: 2, rowNumber: 4, status: '발행 준비 완료', subject: '첫 글' },
            { rowIndex: 3, rowNumber: 5, status: '발행 준비 완료', subject: '둘째 글' },
            { rowIndex: 4, rowNumber: 6, status: '발행 준비 완료', subject: '셋째 글' }
        ],
        automationSettingsRepository: {
            read() {
                return {
                    document: {
                        schema_version: 1, enabled: true, allowed_start_time: '09:00', allowed_end_time: '18:00',
                        interval_minutes: 25, notification_enabled: false, updated_at: null
                    },
                    source: 'saved', warnings: []
                };
            }
        }
    };
    const service = createService(state);
    service.startAutomationScheduler();

    const result = await service.getReadyQueue({ searchParams: new URLSearchParams({ limit: '50' }) });

    assert.equal(result.automation_schedule.next_processing_at, firstRunAt);
    assert.deepEqual(result.items.map(item => item.processing_estimate_at), [
        firstRunAt,
        new Date(2026, 7, 31, 9, 0, 0, 0).toISOString(),
        new Date(2026, 7, 31, 9, 25, 0, 0).toISOString()
    ]);
});

test('ready queue reorder moves the whole Sheet row relative to the adjacent ready topic', async () => {
    const state = {
        readItems: [
            { rowIndex: 1, rowNumber: 3, status: '발행 준비 완료', subject: '첫 글' },
            { rowIndex: 3, rowNumber: 5, status: '대기', subject: '보관 글' },
            { rowIndex: 5, rowNumber: 7, status: '발행 준비 완료', subject: '둘째 글' }
        ]
    };
    const service = createService(state);

    const result = await service.reorderReadyTopic({ rowIndex: 5, direction: 'up' });

    assert.equal(state.rowMove.sourceStartIndex, 6);
    assert.equal(state.rowMove.sourceEndIndex, 7);
    assert.equal(state.rowMove.destinationIndex, 2);
    assert.equal(result.moved.subject, '둘째 글');
    assert.ok(state.clearedPrefixes.length >= 3);
    assert.ok(state.clearedPrefixes.every(prefix => prefix === 'topics'));
});

test('ready queue reorder rejects a boundary move without mutating the Sheet', async () => {
    const state = {
        readItems: [
            { rowIndex: 1, rowNumber: 3, status: '발행 준비 완료', subject: '첫 글' },
            { rowIndex: 5, rowNumber: 7, status: '발행 준비 완료', subject: '둘째 글' }
        ]
    };
    const service = createService(state);

    await assert.rejects(
        () => service.reorderReadyTopic({ rowIndex: 1, direction: 'up' }),
        error => error.apiCode === 'QUEUE_MOVE_BOUNDARY' && error.status === 409
    );
    assert.equal(state.rowMove, undefined);
});

test('ready topic update validates and preserves the row identity', async () => {
    const state = {};
    const service = createService(state);

    const result = await service.updateReadyTopic({
        rowIndex: 2,
        subject: '수정한 글감',
        title: '수정한 최종 제목',
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
    assert.equal(state.updatedFields.title, '수정한 최종 제목');
    assert.equal(state.clearedPrefix, 'topics');
});

test('saved topic can be updated in place or promoted to the ready queue', async () => {
    const state = {
        readItems: [{ rowIndex: 2, rowNumber: 4, status: '대기', subject: '보관한 글감' }]
    };
    const service = createService(state);

    const saved = await service.updateTopic({
        action: 'save',
        sourceStatus: '대기',
        rowIndex: 2,
        subject: '조금 더 적은 글감'
    });
    assert.equal(saved.status, '대기');
    assert.equal(state.updatedFields.status, '대기');

    const promoted = await service.updateTopic({
        action: 'enqueue',
        sourceStatus: '대기',
        rowIndex: 2,
        subject: '발행할 글감',
        platforms: ['naver']
    });
    assert.equal(promoted.status, '발행 준비 완료');
    assert.equal(state.updatedFields.status, '발행 준비 완료');
});

test('saved topic deletion verifies waiting state before deleting the row', async () => {
    const state = {
        readItems: [{ rowIndex: 2, rowNumber: 4, status: '대기', subject: '지울 글감' }]
    };
    const service = createService(state);

    const result = await service.deleteSavedTopic({ rowIndex: 2 });

    assert.equal(result.deleted, true);
    assert.deepEqual(state.deleteRequest, { rowIndices: [2] });
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

test('single-item runner selects the top ready topic without overriding its plan', async () => {
    const state = {
        readItems: [{ rowIndex: 7, rowNumber: 9, status: '발행 준비 완료', subject: '첫 번째 글' }]
    };
    const service = createService(state);

    const accepted = service.startNextReadyTopic({ headless: false });
    const result = await waitForRunner(service);

    assert.equal(accepted.accepted, true);
    assert.deepEqual(state.readOptions, {
        status: '발행 준비 완료', limit: 1, offset: 0, sortBy: 'rowNumber', sortDir: 'asc'
    });
    assert.deepEqual(state.runnerRequest, {
        action: 'batch', rowIndex: 7, headless: false, requireReadyStatus: true
    });
    assert.equal(Object.hasOwn(state.runnerRequest, 'targets'), false);
    assert.equal(Object.hasOwn(state.runnerRequest, 'postStatus'), false);
    assert.equal(state.runnerOptions.manualTrigger, true);
    assert.equal(state.runnerOptions.isAutoCycle, false);
    assert.equal(result.state, 'completed');
    assert.equal(result.resultStatus, '발행 완료');
});

test('manual runner can execute one explicitly selected ready topic without changing queue order', async () => {
    const state = {
        readItems: [
            { rowIndex: 7, rowNumber: 9, status: '발행 준비 완료', subject: '첫 번째 글' },
            { rowIndex: 11, rowNumber: 13, status: '발행 준비 완료', subject: '지금 실행할 글', postStatus: 'draft' }
        ]
    };
    const service = createService(state);

    const accepted = service.startNextReadyTopic({ rowIndex: 11, headless: true });
    const result = await waitForRunner(service);

    assert.equal(accepted.accepted, true);
    assert.deepEqual(state.readOptions, {
        status: '발행 준비 완료', limit: 10000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc'
    });
    assert.deepEqual(state.runnerRequest, {
        action: 'batch', rowIndex: 11, headless: true, requireReadyStatus: true
    });
    assert.equal(result.subject, '지금 실행할 글');
    assert.equal(result.resultStatus, '발행 완료');
});

test('single-item runner reports an empty queue without invoking publishing', async () => {
    const state = { readItems: [] };
    const service = createService(state);

    service.startNextReadyTopic();
    const result = await waitForRunner(service);

    assert.equal(result.state, 'empty');
    assert.equal(state.runnerRequest, undefined);
});

test('single-item runner rejects duplicate starts while one run is active', async () => {
    let releaseExecution;
    const state = {
        readItems: [{ rowIndex: 7, rowNumber: 9, status: '발행 준비 완료', subject: '첫 번째 글' }],
        executeRunner: () => new Promise(resolve => { releaseExecution = resolve; })
    };
    const service = createService(state);

    service.startNextReadyTopic();
    await new Promise(resolve => setImmediate(resolve));
    assert.throws(
        () => service.startNextReadyTopic(),
        (error) => error.status === 409 && error.apiCode === 'CONTINUOUS_RUNNER_BUSY'
    );
    releaseExecution({ success: true, data: { status: '임시 저장 완료' } });
    const result = await waitForRunner(service);
    assert.equal(result.resultStatus, '임시 저장 완료');
});

test('single-item runner retains a stable failure result for UI polling', async () => {
    const state = {
        readItems: [{ rowIndex: 7, rowNumber: 9, status: '발행 준비 완료', subject: '첫 번째 글' }],
        executeRunner: async () => ({ success: false, code: 'NAVER_SESSION_INVALID', message: '로그인이 필요합니다.' })
    };
    const service = createService(state);

    service.startNextReadyTopic();
    const result = await waitForRunner(service);

    assert.equal(result.state, 'failed');
    assert.equal(result.resultStatus, 'NAVER_SESSION_INVALID');
    assert.equal(result.message, '로그인이 필요합니다.');
});
