const crypto = require('crypto');

const TOPIC_CANDIDATE_SCHEMA_VERSION = 1;

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeKey(value) {
    return compact(value, 300).toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

function stableCandidateId(type, key) {
    return `topic_candidate_${crypto.createHash('sha256').update(`${TOPIC_CANDIDATE_SCHEMA_VERSION}:${type}:${key}`).digest('hex')}`;
}

function listProfileFacets(profile = {}, kind = '') {
    const values = profile?.interests?.[kind];
    return (Array.isArray(values) ? values : [])
        .map((item) => ({
            value: compact(item?.value || item?.normalized_value, 120),
            normalized_value: compact(item?.normalized_value || item?.value, 120).toLocaleLowerCase('ko-KR'),
            evidence_count: Number(item?.evidence_count || 0),
            last_used_at: item?.last_used_at || null,
            evidence: item?.evidence || null,
            contexts: Array.isArray(item?.contexts) ? item.contexts.slice(0, 3) : []
        }))
        .filter((item) => {
            if (!item.value) return false;
            const contextSources = item.contexts
                .map((context) => compact(context?.source, 80).toLowerCase())
                .filter(Boolean);
            // Automatically observed trends remain external knowledge. They become an
            // owner interest only after a separate user save/select/draft/publish fact.
            return contextSources.length === 0 || contextSources.some((source) => source !== 'auto-trends');
        });
}

function profileFacetContext(facet = {}) {
    const context = Array.isArray(facet.contexts) ? facet.contexts[0] : null;
    if (!context) return { summary: '', source: '', subject: '' };
    const subject = compact(context.subject || context.title, 180);
    const category = compact(context.category, 100);
    const instruction = compact(context.instruction, 240);
    return {
        summary: [subject, category, instruction].filter(Boolean).join(' | '),
        source: compact(context.source, 80),
        subject
    };
}

function profileFacetExplanation(facet = {}) {
    const context = profileFacetContext(facet);
    if (context.source === 'naver_trend' || context.source === 'auto-trends') {
        return '이전에 저장한 네이버 트렌드 글감과 연결됩니다.';
    }
    if (context.source === 'topic_recommendation') {
        return '이전에 선택하거나 저장한 추천 글감과 연결됩니다.';
    }
    if (context.subject) return '직접 저장한 글감의 주제 문맥과 연결됩니다.';
    return '저장한 관심 주제와 연결됩니다.';
}

function collectRecentKeys(artifacts = []) {
    const keys = new Set();
    for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
        [artifact?.title, artifact?.payload?.subject, artifact?.payload?.name]
            .map(normalizeKey)
            .filter(Boolean)
            .forEach((key) => keys.add(key));
    }
    return keys;
}

function flattenTrendKnowledge(knowledge = []) {
    return (Array.isArray(knowledge) ? knowledge : [])
        .filter((entry) => compact(entry?.kind, 40) === 'trends')
        .flatMap((entry) => (Array.isArray(entry?.items) ? entry.items : []).map((item) => ({
            provider_id: compact(entry?.provider_id, 120),
            transport: compact(entry?.transport, 80),
            item
        })));
}

function readTrendItem(item = {}) {
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const observedAt = item.observed_at || item.timestamp || null;
    return {
        title: compact(item.keyword || item.title || metadata.keyword || metadata.query, 180),
        categories: Array.isArray(item.categories)
            ? item.categories
            : (Array.isArray(metadata.categories) ? metadata.categories : []),
        trend_date: compact(metadata.trend_date || observedAt, 80) || null,
        change_type: compact(item.change_type || metadata.change_type, 40),
        change_amount: item.change_amount ?? metadata.change_amount ?? null,
        display_order: item.display_order ?? metadata.display_order ?? null,
        source: compact(item.source || metadata.source, 80),
        timestamp: observedAt
    };
}

function matchesFacet(textValue, facets = []) {
    const key = normalizeKey(textValue);
    if (!key) return [];
    return facets.filter((facet) => {
        const facetKey = normalizeKey(facet.normalized_value || facet.value);
        return facetKey && (key.includes(facetKey) || facetKey.includes(key));
    });
}

function focusTerms(value) {
    const normalized = normalizeKey(value);
    const terms = String(value || '')
        .toLocaleLowerCase('ko-KR')
        .split(/[^\p{L}\p{N}]+/u)
        .map((item) => normalizeKey(item))
        .filter((item) => item.length >= 2);
    return [...new Set([normalized, ...terms].filter(Boolean))];
}

function focusMatch(value, query) {
    const valueKey = normalizeKey(value);
    const terms = focusTerms(query);
    if (!valueKey || terms.length === 0) return { matched: false, terms: [] };
    const matchedTerms = terms.filter((term) => valueKey.includes(term) || term.includes(valueKey));
    return { matched: matchedTerms.length > 0, terms: matchedTerms };
}

