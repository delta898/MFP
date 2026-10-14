const ALLOWED_SOURCES = new Set(['continuous_runner', 'shopping_continuous_runner', 'local_markdown', 'manuscript_generation', 'manuscript_image_generation']);

function normalizeText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
}

function createBlogNextExecutionCoordinator(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    let sequence = 0;
    let active = null;
    let lastTerminalStatus = null;

    function snapshot() {
        if (!active) return { busy: false };
        return {
            busy: true,
            state: active.stopRequested ? 'stop_requested' : 'running',
            executionId: active.executionId,
            source: active.source,
            subject: active.subject,
            message: active.message,
            startedAt: active.startedAt,
            ...(active.progressStage ? { progressStage: active.progressStage } : {}),
            ...(active.postStatus ? { postStatus: active.postStatus } : {}),
            ...(active.canStop && !active.stopRequested ? { canStop: true } : {}),
            ...(active.stopRequested ? { canStop: false } : {})
        };
    }

    return {
        acquire(input = {}) {
            if (active) return null;
            const source = normalizeText(input.source, 40);
            if (!ALLOWED_SOURCES.has(source)) {
                const error = new Error('지원하지 않는 블로그 실행 경로입니다.');
                error.code = 'BLOG_NEXT_EXECUTION_SOURCE_INVALID';
                throw error;
            }
            const token = Symbol(source);
            sequence += 1;
            active = {
                token,
                executionId: `blog-next-${sequence}`,
                source,
                subject: normalizeText(input.subject) || (source === 'local_markdown' ? '원고 포스팅' : '발행 대기열'),
                message: normalizeText(input.message, 200) || '블로그 작업을 처리하고 있습니다.',
                progressStage: '',
                postStatus: '',
                canStop: input.canStop === true && source === 'local_markdown',
                stopRequested: false,
                abortController: new AbortController(),
                startedAt: now().toISOString()
            };
            lastTerminalStatus = null;
            let released = false;
            return {
                executionId: active.executionId,
                signal: active.abortController.signal,
                setCanStop(canStop) {
                    if (released || active?.token !== token || active.stopRequested) return false;
                    active.canStop = canStop === true && active.source === 'local_markdown';
                    return true;
                },
                updateProgress(progress = {}) {
                    if (released || active?.token !== token) return false;
                    const stage = normalizeText(progress.stage, 40);
                    const message = normalizeText(progress.message, 200);
                    if (!stage || !message) return false;
                    active.progressStage = stage;
                    active.message = message;
                    active.postStatus = normalizeText(progress.postStatus, 20);
                    if (['submitting', 'verifying'].includes(stage)) active.canStop = false;
                    return true;
                },
                release() {
                    if (released) return false;
                    released = true;
                    if (active?.token !== token) return false;
                    if (active.stopRequested) {
                        lastTerminalStatus = {
                            busy: false,
                            state: 'stopped',
                            executionId: active.executionId,
                            source: active.source,
                            subject: active.subject,
                            message: '블로그 포스팅을 중지했습니다. 이미 처리된 업로드·발행은 되돌리지 않습니다.',
                            startedAt: active.startedAt,
                            finishedAt: now().toISOString(),
                            ...(active.progressStage ? { progressStage: active.progressStage } : {}),
                            ...(active.postStatus ? { postStatus: active.postStatus } : {})
                        };
                    }
                    active = null;
                    return true;
                }
            };
        },

        getStatus() {
            return active ? snapshot() : (lastTerminalStatus ? { ...lastTerminalStatus } : { busy: false });
        },

        requestStop() {
            if (!active || active.source !== 'local_markdown' || !active.canStop || active.stopRequested) {
                return { accepted: false, status: active ? snapshot() : { busy: false } };
            }
            active.stopRequested = true;
            active.canStop = false;
            active.message = '블로그 포스팅 중지를 처리하고 있습니다.';
            active.abortController.abort();
            return { accepted: true, status: snapshot() };
        }
    };
}

module.exports = {
    createBlogNextExecutionCoordinator
};
