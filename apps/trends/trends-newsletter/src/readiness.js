export const DEVELOPMENT_SUPABASE_PROJECT_REF = 'bvtlwjbmjnfphxlrkzhm';
export const PRODUCTION_SUPABASE_PROJECT_REF = 'hocfjolcthvtgfaxjmse';
export const NEWSLETTER_ENVIRONMENT_PROFILES = Object.freeze({
    development: Object.freeze({ projectRef: DEVELOPMENT_SUPABASE_PROJECT_REF, siteOrigin: 'https://www-dev.bloggenius.kr' }),
    production: Object.freeze({ projectRef: PRODUCTION_SUPABASE_PROJECT_REF, siteOrigin: 'https://www.bloggenius.kr' })
});

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

export function validateNewsletterTarget(env) {
    const environment = String(env.BLOGGENIUS_ENV || '').trim().toLowerCase();
    const profile = NEWSLETTER_ENVIRONMENT_PROFILES[environment];
    if (!profile) throw new Error('Newsletter Workflow requires a supported Development or Production environment.');
    const configuredRef = String(env.SUPABASE_PROJECT_REF || '').trim();
    const supabaseUrl = String(env.SUPABASE_URL || '').trim();
    let url;
    try {
        url = new URL(supabaseUrl);
    } catch {
        throw new Error(`${environment} Supabase URL is missing or invalid.`);
    }

    if (configuredRef !== profile.projectRef
        || url.protocol !== 'https:'
        || url.hostname !== `${profile.projectRef}.supabase.co`
        || !String(env.SUPABASE_SECRET_KEY || '').trim()) {
        throw new Error(`Newsletter Workflow target does not match the approved ${environment} Supabase project.`);
    }

    return { environment, profile, url: url.origin, projectRef: configuredRef };
}

export async function readNewsletterDeliveryMode(env) {
    const { url, environment } = validateNewsletterTarget(env);
    const token = String(env.TRENDS_NEWSLETTER_WORKER_TOKEN || '').trim();
    if (!token) throw new Error('Newsletter delivery token is missing.');
    const response = await fetch(new URL('/functions/v1/trends-mailing-list', url), {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delivery_mode' }), signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`${environment} newsletter delivery mode check failed with HTTP ${response.status}.`);
    const result = await response.json();
    if (result?.success !== true || result.environment !== environment || !['disabled', 'allowlist', 'canary', 'live'].includes(result.mode)) {
        throw new Error('Newsletter delivery mode response is invalid.');
    }
    return result.mode;
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

export async function readNewsletterTrendRows(env, trendDate) {
    const { url, environment } = validateNewsletterTarget(env);
    const secretKey = String(env.SUPABASE_SECRET_KEY).trim();
    const endpoint = new URL('/rest/v1/items', url);
    endpoint.search = new URLSearchParams({
        select: 'source,trend_date,category,keyword,change_raw,change_type,change_amount,display_order',
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
        throw new Error(`${environment} trends read failed with HTTP ${response.status}.`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Newsletter trends response was not a row list.');
    return rows;
}

export async function recordNewsletterCollectionResult(env, result) {
    const { url, environment } = validateNewsletterTarget(env);
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
    if (!response.ok) throw new Error(`${environment} newsletter state write failed with HTTP ${response.status}.`);
    return response.json();
}
