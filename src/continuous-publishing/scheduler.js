'use strict';

const { computeNextRunPreview } = require('./automation-settings');

const TEST_DELAY_MS = 30 * 1000;

function createContinuousPublishingScheduler(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    const readSettings = options.readSettings;
    const runOnce = options.runOnce;
    if (typeof readSettings !== 'function') throw new Error('scheduler readSettings is required.');
    if (typeof runOnce !== 'function') throw new Error('scheduler runOnce is required.');

    let recurringTimer = null;
    let testTimer = null;
    let running = false;
    let state = {
        state: 'stopped',
        message: '자동 실행이 꺼져 있습니다.',
        next_run_at: null,
        test_run_at: null,
        last_started_at: null,
        last_finished_at: null,
        last_result: ''
    };

    function snapshot() {
        return { ...state, running, recurring_scheduled: recurringTimer !== null, test_scheduled: testTimer !== null };
    }

    function cancelRecurring() {
        if (recurringTimer !== null) clearTimer(recurringTimer);
        recurringTimer = null;
        state.next_run_at = null;
    }

    function scheduleRecurring() {
        cancelRecurring();
        const settings = readSettings();
        if (settings?.enabled !== true) {
            state = { ...state, state: 'stopped', message: '자동 실행이 꺼져 있습니다.', next_run_at: null };
            return snapshot();
        }
        const current = now();
        const nextRunAt = computeNextRunPreview(settings, { now: current });
        const delay = Math.max(0, new Date(nextRunAt).getTime() - current.getTime());
        state = { ...state, state: 'scheduled', message: '다음 자동 실행을 기다리고 있습니다.', next_run_at: nextRunAt };
        recurringTimer = setTimer(async () => {
            recurringTimer = null;
            state.next_run_at = null;
            await execute('recurring');
            scheduleRecurring();
        }, delay);
        recurringTimer?.unref?.();
        return snapshot();
    }

    async function execute(source) {
        if (running) {
            state = { ...state, state: 'busy', message: '다른 글감을 처리 중이라 이번 실행을 건너뜁니다.', last_result: 'busy' };
            return snapshot();
        }
        running = true;
        state = { ...state, state: 'running', message: '자동 실행을 시작합니다.', last_started_at: now().toISOString() };
        try {
            const result = await runOnce({ source });
            state = {
                ...state,
                state: result?.state || 'completed',
                message: result?.message || '자동 실행을 마쳤습니다.',
                last_result: result?.resultStatus || result?.state || 'completed'
            };
        } catch (error) {
            state = {
                ...state,
                state: 'failed',
                message: error.message || '자동 실행 중 오류가 발생했습니다.',
                last_result: error.apiCode || error.code || 'failed'
            };
        } finally {
            running = false;
            state.last_finished_at = now().toISOString();
        }
        return snapshot();
    }

    function scheduleTestRun() {
        if (testTimer !== null) {
            const error = new Error('이미 30초 시험 실행을 기다리고 있습니다.');
            error.code = 'CONTINUOUS_AUTOMATION_TEST_ALREADY_SCHEDULED';
            error.apiCode = error.code;
            error.status = 409;
            throw error;
        }
        const runAt = new Date(now().getTime() + TEST_DELAY_MS).toISOString();
        state = { ...state, state: 'test_scheduled', message: '30초 후 1회 시험 실행을 기다리고 있습니다.', test_run_at: runAt };
        testTimer = setTimer(async () => {
            testTimer = null;
            state.test_run_at = null;
            await execute('test');
        }, TEST_DELAY_MS);
        testTimer?.unref?.();
        return snapshot();
    }

    function stop() {
        cancelRecurring();
        if (testTimer !== null) clearTimer(testTimer);
        testTimer = null;
        state = { ...state, state: 'stopped', message: '자동 실행이 꺼져 있습니다.', test_run_at: null };
        return snapshot();
    }

    return {
        start: scheduleRecurring,
        refresh: scheduleRecurring,
        scheduleTestRun,
        getStatus: snapshot,
        stop,
        executeForTest: execute
    };
}

module.exports = {
    TEST_DELAY_MS,
    createContinuousPublishingScheduler
};
