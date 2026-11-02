export const DEVELOPMENT_SUPABASE_PROJECT_REF = 'bvtlwjbmjnfphxlrkzhm';

export const NAVER_TRENDS_CATEGORIES = Object.freeze([
    'IT·컴퓨터', '건강·의학', '게임', '공연·전시', '교육·학문', '국내여행', '드라마', '만화·애니',
    '맛집', '문학·책', '미술·디자인', '반려동물', '방송', '비즈니스·경제', '사진', '사회·정치',
    '상품리뷰', '세계여행', '스타·연예인', '스포츠', '어학·외국어', '영화', '요리·레시피', '원예·재배',
    '육아·결혼', '음악', '인테리어·DIY', '일상·생각', '자동차', '좋은글·이미지', '취미', '패션·미용'
]);

export function koreaDate(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(value);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

export function previousKoreaDate(value = new Date()) {
    const [year, month, day] = koreaDate(value).split('-').map(Number);
    const previous = new Date(Date.UTC(year, month - 1, day - 1));
    return previous.toISOString().slice(0, 10);
}

export function getReadinessExpectations(env = {}) {
    const configuredCategories = String(env.NEWSLETTER_EXPECTED_CATEGORIES || '').trim();
    const categories = configuredCategories
        ? configuredCategories.split(',').map((value) => value.trim()).filter(Boolean)
        : NAVER_TRENDS_CATEGORIES;
    if (categories.length < 1 || categories.length > 50 || new Set(categories).size !== categories.length) {
        throw new Error('Expected trend categories must contain 1 to 50 unique values.');
    }
    const configuredItems = Number.parseInt(String(env.NEWSLETTER_ITEMS_PER_CATEGORY ?? '20'), 10);
    if (!Number.isInteger(configuredItems) || configuredItems < 1 || configuredItems > 100) {
        throw new Error('Expected items per category must be between 1 and 100.');
    }
    return { categories, itemsPerCategory: configuredItems };
}

export function validateDevelopmentTarget(env) {
    if (String(env.BLOGGENIUS_ENV || '').trim() !== 'development') {
        throw new Error('Newsletter Workflow is restricted to the Development environment.');
    }

    const configuredRef = String(env.SUPABASE_PROJECT_REF || '').trim();
    const supabaseUrl = String(env.SUPABASE_URL || '').trim();
    let url;
    try {
        url = new URL(supabaseUrl);
    } catch {
        throw new Error('Development Supabase URL is missing or invalid.');
    }

    if (configuredRef !== DEVELOPMENT_SUPABASE_PROJECT_REF
        || url.protocol !== 'https:'
        || url.hostname !== `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`
        || !String(env.SUPABASE_SECRET_KEY || '').trim()) {
        throw new Error('Newsletter Workflow target does not match the approved Development Supabase project.');
    }

    return { url: url.origin, projectRef: configuredRef };
}

export function evaluateTrendsReadiness(rows, trendDate, {
    categories = NAVER_TRENDS_CATEGORIES,
    itemsPerCategory = 20
} = {}) {
    const expected = new Set(categories);
    const keywordsByCategory = new Map(categories.map((category) => [category, new Set()]));
    const unexpectedCategories = new Set();
    let invalidRows = 0;

    for (const row of Array.isArray(rows) ? rows : []) {
        const category = String(row?.category || '').trim();
        const keyword = String(row?.keyword || '').trim();
        if (row?.trend_date !== trendDate || row?.source !== 'naver_creator_advisor' || !category || !keyword) {
            invalidRows += 1;
            continue;
        }
        if (!expected.has(category)) {
            unexpectedCategories.add(category);
            continue;
        }
        keywordsByCategory.get(category).add(keyword);
    }

    const categoryCounts = Object.fromEntries([...keywordsByCategory]
        .map(([category, keywords]) => [category, keywords.size]));
    const missingCategories = categories.filter((category) => categoryCounts[category] === 0);
    const incompleteCategories = categories.filter((category) => categoryCounts[category] !== itemsPerCategory);
    const uniqueTotal = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
    const expectedTotal = categories.length * itemsPerCategory;
    const ready = missingCategories.length === 0
        && incompleteCategories.length === 0
        && unexpectedCategories.size === 0
        && invalidRows === 0
        && uniqueTotal === expectedTotal;

    return {
        status: ready ? 'ready' : 'incomplete',
        trendDate,
        expectedCategories: categories.length,
        expectedItemsPerCategory: itemsPerCategory,
        expectedTotal,
        uniqueTotal,
        rawRows: Array.isArray(rows) ? rows.length : 0,
        missingCategories,
        incompleteCategories: Object.fromEntries(incompleteCategories.map((category) => [category, categoryCounts[category]])),
        unexpectedCategories: [...unexpectedCategories],
        invalidRows
    };
}

export async function readDevelopmentTrendRows(env, trendDate) {
    const { url } = validateDevelopmentTarget(env);
    const secretKey = String(env.SUPABASE_SECRET_KEY).trim();
    const endpoint = new URL('/rest/v1/items', url);
    endpoint.search = new URLSearchParams({
        select: 'source,trend_date,category,keyword',
        source: 'eq.naver_creator_advisor',
        trend_date: `eq.${trendDate}`,
        order: 'category.asc,keyword.asc',
        limit: '1000'
    }).toString();

    const response = await fetch(endpoint, {
        headers: {
            apikey: secretKey,
            authorization: `Bearer ${secretKey}`,
            'accept-profile': 'trends'
        },
        signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
        throw new Error(`Development trends read failed with HTTP ${response.status}.`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Development trends response was not a row list.');
    return rows;
}

export async function recordDevelopmentCollectionResult(env, result) {
    const { url } = validateDevelopmentTarget(env);
    const secretKey = String(env.SUPABASE_SECRET_KEY).trim();
    const endpoint = new URL('/rest/v1/rpc/record_trends_newsletter_collection', url);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            apikey: secretKey,
            authorization: `Bearer ${secretKey}`,
            'content-type': 'application/json',
            'content-profile': 'public',
            'accept-profile': 'public'
        },
        body: JSON.stringify({
            p_trend_date: result.trendDate,
            p_collection_status: result.status === 'ready' ? 'complete' : result.status === 'incomplete' ? 'incomplete' : 'read_error',
            p_source: 'naver_creator_advisor',
            p_expected_categories: result.expectedCategories,
            p_items_per_category: result.expectedItemsPerCategory,
            p_expected_total: result.expectedTotal,
            p_actual_total: result.uniqueTotal,
            p_report: result
        }),
        signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Development newsletter state write failed with HTTP ${response.status}.`);
    return response.json();
}
