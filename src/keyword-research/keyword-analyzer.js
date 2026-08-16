/**
 * Deterministic keyword research, scoring, and ranking engine
 * Ported from KeywordMaster Core (Python) to Pure JavaScript.
 */

const DEFAULT_RELATED_LIMIT = 8;
const DEFAULT_CANDIDATE_LIMIT = 8;

function parseCount(value) {
    if (value === null || value === undefined) {
        return { count: null, raw: null };
    }
    const raw = String(value);
    if (raw.trim().startsWith('<')) {
        return { count: 5, raw };
    }
    try {
        const cleaned = raw.replace(/,/g, '').trim();
        const parsed = parseInt(cleaned, 10);
        if (Number.isFinite(parsed)) {
            return { count: parsed, raw };
        }
        return { count: null, raw };
    } catch (_) {
        return { count: null, raw };
    }
}

function normalizedKeyword(keyword) {
    return String(keyword || '').replace(/\s+/g, '').toLowerCase();
}

function parseKeywords(values) {
    const keywords = [];
    const seen = new Set();

    const rawList = Array.isArray(values) ? values : (values ? [values] : []);

    for (const val of rawList) {
        if (val === null || val === undefined) continue;
        const strVal = String(val).trim();
        if (!strVal) continue;

        let rawKeywords = [];
        if (strVal.startsWith('[')) {
            try {
                const parsed = JSON.parse(strVal);
                if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
                    rawKeywords = parsed;
                } else {
                    throw new Error('JSON 배열은 문자열로만 구성되어야 합니다.');
                }
            } catch (err) {
                throw new Error(`키워드 JSON 파싱 실패: ${err.message}`);
            }
        } else {
            rawKeywords = strVal.split(',');
        }

        for (const kw of rawKeywords) {
            const trimmed = String(kw).trim();
            const normalized = normalizedKeyword(trimmed);
            if (trimmed && !seen.has(normalized)) {
                keywords.push(trimmed);
                seen.add(normalized);
            }
        }
    }

    return keywords;
}

function validateRequest(request) {
    if (!request || !Array.isArray(request.keywords) || request.keywords.length === 0) {
        throw new Error('최소 1개의 키워드가 필요합니다.');
    }
    if (request.keywords.length > 3) {
        throw new Error('최대 3개의 고유 키워드만 지원됩니다.');
    }
    if (!request.subject || !String(request.subject).trim()) {
        throw new Error('주제(subject)가 필요합니다.');
    }
    const relatedLimit = request.related_limit ?? DEFAULT_RELATED_LIMIT;
    if (relatedLimit < 1 || relatedLimit > 100) {
        throw new Error('related_limit는 1에서 100 사이여야 합니다.');
    }
    const candidateLimit = request.candidate_limit ?? DEFAULT_CANDIDATE_LIMIT;
    if (candidateLimit < 1 || candidateLimit > 100) {
        throw new Error('candidate_limit는 1에서 100 사이여야 합니다.');
    }
    const minSearchVolume = request.min_search_volume ?? 300;
    if (minSearchVolume < 0) {
        throw new Error('min_search_volume은 0 이상이어야 합니다.');
    }
    if (request.related_assist && relatedLimit > candidateLimit) {
        throw new Error('related_limit는 candidate_limit보다 클 수 없습니다.');
    }
}

function totalVolume(row) {
    const pc = parseCount(row?.monthlyPcQcCnt);
    const mobile = parseCount(row?.monthlyMobileQcCnt);
    const total = (pc.count !== null && mobile.count !== null) ? (pc.count + mobile.count) : null;
    return {
        total,
        raw: { pc: pc.raw, mobile: mobile.raw }
    };
}

function relatedSubjectScore(item, subject) {
    const keyword = normalizedKeyword(item?.row?.relKeyword);
    if (!keyword) return 0;

    const subjectTokens = String(subject || '')
        .toLowerCase()
        .match(/[0-9a-z가-힣]{2,}/g) || [];
    const sourceKeywords = Array.isArray(item?.source_input_keywords)
        ? item.source_input_keywords.map(normalizedKeyword).filter(Boolean)
        : [];

    let score = 0;
    for (const token of subjectTokens) {
        if (keyword.includes(token.replace(/\s+/g, ''))) score += 2;
    }
    for (const sourceKeyword of sourceKeywords) {
        if (keyword.includes(sourceKeyword) || sourceKeyword.includes(keyword)) score += 3;
    }
    return score;
}

function choosePrimaryRow(rows, keyword) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const target = normalizedKeyword(keyword);
    for (const row of rows) {
        if (normalizedKeyword(row?.relKeyword) === target) {
            return row;
        }
    }
    return rows[0];
}

function competitionLevel(documentsPerSearch) {
    if (documentsPerSearch < 1) return '낮음';
    if (documentsPerSearch < 5) return '보통';
    return '높음';
}

