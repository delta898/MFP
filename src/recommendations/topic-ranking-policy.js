const { normalizeKey } = require('./topic-candidate-generator');

const TOPIC_RANKING_POLICY = Object.freeze({
    id: 'topic-ranking-v1',
    version: 1,
    weights: Object.freeze({
        explicit_request: 100,
        owner_keyword_per_evidence: 4,
        owner_keyword_cap: 24,
        owner_category_per_evidence: 3,
        owner_category_cap: 12,
        trend_fresh_1d: 15,
        trend_fresh_3d: 10,
        trend_fresh_7d: 5,
        trend_new: 8,
        trend_up_cap: 12,
        trend_down: -3,
        helpful_feedback: 12,
        not_helpful_feedback: -18
    }),
    diversity: Object.freeze({
        max_per_group: 2,
        similarity_threshold: 0.75
    })
});

function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function daysSince(value, now = new Date()) {
    const timestamp = Date.parse(String(value || ''));
    const nowTime = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
    if (!Number.isFinite(timestamp) || !Number.isFinite(nowTime)) return null;
    return Math.max(0, Math.floor((nowTime - timestamp) / 86400000));
}

function tokenSet(value) {
    return new Set(String(value || '')
        .toLocaleLowerCase('ko-KR')
        .split(/[^\p{L}\p{N}]+/u)
        .map((item) => item.trim())
        .filter(Boolean));
}

function similarity(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return intersection / (a.size + b.size - intersection);
}

function feedbackForCandidate(candidate = {}, profile = {}) {
    const key = normalizeKey(candidate.topic_seed);
    const candidateId = String(candidate.id || '').trim();
    const recent = Array.isArray(profile?.feedback?.recent) ? profile.feedback.recent : [];
    return recent.filter((item) => {
        const feedbackCandidateId = String(item?.recommendation?.candidate_id || '').trim();
        if (candidateId && feedbackCandidateId && candidateId === feedbackCandidateId) return true;
        const subjectKey = normalizeKey(item?.subject);
        return key && subjectKey && (key.includes(subjectKey) || subjectKey.includes(key));
    });
}

function scoreCandidate(candidate = {}, input = {}) {
    const policy = input.policy || TOPIC_RANKING_POLICY;
    const weights = policy.weights || TOPIC_RANKING_POLICY.weights;
    const profile = input.ownerProfile || {};
    const now = input.now || new Date();
    const features = candidate.evidence_features || {};
    const breakdown = [];

    function add(code, points, evidence = null) {
        if (!Number.isFinite(points) || points === 0) return;
        breakdown.push({ code, points, evidence });
    }

    if (features.explicit_request === true || candidate.candidate_type === 'request_seed') {
        add('explicit_request', finite(weights.explicit_request), { kind: 'request' });
    }

    const keywordEvidence = Math.max(0, finite(features.owner_keyword_evidence));
    add(
        'owner_keyword_frequency',
        Math.min(finite(weights.owner_keyword_cap), keywordEvidence * finite(weights.owner_keyword_per_evidence)),
        { evidence_count: keywordEvidence }
    );
    const categoryEvidence = Math.max(0, finite(features.owner_category_evidence));
    add(
        'owner_category_frequency',
        Math.min(finite(weights.owner_category_cap), categoryEvidence * finite(weights.owner_category_per_evidence)),
        { evidence_count: categoryEvidence }
    );

    if (candidate.trend) {
        const age = daysSince(candidate.trend.trend_date, now);
        const freshness = age === null
            ? 0
            : age <= 1
                ? finite(weights.trend_fresh_1d)
                : age <= 3
                    ? finite(weights.trend_fresh_3d)
                    : age <= 7
                        ? finite(weights.trend_fresh_7d)
                        : 0;
        add('trend_freshness', freshness, { age_days: age, trend_date: candidate.trend.trend_date });
        if (candidate.trend.change_type === 'new') {
            add('trend_new', finite(weights.trend_new), { change_type: 'new' });
        } else if (candidate.trend.change_type === 'up') {
            add('trend_momentum', Math.min(finite(weights.trend_up_cap), Math.max(0, finite(candidate.trend.change_amount))), {
                change_type: 'up',
                change_amount: candidate.trend.change_amount
            });
        } else if (candidate.trend.change_type === 'down') {
            add('trend_down', finite(weights.trend_down), { change_type: 'down' });
        }
    }

    for (const feedback of feedbackForCandidate(candidate, profile)) {
        const polarity = String(feedback?.feedback || '').trim().toLowerCase();
        if (['helpful', 'accepted'].includes(polarity)) {
            add('positive_feedback', finite(weights.helpful_feedback), feedback.evidence || null);
        }
        if (['not_helpful', 'rejected'].includes(polarity)) {
            add('negative_feedback', finite(weights.not_helpful_feedback), feedback.evidence || null);
        }
    }

    return {
        score: breakdown.reduce((sum, item) => sum + item.points, 0),
        breakdown
    };
}

