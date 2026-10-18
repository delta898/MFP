function createCandidate(overrides = {}) {
    return {
        candidate_id: 'candidate:news:ai-writing',
        kind: 'content_opportunity',
        producer_id: 'news-content-v1',
        owner_user_id: 'owner-local',
        title: ' AI 글쓰기 정책 변화 ',
        summary: ' 최신 뉴스와 관심 이력을 함께 반영했습니다. ',
        explanation: '최근 뉴스이며 사용자가 관련 글을 발행한 근거가 있습니다.',
        evidence: [{
            evidence_id: 'knowledge:news:item-1',
            kind: 'knowledge',
            stage: 'observed',
            strength: 'weak',
            summary: '오늘 게시된 관련 뉴스',
            observed_at: '2026-08-23T00:00:00.000Z',
            expires_at: '2026-08-24T00:00:00.000Z',
            source_ref: {
                kind: 'knowledge',
                id: 'news-item-1',
                publisher: 'Example News',
                provider_id: 'news-main',
                transport: 'builtin_api',
                url: 'https://example.com/news/1',
                timestamp: '2026-08-23T00:00:00.000Z'
            },
            features: { freshness_hours: 2 }
        }],
        handoff: {
            type: 'capability',
            label: '글감 만들기',
            capability_id: 'content.idea.suggest',
            params: { query: 'AI 글쓰기 정책' },
            intent: '뉴스를 바탕으로 글감을 만듭니다.'
        },
        dedupe_key: 'news-content:ai-writing:2026-08-23',
        created_at: '2026-08-23T01:00:00.000Z',
        expires_at: '2026-08-24T01:00:00.000Z',
        metadata: { locale: 'ko-KR' },
        ...overrides
    };
}

function createRecommendation(overrides = {}) {
    return {
        recommendation_id: 'recommendation:news:ai-writing:2026-08-23',
        owner_user_id: 'owner-local',
        candidate: createCandidate(),
        policy: {
            policy_id: 'proactive-guidance-ranking-v1',
            policy_version: 1,
            eligible: true,
            suppression_reasons: [],
            score: 0.82,
            rank: 1,
            breakdown: { freshness: 0.4, owner_relevance: 0.42 },
            decided_at: '2026-08-23T01:01:00.000Z'
        },
        status: 'available',
        available_at: '2026-08-23T01:02:00.000Z',
        snoozed_until: null,
        expires_at: '2026-08-24T01:00:00.000Z',
        last_event_at: '2026-08-23T01:02:00.000Z',
        ...overrides
    };
}

module.exports = {
    createCandidate,
    createRecommendation
};
