function createMemoryBasedSuggestionProvider() {
    function getFeedbackMap(preferences = []) {
        const map = new Map();
        preferences.forEach((item) => {
            const name = String(item?.name || '').trim();
            if (!name.startsWith('suggestion_feedback.')) return;
            map.set(name.replace(/^suggestion_feedback\./, ''), item.value || {});
        });
        return map;
    }

    function shouldIncludeSuggestion(feedbackMap, feedbackKey) {
        const key = String(feedbackKey || '').trim();
        if (!key) return true;
        const value = feedbackMap.get(key);
        if (!value || typeof value !== 'object') return true;
        const positive = Number(value.helpful_count || 0) + Number(value.accepted_count || 0);
        const negative = Number(value.not_helpful_count || 0) + Number(value.rejected_count || 0);
        return negative <= positive;
    }

    return {
        id: 'memory-based',

        async generate(input = {}, context = {}) {
            const suggestions = [];
            const preferences = Array.isArray(context?.memory?.preferences) ? context.memory.preferences : [];
            const pending = Array.isArray(context?.memory?.pending_confirmations) ? context.memory.pending_confirmations : [];
            const recentJobs = Array.isArray(context?.memory?.recent_job_runs) ? context.memory.recent_job_runs : [];
            const trendKnowledge = Array.isArray(context?.knowledge)
                ? context.knowledge
                    .filter((entry) => String(entry?.kind || '').trim() === 'trends')
                    .flatMap((entry) => Array.isArray(entry.items) ? entry.items : [])
                    .slice(0, 5)
                : [];
            const feedbackMap = getFeedbackMap(preferences);

            const trendsTimePref = preferences.find((item) => item.name === 'preferred_trends_collect_time');
            if (trendsTimePref?.value?.time && shouldIncludeSuggestion(feedbackMap, 'workflow_hint.preferred_trends_collect_time')) {
                suggestions.push({
                    id: `sugg_${Date.now()}_trends_time`,
                    type: 'workflow_hint',
                    summary: `트렌드 수집 선호 시간은 현재 ${trendsTimePref.value.time}로 보입니다. 향후 자동 제안 시 이 시간대를 기본 후보로 삼을 수 있습니다.`,
                    payload: {
                        source: 'preference',
                        preference: 'preferred_trends_collect_time',
                        value: trendsTimePref.value,
                        feedback_key: 'workflow_hint.preferred_trends_collect_time'
                    },
                    status: 'proposed'
                });
            }

            if (pending.length > 0 && shouldIncludeSuggestion(feedbackMap, 'next_action.pending_confirmations')) {
                suggestions.push({
                    id: `sugg_${Date.now()}_pending`,
                    type: 'next_action',
                    summary: `현재 확인 대기 중인 요청이 ${pending.length}건 있습니다. 먼저 승인/취소를 정리하는 것이 좋습니다.`,
                    payload: {
                        source: 'working_memory',
                        pending_count: pending.length,
                        feedback_key: 'next_action.pending_confirmations'
                    },
                    status: 'proposed'
                });
            }

            const failedJob = recentJobs.find((item) => String(item.status || '').trim().toLowerCase() === 'failed');
            if (failedJob && shouldIncludeSuggestion(feedbackMap, 'recovery_hint.failed_job')) {
                suggestions.push({
                    id: `sugg_${Date.now()}_retry_job`,
                    type: 'recovery_hint',
                    summary: `최근 실패한 작업이 있습니다: ${failedJob.job_name}. 원인 점검 후 재실행 제안을 붙일 수 있습니다.`,
                    payload: {
                        source: 'recent_job_run',
                        job_name: failedJob.job_name,
                        result: failedJob.result || {},
                        feedback_key: 'recovery_hint.failed_job'
                    },
                    status: 'proposed'
                });
            }

            if (trendKnowledge.length > 0 && shouldIncludeSuggestion(feedbackMap, 'workflow_hint.external_trends')) {
                const firstTrend = trendKnowledge[0];
                suggestions.push({
                    id: `sugg_${Date.now()}_external_trends`,
                    type: 'workflow_hint',
                    summary: `외부 트렌드 신호가 감지됐습니다. 현재 '${firstTrend.title}' 같은 주제가 올라오고 있어 관련 글감 정리에 활용할 수 있습니다.`,
                    payload: {
                        source: 'knowledge',
                        kind: 'trends',
                        top_title: firstTrend.title,
                        feedback_key: 'workflow_hint.external_trends'
                    },
                    status: 'proposed'
                });
            }

            return suggestions.slice(0, Math.max(1, Math.min(5, Number(input.limit || 3))));
        }
    };
}

module.exports = {
    createMemoryBasedSuggestionProvider
};
