const WEEKLY_SEARCH_DAYS = 7;
const MONTHLY_SEARCH_DAYS = 31;
const MAX_INPUT_KEYWORDS = 3;
const DEFAULT_RELATED_LIMIT = 8;
const MAX_RELATED_CANDIDATES = 8;

function boundedPositiveInteger(value, fallback, maximum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(maximum, Math.floor(parsed));
}

function normalizeKeyword(value) {
    return String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function parseCount(value) {
    if (value === null || value === undefined) return { count: null, raw: null };
    const raw = String(value);
    if (raw.trim().startsWith('<')) return { count: 5, raw };
    const parsed = Number.parseInt(raw.replace(/,/g, '').trim(), 10);
    return { count: Number.isFinite(parsed) ? parsed : null, raw };
}

function totalVolume(row = {}) {
    const pc = parseCount(row.monthlyPcQcCnt);
    const mobile = parseCount(row.monthlyMobileQcCnt);
    return {
        total: pc.count !== null && mobile.count !== null ? pc.count + mobile.count : null,
        pc: pc.count,
        mobile: mobile.count,
        raw: { pc: pc.raw, mobile: mobile.raw }
    };
}

function estimateWeeklySearchVolume(monthlySearchVolume) {
    if (!Number.isFinite(monthlySearchVolume)) return null;
    return Number((monthlySearchVolume * WEEKLY_SEARCH_DAYS / MONTHLY_SEARCH_DAYS).toFixed(2));
}

function chooseInputRow(rows, keyword) {
    const target = normalizeKeyword(keyword);
    return rows.find((row) => normalizeKeyword(row?.relKeyword) === target)
        || { relKeyword: keyword, monthlyPcQcCnt: null, monthlyMobileQcCnt: null };
}

function prepareKeywordPlan(options = {}) {
    const keywords = Array.isArray(options.keywords) ? options.keywords : [];
    const subject = String(options.subject || '').trim();
    const rowsByKeyword = options.rowsByKeyword instanceof Map ? options.rowsByKeyword : new Map();
    const relatedAssist = options.relatedAssist !== false;
    const relatedLimit = boundedPositiveInteger(
        options.relatedLimit ?? options.candidateLimit,
        DEFAULT_RELATED_LIMIT,
        MAX_RELATED_CANDIDATES
    );
    const inputKeys = new Set(keywords.map(normalizeKeyword));
    const inputRows = new Map();
    const relatedRows = [];
    const relatedKeys = new Set();

    for (const keyword of keywords) {
        const rows = rowsByKeyword.get(normalizeKeyword(keyword)) || [];
        inputRows.set(normalizeKeyword(keyword), chooseInputRow(rows, keyword));
        if (!relatedAssist) continue;

        for (const row of rows) {
            const candidate = String(row?.relKeyword || '').trim();
            const key = normalizeKeyword(candidate);
            if (!candidate || inputKeys.has(key)) continue;

            const existing = relatedRows.find((item) => item.key === key);
            if (existing) {
                if (!existing.source_input_keywords.includes(keyword)) existing.source_input_keywords.push(keyword);
                continue;
            }
            if (relatedKeys.size >= relatedLimit) continue;
            relatedKeys.add(key);
            relatedRows.push({ key, row, source_input_keywords: [keyword] });
        }
    }

    return { subject, keywords, relatedAssist, relatedLimit, inputRows, relatedRows };
}

function collectWeeklyDocumentKeywords(plan) {
    const seen = new Set();
    const candidates = [
        ...plan.keywords.map((keyword) => ({ keyword })),
        ...plan.relatedRows.map((item) => ({ keyword: String(item.row?.relKeyword || '') }))
    ];
    return candidates
        .filter((item) => {
            const key = normalizeKeyword(item.keyword);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((item) => item.keyword);
}

function normalizeWeeklyDocuments(value = {}) {
    const rawCount = value?.count;
    const count = Number(rawCount);
    const hasCount = rawCount !== null && rawCount !== undefined && Number.isFinite(count) && count >= 0;
    const capped = Boolean(value?.capped || value?.status === 'lower_bound');
    return {
        count: hasCount ? Math.floor(count) : null,
        status: hasCount ? (capped ? 'lower_bound' : 'complete') : 'incomplete',
        capped,
        cutoff_date: String(value?.cutoff_date || '').trim() || null,
        pages_fetched: Number.isFinite(Number(value?.pages_fetched)) ? Number(value.pages_fetched) : 0,
        error: String(value?.error || '').trim() || null
    };
}

function competitionLevel(documentsPerSearch) {
    if (documentsPerSearch < 0.5) return '낮음';
    if (documentsPerSearch < 1.5) return '보통';
    return '높음';
}

function buildCandidate(row, weeklyResult, sourceInputKeywords, isInputKeyword) {
    const volume = totalVolume(row);
    const estimatedWeeklySearch = estimateWeeklySearchVolume(volume.total);
    const weeklyDocuments = normalizeWeeklyDocuments(weeklyResult);
    const documentsPerSearch = estimatedWeeklySearch !== null && weeklyDocuments.count !== null
        ? weeklyDocuments.count / Math.max(estimatedWeeklySearch, 1)
        : null;

    return {
        keyword: String(row?.relKeyword || ''),
        source_input_keywords: sourceInputKeywords,
        is_input_keyword: isInputKeyword,
        monthly_search_volume: volume,
        estimated_weekly_search_volume: estimatedWeeklySearch,
        mobile_share_percent: volume.mobile !== null && volume.total ? Math.round((volume.mobile / volume.total) * 10000) / 100 : null,
        weekly_new_blog_documents: weeklyDocuments,
        competition_strength: documentsPerSearch === null
            ? { status: 'incomplete', new_documents_per_estimated_search: null, level: null }
            : {
                status: weeklyDocuments.capped ? 'lower_bound' : 'complete',
                new_documents_per_estimated_search: Number(documentsPerSearch.toFixed(6)),
                level: weeklyDocuments.capped ? null : competitionLevel(documentsPerSearch)
            },
        opportunity: documentsPerSearch === null || weeklyDocuments.capped
            ? { status: weeklyDocuments.capped ? 'lower_bound' : 'incomplete', estimated_weekly_searches_per_new_document: null }
            : { status: 'complete', estimated_weekly_searches_per_new_document: Number((estimatedWeeklySearch / Math.max(weeklyDocuments.count, 1)).toFixed(6)) },
        ad_competition_index: row?.compIdx || null
    };
}

function compareRelatedCandidates(a, b) {
    const aScore = a.candidate.opportunity?.estimated_weekly_searches_per_new_document;
    const bScore = b.candidate.opportunity?.estimated_weekly_searches_per_new_document;
    const aMeasured = aScore !== null && aScore !== undefined && Number.isFinite(Number(aScore));
    const bMeasured = bScore !== null && bScore !== undefined && Number.isFinite(Number(bScore));
    if (aMeasured !== bMeasured) return aMeasured ? -1 : 1;
    if (aMeasured && bMeasured && Number(bScore) !== Number(aScore)) return Number(bScore) - Number(aScore);
    return a.index - b.index;
}

function buildKeywordAnalysis(options = {}) {
    const plan = options.plan;
    const weeklyDocuments = options.weeklyDocuments instanceof Map ? options.weeklyDocuments : new Map();
    const resultFor = (keyword) => weeklyDocuments.get(normalizeKeyword(keyword)) || {
        count: null,
        status: 'incomplete',
        capped: false,
        cutoff_date: null,
        pages_fetched: 0,
        error: 'weekly_document_count_unavailable'
    };
    const inputCandidates = plan.keywords.map((keyword) => buildCandidate(
        plan.inputRows.get(normalizeKeyword(keyword)) || { relKeyword: keyword },
        resultFor(keyword),
        [keyword],
        true
    ));
    const relatedCandidates = plan.relatedRows
        .map((item, index) => ({
            index,
            candidate: buildCandidate(item.row, resultFor(item.row?.relKeyword), item.source_input_keywords, false)
        }))
        .sort(compareRelatedCandidates)
        .map((item) => item.candidate);

    return {
        subject: plan.subject,
        input_keywords: inputCandidates,
        related_candidates: relatedCandidates,
        candidate_pool_size: inputCandidates.length + relatedCandidates.length,
        settings: {
            related_assist: plan.relatedAssist,
            related_limit: plan.relatedLimit,
            weekly_search_days: WEEKLY_SEARCH_DAYS
        }
    };
}

module.exports = {
    WEEKLY_SEARCH_DAYS,
    MAX_INPUT_KEYWORDS,
    DEFAULT_RELATED_LIMIT,
    MAX_RELATED_CANDIDATES,
    normalizeKeyword,
    parseCount,
    totalVolume,
    prepareKeywordPlan,
    collectWeeklyDocumentKeywords,
    buildKeywordAnalysis
};