function activityText(item = {}) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
    const keywordText = Array.isArray(payload.keywords) ? payload.keywords.join(' ') : payload.keywords;
    return [item?.subject, item?.title, item?.summary, payload.subject, payload.name, keywordText]
        .map((value) => compact(value, 240))
        .filter(Boolean)
        .join(' ');
}

function buildCandidate(input = {}) {
    const type = compact(input.candidate_type, 60);
    const topicSeed = compact(input.topic_seed, 180);
    const key = normalizeKey(topicSeed);
    if (!type || !key) return null;
    return {
        schema_version: TOPIC_CANDIDATE_SCHEMA_VERSION,
        id: stableCandidateId(type, key),
        candidate_type: type,
        topic_seed: topicSeed,
        source_refs: Array.isArray(input.source_refs) ? input.source_refs : [],
        owner_matches: input.owner_matches && typeof input.owner_matches === 'object'
            ? input.owner_matches
            : { keywords: [], categories: [] },
        trend: input.trend && typeof input.trend === 'object' ? input.trend : null,
        evidence_features: input.evidence_features && typeof input.evidence_features === 'object'
            ? input.evidence_features
            : {},
        semantic_context: compact(input.semantic_context, 500),
        explanation: compact(input.explanation, 300)
    };
}

function createTopicCandidateGenerator() {
    return {
        generate(input = {}) {
            const query = compact(input.query, 180);
            const profile = input.ownerProfile && typeof input.ownerProfile === 'object' ? input.ownerProfile : {};
            const keywords = listProfileFacets(profile, 'keywords');
            const categories = listProfileFacets(profile, 'categories');
            const recentSubjects = Array.isArray(profile?.activity?.recent_subjects)
                ? profile.activity.recent_subjects
                : [];
            const recentKeys = collectRecentKeys(input.recentArtifacts);
            const excludedCandidateIds = new Set(
                (Array.isArray(input.excludedCandidateIds) ? input.excludedCandidateIds : [])
                    .map((value) => compact(value, 240))
                    .filter(Boolean)
            );
            const limit = Math.max(1, Math.min(50, Number(input.limit || 20)));
            const recentArtifacts = Array.isArray(input.recentArtifacts) ? input.recentArtifacts : [];
            const focusedKeywords = query
                ? keywords.filter((facet) => focusMatch(`${facet.value} ${facet.normalized_value}`, query).matched)
                : [];
            const candidates = [];
            const seen = new Set();
            let excludedRecentCount = 0;
            let excludedPreviousCount = 0;

            function append(candidate, options = {}) {
                if (!candidate) return;
                const key = normalizeKey(candidate.topic_seed);
                if (!key) return;
                if (excludedCandidateIds.has(candidate.id) || excludedCandidateIds.has(compact(options.relatedCandidateId, 240))) {
                    excludedPreviousCount += 1;
                    return;
                }
                if (recentKeys.has(key) && options.allowRecent !== true) {
                    excludedRecentCount += 1;
                    return;
                }
                if (seen.has(key)) return;
                seen.add(key);
                candidates.push(candidate);
            }

            if (query) {
                append(buildCandidate({
                    candidate_type: 'request_seed',
                    topic_seed: query,
                    source_refs: [{ kind: 'request', id: 'current_request' }],
                    owner_matches: { keywords: focusedKeywords, categories: [] },
                    evidence_features: {
                        explicit_request: true,
                        owner_keyword_evidence: focusedKeywords.reduce((sum, facet) => sum + facet.evidence_count, 0)
                    },
                    explanation: focusedKeywords.length > 0
                        ? '현재 요청한 주제이며 저장된 관심 글감 신호와 연결됩니다.'
                        : '현재 사용자가 직접 요청한 주제입니다.'
                }), { allowRecent: true });
            }

            for (const entry of flattenTrendKnowledge(input.knowledge)) {
                const item = entry.item || {};
                const trendItem = readTrendItem(item);
                const title = trendItem.title;
                if (!title) continue;
                const categoryText = trendItem.categories.join(' ');
                const keywordMatches = matchesFacet(title, keywords);
                const categoryMatches = matchesFacet(categoryText, categories);
                append(buildCandidate({
                    candidate_type: 'trend_seed',
                    topic_seed: title,
                    source_refs: [{
                        kind: 'knowledge',
                        provider_id: entry.provider_id,
                        transport: entry.transport,
                        source: trendItem.source,
                        timestamp: trendItem.timestamp
                    }],
                    owner_matches: {
                        keywords: keywordMatches,
                        categories: categoryMatches
                    },
                    trend: {
                        categories: trendItem.categories,
                        trend_date: trendItem.trend_date,
                        change_type: trendItem.change_type,
                        change_amount: trendItem.change_amount,
                        display_order: trendItem.display_order
                    },
                    evidence_features: {
                        owner_keyword_evidence: keywordMatches.reduce((sum, match) => sum + match.evidence_count, 0),
                        owner_category_evidence: categoryMatches.reduce((sum, match) => sum + match.evidence_count, 0),
                        external_observation: true
                    },
                    explanation: keywordMatches.length + categoryMatches.length > 0
                        ? '최근 트렌드이며 기존 관심 근거와 연결됩니다.'
                        : '최근 외부 트렌드에서 발견된 주제입니다.'
                }));
            }

            const profileKeywordPool = query && focusedKeywords.length > 0 ? focusedKeywords : keywords;
            for (const facet of profileKeywordPool) {
                const isFocused = query && focusedKeywords.includes(facet);
                const context = profileFacetContext(facet);
                append(buildCandidate({
                    candidate_type: 'profile_seed',
                    topic_seed: facet.value,
                    source_refs: [facet.evidence ? {
                        ...facet.evidence,
                        source: context.source,
                        subject: context.subject
                    } : null].filter(Boolean),
                    owner_matches: { keywords: [facet], categories: [] },
                    evidence_features: {
                        owner_keyword_evidence: facet.evidence_count,
                        last_used_at: facet.last_used_at
                    },
                    semantic_context: context.summary,
                    explanation: isFocused
                        ? `입력한 힌트와 ${profileFacetExplanation(facet)}`
                        : profileFacetExplanation(facet)
                }));
            }

            const activityCandidates = [
                ...recentArtifacts
                    .filter((artifact) => compact(artifact?.artifact_type, 80).toLowerCase() !== 'content_idea')
                    .map((artifact) => ({
                    subject: artifact?.title || artifact?.payload?.subject,
                    id: artifact?.id,
                    domain: artifact?.artifact_type || 'blog',
                    stage: 'recent_artifact',
                    timestamp: artifact?.timestamp,
                    relatedCandidateId: artifact?.payload?.recommendation?.candidate_id
                })),
                ...recentSubjects.filter((recent) => ['saved', 'selected', 'drafted', 'published']
                    .includes(compact(recent?.stage, 80).toLowerCase()))
            ];
            const focusedActivities = query
                ? activityCandidates.filter((recent) => focusMatch(activityText(recent), query).matched)
                : [];
            const activityPool = query && focusedActivities.length > 0 ? focusedActivities : activityCandidates;
            for (const recent of activityPool.slice(0, 12)) {
                const subject = compact(recent?.subject, 180);
                if (!subject) continue;
                const isFocused = query && focusedActivities.includes(recent);
                append(buildCandidate({
                    candidate_type: 'activity_seed',
                    topic_seed: subject,
                    source_refs: [{
                        kind: 'activity',
                        id: compact(recent?.id, 240),
                        domain: compact(recent?.domain, 80),
                        stage: compact(recent?.stage, 80),
                        timestamp: recent?.timestamp || null
                    }],
                    evidence_features: {
                        recent_activity: true
                    },
                    explanation: isFocused
                        ? '입력한 힌트와 연결된 최근 글쓰기·활동 이력입니다.'
                        : compact(recent?.stage, 80) === 'published'
                            ? '최근 발행한 글의 주제와 연결됩니다.'
                            : compact(recent?.stage, 80) === 'drafted'
                                ? '최근 작성한 초안의 주제와 연결됩니다.'
                                : '최근 선택하거나 저장한 글감과 연결됩니다.'
                }), {
                    allowRecent: true,
                    relatedCandidateId: recent?.relatedCandidateId || recent?.recommendation_candidate_id
                });
            }

            const limitedCandidates = candidates.slice(0, limit);

            return {
                schema_version: TOPIC_CANDIDATE_SCHEMA_VERSION,
                owner_user_id: compact(profile.owner_user_id, 240),
                candidates: limitedCandidates,
                excluded_recent_count: excludedRecentCount,
                excluded_previous_count: excludedPreviousCount,
                focus: query ? {
                    query,
                    matched_profile_keyword_count: focusedKeywords.length,
                    matched_activity_count: focusedActivities.length,
                    profile_fallback_used: focusedKeywords.length === 0,
                    activity_fallback_used: focusedActivities.length === 0
                } : null,
                source_counts: limitedCandidates.reduce((counts, item) => {
                    counts[item.candidate_type] = (counts[item.candidate_type] || 0) + 1;
                    return counts;
                }, {})
            };
        }
    };
}

module.exports = {
    TOPIC_CANDIDATE_SCHEMA_VERSION,
    createTopicCandidateGenerator,
    flattenTrendKnowledge,
    focusMatch,
    normalizeKey,
    readTrendItem,
    stableCandidateId
};
