const { stableAdapterId } = require('../adapters/identity');

const DAY_MS = 86400000;

function iso(value, fallback) {
    const timestamp = Date.parse(String(value || ''));
    return new Date(Number.isFinite(timestamp) ? timestamp : fallback).toISOString();
}

function buildCandidate({ ownerUserId, kind, source, signalKey, title, summary, explanation, sourceRef, evidenceKind, strength, createdAt, ttlMs, handoff = null, metadata = {} }) {
    const sourceIdentity = sourceRef.id || sourceRef.provider_id;
    const candidateId = stableAdapterId('candidate', ownerUserId, signalKey, sourceIdentity);
    const observedAt = iso(sourceRef.timestamp, Date.parse(createdAt));
    return {
        candidate_id: candidateId,
        kind,
        producer_id: 'agent-memory-context-v1',
        owner_user_id: ownerUserId,
        title,
        summary,
        explanation,
        evidence: [{
            evidence_id: stableAdapterId('evidence', candidateId, sourceIdentity),
            kind: evidenceKind,
            stage: 'observed',
            strength,
            summary: explanation,
            observed_at: observedAt,
            expires_at: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
            source_ref: { ...sourceRef, timestamp: sourceRef.timestamp || createdAt },
            features: {}
        }],
        handoff,
        dedupe_key: `${signalKey}:${sourceIdentity}`.slice(0, 300),
        created_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
        metadata: { source, signal_key: signalKey, ...metadata }
    };
}

function createMemoryContextRecommendationProducer(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    return {
        id: 'agent-memory-context',
        async produce(input = {}, context = {}) {
            const currentTime = now();
            const ownerUserId = String(context?.memory?.owner_memory?.owner_user_id || context.owner_user_id || '').trim();
            if (!ownerUserId) return { candidates: [] };
            const recentJobs = Array.isArray(context?.memory?.recent_job_runs) ? context.memory.recent_job_runs : [];
            const trendEntries = (Array.isArray(context.knowledge) ? context.knowledge : [])
                .filter((entry) => String(entry?.kind || '') === 'trends')
                .flatMap((entry) => (Array.isArray(entry.items) ? entry.items.map((item) => ({ entry, item })) : []));
            const candidates = [];
            const failedJob = recentJobs.find((item) => String(item?.status || '').toLowerCase() === 'failed');
            const jobKey = 'failed_job';
            if (failedJob) {
                const createdAt = iso(failedJob.finished_at || failedJob.started_at, currentTime);
                const jobId = String(failedJob.id || `${failedJob.job_name}:${createdAt}`);
                candidates.push(buildCandidate({
                    ownerUserId, kind: 'recovery_action', source: 'recent_job_run', signalKey: jobKey,
                    title: '최근 실패 작업 점검',
                    summary: `최근 실패한 ${String(failedJob.job_name || '작업').slice(0, 100)} 작업의 원인을 점검해 보세요.`,
                    explanation: '최근 작업 이력에서 실패 상태가 확인되었습니다.',
                    sourceRef: { kind: 'job', id: jobId, label: String(failedJob.job_name || '실패 작업'), provider_id: '', transport: '', url: '', timestamp: createdAt },
                    evidenceKind: 'system_state', strength: 'medium', createdAt, ttlMs: 3 * DAY_MS
                }));
            }

            const trendKey = 'external_trends';
            if (trendEntries[0]) {
                const { entry, item } = trendEntries[0];
                const title = String(item?.title || item?.metadata?.keyword || '').trim().slice(0, 180);
                if (title) {
                    const createdAt = iso(item.timestamp, currentTime);
                    candidates.push(buildCandidate({
                    ownerUserId, kind: 'content_opportunity', source: 'knowledge', signalKey: trendKey,
                        title: `${title} 관련 글감`,
                        summary: `최근 '${title}' 트렌드가 확인되어 관련 글감을 정리해 볼 수 있습니다.`,
                        explanation: '외부 트렌드에서 최근 관찰된 주제입니다.',
                        sourceRef: {
                            kind: 'knowledge', id: String(item.id || stableAdapterId('trend', title, createdAt)), label: title,
                            provider_id: String(entry.provider_id || 'trends'), transport: String(entry.transport || 'builtin_api'),
                            url: String(item.url || ''), timestamp: createdAt
                        },
                        evidenceKind: 'knowledge', strength: 'weak', createdAt, ttlMs: DAY_MS,
                        handoff: { type: 'presentation', label: '글감 보기', target: { surface: 'blog.quick', view: '', tab: '' }, payload: { query: title } }
                    }));
                }
            }
            return { candidates };
        }
    };
}

module.exports = { createMemoryContextRecommendationProducer };
