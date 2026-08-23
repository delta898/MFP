const { IDENTIFIER_PATTERN } = require('../core/validators');
const { compact, createOperationalCandidate, createSystemStateEvidence } = require('./operational-candidate');

const JOB_RECOVERY_PRODUCER_ID = 'job-recovery-v1';
const RECOVERY_WINDOW_MS = 72 * 60 * 60 * 1000;
const SUCCESS_STATES = new Set(['completed', 'succeeded', 'success']);

function jobTimestamp(job = {}) {
    const value = job.finished_at || job.started_at;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function unresolvedFailures(jobs = [], now = new Date()) {
    const currentTime = new Date(now).getTime();
    const sorted = (Array.isArray(jobs) ? jobs : [])
        .filter((job) => IDENTIFIER_PATTERN.test(String(job?.id || ''))
            && IDENTIFIER_PATTERN.test(String(job?.job_name || ''))
            && jobTimestamp(job) > 0
            && jobTimestamp(job) <= currentTime)
        .sort((left, right) => jobTimestamp(right) - jobTimestamp(left));
    const latestByName = new Map();
    for (const job of sorted) {
        if (!latestByName.has(job.job_name)) latestByName.set(job.job_name, job);
    }
    return [...latestByName.values()]
        .filter((job) => job.status === 'failed'
            && !SUCCESS_STATES.has(job.status)
            && currentTime - jobTimestamp(job) <= RECOVERY_WINDOW_MS)
        .sort((left, right) => jobTimestamp(right) - jobTimestamp(left));
}

function jobLabel(value) {
    return compact(value, 100).replace(/[._:-]+/g, ' ');
}

function createJobRecoveryProducer() {
    return {
        id: JOB_RECOVERY_PRODUCER_ID,
        version: 1,
        kinds: ['recovery_action'],
        async produce(input = {}, context = {}) {
            const state = input.operational_state || context.operational_state || {};
            const ownerUserId = compact(input.owner_user_id || context.owner_user_id, 240);
            if (!ownerUserId || state.owner_user_id !== ownerUserId) return { candidates: [] };
            const createdAt = new Date(state.observed_at).toISOString();
            const failures = unresolvedFailures(state.jobs, createdAt).slice(0, 3);
            return { candidates: failures.map((job) => {
                const observedAt = new Date(jobTimestamp(job)).toISOString();
                const label = jobLabel(job.job_name);
                return createOperationalCandidate({
                    producer_id: JOB_RECOVERY_PRODUCER_ID,
                    owner_user_id: ownerUserId,
                    kind: 'recovery_action',
                    key: `job:${job.job_name}`,
                    title: '최근 실패한 작업을 확인해보세요',
                    summary: `${label} 작업의 최신 실행이 실패 상태로 기록되었습니다.`,
                    explanation: 'owner 작업 이력에서 아직 성공 실행으로 해소되지 않은 최근 실패가 확인되었습니다.',
                    evidence: [createSystemStateEvidence({
                        observed_at: observedAt,
                        ttl_ms: RECOVERY_WINDOW_MS,
                        source_kind: 'job',
                        source_id: job.id,
                        label,
                        summary: '최신 작업 실행이 실패 상태로 기록되었습니다.',
                        strength: 'strong',
                        features: { status: 'failed', job_name: job.job_name }
                    })],
                    handoff: {
                        type: 'presentation', label: '시스템 로그 보기',
                        target: { surface: 'logs.system', view: 'logs', tab: '' },
                        payload: { job_name: job.job_name }
                    },
                    created_at: createdAt,
                    ttl_ms: RECOVERY_WINDOW_MS,
                    metadata: { job_name: job.job_name, latest_status: 'failed' }
                });
            }) };
        }
    };
}

module.exports = {
    JOB_RECOVERY_PRODUCER_ID,
    RECOVERY_WINDOW_MS,
    SUCCESS_STATES,
    createJobRecoveryProducer,
    jobLabel,
    unresolvedFailures
};
