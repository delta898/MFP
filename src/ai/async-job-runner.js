const DEFAULT_TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_CONSECUTIVE_POLL_ERRORS = 5;

const PENDING_STATES = new Set(['submitted', 'waiting', 'queuing', 'generating']);

function getAsyncJobPollIntervalMs(elapsedMs) {
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    if (elapsed < 30 * 1000) return 2000;
    if (elapsed < 60 * 1000) return 3000;
    if (elapsed < 3 * 60 * 1000) return 5000;
    return 10000;
}

function createAsyncJobError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

async function pollAsyncJob(options = {}) {
    const taskId = String(options.taskId || '').trim();
    const queryTask = options.queryTask;
    const normalizeTask = typeof options.normalizeTask === 'function'
        ? options.normalizeTask
        : (value) => value;
    const sleep = typeof options.sleep === 'function'
        ? options.sleep
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : async () => {};
    const isRetryablePollError = typeof options.isRetryablePollError === 'function'
        ? options.isRetryablePollError
        : () => false;
    const totalTimeoutMs = Number.isFinite(Number(options.totalTimeoutMs))
        ? Math.max(1000, Number(options.totalTimeoutMs))
        : DEFAULT_TOTAL_TIMEOUT_MS;
    const maxConsecutivePollErrors = Number.isFinite(Number(options.maxConsecutivePollErrors))
        ? Math.max(0, Number.parseInt(options.maxConsecutivePollErrors, 10))
        : DEFAULT_MAX_CONSECUTIVE_POLL_ERRORS;

    if (!taskId) throw createAsyncJobError('AI_ASYNC_JOB_INVALID', '비동기 작업 ID가 없습니다.');
    if (typeof queryTask !== 'function') {
        throw createAsyncJobError('AI_ASYNC_JOB_INVALID', '비동기 작업 조회 함수가 없습니다.');
    }

    const startedAt = now();
    let consecutivePollErrors = 0;

    while (true) {
        const elapsedBeforeWait = Math.max(0, now() - startedAt);
        if (elapsedBeforeWait >= totalTimeoutMs) {
            throw createAsyncJobError(
                'AI_ASYNC_JOB_TIMEOUT',
                `비동기 작업 대기 시간이 ${Math.round(totalTimeoutMs / 60000)}분을 초과했습니다.`,
                { taskId, state: 'timed_out' }
            );
        }

        const remainingMs = totalTimeoutMs - elapsedBeforeWait;
        await sleep(Math.min(getAsyncJobPollIntervalMs(elapsedBeforeWait), remainingMs));

        if ((now() - startedAt) >= totalTimeoutMs) {
            throw createAsyncJobError(
                'AI_ASYNC_JOB_TIMEOUT',
                `비동기 작업 대기 시간이 ${Math.round(totalTimeoutMs / 60000)}분을 초과했습니다.`,
                { taskId, state: 'timed_out' }
            );
        }

        let task;
        try {
            task = normalizeTask(await queryTask(taskId));
            consecutivePollErrors = 0;
        } catch (error) {
            consecutivePollErrors += 1;
            if (
                !isRetryablePollError(error)
                || consecutivePollErrors > maxConsecutivePollErrors
            ) {
                throw createAsyncJobError(
                    'AI_ASYNC_JOB_QUERY_FAILED',
                    `비동기 작업 상태 조회에 실패했습니다: ${error.message}`,
                    { taskId, cause: error }
                );
            }
            await onUpdate({
                taskId,
                state: 'poll_retry',
                consecutivePollErrors,
                error: String(error?.message || error)
            });
            continue;
        }

        const state = String(task?.state || '').trim().toLowerCase();
        if (!state) {
            throw createAsyncJobError(
                'AI_ASYNC_JOB_INVALID_RESPONSE',
                '비동기 작업 응답에 상태가 없습니다.',
                { taskId }
            );
        }

        const normalizedTask = { ...task, taskId, state };
        await onUpdate(normalizedTask);

        if (state === 'success') return normalizedTask;
        if (state === 'fail') {
            const failureMessage = String(task?.errorMessage || '원격 이미지 생성 작업이 실패했습니다.').trim();
            throw createAsyncJobError(
                'AI_ASYNC_JOB_FAILED',
                failureMessage,
                { taskId, state, remoteCode: task?.errorCode || '' }
            );
        }
        if (!PENDING_STATES.has(state)) {
            throw createAsyncJobError(
                'AI_ASYNC_JOB_UNKNOWN_STATE',
                `지원하지 않는 비동기 작업 상태입니다: ${state}`,
                { taskId, state }
            );
        }
    }
}

module.exports = {
    DEFAULT_MAX_CONSECUTIVE_POLL_ERRORS,
    DEFAULT_TOTAL_TIMEOUT_MS,
    createAsyncJobError,
    getAsyncJobPollIntervalMs,
    pollAsyncJob
};
