function normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripMarkup(text) {
    return normalizeWhitespace(
        String(text || '')
            .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/https?:\/\/\S+/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/[`*_>#~|-]/g, ' ')
    );
}

function normalizeComparableText(text) {
    return stripMarkup(text).toLowerCase();
}

const RELATED_POST_STOPWORDS = new Set([
    'blog', 'post', 'posts', 'related', 'guide', 'tips', 'review',
    '관련', '블로그', '포스팅', '정리', '방법', '추천', '후기', '리뷰',
    '사용', '활용', '정보', '가이드', '비교', '요약', '최신', '소개',
    '대한', '위한', '에서', '으로', '그리고', '하지만', '또는', '정말',
    '하는', '있는', '했다', '합니다', '좋은', '같은', '바로'
]);

function tokenizeText(text, options = {}) {
    const minLength = Number.isInteger(options.minLength) ? options.minLength : 2;
    const maxTokens = Number.isInteger(options.maxTokens) ? options.maxTokens : 40;
    const source = normalizeComparableText(text);
    const matches = source.match(/[0-9a-zA-Z가-힣]{2,}/g) || [];
    const seen = new Set();
    const tokens = [];

    for (const raw of matches) {
        const token = String(raw || '').trim();
        if (!token || token.length < minLength) continue;
        if (RELATED_POST_STOPWORDS.has(token)) continue;
        if (seen.has(token)) continue;
        seen.add(token);
        tokens.push(token);
        if (tokens.length >= maxTokens) break;
    }

    return tokens;
}

function normalizeKeywordInput(keywords) {
    if (Array.isArray(keywords)) return keywords;
    return String(keywords || '')
        .split(/[,\n;/|]+/)
        .map((value) => String(value || '').trim())
        .filter(Boolean);
}

function buildRelatedPostContext(input = {}) {
    const title = normalizeWhitespace(input.title || input.subject || '');
    const content = normalizeWhitespace(input.content || input.body || '');
    const keywordItems = normalizeKeywordInput(input.keywords);

    const keywordPhrases = keywordItems
        .map((value) => normalizeComparableText(value))
        .filter((value) => value.length >= 2)
        .slice(0, 8);

    const titleTokens = tokenizeText(title, { maxTokens: 12 });
    const keywordTokens = keywordItems.flatMap((value) => tokenizeText(value, { maxTokens: 6 }));
    const contentTokens = tokenizeText(content.slice(0, 1800), { maxTokens: 28 });
    const titleComparable = normalizeComparableText(title);

    return {
        title,
        titleComparable,
        keywordPhrases,
        titleTokens,
        keywordTokens,
        contentTokens
    };
}

function countOverlap(sourceSet, tokens) {
    let count = 0;
    for (const token of tokens) {
        if (sourceSet.has(token)) count += 1;
    }
    return count;
}

function scoreRelatedPostCandidate(candidate = {}, context = {}) {
    const candidateTitle = normalizeWhitespace(candidate.title || '');
    const candidateExcerpt = normalizeWhitespace(candidate.description || candidate.summary || candidate.excerpt || '');
    const titleComparable = normalizeComparableText(candidateTitle);
    const excerptComparable = normalizeComparableText(candidateExcerpt);

    if (!candidateTitle) return 0;
    if (context.titleComparable && titleComparable && context.titleComparable === titleComparable) return 0;

    const titleTokenSet = new Set(tokenizeText(candidateTitle, { maxTokens: 16 }));
    const excerptTokenSet = new Set(tokenizeText(candidateExcerpt, { maxTokens: 30 }));
    const keywordTokens = Array.isArray(context.keywordTokens) ? context.keywordTokens : [];
    const titleTokens = Array.isArray(context.titleTokens) ? context.titleTokens : [];
    const contentTokens = Array.isArray(context.contentTokens) ? context.contentTokens : [];
    const keywordPhrases = Array.isArray(context.keywordPhrases) ? context.keywordPhrases : [];

    let score = 0;

    for (const phrase of keywordPhrases) {
        if (phrase.length < 2) continue;
        if (titleComparable.includes(phrase)) score += 14;
        else if (excerptComparable.includes(phrase)) score += 6;
    }

    score += countOverlap(titleTokenSet, keywordTokens) * 8;
    score += countOverlap(titleTokenSet, titleTokens) * 5;
    score += countOverlap(titleTokenSet, contentTokens) * 2;
    score += countOverlap(excerptTokenSet, keywordTokens) * 4;
    score += countOverlap(excerptTokenSet, titleTokens) * 2;
    score += countOverlap(excerptTokenSet, contentTokens) * 1;

    return score;
}

function defaultShuffle(items) {
    const copy = Array.isArray(items) ? items.slice() : [];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function selectRelatedPosts(candidates = [], context = {}, count = 3, options = {}) {
    const targetCount = Math.max(1, Math.min(10, parseInt(count, 10) || 3));
    const shuffle = typeof options.shuffle === 'function' ? options.shuffle : defaultShuffle;

    const unique = [];
    const seenUrls = new Set();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const url = normalizeWhitespace(candidate?.url || candidate?.link || '');
        const title = normalizeWhitespace(candidate?.title || '');
        if (!url || !title || seenUrls.has(url)) continue;
        if (context.titleComparable && normalizeComparableText(title) === context.titleComparable) continue;
        seenUrls.add(url);
        unique.push({
            ...candidate,
            title,
            url
        });
    }

    const scored = unique
        .map((candidate) => ({
            ...candidate,
            _relatedScore: scoreRelatedPostCandidate(candidate, context)
        }))
        .sort((a, b) => b._relatedScore - a._relatedScore || a.title.length - b.title.length);

    const selected = [];
    const selectedUrls = new Set();
    let heuristicCount = 0;

    const diversify = options.preferSourceDiversity === true;
    const pendingRelevant = scored.filter((candidate) => candidate._relatedScore > 0);
    while (pendingRelevant.length && selected.length < targetCount) {
        const bestScore = pendingRelevant[0]._relatedScore;
        let bestIndex = 0;
        if (diversify && selected.some((post) => post.source)) {
            const selectedSources = new Set(selected.map((post) => post.source).filter(Boolean));
            const tolerance = Number.isFinite(options.diversityScoreTolerance)
                ? Math.max(0, options.diversityScoreTolerance)
                : 6;
            const diverseIndex = pendingRelevant.findIndex((candidate) =>
                candidate.source && !selectedSources.has(candidate.source)
                && candidate._relatedScore >= Math.max(bestScore - tolerance, bestScore * 0.75)
            );
            if (diverseIndex >= 0) bestIndex = diverseIndex;
        }
        const [candidate] = pendingRelevant.splice(bestIndex, 1);
        selected.push(candidate);
        selectedUrls.add(candidate.url);
        heuristicCount += 1;
    }

    const fallbackPool = unique.filter((candidate) => !selectedUrls.has(candidate.url));
    const shuffledFallback = shuffle(fallbackPool);
    const fallback = [];
    while (shuffledFallback.length && selected.length + fallback.length < targetCount) {
        let fallbackIndex = 0;
        if (diversify) {
            const selectedSources = new Set([...selected, ...fallback].map((post) => post.source).filter(Boolean));
            const diverseIndex = shuffledFallback.findIndex((candidate) =>
                candidate.source && !selectedSources.has(candidate.source)
            );
            if (diverseIndex >= 0) fallbackIndex = diverseIndex;
        }
        fallback.push(shuffledFallback.splice(fallbackIndex, 1)[0]);
    }

    return {
        posts: [...selected, ...fallback].slice(0, targetCount).map(({ _relatedScore, ...candidate }) => candidate),
        heuristicCount,
        fallbackCount: fallback.length,
        totalCandidates: unique.length
    };
}

module.exports = {
    buildRelatedPostContext,
    scoreRelatedPostCandidate,
    selectRelatedPosts
};
