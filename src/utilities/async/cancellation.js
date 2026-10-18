function createCanceledError() {
    const error = new Error('AI 원고 생성을 취소했습니다.');
    error.code = 'AI_GENERATION_CANCELED';
    return error;
}

function isCancellation(error, signal) {
    return signal?.aborted === true
        || error?.code === 'AI_GENERATION_CANCELED'
        || error?.code === 'ERR_CANCELED'
        || error?.name === 'AbortError';
}

function throwIfCanceled(signal) {
    if (signal?.aborted) throw createCanceledError();
}

function rethrowIfCanceled(error, signal) {
    if (isCancellation(error, signal)) {
        const canceled = createCanceledError();
        if (error?.remoteStatusUnknown === true) canceled.remoteStatusUnknown = true;
        throw canceled;
    }
}

function sleepWithCancellation(ms, signal, fallbackSleep) {
    throwIfCanceled(signal);
    if (!signal) return fallbackSleep(ms);
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(createCanceledError());
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
    });
}

function raceWithCancellation(work, signal) {
    throwIfCanceled(signal);
    const promise = typeof work === 'function' ? work() : work;
    if (!signal) return Promise.resolve(promise);
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(createCanceledError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            }
        );
        if (signal.aborted) onAbort();
    });
}

module.exports = {
    createCanceledError,
    isCancellation,
    raceWithCancellation,
    rethrowIfCanceled,
    sleepWithCancellation,
    throwIfCanceled
};
