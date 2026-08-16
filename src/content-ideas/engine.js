const { createTopicCandidateGenerator } = require('../recommendations/topic-candidate-generator');
const { rankTopicCandidates } = require('../recommendations/topic-ranking-policy');
const {
    createRecommendationRunId,
    buildRecommendationContext
} = require('../recommendations/topic-recommendation-learning');
const Logger = require('../logger');

function compactLog(value, maxLength = 180) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function formatCandidate(candidate = {}) {
    const breakdown = Array.isArray(candidate?.ranking?.breakdown)
        ? candidate.ranking.breakdown.map((item) => `${item.code}:${item.points}`).join(',')
        : '없음';
    const refs = Array.isArray(candidate?.source_refs)
        ? candidate.source_refs.map((ref) => `${ref.kind || 'unknown'}:${ref.provider_id || ref.id || ref.source || '-'}`).join(',')
        : '없음';
    const selection = candidate?.ranking?.selection_reason
        ? `, selection=${candidate.ranking.selection_reason}, eligible=${candidate.ranking.high_score_band_count}, min_score=${candidate.ranking.high_score_minimum}`
        : '';
    return `${compactLog(candidate.topic_seed)} [type=${candidate.candidate_type}, score=${candidate?.ranking?.score ?? '-'}, refs=${refs}, evidence=${breakdown}${selection}, reason=${compactLog(candidate.explanation)}]`;
}

function collectRecentRecommendationCandidateIds(input = {}, artifacts = []) {
    const explicit = Array.isArray(input.excludedCandidateIds) ? input.excludedCandidateIds : [];
    const recent = (Array.isArray(artifacts) ? artifacts : [])
        .filter((artifact) => String(artifact?.artifact_type || '').trim().toLowerCase() === 'content_idea')
        .slice(0, 9)
        .map((artifact) => artifact?.payload?.recommendation?.candidate_id);
    return [...new Set([...explicit, ...recent].map((value) => String(value || '').trim()).filter(Boolean))];
}

