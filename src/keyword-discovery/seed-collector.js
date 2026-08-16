const { flattenTrendKnowledge, normalizeKey } = require('../recommendations/topic-candidate-generator');

function compact(value, maxLength = 120) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function appendSeed(target, seen, input = {}) {
    const keyword = compact(input.keyword, 120);
    const key = normalizeKey(keyword);
    if (!keyword || !key || seen.has(key)) return false;
    seen.add(key);
    target.push({
        keyword,
        source: compact(input.source, 40),
        source_label: compact(input.source_label, 40),
        source_detail: compact(input.source_detail, 180)
    });
    return true;
}

function chooseCandidate(candidates, seen, excluded, random) {
    const usable = (Array.isArray(candidates) ? candidates : [])
        .filter((candidate) => {
            const key = normalizeKey(candidate?.keyword);
            return key && !seen.has(key);
        });
    const preferred = usable.filter((candidate) => !excluded.has(normalizeKey(candidate.keyword)));
    const pool = preferred.length > 0 ? preferred : usable;
    if (pool.length === 0) return null;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

function collectKeywordDiscoverySeeds(input = {}) {
    const seeds = [];
    const seen = new Set();
    const random = typeof input.random === 'function' ? input.random : Math.random;
    const excluded = new Set(
        (Array.isArray(input.excludedKeywords) ? input.excludedKeywords : [])
            .map(normalizeKey)
            .filter(Boolean)
    );
    const profile = input.ownerProfile && typeof input.ownerProfile === 'object' ? input.ownerProfile : {};

    const trend = flattenTrendKnowledge(input.knowledge)
        .map((entry) => ({
            keyword: entry?.item?.metadata?.keyword || entry?.item?.title,
            source: 'trend',
            source_label: '최근 트렌드',
            source_detail: entry?.item?.summary || entry?.provider_id
        }));
    const profileKeywords = (Array.isArray(profile?.interests?.keywords) ? profile.interests.keywords : [])
        .map((facet) => ({
            keyword: facet?.value || facet?.normalized_value,
            source: 'profile',
            source_label: '관심 주제',
            source_detail: '저장된 관심 키워드'
        }));
    const recentActivity = (Array.isArray(profile?.activity?.recent_subjects) ? profile.activity.recent_subjects : [])
        .filter((item) => ['saved', 'drafted', 'published'].includes(String(item?.stage || '').trim().toLowerCase()))
        .map((item) => ({
            keyword: item?.subject,
            source: 'activity',
            source_label: '최근 글쓰기',
            source_detail: '저장하거나 작성한 최근 글'
        }));

    const sourceQueues = [trend, profileKeywords, recentActivity];
    // Pick one from each available signal family first, then fill the remaining slots at random.
    sourceQueues.forEach((candidates) => {
        const candidate = chooseCandidate(candidates, seen, excluded, random);
        if (candidate) appendSeed(seeds, seen, candidate);
    });
    const allCandidates = sourceQueues.flat();
    while (seeds.length < 3) {
        const candidate = chooseCandidate(allCandidates, seen, excluded, random);
        if (!candidate || !appendSeed(seeds, seen, candidate)) break;
    }

    return seeds;
}

module.exports = {
    collectKeywordDiscoverySeeds
};
