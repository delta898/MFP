const crypto = require('crypto');
const { createApiError } = require('../ui-api/errors');
const { createCanceledError } = require('../ai/cancellation');

const DEFAULT_RETENTION_MS = 10 * 60 * 1000;
const DEFAULT_MAX_RETAINED = 20;

function createAiGenerationOperationManager(options = {}) {
    const coordinator = options.coordinator;
    if (!coordinator || typeof coordinator.acquire !== 'function') {
        throw new TypeError('AI 생성 작업에는 실행 coordinator가 필요합니다.');
    }
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
    const retentionMs = Number.isFinite(options.retentionMs)
        ? Math.max(1000, options.retentionMs) : DEFAULT_RETENTION_MS;
    const maxRetained = Number.isInteger(options.maxRetained)
        ? Math.max(1, options.maxRetained) : DEFAULT_MAX_RETAINED;
    const operations = new Map();

    function timestamp() {
        return now().toISOString();
    }

    function isTerminal(state) {
        return state === 'completed' || state === 'failed' || state === 'canceled';
    }

    function prune() {
        const cutoff = now().getTime() - retentionMs;
        for (const [id, operation] of operations) {
            if (isTerminal(operation.state) && Date.parse(operation.finishedAt) <= cutoff) {
                operations.delete(id);
            }
        }
        const finished = [...operations.values()]
            .filter((operation) => isTerminal(operation.state))
            .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
        while (finished.length > maxRetained) {
            operations.delete(finished.shift().operationId);
        }
    }

    function snapshot(operation) {
        return {
            operationId: operation.operationId,
            executionId: operation.executionId,
            state: operation.state,
            stage: operation.stage,
            busy: !isTerminal(operation.state),
            canCancel: !operation.commitStarted
                && (operation.state === 'accepted' || operation.state === 'running'),
            subject: operation.subject,
            startedAt: operation.startedAt,
            cancelRequestedAt: operation.cancelRequestedAt,
            finishedAt: operation.finishedAt,
            ...(operation.state === 'completed' ? { result: operation.result } : {}),
            ...(operation.state === 'failed' ? { error: operation.error } : {})
        };
    }

    function requireOperation(operationId) {
        prune();
        const operation = operations.get(String(operationId || '').trim());
        if (!operation) {
            throw createApiError(404, 'AI_GENERATION_OPERATION_NOT_FOUND', 'AI 원고 생성 작업을 찾지 못했습니다.');
        }
        return operation;
    }

    function start(input = {}, task) {
        if (typeof task !== 'function') throw new TypeError('AI 생성 실행 함수가 필요합니다.');
        prune();
        const subject = String(input.subject || '바로 생성 원고').trim().slice(0, 120);
        const lease = coordinator.acquire({
            source: 'manuscript_generation',
            subject,
            message: 'AI로 원고를 만들고 있습니다.'
        });
        if (!lease) {
            throw createApiError(409, 'BLOG_NEXT_EXECUTION_BUSY', '다른 블로그 작업을 처리하고 있습니다. 현재 실행이 끝난 뒤 다시 시도해 주세요.');
        }
        const controller = new AbortController();
        let operationId;
        try {
            operationId = createId();
            if (!operationId || operations.has(operationId)) {
                throw new Error('중복되거나 비어 있는 AI 생성 작업 ID입니다.');
            }
        } catch (error) {
            lease.release();
            throw error;
        }
        const operation = {
            operationId,
            executionId: lease.executionId,
            state: 'accepted',
            stage: 'preparing',
            subject,
            startedAt: timestamp(),
            cancelRequestedAt: '',
            finishedAt: '',
            result: null,
            error: null,
            controller,
            commitStarted: false
        };
        operations.set(operation.operationId, operation);

        const context = {
            signal: controller.signal,
            throwIfCanceled() {
                if (controller.signal.aborted) throw createCanceledError();
            },
            setStage(stage) {
                if (operation.state !== 'running') return false;
                operation.stage = String(stage || '').trim().slice(0, 40) || operation.stage;
                return true;
            },
            beginCommit() {
                this.throwIfCanceled();
                operation.commitStarted = true;
                operation.stage = 'finalizing';
            }
        };

        // Keep ownership of the detached promise so a rejected AI call never becomes unhandled.
        void Promise.resolve().then(async () => {
            context.throwIfCanceled();
            operation.state = 'running';
            return task(context);
        }).then((result) => {
            if (controller.signal.aborted && !operation.commitStarted) {
                operation.state = 'canceled';
            } else {
                operation.state = 'completed';
                operation.result = result;
            }
        }, (error) => {
            if ((controller.signal.aborted || error?.code === 'AI_GENERATION_CANCELED') && !operation.commitStarted) {
                operation.state = 'canceled';
            } else {
                operation.state = 'failed';
                operation.error = {
                    code: String(error?.apiCode || error?.code || 'MANUSCRIPT_AI_GENERATE_FAILED'),
                    message: String(error?.message || 'AI 원고를 만들지 못했습니다.')
                };
            }
        }).finally(() => {
            operation.finishedAt = timestamp();
            lease.release();
        });

        return snapshot(operation);
    }

    function get(operationId) {
        return snapshot(requireOperation(operationId));
    }

    function getCurrent() {
        prune();
        const current = [...operations.values()].find((operation) => !isTerminal(operation.state));
        return current ? snapshot(current) : null;
    }

    function cancel(operationId) {
        const operation = requireOperation(operationId);
        if (isTerminal(operation.state)) {
            return { ...snapshot(operation), cancelOutcome: 'already_finished' };
        }
        if (operation.commitStarted) {
            return { ...snapshot(operation), cancelOutcome: 'too_late' };
        }
        if (operation.state === 'cancel_requested') {
            return { ...snapshot(operation), cancelOutcome: 'already_requested' };
        }
        operation.state = 'cancel_requested';
        operation.cancelRequestedAt = timestamp();
        operation.controller.abort();
        return { ...snapshot(operation), cancelOutcome: 'requested' };
    }

    return { start, get, getCurrent, cancel };
}

module.exports = {
    createAiGenerationOperationManager,
    createCanceledError
};