function diversityGroup(candidate = {}) {
    const category = candidate?.trend?.categories?.[0]
        || candidate?.owner_matches?.categories?.[0]?.normalized_value
        || candidate?.owner_matches?.categories?.[0]?.value;
    if (normalizeKey(category)) return `category:${normalizeKey(category)}`;
    const firstToken = [...tokenSet(candidate.topic_seed)][0];
    return `seed:${normalizeKey(firstToken || candidate.topic_seed) || String(candidate.candidate_type || 'unknown')}`;
}

function rankTopicCandidates(input = {}) {
    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    const policy = input.policy || TOPIC_RANKING_POLICY;
    const limit = Math.max(1, Math.min(20, Number(input.limit || 5)));
    const scored = candidates.map((candidate, index) => {
        const ranking = scoreCandidate(candidate, {
            policy,
            ownerProfile: input.ownerProfile,
            now: input.now
        });
        return {
            ...candidate,
            ranking: {
                policy_id: policy.id,
                policy_version: policy.version,
                score: ranking.score,
                breakdown: ranking.breakdown,
                original_index: index,
                diversity_group: diversityGroup(candidate)
            }
        };
    }).sort((left, right) => right.ranking.score - left.ranking.score || left.ranking.original_index - right.ranking.original_index);

    const preferredCandidateTypes = Array.isArray(input.preferredCandidateTypes)
        ? input.preferredCandidateTypes.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
    const selected = [];
    const deferred = [];
    const groupCounts = new Map();
    const maxPerGroup = Math.max(1, finite(policy?.diversity?.max_per_group, 2));
    const threshold = Math.max(0, Math.min(1, finite(policy?.diversity?.similarity_threshold, 0.75)));
    const random = typeof input.random === 'function' ? input.random : Math.random;
    const highScoreRatio = Math.max(0, Math.min(1, finite(input.highScoreRatio, 0.8)));

    function trySelect(candidate) {
        if (selected.length >= limit) {
            deferred.push({ ...candidate, ranking: { ...candidate.ranking, deferred_reason: 'limit' } });
            return;
        }
        const isExplicit = candidate.candidate_type === 'request_seed';
        const group = candidate.ranking.diversity_group;
        const groupFull = (groupCounts.get(group) || 0) >= maxPerGroup;
        const similar = selected.find((item) => similarity(item.topic_seed, candidate.topic_seed) >= threshold);
        if (!isExplicit && (groupFull || similar)) {
            deferred.push({
                ...candidate,
                ranking: {
                    ...candidate.ranking,
                    deferred_reason: groupFull ? 'group_limit' : 'similar_candidate',
                    similar_to: similar?.id || null
                }
            });
            return;
        }
        selected.push({ ...candidate, ranking: { ...candidate.ranking, rank: selected.length + 1 } });
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }

    function chooseHighScoreCandidate(items) {
        if (items.length === 0) return null;
        const highestScore = items[0].ranking.score;
        const minimumScore = highestScore > 0 ? highestScore * highScoreRatio : highestScore;
        const eligible = items.filter((item) => item.ranking.score >= minimumScore);
        const index = Math.min(eligible.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * eligible.length));
        return {
            candidate: eligible[index] || eligible[0],
            eligibleCount: eligible.length,
            minimumScore
        };
    }

    const preferred = [];
    for (const candidateType of preferredCandidateTypes) {
        const candidatesForType = scored.filter((item) => item.candidate_type === candidateType
            && !selected.some((selectedItem) => selectedItem.id === item.id));
        const choice = chooseHighScoreCandidate(candidatesForType);
        if (choice?.candidate) {
            preferred.push({
                ...choice.candidate,
                ranking: {
                    ...choice.candidate.ranking,
                    selection_reason: 'random_high_score_band',
                    high_score_band_count: choice.eligibleCount,
                    high_score_minimum: choice.minimumScore
                }
            });
        }
    }
    const preferredIds = new Set(preferred.map((candidate) => candidate.id));
    preferred.forEach(trySelect);
    scored.filter((candidate) => !preferredIds.has(candidate.id)).forEach(trySelect);

    return {
            policy: { id: policy.id, version: policy.version },
        selected,
        deferred,
        input_count: candidates.length,
        selected_count: selected.length,
        deferred_count: deferred.length
    };
}

module.exports = {
    TOPIC_RANKING_POLICY,
    daysSince,
    rankTopicCandidates,
    scoreCandidate,
    similarity
};
