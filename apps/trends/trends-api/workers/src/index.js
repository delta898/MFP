import { parseRssFeed } from '../../../shared/lib/rss-feed.mjs';

const DEFAULT_SCHEMA = 'trends';
const DEFAULT_TABLE = 'items';
const DEFAULT_CONFLICT = 'source,trend_date,category,keyword';
const VALID_CHANGE_TYPES = new Set(['up', 'down', 'new', 'steady']);
const metaCache = new Map();
const readRateWindows = new Map();
const PUBLIC_TRENDS_PATHS = new Set(['/api/v1/public/trends', '/api/v1/public/trends/meta', '/api/v1/public/trends/recommendations']);
const PUBLIC_SUBSCRIPTION_PATHS = new Set(['/api/v1/public/subscriptions', '/api/v1/public/subscriptions/confirm', '/api/v1/public/subscriptions/confirm/preview', '/api/v1/public/subscriptions/unsubscribe']);
const NEWSLETTER_CATEGORIES = new Set([
    'IT·컴퓨터', '건강·의학', '게임', '공연·전시', '교육·학문', '국내여행', '드라마', '만화·애니',
    '맛집', '문학·책', '미술·디자인', '반려동물', '방송', '비즈니스·경제', '사진', '사회·정치',
    '상품리뷰', '세계여행', '스타·연예인', '스포츠', '어학·외국어', '영화', '요리·레시피', '원예·재배',
    '육아·결혼', '음악', '인테리어·DIY', '일상·생각', '자동차', '좋은글·이미지', '취미', '패션·미용'
]);

function jsonResponse(status, value, headers = {}) {
    return new Response(JSON.stringify(value, null, 2), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
    });
}

function getConfig(env) {
    return {
        environment: String(env.TRENDS_ENV || '').trim().toLowerCase(),
        internalToken: String(env.TRENDS_API_TOKEN || '').trim(),
        readTokenSecret: String(env.TRENDS_READ_TOKEN_SECRET || '').trim(),
        readTokenIssuer: String(env.TRENDS_READ_TOKEN_ISSUER || 'bloggenius-license').trim(),
        readTokenAudience: String(env.TRENDS_READ_TOKEN_AUDIENCE || 'trends-api').trim(),
        readRateLimitPerMinute: Math.max(1, Number.parseInt(env.TRENDS_API_READ_RATE_LIMIT_PER_MINUTE, 10) || 120),
        publicAllowedOrigins: new Set(String(env.TRENDS_PUBLIC_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)),
        allowLocalPreview: String(env.TRENDS_PUBLIC_ALLOW_LOCAL_PREVIEW || '').trim().toLowerCase() === 'true',
        publicRateLimitPerMinute: Math.max(1, Number.parseInt(env.TRENDS_PUBLIC_RATE_LIMIT_PER_MINUTE, 10) || 60),
        publicBlogFeeds: String(env.TRENDS_PUBLIC_BLOG_FEEDS || '').trim(),
        subscribeRateLimitPerMinute: Math.max(1, Number.parseInt(env.TRENDS_SUBSCRIBE_RATE_LIMIT_PER_MINUTE, 10) || 5),
        newsletterFunctionUrl: String(env.TRENDS_NEWSLETTER_FUNCTION_URL || '').trim().replace(/\/+$/, ''),
        newsletterWorkerToken: String(env.TRENDS_NEWSLETTER_WORKER_TOKEN || '').trim(),
        newsletterCanaryToken: String(env.TRENDS_NEWSLETTER_CANARY_TOKEN || '').trim(),
        newsletterExpectedCategories: Math.max(1, Number.parseInt(env.TRENDS_NEWSLETTER_EXPECTED_CATEGORIES, 10) || 32),
        newsletterItemsPerCategory: Math.max(1, Number.parseInt(env.TRENDS_NEWSLETTER_ITEMS_PER_CATEGORY, 10) || 20),
        supabaseUrl: String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
        supabaseKey: String(env.SUPABASE_SECRET_KEY || '').trim(),
        schema: String(env.TRENDS_SUPABASE_SCHEMA || DEFAULT_SCHEMA).trim() || DEFAULT_SCHEMA,
        table: String(env.TRENDS_SUPABASE_TABLE || DEFAULT_TABLE).trim() || DEFAULT_TABLE,
        conflict: String(env.TRENDS_SUPABASE_ON_CONFLICT || DEFAULT_CONFLICT).trim() || DEFAULT_CONFLICT,
        metaFunction: String(env.TRENDS_SUPABASE_META_FUNCTION || 'get_items_meta').trim() || 'get_items_meta',
        exportMaxRows: Math.max(1, Number.parseInt(env.TRENDS_EXPORT_MAX_ROWS, 10) || 5000),
        bodyMaxBytes: Math.max(1024, Number.parseInt(env.TRENDS_API_MAX_BODY_BYTES, 10) || 1048576),
        metaCacheTtlMs: Math.max(1000, Number.parseInt(env.TRENDS_META_CACHE_TTL_MS, 10) || 300000)
    };
}

function constantTimeEquals(left, right) {
    const a = new TextEncoder().encode(String(left || ''));
    const b = new TextEncoder().encode(String(right || ''));
    let difference = a.length ^ b.length;
    const size = Math.max(a.length, b.length);
    for (let i = 0; i < size; i += 1) difference |= (a[i] || 0) ^ (b[i] || 0);
    return difference === 0;
}