function createContentIdeaEngine(options = {}) {
    const providers = Array.isArray(options.providers) ? options.providers.filter(Boolean) : [];
    const knowledgeRegistry = options.knowledgeRegistry || null;
    const candidateGenerator = options.candidateGenerator || createTopicCandidateGenerator();
    const candidateRanker = options.candidateRanker || rankTopicCandidates;

    return {
        async generateIdeas(input = {}, context = {}) {
            const ideas = [];
            const recommendationRunId = createRecommendationRunId();
            const requestedLimit = Math.max(1, Math.min(5, Number(input.limit || 3)));
            const knowledge = knowledgeRegistry && typeof knowledgeRegistry.fetchForRoute === 'function'
                ? await knowledgeRegistry.fetchForRoute('content_ideas', {
                    query: input.query || '',
                    topic: input.query || '',
                    limit: input.limit || 5,
                    purpose: 'content_ideas'
                }, context).catch(() => [])
                : [];
            const ownerMemory = context?.memory?.owner_memory && typeof context.memory.owner_memory === 'object'
                ? context.memory.owner_memory
                : {};
            const excludedCandidateIds = collectRecentRecommendationCandidateIds(input, ownerMemory.recent_artifacts);
            const candidateSet = candidateGenerator.generate({
                query: input.query || '',
                ownerProfile: ownerMemory.profile || {},
                recentArtifacts: ownerMemory.recent_artifacts || [],
                excludedCandidateIds,
                knowledge,
                // Keep enough candidates for every source pool before ranking.
                limit: Math.max(30, requestedLimit * 4)
            });
            Logger.debug(`🧭 [Content Ideas] 추천 후보 pool 구성 시작 (run=${recommendationRunId}, query=${compactLog(input.query || '새로운 글감 추천', 120)})`);
            Logger.debug(`🧭 [Content Ideas] 후보 pool=${candidateSet.candidates.length}건, 외부 지식=${knowledge.length}건, source_counts=${JSON.stringify(candidateSet.source_counts || {})}, 최근 글 제외=${Number(candidateSet.excluded_recent_count || 0)}건, 이전 추천 후보 제외=${Number(candidateSet.excluded_previous_count || 0)}건`);
            if (candidateSet.focus) {
                Logger.debug(`🧭 [Content Ideas] 글감 힌트 연결 (run=${recommendationRunId}, hint=${compactLog(candidateSet.focus.query, 120)}, graph_profile_matches=${candidateSet.focus.matched_profile_keyword_count}, graph_activity_matches=${candidateSet.focus.matched_activity_count}, profile_fallback=${candidateSet.focus.profile_fallback_used}, activity_fallback=${candidateSet.focus.activity_fallback_used})`);
            }
            Logger.debug(`🧭 [Content Ideas] 후보 pool 상세 (run=${recommendationRunId}): ${candidateSet.candidates.map(formatCandidate).join(' || ') || '없음'}`);
            const ranking = candidateRanker({
                candidates: candidateSet.candidates,
                ownerProfile: ownerMemory.profile || {},
                limit: requestedLimit,
                preferredCandidateTypes: input.query
                    ? ['request_seed', 'trend_seed', 'profile_seed', 'activity_seed']
                    : ['trend_seed', 'profile_seed', 'activity_seed']
            });
            Logger.debug(`🎯 [Content Ideas] 최종 선별 (run=${recommendationRunId}, policy=${ranking.policy?.id || 'unknown'}, pool=${ranking.input_count}건 -> selected=${ranking.selected_count}건, deferred=${ranking.deferred_count}건)`);
            Logger.debug(`🎯 [Content Ideas] 선별 결과 (run=${recommendationRunId}): ${ranking.selected.map((candidate) => `#${candidate.ranking?.rank || '-'} ${formatCandidate(candidate)}`).join(' || ') || '없음'}`);
            if (ranking.deferred.length > 0) {
                Logger.debug(`⏸️ [Content Ideas] 보류 후보 (run=${recommendationRunId}): ${ranking.deferred.map((candidate) => `${compactLog(candidate.topic_seed)} [${candidate.ranking?.deferred_reason || 'unknown'}]`).join(' || ')}`);
            }
            const rankedCandidates = new Map(ranking.selected.map((candidate) => [String(candidate.id || '').trim(), candidate]));

            for (const provider of providers) {
                if (!provider || typeof provider.generate !== 'function') continue;
                Logger.debug(`🤖 [Content Ideas] provider=${provider.id || 'unknown'} 에 최종 후보 ${ranking.selected.length}건 전달 (run=${recommendationRunId})`);
                const result = await provider.generate(input, {
                    ...context,
                    knowledge,
                    recommendationCandidates: ranking.selected
                });
                if (Array.isArray(result?.ideas)) {
                    ideas.push(...result.ideas);
                    Logger.debug(`🤖 [Content Ideas] provider=${provider.id || 'unknown'} 결과 ${result.ideas.length}건 수신 (run=${recommendationRunId}): ${result.ideas.map((idea) => `${compactLog(idea?.title)} [candidate_id=${idea?.candidate_id || '미연결'}, source=${idea?.source || 'unknown'}]`).join(' || ') || '없음'}`);
                }
            }

            const deduped = [];
            const seen = new Set();
            ideas.forEach((item) => {
                const title = String(item?.title || '').trim();
                if (!title) return;
                const key = title.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                deduped.push({
                    id: String(item.id || `idea_${Date.now()}_${deduped.length + 1}`),
                    title,
                    summary: String(item.summary || '').trim(),
                    reason: String(item.reason || '').trim(),
                    keywords: Array.isArray(item.keywords) ? item.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean) : [],
                    source: String(item.source || 'memory_ai').trim(),
                    candidate_id: String(item.candidate_id || '').trim()
                });
            });

            const enrichedIdeas = deduped.map((idea) => {
                const candidate = rankedCandidates.get(idea.candidate_id);
                return {
                    ...idea,
                    recommendation: buildRecommendationContext({
                        run_id: recommendationRunId,
                        candidate,
                        policy: ranking.policy
                    })
                };
            });

            Logger.info(`✅ [Content Ideas] 추천 완료 (run=${recommendationRunId}, 최종=${enrichedIdeas.length}건): ${enrichedIdeas.map((idea) => `${compactLog(idea.title)} -> ${idea.candidate_id || '후보 미연결'}`).join(' || ') || '없음'}`);

            return {
                ideas: enrichedIdeas.slice(0, requestedLimit),
                knowledge,
                candidates: ranking.selected,
                recommendation_run: {
                    schema_version: 1,
                    id: recommendationRunId,
                    policy: ranking.policy
                },
                ranking: {
                    policy: ranking.policy,
                    input_count: ranking.input_count,
                    selected_count: ranking.selected_count,
                    deferred_count: ranking.deferred_count
                }
            };
        }
    };
}

module.exports = {
    createContentIdeaEngine
};
