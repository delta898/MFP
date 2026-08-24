const crypto = require('crypto');
const { normalizeCapability } = require('./capabilities');

function normalizeSessionId(value) {
    return String(value || '').trim().slice(0, 160);
}

function createSmartUsageService({ License } = {}) {
    if (!License
        || typeof License.reserveSmartUsage !== 'function'
        || typeof License.commitSmartUsage !== 'function'
        || typeof License.releaseSmartUsage !== 'function') {
        throw new Error('smart usage License methods are required');
    }

    async function run(capabilityInput, input = {}, action) {
        const capability = normalizeCapability(capabilityInput);
        if (!capability) throw new Error('지원하지 않는 스마트 기능입니다.');
        if (typeof action !== 'function') throw new Error('smart usage action is required');

        const sessionId = normalizeSessionId(input.sessionId) || crypto.randomUUID();
        const operationId = String(input.operationId || crypto.randomUUID()).trim();
        const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
        const reservation = await License.reserveSmartUsage({
            capability,
            sessionId,
            operationId,
            metadata
        });
        if (!reservation?.success) {
            const error = new Error(reservation?.message || '이번 달 사용 가능 횟수를 모두 사용했습니다.');
            error.code = reservation?.code || 'SMART_USAGE_RESERVE_FAILED';
            error.apiCode = error.code;
            error.status = ['SMART_USAGE_EXHAUSTED', 'SMART_SESSION_REQUEST_LIMIT'].includes(error.code) ? 429 : 503;
            error.usage = reservation?.usage || null;
            throw error;
        }

        try {
            const result = await action({
                sessionId: reservation.sessionId || sessionId,
                operationId: reservation.operationId || operationId,
                usage: reservation.usage || null
            });
            const committed = await License.commitSmartUsage({
                capability,
                sessionId: reservation.sessionId || sessionId,
                operationId: reservation.operationId || operationId,
                metadata
            });
            if (!committed?.success) {
                const error = new Error(committed?.message || '사용량 처리 결과를 확정하지 못했습니다.');
                error.code = committed?.code || 'SMART_USAGE_COMMIT_FAILED';
                error.apiCode = error.code;
                error.status = 503;
                throw error;
            }
            let usage = committed.usage || reservation.usage || null;
            if (typeof License.getSmartUsageStatus === 'function') {
                const status = await License.getSmartUsageStatus().catch(() => null);
                const current = status?.success === true && Array.isArray(status.items)
                    ? status.items.find((item) => String(item?.capability || '') === capability)
                    : null;
                if (current) usage = { ...(usage || {}), ...current, capability };
            }
            return {
                result,
                sessionId: committed.sessionId || reservation.sessionId || sessionId,
                usage
            };
        } catch (error) {
            await License.releaseSmartUsage({
                capability,
                sessionId: reservation.sessionId || sessionId,
                operationId: reservation.operationId || operationId,
                metadata: { ...metadata, failure: String(error?.message || 'unknown').slice(0, 240) }
            }).catch(() => {});
            throw error;
        }
    }

    return { run };
}

module.exports = {
    createSmartUsageService,
    normalizeSessionId
};