function bearerToken(request) {
    const match = String(request.headers.get('authorization') || '').trim().match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function hasInternalAccess(request, config) {
    return Boolean(config.internalToken) && constantTimeEquals(bearerToken(request), config.internalToken);
}

function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    try {
        return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    } catch {
        return null;
    }
}

async function verifyReadToken(token, config, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!config.readTokenSecret) return null;
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const headerBytes = decodeBase64Url(parts[0]);
    const claimsBytes = decodeBase64Url(parts[1]);
    const signature = decodeBase64Url(parts[2]);
    if (!headerBytes || !claimsBytes || !signature) return null;

    let header;
    let claims;
    try {
        header = JSON.parse(new TextDecoder().decode(headerBytes));
        claims = JSON.parse(new TextDecoder().decode(claimsBytes));
    } catch {
        return null;
    }
    if (header?.alg !== 'HS256' || !claims || typeof claims !== 'object' || Array.isArray(claims)) return null;

    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(config.readTokenSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const validSignature = await crypto.subtle.verify(
        'HMAC', key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!validSignature) return null;
    if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= nowSeconds) return null;
    if (String(claims.iss || '') !== config.readTokenIssuer) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((value) => String(value || '') === config.readTokenAudience)) return null;
    const scopes = Array.isArray(claims.scope) ? claims.scope : String(claims.scope || '').split(/\s+/);
    if (!scopes.includes('trends:read') || !String(claims.sub || '').trim()) return null;
    return claims;
}

