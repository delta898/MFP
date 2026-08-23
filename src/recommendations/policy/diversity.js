const { KIND_PRIORITY, compareScoredCandidates } = require('./scoring');

const DEFAULT_PER_RUN_LIMIT = 6;
const DEFAULT_PER_KIND_LIMIT = 2;
const DEFAULT_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const SIMILARITY_THRESHOLD = 0.75;
const SEMANTIC_KINDS = new Set(['content_opportunity', 'commerce_opportunity']);
const GENERIC_TOKENS = new Set([
    '관련', '바탕으로', '글감', '검토', '정리', '추천', '콘텐츠', '기회', '검색', '관심', '흐름'
]);

function compact(value, maxLength = 300) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function tokenSet(value) {
    return new Set(compact(value, 300)
        .toLocaleLowerCase('ko-KR')
        .split(/[^\p{L}\p{N}]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2 && !GENERIC_TOKENS.has(item)));
}

function similarity(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return intersection / (a.size + b.size - intersection);
}

function semanticLabel(candidate = {}) {
    if (!SEMANTIC_KINDS.has(candidate.kind)) return '';
    return compact(candidate?.metadata?.topic || candidate?.metadata?.product || candidate.title, 300);
}

function recentMaterializationCount(policyContext = {}, now, windowMs = DAY_MS) {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs) || policyContext?.history?.known !== true) return 0;
    return (Array.isArray(policyContext.history.items) ? policyContext.history.items : [])
        .filter((item) => {
            const availableAt = Date.parse(item.available_at);
            return Number.isFinite(availableAt) && availableAt <= nowMs && availableAt > nowMs - windowMs;
        }).length;
}

function selectDiverseCandidates(scoredInput = [], options = {}) {
    const sorted = [...(Array.isArray(scoredInput) ? scoredInput : [])].sort(compareScoredCandidates);
    const perRunLimit = Math.max(1, Math.min(20, Number(options.perRunLimit) || DEFAULT_PER_RUN_LIMIT));
    const perKindLimit = Math.max(1, Math.min(10, Number(options.perKindLimit) || DEFAULT_PER_KIND_LIMIT));
    const dailyLimit = Math.max(1, Math.min(100, Number(options.dailyLimit) || DEFAULT_DAILY_LIMIT));
    const recentCount = recentMaterializationCount(options.policyContext, options.now || new Date().toISOString());
    const dailyRemaining = Math.max(0, dailyLimit - recentCount);
    const capacity = Math.min(perRunLimit, dailyRemaining);
    const threshold = Math.max(0, Math.min(1, Number(options.similarityThreshold) || SIMILARITY_THRESHOLD));
    const selected = [];
    const deferred = [];
    const selectedIds = new Set();
    const kindCounts = new Map();

    function defer(entry, reason, similarTo = '') {
        deferred.push({ ...entry, deferred_reason: reason, similar_to: similarTo || null });
    }

    function trySelect(entry, phase) {
        if (selectedIds.has(entry.candidate.candidate_id)) return false;
        const kind = entry.candidate.kind;
        if ((kindCounts.get(kind) || 0) >= perKindLimit) {
            defer(entry, 'kind_limit');
            selectedIds.add(entry.candidate.candidate_id);
            return false;
        }
        const label = semanticLabel(entry.candidate);
        const similar = label ? selected.find((item) =>
            item.candidate.kind === kind
            && similarity(label, semanticLabel(item.candidate)) >= threshold
        ) : null;
        if (similar) {
            defer(entry, 'similar_candidate', similar.candidate.candidate_id);
            selectedIds.add(entry.candidate.candidate_id);
            return false;
        }
        if (selected.length >= capacity) {
            defer(entry, dailyRemaining <= selected.length ? 'daily_cap' : 'run_limit');
            selectedIds.add(entry.candidate.candidate_id);
            return false;
        }
        selected.push({ ...entry, selection_phase: phase });
        selectedIds.add(entry.candidate.candidate_id);
        kindCounts.set(kind, (kindCounts.get(kind) || 0) + 1);
        return true;
    }

    for (const kind of KIND_PRIORITY) {
        const first = sorted.find((entry) => entry.candidate.kind === kind && !selectedIds.has(entry.candidate.candidate_id));
        if (first) trySelect(first, 'kind_first');
    }
    for (const entry of sorted) if (!selectedIds.has(entry.candidate.candidate_id)) trySelect(entry, 'score_fill');

    selected.sort(compareScoredCandidates);
    selected.forEach((entry, index) => { entry.rank = index + 1; });
    deferred.sort(compareScoredCandidates);
    return {
        selected,
        deferred,
        stats: {
            input_count: sorted.length,
            selected_count: selected.length,
            deferred_count: deferred.length,
            per_run_limit: perRunLimit,
            per_kind_limit: perKindLimit,
            daily_limit: dailyLimit,
            recent_materialization_count: recentCount,
            daily_remaining_before_run: dailyRemaining
        }
    };
}

module.exports = {
    DAY_MS,
    DEFAULT_DAILY_LIMIT,
    DEFAULT_PER_KIND_LIMIT,
    DEFAULT_PER_RUN_LIMIT,
    GENERIC_TOKENS,
    SEMANTIC_KINDS,
    SIMILARITY_THRESHOLD,
    recentMaterializationCount,
    selectDiverseCandidates,
    semanticLabel,
    similarity,
    tokenSet
};
