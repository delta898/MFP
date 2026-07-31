const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getAsyncJobPollIntervalMs,
    pollAsyncJob
} = require('./async-job-runner');

test('async job polling intervals grow without exceeding ten seconds', () => {
    assert.equal(getAsyncJobPollIntervalMs(0), 2000);
    assert.equal(getAsyncJobPollIntervalMs(29999), 2000);
    assert.equal(getAsyncJobPollIntervalMs(30000), 3000);
    assert.equal(getAsyncJobPollIntervalMs(60000), 5000);
    assert.equal(getAsyncJobPollIntervalMs(180000), 10000);
});

test('async job runner polls one task until success', async () => {
    let time = 0;
    const states = ['waiting', 'generating', 'success'];
    const updates = [];
    const result = await pollAsyncJob({
        taskId: 'task-1',
        now: () => time,
        sleep: async (ms) => { time += ms; },
        queryTask: async () => ({ state: states.shift(), resultUrls: ['https://cdn.example/image.png'] }),
        onUpdate: async (task) => updates.push(task.state)
    });

    assert.equal(result.taskId, 'task-1');
    assert.equal(result.state, 'success');
    assert.deepEqual(updates, ['waiting', 'generating', 'success']);
});

test('async job runner retries transient query errors without changing task id', async () => {
    let time = 0;
    const queriedTaskIds = [];
    let calls = 0;
    const result = await pollAsyncJob({
        taskId: 'same-task',
        now: () => time,
        sleep: async (ms) => { time += ms; },
        isRetryablePollError: () => true,
        queryTask: async (taskId) => {
            queriedTaskIds.push(taskId);
            calls += 1;
            if (calls < 3) throw new Error('temporary');
            return { state: 'success' };
        }
    });

    assert.equal(result.state, 'success');
    assert.deepEqual(queriedTaskIds, ['same-task', 'same-task', 'same-task']);
});

test('async job runner distinguishes provider failure and total timeout', async () => {
    let failedTime = 0;
    await assert.rejects(
        pollAsyncJob({
            taskId: 'failed-task',
            now: () => failedTime,
            sleep: async (ms) => { failedTime += ms; },
            queryTask: async () => ({
                state: 'fail',
                errorCode: 'CONTENT_REJECTED',
                errorMessage: 'generation rejected'
            })
        }),
        (error) => error.code === 'AI_ASYNC_JOB_FAILED' && error.taskId === 'failed-task'
    );

    let timeoutTime = 0;
    await assert.rejects(
        pollAsyncJob({
            taskId: 'slow-task',
            totalTimeoutMs: 5000,
            now: () => timeoutTime,
            sleep: async (ms) => { timeoutTime += ms; },
            queryTask: async () => ({ state: 'waiting' })
        }),
        (error) => error.code === 'AI_ASYNC_JOB_TIMEOUT'
            && error.taskId === 'slow-task'
            && error.state === 'timed_out'
    );
});