function normalizeYmd(value, name) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} must be YYYY-MM-DD`);
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.toISOString().slice(0, 10) !== text) throw new Error(`${name} must be a valid calendar date`);
    return text;
}

function normalizeFilters(params, config) {
    const trendDate = normalizeYmd(params.get('trend_date'), 'trend_date');
    const dateFrom = normalizeYmd(params.get('date_from'), 'date_from');
    const dateTo = normalizeYmd(params.get('date_to'), 'date_to');
    const categories = [...params.getAll('category'), ...params.getAll('categories').flatMap((v) => v.split(','))]
        .map((v) => v.trim()).filter(Boolean);
    const selectedCategories = categories.some((v) => v.toLowerCase() === 'all' || v === '*')
        ? [] : [...new Set(categories)];
    const changeType = String(params.get('change_type') || '').trim().toLowerCase();
    if (changeType && !VALID_CHANGE_TYPES.has(changeType)) throw new Error('change_type must be one of: up, down, new, steady');
    const asInteger = (value, name) => {
        const text = String(value || '').trim();
        if (!text) return null;
        if (!/^-?\d+$/.test(text)) throw new Error(`${name} must be an integer`);
        return Number.parseInt(text, 10);
    };
    const changeAmountMin = asInteger(params.get('change_amount_min'), 'change_amount_min');
    const changeAmountMax = asInteger(params.get('change_amount_max'), 'change_amount_max');
    if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('date_from must be earlier than or equal to date_to');
    if (changeAmountMin !== null && changeAmountMax !== null && changeAmountMin > changeAmountMax) {
        throw new Error('change_amount_min must be less than or equal to change_amount_max');
    }
    const requestedLimit = Number.parseInt(params.get('limit'), 10) || 500;
    return {
        trendDate, dateFrom, dateTo, categories: selectedCategories,
        keyword: String(params.get('keyword') || '').trim(),
        source: String(params.get('source') || '').trim(), changeType,
        changeAmountMin, changeAmountMax,
        limit: Math.min(config.exportMaxRows, Math.max(1, requestedLimit))
    };
}

function normalizeChange(item) {
    const raw = String(item.changeRaw || item.change_raw || item.variation || '').trim();
    const lowered = raw.toLowerCase();
    if (lowered === 'new') return { changeRaw: 'new', changeType: 'new', changeAmount: null, variation: 'new' };
    if (raw === '-') return { changeRaw: '-', changeType: 'steady', changeAmount: null, variation: '-' };
    let match = raw.match(/^[▲+]\s*(\d+)(?:\D.*)?$/);
    if (match) return { changeRaw: `▲ ${Number(match[1])}`, changeType: 'up', changeAmount: Number(match[1]), variation: `+${Number(match[1])}` };
    match = raw.match(/^[▼-]\s*(\d+)(?:\D.*)?$/);
    if (match) return { changeRaw: `▼ ${Number(match[1])}`, changeType: 'down', changeAmount: Number(match[1]), variation: `-${Number(match[1])}` };
    const type = String(item.changeType || item.change_type || '').trim().toLowerCase();
    const amountValue = item.changeAmount ?? item.change_amount;
    const amount = amountValue === null || amountValue === undefined || amountValue === '' ? null : Number(amountValue);
    if (!type && raw) throw new Error(`unsupported trend change literal: ${raw}`);
    if (!type) return { changeRaw: '-', changeType: 'steady', changeAmount: null, variation: '-' };
    if (!VALID_CHANGE_TYPES.has(type)) throw new Error(`invalid change type: ${type}`);
    if (type === 'new' || type === 'steady') {
        if (amount !== null) throw new Error(`change amount must be null for ${type}`);
        return { changeRaw: type === 'new' ? 'new' : '-', changeType: type, changeAmount: null, variation: type === 'new' ? 'new' : '-' };
    }
    if (!Number.isInteger(amount) || amount < 0) throw new Error(`invalid change amount for ${type}`);
    const up = type === 'up';
    return { changeRaw: `${up ? '▲' : '▼'} ${amount}`, changeType: type, changeAmount: amount, variation: `${up ? '+' : '-'}${amount}` };
}

function normalizeIngest(body) {
    const source = String(body.source || 'naver_creator_advisor').trim() || 'naver_creator_advisor';
    const trendDate = String(body.trendDate || body.date || '').trim();
    const collectedDate = new Date(body.collectedAt || Date.now());
    const collectedAt = Number.isNaN(collectedDate.getTime()) ? new Date().toISOString() : collectedDate.toISOString();
    const rawItems = Array.isArray(body.items) ? body.items : (Array.isArray(body.keywords) ? body.keywords : []);
    const items = rawItems.map((item, index) => {
        const category = String(item.category || '').trim();
        const keyword = String(item.keyword || '').trim();
        if (!category || !keyword) return null;
        const change = normalizeChange(item);
        const order = Number(item.displayOrder ?? item.display_order ?? item.rank ?? item.position ?? index + 1);
        return { category, keyword, ...change, displayOrder: Number.isInteger(order) && order > 0 ? order : index + 1 };
    }).filter(Boolean);
    if (items.length && !/^\d{4}-\d{2}-\d{2}$/.test(trendDate)) throw new Error('trendDate must be YYYY-MM-DD when ingest items are provided');
    return { source, trendDate, collectedAt, items };
}

function toRows(payload) {
    return payload.items.map((item) => ({
        source: payload.source, trend_date: payload.trendDate, collected_at: payload.collectedAt,
        category: item.category, keyword: item.keyword, change_raw: item.changeRaw,
        change_type: item.changeType, change_amount: item.changeAmount, display_order: item.displayOrder,
        metadata: { category: item.category, keyword: item.keyword, variation: item.variation,
            change_raw: item.changeRaw, change_type: item.changeType, change_amount: item.changeAmount,
            display_order: item.displayOrder }
    }));
}

function dedupeRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        const key = [row.source, row.trend_date, row.category, row.keyword].join('\u0001');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function supabaseHeaders(config, schema = config.schema) {
    return {
        apikey: config.supabaseKey,
        authorization: `Bearer ${config.supabaseKey}`,
        'content-type': 'application/json',
        'accept-profile': schema,
        'content-profile': schema
    };
}

async function supabaseRequest(config, path, init = {}) {
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Supabase server configuration is missing');
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
        ...init, headers: { ...supabaseHeaders(config), ...(init.headers || {}) },
        signal: AbortSignal.timeout(7000)
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) throw new Error(body && typeof body === 'object' ? (body.message || `Supabase HTTP ${response.status}`) : `Supabase HTTP ${response.status}`);
    return body;
}

function postgrestFilter(filters) {
    const query = new URLSearchParams({
        select: 'source,trend_date,category,keyword,change_raw,change_type,change_amount,display_order,collected_at',
        order: 'trend_date.desc,category.asc,display_order.asc',
        limit: String(filters.limit)
    });
    if (filters.trendDate) query.set('trend_date', `eq.${filters.trendDate}`);
    if (filters.dateFrom) query.append('trend_date', `gte.${filters.dateFrom}`);
    if (filters.dateTo) query.append('trend_date', `lte.${filters.dateTo}`);
    if (filters.categories.length === 1) query.set('category', `eq.${filters.categories[0]}`);
    else if (filters.categories.length > 1) query.set('category', `in.(${filters.categories.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`);
    if (filters.keyword) query.set('keyword', `ilike.*${filters.keyword}*`);
    if (filters.source) query.set('source', `eq.${filters.source}`);
    if (filters.changeType) query.set('change_type', `eq.${filters.changeType}`);
    if (filters.changeAmountMin !== null) query.set('change_amount', `gte.${filters.changeAmountMin}`);
    if (filters.changeAmountMax !== null) query.append('change_amount', `lte.${filters.changeAmountMax}`);
    return query;
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function trendCsv(rows) {
    const fields = ['source', 'trend_date', 'category', 'keyword', 'change_raw', 'change_type', 'change_amount', 'display_order', 'collected_at'];
    return `${[fields.join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n')}\n`;
}

function downloadName(filters) {
    const from = filters.trendDate || filters.dateFrom || 'all';
    const to = filters.trendDate || filters.dateTo || 'latest';
    const category = filters.categories.length === 1 ? `-${filters.categories[0].replace(/\s+/g, '-')}` : (filters.categories.length > 1 ? '-multi' : '');
    const name = `naver-trends-${from}-${to}${category}.csv`;
    const ascii = name.normalize('NFKD').replace(/[^\x20-\x7E]+/g, '-').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'naver-trends.csv';
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function rateLimit(claims, config) {
    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000;
    const key = String(claims.sub);
    const current = readRateWindows.get(key);
    const count = current?.windowStart === windowStart ? current.count + 1 : 1;
    readRateWindows.set(key, { windowStart, count });
    if (readRateWindows.size > 10000) {
        for (const [entryKey, entry] of readRateWindows) if (entry.windowStart < windowStart) readRateWindows.delete(entryKey);
    }
    return { allowed: count <= config.readRateLimitPerMinute, retryAfter: Math.max(1, Math.ceil((windowStart + 60000 - now) / 1000)) };
}

async function readAccess(request, config) {
    if (hasInternalAccess(request, config)) return { type: 'internal' };
    const claims = await verifyReadToken(bearerToken(request), config);
    return claims ? { type: 'user', claims } : null;
}

function normalizeMeta(value) {
    const payload = Array.isArray(value) ? value[0] : value;
    const meta = payload && typeof payload === 'object' ? payload : {};
    const dateRange = meta.dateRange || meta.date_range || {};
    return {
        categories: (Array.isArray(meta.categories) ? meta.categories : []).map((v) => String(v || '').trim()).filter(Boolean),
        sources: (Array.isArray(meta.sources) ? meta.sources : []).map((v) => String(v || '').trim()).filter(Boolean),
        availableDates: (Array.isArray(meta.availableDates) ? meta.availableDates : (Array.isArray(meta.available_dates) ? meta.available_dates : [])).map((v) => String(v || '').trim()).filter(Boolean),
        dateRange: { min: dateRange.min ? String(dateRange.min) : null, max: dateRange.max ? String(dateRange.max) : null },
        totalRows: Math.max(0, Number.parseInt(meta.totalRows ?? meta.total_rows, 10) || 0)
    };
}

async function loadMeta(config, filters) {
    const key = JSON.stringify({ source: filters.source, trendDate: filters.trendDate, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
    const cached = metaCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return { value: cached.value, cache: 'hit' };
    if (cached?.pending) return { value: await cached.pending, cache: 'shared' };
    const entry = { expiresAt: 0, value: null };
    const pending = supabaseRequest(config, `rpc/${encodeURIComponent(config.metaFunction)}`, {
        method: 'POST', body: JSON.stringify({
            p_source: filters.source || null, p_trend_date: filters.trendDate || null,
            p_date_from: filters.dateFrom || null, p_date_to: filters.dateTo || null
        })
    }).then(normalizeMeta);
    entry.pending = pending;
    metaCache.set(key, entry);
    try {
        entry.value = await pending;
        entry.expiresAt = Date.now() + config.metaCacheTtlMs;
        delete entry.pending;
        if (metaCache.size > 64) metaCache.delete(metaCache.keys().next().value);
        return { value: entry.value, cache: 'miss' };
    } catch (error) {
        metaCache.delete(key);
        throw error;
    }
}

async function handleQuery(request, config, asCsv) {
    let filters;
    try { filters = normalizeFilters(new URL(request.url).searchParams, config); }
    catch (error) { return jsonResponse(400, { success: false, message: error.message }); }
    try {
        const rows = await supabaseRequest(config, `${encodeURIComponent(config.table)}?${postgrestFilter(filters)}`);
        if (asCsv) return new Response(trendCsv(Array.isArray(rows) ? rows : []), {
            status: 200,
            headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': downloadName(filters) }
        });
        return jsonResponse(200, { success: true, count: Array.isArray(rows) ? rows.length : 0, items: Array.isArray(rows) ? rows : [] });
    } catch (error) {
        console.error('[trends-api-workers] query failed', error.message);
        return jsonResponse(500, { success: false, message: `Trend query failed: ${error.message}` });
    }
}

async function handleMeta(request, config) {
    let filters;
    try { filters = normalizeFilters(new URL(request.url).searchParams, config); }
    catch (error) { return jsonResponse(400, { success: false, message: error.message }); }
    try {
        const { value, cache } = await loadMeta(config, filters);
        return jsonResponse(200, { success: true, ...value }, { 'x-trends-cache': cache });
    } catch (error) {
        console.error('[trends-api-workers] metadata failed', error.message);
        return jsonResponse(500, { success: false, message: `Trend meta failed: ${error.message}` });
    }
}

function publicCorsHeaders(origin) {
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        vary: 'Origin'
    };
}

function subscriptionCorsHeaders(origin) {
    return { ...publicCorsHeaders(origin), 'access-control-allow-methods': 'POST, OPTIONS' };
}

function publicOrigin(request, config) {
    const origin = String(request.headers.get('origin') || '').trim();
    if (origin && config.publicAllowedOrigins.has(origin)) return origin;
    return config.allowLocalPreview && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin) ? origin : '';
}

function publicRateLimit(request, config) {
    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000;
    const client = String(request.headers.get('cf-connecting-ip') || '').trim();
    if (!client) return { allowed: false, retryAfter: 60 };
    const key = `public:${client}`;
    const current = readRateWindows.get(key);
    const count = current?.windowStart === windowStart ? current.count + 1 : 1;
    readRateWindows.set(key, { windowStart, count });
    if (readRateWindows.size > 10000) {
        for (const [entryKey, entry] of readRateWindows) if (entry.windowStart < windowStart) readRateWindows.delete(entryKey);
    }
    return { allowed: count <= config.publicRateLimitPerMinute, retryAfter: Math.max(1, Math.ceil((windowStart + 60000 - now) / 1000)) };
}

function subscriptionRateLimit(request, config) {
    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000;
    const client = String(request.headers.get('cf-connecting-ip') || '').trim();
    if (!client) return { allowed: false, retryAfter: 60 };
    const key = `subscribe:${client}`;
    const current = readRateWindows.get(key);
    const count = current?.windowStart === windowStart ? current.count + 1 : 1;
    readRateWindows.set(key, { windowStart, count });
    if (readRateWindows.size > 10000) {
        for (const [entryKey, entry] of readRateWindows) if (entry.windowStart < windowStart) readRateWindows.delete(entryKey);
    }
    return { allowed: count <= config.subscribeRateLimitPerMinute, retryAfter: Math.max(1, Math.ceil((windowStart + 60000 - now) / 1000)) };
}

async function readBoundedJson(request, maxBytes) {
    const reader = request.body?.getReader();
    if (!reader) return {};
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error('Request body is too large');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
}

async function handlePublicSubscription(request, config, path, origin) {
    const headers = subscriptionCorsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed' }, { ...headers, allow: 'POST, OPTIONS' });
    const rate = subscriptionRateLimit(request, config);
    if (!rate.allowed) return jsonResponse(429, { success: false, message: '요청이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.' }, { ...headers, 'retry-after': String(rate.retryAfter) });
    let functionUrl;
    try { functionUrl = new URL(config.newsletterFunctionUrl); } catch {}
    if (!functionUrl || functionUrl.protocol !== 'https:' || !functionUrl.hostname.endsWith('.supabase.co') || functionUrl.pathname !== '/functions/v1/trends-mailing-list' || functionUrl.search || functionUrl.username || !config.newsletterWorkerToken) {
        console.error('[trends-api-workers] newsletter integration is not configured');
        return jsonResponse(503, { success: false, message: '구독 기능을 일시적으로 사용할 수 없습니다.' }, headers);
    }
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 4096) return jsonResponse(413, { success: false, message: 'Request body is too large' }, headers);
    if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return jsonResponse(415, { success: false, message: 'Expected application/json' }, headers);
    let body;
    try { body = await readBoundedJson(request, 4096); }
    catch (error) {
        if (error.message === 'Request body is too large') return jsonResponse(413, { success: false, message: error.message }, headers);
        return jsonResponse(400, { success: false, message: '올바른 요청이 아닙니다.' }, headers);
    }
    let payload;
    if (path.endsWith('/confirm') || path.endsWith('/confirm/preview') || path.endsWith('/unsubscribe')) {
        const token = String(body?.token || '').trim();
        if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return jsonResponse(400, { success: false, message: '유효하지 않거나 만료된 링크입니다.' }, headers);
        const isConfirm = path.includes('/confirm');
        const isPreview = path.endsWith('/confirm/preview');
        const categories = Array.isArray(body?.categories) ? [...new Set(body.categories.map((value) => String(value).trim()))] : [];
        const hasCategories = body?.categories !== undefined;
        if (!isPreview && isConfirm && hasCategories && (categories.length < 1 || categories.length > 10 || categories.some((value) => !NEWSLETTER_CATEGORIES.has(value)))) {
            return jsonResponse(400, { success: false, message: '카테고리를 1개 이상 선택해 주세요.' }, headers);
        }
        payload = { action: isPreview ? 'preview_confirmation' : isConfirm ? 'confirm' : 'unsubscribe', token, ...(isConfirm && !isPreview && hasCategories ? { categories } : {}) };
    } else {
        const email = String(body?.email || '').trim().toLowerCase();
        const categories = Array.isArray(body?.categories) ? [...new Set(body.categories.map((value) => String(value).trim()))] : [];
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || categories.length < 1 || categories.length > 10 || categories.some((value) => !NEWSLETTER_CATEGORIES.has(value))) {
            return jsonResponse(400, { success: false, message: '이메일 주소와 카테고리를 확인해 주세요.' }, headers);
        }
        if (body?.consent !== true) return jsonResponse(400, { success: false, message: '이메일 수신 동의가 필요합니다.' }, headers);
        payload = { action: 'subscribe', email, categories, consent: true };
    }
    try {
        const response = await fetch(functionUrl.toString(), {
            method: 'POST', headers: { authorization: `Bearer ${config.newsletterWorkerToken}`, 'content-type': 'application/json' },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(12000)
        });
        let result = {};
        try { result = await response.json(); } catch {}
        if (!response.ok) {
            console.error('[trends-api-workers] newsletter backend rejected request', response.status, result?.error || 'unknown');
            return jsonResponse(response.status === 400 ? 400 : 503, { success: false, message: response.status === 400 ? '입력한 정보를 확인해 주세요.' : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, headers);
        }
        return jsonResponse(200, { success: true, message: String(result.message || '요청을 처리했습니다.'), ...(Array.isArray(result.categories) ? { categories: result.categories } : {}) }, headers);
    } catch (error) {
        console.error('[trends-api-workers] newsletter backend unavailable', error.message);
        return jsonResponse(503, { success: false, message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, headers);
    }
}

function publicFilters(params, config) {
    const allowed = new Set(['trend_date', 'category']);
    for (const key of params.keys()) if (!allowed.has(key)) throw new Error(`Unsupported public filter: ${key}`);
    const dates = params.getAll('trend_date');
    if (dates.length !== 1) throw new Error('trend_date is required');
    const trendDate = normalizeYmd(dates[0], 'trend_date');
    if (!trendDate) throw new Error('trend_date is required');
    const categories = [...new Set(params.getAll('category').map((value) => value.trim()).filter(Boolean))];
    if (!categories.length || categories.length > 3) throw new Error('Select between one and three categories');
    if (categories.some((value) => value.length > 40 || /[\u0000-\u001f,"'()\\%*]/.test(value))) throw new Error('Invalid category');
    return {
        trendDate, dateFrom: '', dateTo: '', categories,
        keyword: '', source: 'naver_creator_advisor', changeType: '', changeAmountMin: null,
        changeAmountMax: null, limit: Math.min(150, config.exportMaxRows)
    };
}

async function handlePublicTrends(request, config, path, origin) {
    const headers = { ...publicCorsHeaders(origin), 'cache-control': 'public, max-age=60, s-maxage=60' };
    const url = new URL(request.url);
    if (path.endsWith('/recommendations')) {
        if ([...url.searchParams.keys()].some((key) => key !== 'limit')) return jsonResponse(400, { success: false, message: 'Unsupported recommendation filter' }, headers);
        const requested = Number(url.searchParams.get('limit') || 2);
        if (!Number.isInteger(requested) || requested < 1 || requested > 2) return jsonResponse(400, { success: false, message: 'Recommendation limit must be one or two' }, headers);
        try {
            const items = await loadPublicBlogRecommendations(config.publicBlogFeeds, requested);
            return jsonResponse(200, { success: true, items }, { ...headers, 'cache-control': 'public, max-age=300, s-maxage=300' });
        } catch (error) {
            console.error('[trends-api-workers] public recommendations failed', error.message);
            return jsonResponse(200, { success: true, items: [] }, headers);
        }
    }
    if (path.endsWith('/meta')) {
        if ([...url.searchParams.keys()].length) return jsonResponse(400, { success: false, message: 'Public metadata does not accept filters' }, headers);
        try {
            const { value, cache } = await loadMeta(config, {
                source: 'naver_creator_advisor', trendDate: '', dateFrom: '', dateTo: ''
            });
            return jsonResponse(200, {
                success: true,
                categories: value.categories,
                availableDates: value.availableDates,
                dateRange: value.dateRange
            }, { ...headers, 'x-trends-cache': cache });
        } catch (error) {
            console.error('[trends-api-workers] public metadata failed', error.message);
            return jsonResponse(503, { success: false, message: 'Trend metadata is temporarily unavailable' }, headers);
        }
    }
    let filters;
    try { filters = publicFilters(url.searchParams, config); }
    catch (error) { return jsonResponse(400, { success: false, message: error.message }, headers); }
    try {
        const rows = await supabaseRequest(config, `${encodeURIComponent(config.table)}?${postgrestFilter(filters)}`);
        return jsonResponse(200, { success: true, count: Array.isArray(rows) ? rows.length : 0, items: Array.isArray(rows) ? rows : [] }, headers);
    } catch (error) {
        console.error('[trends-api-workers] public query failed', error.message);
        return jsonResponse(503, { success: false, message: 'Trend data is temporarily unavailable' }, headers);
    }
}

async function loadPublicBlogRecommendations(configuredFeeds, limit) {
    let feeds;
    try { feeds = JSON.parse(configuredFeeds); } catch { throw new Error('Invalid public RSS feed configuration'); }
    if (!Array.isArray(feeds) || feeds.length < 1 || feeds.length > 8) throw new Error('Missing public RSS feed configuration');
    const feedResults = await Promise.all(feeds.map(async (feed) => {
        let feedUrl, siteUrl;
        try { feedUrl = new URL(feed.feedUrl); siteUrl = new URL(feed.siteUrl); } catch { return []; }
        if (feedUrl.protocol !== 'https:' || siteUrl.protocol !== 'https:' || feedUrl.username || feedUrl.password || siteUrl.username || siteUrl.password) return [];
        try {
            const response = await fetch(feedUrl, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000) });
            if (!response.ok) return [];
            const xml = await response.text();
            const source = { name: String(feed.name || 'BlogGenius').slice(0, 80), host: siteUrl.hostname, pathPrefix: siteUrl.pathname.replace(/\/$/, '') };
            return parseRssFeed(xml, source, { maxItems: 20, maxBytes: 1_000_000 });
        } catch { return []; /* An unavailable feed should not hide the trends. */ }
    }));
    const candidates = feedResults.flat();
    const unique = [...new Map(candidates.map((item) => [item.url, item])).values()];
    const selected = [];
    while (unique.length && selected.length < limit) selected.push(unique.splice(Math.floor(Math.random() * unique.length), 1)[0]);
    return selected;
}

async function handleIngest(request, config) {
    if (!hasInternalAccess(request, config)) return jsonResponse(401, { success: false, message: 'Unauthorized' });
    const requestEnvironment = String(request.headers.get('x-trends-environment') || '').trim().toLowerCase();
    if (config.environment && requestEnvironment !== config.environment) return jsonResponse(409, { success: false, message: 'Trends environment target mismatch' });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > config.bodyMaxBytes) return jsonResponse(413, { success: false, message: `Request body exceeds ${config.bodyMaxBytes} bytes` });
    let body;
    try {
        const reader = request.body?.getReader();
        const chunks = [];
        let totalBytes = 0;
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.byteLength;
                if (totalBytes > config.bodyMaxBytes) {
                    await reader.cancel();
                    return jsonResponse(413, { success: false, message: `Request body exceeds ${config.bodyMaxBytes} bytes` });
                }
                chunks.push(value);
            }
        }
        const bytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder().decode(bytes);
        body = text.trim() ? JSON.parse(text) : {};
    } catch (error) { return jsonResponse(400, { success: false, message: `Invalid JSON body: ${error.message}` }); }
    let payload;
    try { payload = normalizeIngest(body); }
    catch (error) { return jsonResponse(400, { success: false, message: error.message }); }
    const mapped = toRows(payload);
    const rows = dedupeRows(mapped);
    const duplicatesCollapsed = mapped.length - rows.length;
    if (!rows.length) return jsonResponse(200, { success: true, accepted: 0, uniqueRows: 0, inserted: 0, updated: 0, duplicatesCollapsed: 0, trendDate: payload.trendDate || null });
    try {
        const first = rows[0];
        const existingQuery = new URLSearchParams({ select: 'source,trend_date,category,keyword', source: `eq.${first.source}`, trend_date: `eq.${first.trend_date}` });
        const categories = [...new Set(rows.map((row) => row.category))];
        if (categories.length === 1) existingQuery.set('category', `eq.${categories[0]}`);
        else existingQuery.set('category', `in.(${categories.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`);
        const existing = await supabaseRequest(config, `${encodeURIComponent(config.table)}?${existingQuery}`);
        const existingKeys = new Set((existing || []).map((row) => [row.source, row.trend_date, row.category, row.keyword].join('\u0001')));
        const updated = rows.filter((row) => existingKeys.has([row.source, row.trend_date, row.category, row.keyword].join('\u0001'))).length;
        const upsertQuery = new URLSearchParams({ on_conflict: config.conflict });
        await supabaseRequest(config, `${encodeURIComponent(config.table)}?${upsertQuery}`, {
            method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows)
        });
        metaCache.clear();
        return jsonResponse(200, { success: true, accepted: mapped.length, uniqueRows: rows.length, inserted: rows.length - updated, updated, duplicatesCollapsed, trendDate: payload.trendDate });
    } catch (error) {
        console.error('[trends-api-workers] ingest failed', error.message);
        return jsonResponse(500, { success: false, message: `Supabase upsert failed: ${error.message}` });
    }
}

async function handleNewsletterCollectionComplete(request, config, env) {
    if (!hasInternalAccess(request, config)) return jsonResponse(401, { success: false, message: 'Unauthorized' });
    const requestEnvironment = String(request.headers.get('x-trends-environment') || '').trim().toLowerCase();
    if (!config.environment || requestEnvironment !== config.environment) {
        return jsonResponse(409, { success: false, message: 'Trends environment target mismatch' });
    }
    let body;
    try { body = await request.json(); }
    catch { return jsonResponse(400, { success: false, message: 'Invalid JSON body' }); }

    let trendDate;
    try { trendDate = normalizeYmd(body?.trendDate, 'trendDate'); }
    catch { return jsonResponse(400, { success: false, message: 'trendDate must be YYYY-MM-DD' }); }
    const signalId = String(body?.runId || body?.signalId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(signalId)) {
        return jsonResponse(400, { success: false, message: 'signalId must be a UUID' });
    }
    if (body?.forceResend !== undefined && typeof body.forceResend !== 'boolean') {
        return jsonResponse(400, { success: false, message: 'forceResend must be a boolean when provided' });
    }
    if (config.environment === 'production' && body?.forceResend === true) {
        return jsonResponse(403, { success: false, message: 'Newsletter resend is not enabled for Production' });
    }
    const status = String(body?.status || 'collected');
    const expectedTotal = config.newsletterExpectedCategories * config.newsletterItemsPerCategory;
    const validFailure = status === 'failed' && typeof body?.stage === 'string' && typeof body?.error === 'string';
    const validSuccess = status === 'collected'
        && Number(body?.expectedCategories) === config.newsletterExpectedCategories
        && Number(body?.itemsPerCategory) === config.newsletterItemsPerCategory
        && Number(body?.itemCount) === expectedTotal;
    if (!trendDate || body?.environment !== config.environment || body?.source !== 'naver_creator_advisor' || (!validFailure && !validSuccess)) {
        return jsonResponse(400, { success: false, message: 'Collection completion signal does not match the configured dataset contract' });
    }
    if (!env.TRENDS_NEWSLETTER_COLLECTION_WORKFLOW?.create) {
        console.error('[trends-api-workers] newsletter collection Workflow binding is unavailable');
        return jsonResponse(503, { success: false, message: 'Newsletter collection workflow is unavailable' });
    }

    try {
        const instanceId = `collection-${trendDate}-${signalId}`;
        let instance;
        let duplicate = false;
        try {
            instance = await env.TRENDS_NEWSLETTER_COLLECTION_WORKFLOW.create({
                id: instanceId,
                params: {
                    environment: config.environment,
                    trendDate,
                    signalId: signalId || null,
                    source: 'naver_creator_advisor',
                    signalItemCount: status === 'collected' ? expectedTotal : 0,
                    runStatus: status,
                    failureStage: validFailure ? body.stage.slice(0, 80) : null,
                    failureSummary: validFailure ? body.error.slice(0, 500) : null,
                    forceResend: body.forceResend === true
                }
            });
        } catch {
            instance = await env.TRENDS_NEWSLETTER_COLLECTION_WORKFLOW.get(instanceId);
            const state = await instance.status();
            if (state?.status === 'errored' || state?.status === 'terminated') {
                await instance.restart();
            } else {
                duplicate = true;
            }
        }
        return jsonResponse(202, { success: true, accepted: true, duplicate, workflowId: instance.id || instanceId, trendDate });
    } catch (error) {
        console.error('[trends-api-workers] newsletter collection Workflow trigger failed', error.message);
        return jsonResponse(503, { success: false, message: 'Newsletter collection workflow could not be started' });
    }
}

async function handleNewsletterCanary(request, config, env) {
    if (config.environment !== 'production' || !config.newsletterCanaryToken
        || !constantTimeEquals(bearerToken(request), config.newsletterCanaryToken)) {
        return jsonResponse(401, { success: false, message: 'Unauthorized' });
    }
    let body;
    try { body = await request.json(); } catch { return jsonResponse(400, { success: false, message: 'Invalid JSON body' }); }
    let trendDate;
    try { trendDate = normalizeYmd(body?.trendDate, 'trendDate'); }
    catch { return jsonResponse(400, { success: false, message: 'trendDate must be YYYY-MM-DD' }); }
    const signalId = String(body?.signalId || '').trim().toLowerCase();
    const releaseSha = String(body?.releaseSha || '').trim().toLowerCase();
    if (!trendDate || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(signalId)) {
        return jsonResponse(400, { success: false, message: 'Invalid canary date or signal ID' });
    }
    if (!/^[0-9a-f]{40}$/.test(releaseSha)) return jsonResponse(400, { success: false, message: 'Invalid canary release SHA' });
    const workflow = env.TRENDS_NEWSLETTER_COLLECTION_WORKFLOW;
    if (!workflow?.create || !workflow?.get) return jsonResponse(503, { success: false, message: 'Newsletter canary workflow is unavailable' });
    const instanceId = `canary-${signalId}`;
    try {
        let instance;
        let duplicate = false;
        try {
            instance = await workflow.create({ id: instanceId, params: {
                environment: 'production', mode: 'canary', trendDate, signalId,
                releaseSha,
                source: 'naver_creator_advisor', signalItemCount: config.newsletterExpectedCategories * config.newsletterItemsPerCategory,
                runStatus: 'collected'
            } });
        } catch {
            instance = await workflow.get(instanceId);
            const state = await instance.status();
            if (state?.status === 'errored' || state?.status === 'terminated') await instance.restart();
            else duplicate = true;
        }
        return jsonResponse(202, { success: true, accepted: true, duplicate, signalId, workflowId: instance.id || instanceId });
    } catch (error) {
        console.error('[trends-api-workers] production newsletter canary trigger failed', error.message);
        return jsonResponse(503, { success: false, message: 'Newsletter canary could not be started' });
    }
}

async function handleNewsletterCanaryStatus(request, config, env, signalId) {
    if (config.environment !== 'production' || !config.newsletterCanaryToken
        || !constantTimeEquals(bearerToken(request), config.newsletterCanaryToken)) {
        return jsonResponse(401, { success: false, message: 'Unauthorized' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(signalId)) {
        return jsonResponse(400, { success: false, message: 'Invalid canary signal ID' });
    }
    try {
        const instance = await env.TRENDS_NEWSLETTER_COLLECTION_WORKFLOW?.get(`canary-${signalId}`);
        if (!instance) return jsonResponse(404, { success: false, message: 'Canary not found' });
        const state = await instance.status();
        return jsonResponse(200, { success: true, signalId, status: state?.status || 'unknown', result: state?.output || null });
    } catch {
        return jsonResponse(404, { success: false, message: 'Canary not found' });
    }
}

export async function handleRequest(request, env) {
    const config = getConfig(env);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'GET' && url.pathname === '/health') {
        return jsonResponse(200, { success: true, service: 'trends-api', environment: config.environment || 'unselected' });
    }
    if (PUBLIC_TRENDS_PATHS.has(url.pathname)) {
        const origin = publicOrigin(request, config);
        if (!origin) return jsonResponse(403, { success: false, message: 'Origin is not allowed' }, { vary: 'Origin' });
        if (method === 'OPTIONS') return new Response(null, { status: 204, headers: publicCorsHeaders(origin) });
        if (method !== 'GET') return jsonResponse(405, { success: false, message: 'Method not allowed' }, { ...publicCorsHeaders(origin), allow: 'GET, OPTIONS' });
        const rate = publicRateLimit(request, config);
        if (!rate.allowed) return jsonResponse(429, { success: false, message: 'Too many requests' }, { ...publicCorsHeaders(origin), 'retry-after': String(rate.retryAfter) });
        return handlePublicTrends(request, config, url.pathname, origin);
    }
    if (PUBLIC_SUBSCRIPTION_PATHS.has(url.pathname)) {
        const origin = publicOrigin(request, config);
        if (!origin) return jsonResponse(403, { success: false, message: 'Origin is not allowed' }, { vary: 'Origin' });
        return handlePublicSubscription(request, config, url.pathname, origin);
    }
    if (method === 'POST' && url.pathname === '/internal/ingest/naver-trends') return handleIngest(request, config);
    if (method === 'POST' && url.pathname === '/internal/newsletter/canary') return handleNewsletterCanary(request, config, env);
    const canaryStatusMatch = method === 'GET' && url.pathname.match(/^\/internal\/newsletter\/canary\/([0-9a-f-]{36})\/status$/i);
    if (canaryStatusMatch) return handleNewsletterCanaryStatus(request, config, env, canaryStatusMatch[1].toLowerCase());
    if (method === 'POST' && ['/internal/newsletter/collection-complete', '/internal/newsletter/collector-run'].includes(url.pathname)) return handleNewsletterCollectionComplete(request, config, env);
    if (method === 'GET' && ['/api/v1/trends', '/api/v1/trends/meta', '/exports/trends.csv', '/exports/trends.xlsx'].includes(url.pathname)) {
        const internalRoute = url.pathname.startsWith('/exports/');
        const access = await readAccess(request, config);
        if (!access || (internalRoute && access.type !== 'internal')) return jsonResponse(401, { success: false, message: 'Unauthorized' });
        if (!internalRoute && access.type === 'user') {
            const rate = rateLimit(access.claims, config);
            if (!rate.allowed) return jsonResponse(429, { success: false, message: 'Too many requests' }, { 'retry-after': String(rate.retryAfter) });
        }
        if (url.pathname === '/api/v1/trends/meta') return handleMeta(request, config);
        if (url.pathname === '/exports/trends.xlsx') return jsonResponse(501, { success: false, message: 'XLSX export is not implemented yet. Use /exports/trends.csv for now.' });
        return handleQuery(request, config, url.pathname === '/exports/trends.csv');
    }
    return jsonResponse(404, { success: false, message: 'Not found' });
}

export default { fetch: handleRequest };
