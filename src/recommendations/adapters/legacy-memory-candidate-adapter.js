const { stableAdapterId } = require('./identity');

const DAY_MS = 86400000;

function iso(value, fallback) {
    const timestamp = Date.parse(String(value || ''));
    return new Date(Number.isFinite(timestamp) ? timestamp : fallback).toISOString();
}

function getFeedbackMap(preferences = []) {
    const map = new Map();
    preferences.forEach((item) => {
        const name = String(item?.name || '').trim();
        if (name.startsWith('suggestion_feedback.')) map.set(name.slice('suggestion_feedback.'.length), item.value || {});
    });
    return map;
}

function shouldInclude(feedbackMap, key) {
    const value = feedbackMap.get(key);
    if (!value || typeof value !== 'object') return true;
    return Number(value.not_helpful_count || 0) + Number(value.rejected_count || 0)
        <= Number(value.helpful_count || 0) + Number(value.accepted_count || 0);
}

function buildCandidate({ ownerUserId, kind, legacyType, source, feedbackKey, title, summary, explanation, sourceRef, evidenceKind, strength, createdAt, ttlMs, handoff = null, metadata = {} }) {
    const sourceIdentity = sourceRef.id || sourceRef.provider_id;
    const candidateId = stableAdapterId('candidate', ownerUserId, feedbackKey, sourceIdentity);
    const observedAt = iso(sourceRef.timestamp, Date.parse(createdAt));
    return {
        candidate_id: candidateId,
        kind,
        producer_id: 'legacy-memory-adapter-v1',
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
        dedupe_key: `${feedbackKey}:${sourceIdentity}`.slice(0, 300),
        created_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
        metadata: {
            legacy_type: legacyType,
            legacy_source: source,
            legacy_feedback_key: feedbackKey,
            ...metadata
        }
    };
}

function createMemoryBasedSuggestionProvider(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    return {
        id: 'legacy-memory-adapter',
        async generate(input = {}, context = {}) {
            const currentTime = now();
            const ownerUserId = String(context?.memory?.owner_memory?.owner_user_id || context.owner_user_id || '').trim();
            if (!ownerUserId) return { candidates: [], legacyItems: [] };
            const preferences = Array.isArray(context?.memory?.preferences) ? context.memory.preferences : [];
            const pending = Array.isArray(context?.memory?.pending_confirmations) ? context.memory.pending_confirmations : [];
            const recentJobs = Array.isArray(context?.memory?.recent_job_runs) ? context.memory.recent_job_runs : [];
            const trendEntries = (Array.isArray(context.knowledge) ? context.knowledge : [])
                .filter((entry) => String(entry?.kind || '') === 'trends')
                .flatMap((entry) => (Array.isArray(entry.items) ? entry.items.map((item) => ({ entry, item })) : []));
            const feedbackMap = getFeedbackMap(preferences);
            const candidates = [];
            const legacyItems = pending.length > 0 ? [{
                id: String(pending[0]?.id || stableAdapterId('pending', ownerUserId, pending.length)),
                type: 'next_action',
                summary: `현재 확인 대기 중인 요청이 ${pending.length}건 있습니다. 기존 확인 카드에서 승인 또는 취소해 주세요.`,
                payload: { source: 'working_memory', pending_count: pending.length },
                status: 'proposed',
                legacy_only: true,
                feedback_enabled: false,
                actionable: false
            }] : [];

            const preference = preferences.find((item) => item.name === 'preferred_trends_collect_time');
            const prefKey = 'workflow_hint.preferred_trends_collect_time';
            if (preference?.value?.time && shouldInclude(feedbackMap, prefKey)) {
                const createdAt = new Date(currentTime).toISOString();
                const observedAt = iso(preference.updated_at, currentTime);
                candidates.push(buildCandidate({
                    ownerUserId, kind: 'workflow_hint', legacyType: 'workflow_hint', source: 'preference', feedbackKey: prefKey,
                    title: '트렌드 수집 시간 활용 안내',
                    summary: `트렌드 수집 선호 시간 ${preference.value.time}을 다음 자동화 계획에 활용해 보세요.`,
                    explanation: '저장된 트렌드 수집 시간 설정을 근거로 한 운영 안내입니다.',
                    sourceRef: { kind: 'setting', id: `preferred_trends_collect_time:${preference.value.time}`, label: '트렌드 수집 시간', provider_id: '', transport: '', url: '', timestamp: observedAt },
                    evidenceKind: 'system_state', strength: 'medium', createdAt, ttlMs: 7 * DAY_MS
                }));
            }

            const failedJob = recentJobs.find((item) => String(item?.status || '').toLowerCase() === 'failed');
            const jobKey = 'recovery_hint.failed_job';
            if (failedJob && shouldInclude(feedbackMap, jobKey)) {
                const createdAt = iso(failedJob.finished_at || failedJob.started_at, currentTime);
                const jobId = String(failedJob.id || `${failedJob.job_name}:${createdAt}`);
                candidates.push(buildCandidate({
                    ownerUserId, kind: 'recovery_action', legacyType: 'recovery_hint', source: 'recent_job_run', feedbackKey: jobKey,
                    title: '최근 실패 작업 점검',
                    summary: `최근 실패한 ${String(failedJob.job_name || '작업').slice(0, 100)} 작업의 원인을 점검해 보세요.`,
                    explanation: '최근 작업 이력에서 실패 상태가 확인되었습니다.',
                    sourceRef: { kind: 'job', id: jobId, label: String(failedJob.job_name || '실패 작업'), provider_id: '', transport: '', url: '', timestamp: createdAt },
                    evidenceKind: 'system_state', strength: 'medium', createdAt, ttlMs: 3 * DAY_MS
                }));
            }

            const trendKey = 'workflow_hint.external_trends';
            if (trendEntries[0] && shouldInclude(feedbackMap, trendKey)) {
                const { entry, item } = trendEntries[0];
                const title = String(item?.title || item?.metadata?.keyword || '').trim().slice(0, 180);
                if (title) {
                    const createdAt = iso(item.timestamp, currentTime);
                    candidates.push(buildCandidate({
                        ownerUserId, kind: 'content_opportunity', legacyType: 'workflow_hint', source: 'knowledge', feedbackKey: trendKey,
                        title: `${title} 관련 글감`,
                        summary: `최근 '${title}' 트렌드가 확인되어 관련 글감을 정리해 볼 수 있습니다.`,
                        explanation: '외부 트렌드에서 최근 관찰된 주제입니다.',
                        sourceRef: {
                            kind: 'knowledge', id: String(item.id || stableAdapterId('trend', title, createdAt)), label: title,
                            provider_id: String(entry.provider_id || 'legacy-trends'), transport: String(entry.transport || 'builtin_api'),
                            url: String(item.url || ''), timestamp: createdAt
                        },
                        evidenceKind: 'knowledge', strength: 'weak', createdAt, ttlMs: DAY_MS,
                        handoff: { type: 'presentation', label: '글감 보기', target: { surface: 'blog.quick', view: '', tab: '' }, payload: { query: title } }
                    }));
                }
            }
            return { candidates, legacyItems };
        }
    };
}

module.exports = { createMemoryBasedSuggestionProvider, getFeedbackMap, shouldInclude };
