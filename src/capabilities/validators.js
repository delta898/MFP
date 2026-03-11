function parseCategoryList(raw) {
    return String(raw || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function serializeCategoryList(items = []) {
    return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean))).join(', ');
}

function isStrictTimeString(value) {
    const text = String(value || '').trim();
    if (!/^\d{2}:\d{2}$/.test(text)) return false;
    const [hour, minute] = text.split(':').map((item) => Number(item));
    return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function normalizeCategoryToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
}

function splitCategoryTerms(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2);
}

function levenshteinDistance(a = '', b = '') {
    const left = String(a);
    const right = String(b);
    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) dp[i][0] = i;
    for (let j = 0; j < cols; j += 1) dp[0][j] = j;
    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[rows - 1][cols - 1];
}

function findSuggestedTrendCategories(input, categories = []) {
    const raw = String(input || '').trim();
    if (!raw) return [];
    const normalizedInput = normalizeCategoryToken(raw);
    const terms = splitCategoryTerms(raw);

    const scored = categories.map((candidate) => {
        const candidateText = String(candidate || '').trim();
        const normalizedCandidate = normalizeCategoryToken(candidateText);
        const candidateTerms = splitCategoryTerms(candidateText);
        const sharedTerms = candidateTerms.filter((term) => terms.includes(term));
        const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
        let score = sharedTerms.length * 10;
        if (normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate)) score += 8;
        score += Math.max(0, 6 - distance);
        return { candidate: candidateText, score, distance };
    }).filter((item) => item.score > 0);

    scored.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.distance - right.distance;
    });

    return scored.slice(0, 3).map((item) => item.candidate);
}

function readTrendCategoryCatalog(CONFIG = {}, configState = null) {
    const runtimeMaster = String(
        CONFIG?.NAVER_AUTO_CATEGORIES_MASTER
        || CONFIG?.BLOG_AUTO_CATEGORIES_MASTER
        || ''
    ).trim();

    const runtimeCategories = parseCategoryList(runtimeMaster);
    let configuredCategories = [];

    try {
        if (configState && typeof configState.loadStructuredConfig === 'function') {
            const structured = configState.loadStructuredConfig();
            configuredCategories = parseCategoryList(structured?.automation?.collect?.blog?.trends?.categories || '');
        }
    } catch (_ignore) { }

    const categories = Array.from(new Set([...runtimeCategories, ...configuredCategories].filter(Boolean)));
    return {
        categories,
        hasCatalog: categories.length > 0,
        hasMaster: runtimeCategories.length > 0
    };
}

async function readResolvedTrendCategoryCatalog(options = {}) {
    const resolveNaverAutoCategoryCatalog = options.resolveNaverAutoCategoryCatalog;
    if (typeof resolveNaverAutoCategoryCatalog !== 'function') return null;
    try {
        const resolved = await resolveNaverAutoCategoryCatalog({ force: false });
        const categories = Array.isArray(resolved?.categories)
            ? Array.from(new Set(resolved.categories.map((item) => String(item || '').trim()).filter(Boolean)))
            : [];
        return {
            categories,
            hasCatalog: categories.length > 0,
            source: 'runtime_hook'
        };
    } catch (_ignore) {
        return null;
    }
}

async function readLearnedTrendCategories(eventStore = null) {
    if (!eventStore || typeof eventStore.listDomainKnowledge !== 'function') return [];
    try {
        return await eventStore.listDomainKnowledge('trends.category', 50);
    } catch (_ignore) {
        return [];
    }
}