function buildCandidate(row, documentCount, documentError, sourceInputKeywords, isInputKeyword, minSearchVolume) {
    const volumeInfo = totalVolume(row);
    const total = volumeInfo.total;
    const pc = parseCount(row?.monthlyPcQcCnt).count;
    const mobile = parseCount(row?.monthlyMobileQcCnt).count;
    const mobileShare = (mobile !== null && total) ? Math.round((mobile / total) * 10000) / 100 : null;

    let competition;
    let opportunity;

    if (total === null || documentCount === null) {
        competition = { status: 'incomplete', documents_per_monthly_search: null, level: null };
        opportunity = { status: 'incomplete', monthly_searches_per_document: null };
    } else {
        const documentsPerSearch = documentCount / Math.max(total, 1);
        competition = {
            status: 'complete',
            documents_per_monthly_search: Number(documentsPerSearch.toFixed(6)),
            level: competitionLevel(documentsPerSearch)
        };
        opportunity = {
            status: 'complete',
            monthly_searches_per_document: Number((total / Math.max(documentCount, 1)).toFixed(6))
        };
    }

    const eligibilityReasons = [];
    if (total === null) {
        eligibilityReasons.push('monthly_search_volume_unavailable');
    } else if (total < minSearchVolume) {
        eligibilityReasons.push('below_minimum_search_volume');
    }
    if (documentCount === null) {
        eligibilityReasons.push('blog_document_count_unavailable');
    }

    return {
        keyword: row?.relKeyword || '',
        source_input_keywords: sourceInputKeywords,
        is_input_keyword: isInputKeyword,
        monthly_search_volume: {
            pc,
            mobile,
            total,
            raw: volumeInfo.raw
        },
        mobile_share_percent: mobileShare,
        blog_document_count: documentCount,
        document_count_note: documentError,
        competition_strength: competition,
        opportunity,
        ad_competition_index: row?.compIdx || null,
        recommendation_eligibility: {
            eligible: eligibilityReasons.length === 0,
            reasons: eligibilityReasons
        }
    };
}

function compareCandidates(a, b) {
    // 1. Eligible first (true < false)
    const aEligible = a.recommendation_eligibility.eligible ? 0 : 1;
    const bEligible = b.recommendation_eligibility.eligible ? 0 : 1;
    if (aEligible !== bEligible) return aEligible - bEligible;

    // 2. Higher opportunity score first
    const aOpp = a.opportunity.monthly_searches_per_document ?? -1;
    const bOpp = b.opportunity.monthly_searches_per_document ?? -1;
    if (aOpp !== bOpp) return bOpp - aOpp;

    // 3. Higher total monthly search volume first
    const aVol = a.monthly_search_volume.total ?? -1;
    const bVol = b.monthly_search_volume.total ?? -1;
    if (aVol !== bVol) return bVol - aVol;

    // 4. Higher mobile share percent first
    const aMob = a.mobile_share_percent ?? -1;
    const bMob = b.mobile_share_percent ?? -1;
    if (aMob !== bMob) return bMob - aMob;

    // 5. Stable alphabetical tie-breaker
    return String(a.keyword).localeCompare(String(b.keyword));
}

/**
 * Main keyword research analysis orchestrator
 */
