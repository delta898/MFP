const { compact, createOperationalCandidate, createSystemStateEvidence } = require('./operational-candidate');

const PENDING_WORKFLOW_PRODUCER_ID = 'pending-workflow-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_PENDING_STATES = new Set(['approved', 'rejected', 'cancelled', 'expired', 'completed']);

function pendingTimestamp(item = {}, fallback) {
    for (const value of [item.updated_at, item.created_at]) {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function createPendingWorkflowProducer() {
    return {
        id: PENDING_WORKFLOW_PRODUCER_ID,
        version: 1,
        kinds: ['workflow_hint'],
        async produce(input = {}, context = {}) {
            const state = input.operational_state || context.operational_state || {};
            const ownerUserId = compact(input.owner_user_id || context.owner_user_id, 240);
            if (!ownerUserId || state.owner_user_id !== ownerUserId) return { candidates: [] };
            const createdAt = new Date(state.observed_at).toISOString();
            const pending = (Array.isArray(state.pending_confirmations) ? state.pending_confirmations : [])
                .filter((item) => !TERMINAL_PENDING_STATES.has(compact(item.status, 40)))
                .sort((left, right) => pendingTimestamp(right, 0) - pendingTimestamp(left, 0));
            if (pending.length === 0) return { candidates: [] };
            const latest = pending[0];
            const observedAt = new Date(pendingTimestamp(latest, Date.parse(createdAt))).toISOString();
            const candidate = createOperationalCandidate({
                producer_id: PENDING_WORKFLOW_PRODUCER_ID,
                owner_user_id: ownerUserId,
                kind: 'workflow_hint',
                key: 'pending-confirmations',
                title: '확인 대기 중인 요청이 있습니다',
                summary: `현재 확인 대기 중인 요청이 ${pending.length}건 있습니다. 요청 내용을 확인해 주세요.`,
                explanation: '현재 owner의 확인 대기 상태를 근거로 한 작업 안내입니다.',
                evidence: [createSystemStateEvidence({
                    observed_at: observedAt,
                    ttl_ms: DAY_MS,
                    source_kind: 'event',
                    source_id: latest.id,
                    label: '확인 대기 요청',
                    summary: '확인 대기 상태의 요청이 존재합니다.',
                    strength: 'strong',
                    features: { pending_count: pending.length }
                })],
                handoff: null,
                created_at: createdAt,
                ttl_ms: DAY_MS,
                metadata: { pending_count: pending.length }
            });
            return { candidates: [candidate] };
        }
    };
}

module.exports = {
    DAY_MS,
    PENDING_WORKFLOW_PRODUCER_ID,
    TERMINAL_PENDING_STATES,
    createPendingWorkflowProducer,
    pendingTimestamp
};