async function resolveAllowedTrendCategory(input, options = {}) {
    const raw = String(input || '').trim();
    if (!raw) {
        return { ok: false, error: 'category가 필요합니다.' };
    }

    const CONFIG = options.CONFIG || {};
    const configState = options.configState || null;
    const eventStore = options.eventStore || null;
    const resolvedCatalog = await readResolvedTrendCategoryCatalog(options);
    const catalog = resolvedCatalog || readTrendCategoryCatalog(CONFIG, configState);
    const learned = await readLearnedTrendCategories(eventStore);
    const learnedCanonical = learned.map((item) => String(item.canonical_value || '').trim()).filter(Boolean);
    const allCategories = Array.from(new Set([...catalog.categories, ...learnedCanonical]));
    if (!catalog.hasCatalog) {
        if (learnedCanonical.length === 0) {
            return {
                ok: false,
                error: '트렌드 카테고리 기준 목록이 없어 현재는 카테고리 변경을 허용하지 않습니다.'
            };
        }
    }

    const normalizedInput = normalizeCategoryToken(raw);
    const learnedAliasMatch = learned.find((item) => {
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        return aliases.some((alias) => normalizeCategoryToken(alias) === normalizedInput);
    });
    if (learnedAliasMatch) {
        return { ok: true, value: String(learnedAliasMatch.canonical_value || '').trim(), learned: true, catalog: { ...catalog, categories: allCategories } };
    }

    const exact = allCategories.find((item) => String(item).trim() === raw);
    if (exact) {
        return { ok: true, value: exact, catalog: { ...catalog, categories: allCategories } };
    }

    const normalizedMatches = allCategories.filter((item) => normalizeCategoryToken(item) === normalizedInput);
    if (normalizedMatches.length === 1) {
        return { ok: true, value: normalizedMatches[0], catalog: { ...catalog, categories: allCategories } };
    }

    if (normalizedMatches.length > 1) {
        return { ok: false, error: `카테고리 '${raw}'가 여러 후보와 매칭되어 모호합니다.`, catalog: { ...catalog, categories: allCategories } };
    }

    const suggested = findSuggestedTrendCategories(raw, allCategories);
    if (suggested.length > 0) {
        return {
            ok: false,
            error: `카테고리 '${raw}'는 허용된 트렌드 카테고리가 아닙니다. 혹시 '${suggested[0]}'을 의미하셨나요?`,
            suggested,
            correctionProposal: {
                type: 'domain_alias',
                domain: 'trends.category',
                raw_input: raw,
                canonical_value: suggested[0]
            },
            catalog: { ...catalog, categories: allCategories }
        };
    }

    return {
        ok: false,
        error: `카테고리 '${raw}'는 허용된 트렌드 카테고리가 아닙니다.`,
        catalog: { ...catalog, categories: allCategories }
    };
}

function validateAiMode(input) {
    const mode = String(input || '').trim().toLowerCase();
    if (!['default', 'custom'].includes(mode)) {
        return { ok: false, error: 'mode는 default 또는 custom 이어야 합니다.' };
    }
    return { ok: true, value: mode };
}

function validateBoolean(input, fieldName = 'value') {
    if (input === true || input === false) {
        return { ok: true, value: input };
    }
    return { ok: false, error: `${fieldName}는 boolean이어야 합니다.` };
}

function validateTime(input, fieldName = 'time') {
    const value = String(input || '').trim();
    if (!isStrictTimeString(value)) {
        return { ok: false, error: `${fieldName}은 HH:MM 형식이어야 합니다.` };
    }
    return { ok: true, value };
}

function validateTimeWindow(startInput, endInput) {
    const start = validateTime(startInput, 'start_time');
    const end = validateTime(endInput, 'end_time');
    const errors = [];
    if (!start.ok) errors.push(start.error);
    if (!end.ok) errors.push(end.error);
    return {
        ok: errors.length === 0,
        errors,
        value: {
            startTime: start.value,
            endTime: end.value
        }
    };
}

module.exports = {
    parseCategoryList,
    serializeCategoryList,
    isStrictTimeString,
    normalizeCategoryToken,
    findSuggestedTrendCategories,
    readLearnedTrendCategories,
    readTrendCategoryCatalog,
    resolveAllowedTrendCategory,
    validateAiMode,
    validateBoolean,
    validateTime,
    validateTimeWindow
};