async function analyzeKeywords(request, clients = {}) {
    const searchAdClient = clients.searchAdClient;
    const blogSearchClient = clients.blogSearchClient;

    if (!searchAdClient || typeof searchAdClient.fetchKeywordRows !== 'function') {
        throw new Error('SearchAdClient가 제공되지 않았거나 유효하지 않습니다.');
    }
    if (!blogSearchClient || typeof blogSearchClient.fetchBlogTotal !== 'function') {
        throw new Error('BlogSearchClient가 제공되지 않았거나 유효하지 않습니다.');
    }

    const keywords = parseKeywords(request.keywords);
    const normalizedRequest = {
        keywords,
        subject: String(request.subject || '').trim(),
        related_assist: Boolean(request.related_assist),
        related_limit: request.related_limit ?? DEFAULT_RELATED_LIMIT,
        candidate_limit: request.candidate_limit ?? DEFAULT_CANDIDATE_LIMIT,
        min_search_volume: request.min_search_volume ?? 300
    };
    validateRequest(normalizedRequest);

    const inputKeywordLookup = new Set(keywords.map(normalizedKeyword));
    const inputRowsByKeyword = new Map();
    const relatedPoolMap = new Map();

    // 1. Fetch Search Ads rows for each input keyword
    for (const keyword of keywords) {
        const rows = await searchAdClient.fetchKeywordRows(keyword);
        const primaryRow = choosePrimaryRow(rows, keyword) || { relKeyword: keyword };
        inputRowsByKeyword.set(normalizedKeyword(keyword), primaryRow);

        if (normalizedRequest.related_assist) {
            for (const row of rows) {
                const candKw = String(row?.relKeyword || '').trim();
                const normCand = normalizedKeyword(candKw);
                if (!candKw || inputKeywordLookup.has(normCand)) continue;

                if (!relatedPoolMap.has(normCand)) {
                    relatedPoolMap.set(normCand, { row, source_input_keywords: [keyword] });
                } else {
                    const existing = relatedPoolMap.get(normCand);
                    if (!existing.source_input_keywords.includes(keyword)) {
                        existing.source_input_keywords.push(keyword);
                    }
                }
            }
        }
    }

    // 2. Determine candidates requiring blog document totals
    const docCountCache = new Map();

    async function getDocumentCount(keyword) {
        const norm = normalizedKeyword(keyword);
        if (docCountCache.has(norm)) {
            return docCountCache.get(norm);
        }
        const res = await blogSearchClient.fetchBlogTotal(keyword);
        docCountCache.set(norm, res);
        return res;
    }

    // Input keywords first
    for (const keyword of keywords) {
        await getDocumentCount(keyword);
    }

    // Top related candidates up to candidate_limit
    const relatedEntries = Array.from(relatedPoolMap.values())
        .filter((item) => {
            const volume = totalVolume(item.row).total;
            return volume !== null && volume >= normalizedRequest.min_search_volume;
        });
    // Search Ads supplies volume for the whole pool, so shortlist before using
    // the separately metered Blog Search API.
    relatedEntries.sort((a, b) => {
        const relevanceA = relatedSubjectScore(a, normalizedRequest.subject);
        const relevanceB = relatedSubjectScore(b, normalizedRequest.subject);
        if (relevanceA !== relevanceB) return relevanceB - relevanceA;
        const volA = totalVolume(a.row).total ?? -1;
        const volB = totalVolume(b.row).total ?? -1;
        return volB - volA;
    });

    const relatedToFetch = relatedEntries.slice(0, normalizedRequest.candidate_limit);
    for (const item of relatedToFetch) {
        const kw = item.row.relKeyword;
        await getDocumentCount(kw);
    }

    // 3. Build input keyword candidate models
    const inputCandidates = [];
    for (const keyword of keywords) {
        const norm = normalizedKeyword(keyword);
        const row = inputRowsByKeyword.get(norm);
        const docResult = docCountCache.get(norm) || { total: null, error: 'Document count not fetched' };
        inputCandidates.push(
            buildCandidate(
                row,
                docResult.total,
                docResult.error,
                [keyword],
                true,
                normalizedRequest.min_search_volume
            )
        );
    }
    inputCandidates.sort(compareCandidates);

    // 4. Build related candidates models
    const relatedCandidates = [];
    if (normalizedRequest.related_assist) {
        for (const item of relatedToFetch) {
            const kw = item.row.relKeyword;
            const norm = normalizedKeyword(kw);
            const docResult = docCountCache.get(norm) || { total: null, error: 'Document count not fetched' };
            relatedCandidates.push(
                buildCandidate(
                    item.row,
                    docResult.total,
                    docResult.error,
                    item.source_input_keywords,
                    false,
                    normalizedRequest.min_search_volume
                )
            );
        }
        relatedCandidates.sort(compareCandidates);
    }

    const rankedRelated = relatedCandidates.slice(0, normalizedRequest.related_limit);

    // 5. Select primary recommended keyword
    const eligibleInputs = inputCandidates.filter((c) => c.recommendation_eligibility.eligible);
    const eligibleRelated = rankedRelated.filter((c) => c.recommendation_eligibility.eligible);

    let selectedCandidate = null;
    let selectionReason = '';

    if (eligibleInputs.length > 0) {
        selectedCandidate = eligibleInputs[0];
        selectionReason = '입력된 키워드 중 검색 수요와 문서 경쟁도 기준 최우선 추천';
    } else if (normalizedRequest.related_assist && eligibleRelated.length > 0) {
        selectedCandidate = eligibleRelated[0];
        selectionReason = '입력 키워드의 기준 미달로 인해 최적 연관 키워드 추천';
    } else if (inputCandidates.length > 0) {
        selectedCandidate = inputCandidates[0];
        selectionReason = '최소 검색량 기준을 충족하는 후보가 없어 입력 키워드 중 최선 후보 유지';
    }

    return {
        subject: normalizedRequest.subject,
        selected_keyword: selectedCandidate?.keyword || keywords[0],
        selection_reason: selectionReason,
        input_keywords: inputCandidates,
        related_candidates: rankedRelated,
        candidate_pool_size: inputCandidates.length + rankedRelated.length,
        settings: {
            related_assist: normalizedRequest.related_assist,
            related_limit: normalizedRequest.related_limit,
            candidate_limit: normalizedRequest.candidate_limit,
            min_search_volume: normalizedRequest.min_search_volume
        }
    };
}

module.exports = {
    DEFAULT_RELATED_LIMIT,
    DEFAULT_CANDIDATE_LIMIT,
    parseCount,
    normalizedKeyword,
    parseKeywords,
    validateRequest,
    totalVolume,
    relatedSubjectScore,
    choosePrimaryRow,
    competitionLevel,
    buildCandidate,
    compareCandidates,
    analyzeKeywords
};
