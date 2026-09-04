const ALLOWED_SOURCES = new Set(['continuous_runner', 'local_markdown']);

function normalizeText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
}

function createBlogNextExecutionCoordinator(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    let sequence = 0;
    let active = null;

    function snapshot() {
        if (!active) return { busy: false };
        return {
            busy: true,
            executionId: active.executionId,
            source: active.source,
            subject: active.subject,
            message: active.message,
            startedAt: active.startedAt
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
                startedAt: now().toISOString()
            };
            let released = false;
            return {
                executionId: active.executionId,
                release() {
                    if (released) return false;
                    released = true;
                    if (active?.token !== token) return false;
                    active = null;
                    return true;
                }
            };
        },

        getStatus() {
            return snapshot();
        }
    };
}

module.exports = {
    createBlogNextExecutionCoordinator
};
