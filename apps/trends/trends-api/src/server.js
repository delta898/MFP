const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFiles } = require('../../shared/lib/load-env');
const { normalizeCollectedTrendItem } = require('../../../../shared/naver-trends-core');

const VALID_CHANGE_TYPES = new Set(['up', 'down', 'new', 'steady']);

loadEnvFiles({ baseDir: path.resolve(__dirname, '../..'), fileNames: ['.env'] });

function toInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIsoTimestamp(input) {
    const parsed = new Date(input || Date.now());
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString();
    }
    return parsed.toISOString();
}

function resolveApiConfig(env = process.env) {
    return {
        host: String(env.TRENDS_API_HOST || '127.0.0.1').trim() || '127.0.0.1',
        port: Math.max(1, toInt(env.TRENDS_API_PORT, 4581)),
        internalToken: String(env.TRENDS_API_TOKEN || '').trim(),
        readTokenSecret: String(env.TRENDS_READ_TOKEN_SECRET || '').trim(),
        readTokenIssuer: String(env.TRENDS_READ_TOKEN_ISSUER || 'bloggenius-license').trim() || 'bloggenius-license',
        readTokenAudience: String(env.TRENDS_READ_TOKEN_AUDIENCE || 'trends-api').trim() || 'trends-api',
        readRateLimitPerMinute: Math.max(1, toInt(env.TRENDS_API_READ_RATE_LIMIT_PER_MINUTE, 120)),
        supabaseUrl: String(env.SUPABASE_URL || '').trim(),
        supabaseAdminKey: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
        supabaseSchema: String(env.TRENDS_SUPABASE_SCHEMA || 'trends').trim() || 'trends',
        supabaseTable: String(env.TRENDS_SUPABASE_TABLE || 'items').trim() || 'items',
        onConflict: String(env.TRENDS_SUPABASE_ON_CONFLICT || 'source,trend_date,category,keyword').trim() || 'source,trend_date,category,keyword',
        exportMaxRows: Math.max(1, toInt(env.TRENDS_EXPORT_MAX_ROWS, 5000)),
        metaFunction: String(env.TRENDS_SUPABASE_META_FUNCTION || 'get_items_meta').trim() || 'get_items_meta',
        metaCacheTtlMs: Math.max(1000, toInt(env.TRENDS_META_CACHE_TTL_MS, 300000)),
        maxConcurrentRequests: Math.max(1, toInt(env.TRENDS_API_MAX_CONCURRENT_REQUESTS, 8)),
        requestBodyMaxBytes: Math.max(1024, toInt(env.TRENDS_API_MAX_BODY_BYTES, 1048576)),
        requestTimeoutMs: Math.max(1000, toInt(env.TRENDS_API_REQUEST_TIMEOUT_MS, 30000)),
        upstreamTimeoutMs: Math.max(1000, toInt(env.TRENDS_API_UPSTREAM_TIMEOUT_MS, 7000))
    };
}

function createSupabaseAdminClient(config = {}) {
    if (!config.supabaseUrl || !config.supabaseAdminKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required');
    }
    return createClient(config.supabaseUrl, config.supabaseAdminKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        },
        global: {
            fetch: (input, init = {}) => {
                const timeoutSignal = AbortSignal.timeout(config.upstreamTimeoutMs || 7000);
                const signal = init.signal
                    ? AbortSignal.any([init.signal, timeoutSignal])
                    : timeoutSignal;
                return fetch(input, {
                    ...init,
                    signal
                });
            }
        }
    });
}

function getTrendItemsQuery(config = {}) {
    return createSupabaseAdminClient(config)
        .schema(config.supabaseSchema)
        .from(config.supabaseTable);
}

function normalizeOptionalYmd(value, fieldName) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error(`${fieldName} must be YYYY-MM-DD`);
    }
    return text;
}

function normalizeOptionalText(value) {
    return String(value || '').trim();
}

function normalizeCategoryList(searchParams) {
    const params = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(searchParams || '');
    const rawValues = [
        ...params.getAll('category'),
        ...params.getAll('categories')
            .flatMap((value) => String(value || '').split(','))
    ];
    const tokens = rawValues
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    if (tokens.length === 0) return [];
    if (tokens.some((token) => {
        const lowered = token.toLowerCase();
        return lowered === 'all' || token === '*';
    })) {
        return [];
    }

    return Array.from(new Set(tokens));
}

function normalizeOptionalInteger(value, fieldName) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (!/^-?\d+$/.test(text)) {
        throw new Error(`${fieldName} must be an integer`);
    }
    return parseInt(text, 10);
}

function normalizeOptionalChangeType(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    if (!VALID_CHANGE_TYPES.has(text)) {
        throw new Error('change_type must be one of: up, down, new, steady');
    }
    return text;
}

function resolveTrendQueryParams(searchParams, config = {}) {
    const params = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(searchParams || '');

    const trendDate = normalizeOptionalYmd(params.get('trend_date'), 'trend_date');
    const dateFrom = normalizeOptionalYmd(params.get('date_from'), 'date_from');
    const dateTo = normalizeOptionalYmd(params.get('date_to'), 'date_to');
    const categories = normalizeCategoryList(params);
    const keyword = normalizeOptionalText(params.get('keyword'));
    const source = normalizeOptionalText(params.get('source'));
    const changeType = normalizeOptionalChangeType(params.get('change_type'));
    const changeAmountMin = normalizeOptionalInteger(params.get('change_amount_min'), 'change_amount_min');
    const changeAmountMax = normalizeOptionalInteger(params.get('change_amount_max'), 'change_amount_max');
    const limit = Math.min(config.exportMaxRows || 5000, Math.max(1, toInt(params.get('limit'), 500)));

    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new Error('date_from must be earlier than or equal to date_to');
    }
    if (changeAmountMin !== null && changeAmountMax !== null && changeAmountMin > changeAmountMax) {
        throw new Error('change_amount_min must be less than or equal to change_amount_max');
    }

    return {
        trendDate,
        dateFrom,
        dateTo,
        categories,
        category: categories.length === 1 ? categories[0] : '',
        keyword,
        source,
        changeType,
        changeAmountMin,
        changeAmountMax,
        limit
    };
}

function normalizeIngestPayload(payload = {}) {
    const source = String(payload.source || 'naver_creator_advisor').trim() || 'naver_creator_advisor';
    const trendDate = String(payload.trendDate || payload.date || '').trim();
    const collectedAt = normalizeIsoTimestamp(payload.collectedAt);
    const rawItems = Array.isArray(payload.items)
        ? payload.items
        : (Array.isArray(payload.keywords) ? payload.keywords : []);
    const items = rawItems
        .map((item, index) => normalizeCollectedTrendItem(item, index))
        .filter(Boolean);

    if (items.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(trendDate)) {
        throw new Error('trendDate must be YYYY-MM-DD when ingest items are provided');
    }

    return {
        source,
        trendDate,
        collectedAt,
        items
    };
}

function mapPayloadToTrendRows(payload = {}) {
    const normalized = normalizeIngestPayload(payload);
    return normalized.items.map((item, index) => ({
        source: normalized.source,
        trend_date: normalized.trendDate,
        collected_at: normalized.collectedAt,
        category: item.category,
        keyword: item.keyword,
        change_raw: item.changeRaw,
        change_type: item.changeType,
        change_amount: item.changeAmount,
        display_order: Number(item.displayOrder || (index + 1)),
        metadata: {
            category: item.category,
            keyword: item.keyword,
            variation: item.variation,
            change_raw: item.changeRaw,
            change_type: item.changeType,
            change_amount: item.changeAmount,
            display_order: Number(item.displayOrder || (index + 1))
        }
    }));
}

function dedupeTrendRows(rows = []) {
    const deduped = [];
    const seen = new Set();
    for (const row of rows) {
        const key = [
            String(row?.source || '').trim(),
            String(row?.trend_date || '').trim(),
            String(row?.category || '').trim(),
            String(row?.keyword || '').trim()
        ].join('\u0001');
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(row);
    }
    return deduped;
}

function buildTrendConflictKey(row = {}) {
    return [
        String(row?.source || '').trim(),
        String(row?.trend_date || '').trim(),
        String(row?.category || '').trim(),
        String(row?.keyword || '').trim()
    ].join('\u0001');
}

function countExistingTrendRows(rows = [], existingRows = []) {
    const existingKeys = new Set(existingRows.map((row) => buildTrendConflictKey(row)));
    return rows.reduce((count, row) => (
        existingKeys.has(buildTrendConflictKey(row)) ? count + 1 : count
    ), 0);
}

async function fetchExistingTrendRows(config = {}, rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const source = String(rows[0]?.source || '').trim();
    const trendDate = String(rows[0]?.trend_date || '').trim();
    const categories = Array.from(new Set(
        rows.map((row) => String(row?.category || '').trim()).filter(Boolean)
    ));

    let query = getTrendItemsQuery(config)
        .select('source, trend_date, category, keyword')
        .eq('source', source)
        .eq('trend_date', trendDate);

    if (categories.length === 1) {
        query = query.eq('category', categories[0]);
    } else if (categories.length > 1) {
        query = query.in('category', categories);
    }

    const { data, error } = await query;
    if (error) {
        throw error;
    }

    return Array.isArray(data) ? data : [];
}

function escapeCsvCell(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function toTrendCsv(rows = []) {
    const headers = ['source', 'trend_date', 'category', 'keyword', 'change_raw', 'change_type', 'change_amount', 'display_order', 'collected_at'];
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((header) => escapeCsvCell(row?.[header] ?? '')).join(','));
    }
    return `${lines.join('\n')}\n`;
}

function buildTrendExportFileName(filters = {}, extension = 'csv') {
    const from = filters.trendDate || filters.dateFrom || 'all';
    const to = filters.trendDate || filters.dateTo || 'latest';
    const category = Array.isArray(filters.categories) && filters.categories.length === 1
        ? `-${filters.categories[0].replace(/\s+/g, '-')}`
        : (Array.isArray(filters.categories) && filters.categories.length > 1 ? '-multi' : '');
    return `naver-trends-${from}-${to}${category}.${extension}`;
}

function toAsciiDownloadFileName(fileName, fallback = 'naver-trends.csv') {
    const normalized = String(fileName || '').normalize('NFKD');
    const ascii = normalized
        .replace(/[^\x20-\x7E]+/g, '-')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return ascii || fallback;
}

function encodeContentDispositionFilename(fileName) {
    return encodeURIComponent(String(fileName || ''))
        .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildDownloadContentDisposition(fileName) {
    const safeFileName = String(fileName || 'naver-trends.csv');
    const asciiFileName = toAsciiDownloadFileName(safeFileName, 'naver-trends.csv');
    return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeContentDispositionFilename(safeFileName)}`;
}

function normalizeMetaPayload(payload = {}) {
    const value = Array.isArray(payload) ? payload[0] : payload;
    const normalized = value && typeof value === 'object' ? value : {};
    const categories = Array.isArray(normalized.categories) ? normalized.categories : [];
    const sources = Array.isArray(normalized.sources) ? normalized.sources : [];
    const availableDates = Array.isArray(normalized.availableDates)
        ? normalized.availableDates
        : (Array.isArray(normalized.available_dates) ? normalized.available_dates : []);
    const dateRange = normalized.dateRange && typeof normalized.dateRange === 'object'
        ? normalized.dateRange
        : (normalized.date_range && typeof normalized.date_range === 'object' ? normalized.date_range : {});

    return {
        categories: categories.map((value) => String(value || '').trim()).filter(Boolean),
        sources: sources.map((value) => String(value || '').trim()).filter(Boolean),
        availableDates: availableDates.map((value) => String(value || '').trim()).filter(Boolean),
        dateRange: {
            min: dateRange.min ? String(dateRange.min) : null,
            max: dateRange.max ? String(dateRange.max) : null
        },
        totalRows: Math.max(0, toInt(normalized.totalRows ?? normalized.total_rows, 0))
    };
}

function createExpiringSingleFlightCache(ttlMs) {
    let cachedValue = null;
    let expiresAt = 0;
    let pending = null;

    return {
        async getOrLoad(loader) {
            const now = Date.now();
            if (cachedValue !== null && now < expiresAt) {
                return { value: cachedValue, cacheStatus: 'hit' };
            }
            if (pending) {
                return { value: await pending, cacheStatus: 'shared' };
            }

            pending = Promise.resolve().then(loader);
            try {
                cachedValue = await pending;
                expiresAt = Date.now() + ttlMs;
                return { value: cachedValue, cacheStatus: 'miss' };
            } finally {
                pending = null;
            }
        },
        clear() {
            cachedValue = null;
            expiresAt = 0;
        }
    };
}

function createConcurrencyGate(limit) {
    let active = 0;
    return {
        tryEnter() {
            if (active >= limit) return false;
            active += 1;
            return true;
        },
        leave() {
            active = Math.max(0, active - 1);
        }
    };
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function sendText(res, statusCode, body, headers = {}) {
    const text = String(body || '');
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
        ...headers
    });
    res.end(text);
}

async function readJsonBody(req, maxBytes = 1048576) {
    const contentLength = toInt(req.headers['content-length'], 0);
    if (contentLength > maxBytes) {
        const error = new Error(`Request body exceeds ${maxBytes} bytes`);
        error.code = 'BODY_TOO_LARGE';
        throw error;
    }

    const chunks = [];
    let receivedBytes = 0;
    for await (const chunk of req) {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
            const error = new Error(`Request body exceeds ${maxBytes} bytes`);
            error.code = 'BODY_TOO_LARGE';
            throw error;
        }
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
}

function safeTokenEquals(actual, expected) {
    const actualBuffer = Buffer.isBuffer(actual) ? actual : Buffer.from(String(actual || ''));
    const expectedBuffer = Buffer.isBuffer(expected) ? expected : Buffer.from(String(expected || ''));
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function extractBearerToken(req) {
    const authHeader = String(req?.headers?.authorization || '').trim();
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? String(match[1] || '').trim() : '';
}

function toBase64Url(value) {
    return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(value) {
    const normalized = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return null;
    try {
        return Buffer.from(normalized.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    } catch (_error) {
        return null;
    }
}

function createTrendReadToken(claims = {}, secret = '') {
    const normalizedSecret = String(secret || '').trim();
    if (!normalizedSecret) throw new Error('read token secret is required');

    const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = toBase64Url(JSON.stringify(claims || {}));
    const signingInput = `${header}.${payload}`;
    const signature = crypto.createHmac('sha256', normalizedSecret).update(signingInput).digest();
    return `${signingInput}.${toBase64Url(signature)}`;
}

function verifyTrendReadToken(token, config = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
    const secret = String(config.readTokenSecret || '').trim();
    if (!secret) return null;

    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;

    const [headerPart, payloadPart, signaturePart] = parts;
    const headerBuffer = fromBase64Url(headerPart);
    const payloadBuffer = fromBase64Url(payloadPart);
    const providedSignature = fromBase64Url(signaturePart);
    if (!headerBuffer || !payloadBuffer || !providedSignature) return null;

    let header;
    let claims;
    try {
        header = JSON.parse(headerBuffer.toString('utf8'));
        claims = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (_error) {
        return null;
    }

    if (!header || header.alg !== 'HS256' || !claims || typeof claims !== 'object' || Array.isArray(claims)) return null;

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${headerPart}.${payloadPart}`)
        .digest();
    if (!safeTokenEquals(providedSignature, expectedSignature)) return null;

    const expiresAt = Number(claims.exp);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) return null;
    if (String(claims.iss || '') !== String(config.readTokenIssuer || 'bloggenius-license')) return null;

    const expectedAudience = String(config.readTokenAudience || 'trends-api');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((audience) => String(audience || '') === expectedAudience)) return null;

    const scopes = Array.isArray(claims.scope)
        ? claims.scope
        : String(claims.scope || '').split(/\s+/);
    if (!scopes.some((scope) => String(scope || '') === 'trends:read')) return null;
    if (!String(claims.sub || '').trim()) return null;

    return claims;
}

function hasInternalAccess(req, config) {
    const expectedToken = String(config.internalToken || '').trim();
    if (!expectedToken) return false;
    return safeTokenEquals(extractBearerToken(req), expectedToken);
}

function resolveTrendReadAccess(req, config) {
    if (hasInternalAccess(req, config)) {
        return { type: 'internal', claims: null };
    }
    const claims = verifyTrendReadToken(extractBearerToken(req), config);
    return claims ? { type: 'user', claims } : null;
}

function createFixedWindowRateLimiter(limitPerMinute = 120, now = () => Date.now()) {
    const limit = Math.max(1, Number(limitPerMinute) || 120);
    const entries = new Map();

    return {
        tryConsume(key) {
            const currentTime = now();
            const windowStart = Math.floor(currentTime / 60000) * 60000;
            const normalizedKey = String(key || 'unknown');
            const current = entries.get(normalizedKey);
            const next = current && current.windowStart === windowStart
                ? { windowStart, count: current.count + 1 }
                : { windowStart, count: 1 };
            entries.set(normalizedKey, next);

            if (entries.size > 10000) {
                for (const [entryKey, entry] of entries) {
                    if (entry.windowStart < windowStart) entries.delete(entryKey);
                }
            }

            return {
                allowed: next.count <= limit,
                retryAfterSeconds: Math.max(1, Math.ceil((windowStart + 60000 - currentTime) / 1000))
            };
        }
    };
}

async function handleIngest(req, res, config, onMutation = () => {}) {
    if (!hasInternalAccess(req, config)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    let body;
    try {
        body = await readJsonBody(req, config.requestBodyMaxBytes);
    } catch (error) {
        const statusCode = error.code === 'BODY_TOO_LARGE' ? 413 : 400;
        return sendJson(res, statusCode, { success: false, message: `Invalid JSON body: ${error.message}` });
    }

    let normalized;
    try {
        normalized = normalizeIngestPayload(body);
    } catch (error) {
        return sendJson(res, 400, { success: false, message: error.message });
    }

    const mappedRows = mapPayloadToTrendRows(normalized);
    const rows = dedupeTrendRows(mappedRows);
    const duplicatesCollapsed = mappedRows.length - rows.length;
    if (rows.length === 0) {
        return sendJson(res, 200, {
            success: true,
            accepted: 0,
            uniqueRows: 0,
            inserted: 0,
            updated: 0,
            duplicatesCollapsed: 0,
            trendDate: normalized.trendDate || null
        });
    }

    try {
        const existingRows = await fetchExistingTrendRows(config, rows);
        const updated = countExistingTrendRows(rows, existingRows);
        const inserted = Math.max(0, rows.length - updated);
        const { error } = await getTrendItemsQuery(config)
            .upsert(rows, {
                onConflict: config.onConflict,
                ignoreDuplicates: false
            });

        if (error) {
            throw error;
        }
        onMutation();

        return sendJson(res, 200, {
            success: true,
            accepted: mappedRows.length,
            uniqueRows: rows.length,
            inserted,
            updated,
            duplicatesCollapsed,
            trendDate: normalized.trendDate
        });
    } catch (error) {
        console.error('[trends-api] ingest upsert failed', {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
        });
        return sendJson(res, 500, { success: false, message: `Supabase upsert failed: ${error.message}` });
    }
}

async function handleQuery(res, queryUrl, config, asCsv = false) {
    try {
        const filters = resolveTrendQueryParams(queryUrl.searchParams, config);

        let query = getTrendItemsQuery(config)
            .select('source, trend_date, category, keyword, change_raw, change_type, change_amount, display_order, collected_at')
            .order('trend_date', { ascending: false })
            .order('category', { ascending: true })
            .order('display_order', { ascending: true })
            .limit(filters.limit);

        if (filters.trendDate) query = query.eq('trend_date', filters.trendDate);
        if (filters.dateFrom) query = query.gte('trend_date', filters.dateFrom);
        if (filters.dateTo) query = query.lte('trend_date', filters.dateTo);
        if (Array.isArray(filters.categories) && filters.categories.length === 1) {
            query = query.eq('category', filters.categories[0]);
        } else if (Array.isArray(filters.categories) && filters.categories.length > 1) {
            query = query.in('category', filters.categories);
        }
        if (filters.keyword) query = query.ilike('keyword', `%${filters.keyword}%`);
        if (filters.source) query = query.eq('source', filters.source);
        if (filters.changeType) query = query.eq('change_type', filters.changeType);
        if (filters.changeAmountMin !== null) query = query.gte('change_amount', filters.changeAmountMin);
        if (filters.changeAmountMax !== null) query = query.lte('change_amount', filters.changeAmountMax);

        const { data, error } = await query;
        if (error) {
            throw error;
        }

        const rows = Array.isArray(data) ? data : [];
        if (asCsv) {
            const csv = toTrendCsv(rows);
            const fileName = buildTrendExportFileName(filters, 'csv');
            return sendText(res, 200, csv, {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': buildDownloadContentDisposition(fileName)
            });
        }

        return sendJson(res, 200, {
            success: true,
            count: rows.length,
            items: rows
        });
    } catch (error) {
        const statusCode = /must be|earlier than|less than or equal/.test(String(error.message || '')) ? 400 : 500;
        return sendJson(res, statusCode, { success: false, message: `Trend query failed: ${error.message}` });
    }
}

async function fetchTrendMeta(config, filters) {
    const client = createSupabaseAdminClient(config).schema(config.supabaseSchema);
    const { data, error } = await client.rpc(config.metaFunction, {
        p_source: filters.source || null,
        p_trend_date: filters.trendDate || null,
        p_date_from: filters.dateFrom || null,
        p_date_to: filters.dateTo || null
    });
    if (error) {
        throw error;
    }
    return normalizeMetaPayload(data);
}

async function handleMeta(res, queryUrl, config, metaCache) {
    try {
        const filters = resolveTrendQueryParams(queryUrl.searchParams, config);
        const cacheKey = JSON.stringify({
            source: filters.source,
            trendDate: filters.trendDate,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo
        });
        let cache = metaCache.get(cacheKey);
        if (!cache) {
            if (metaCache.size >= 64) {
                metaCache.delete(metaCache.keys().next().value);
            }
            cache = createExpiringSingleFlightCache(config.metaCacheTtlMs);
            metaCache.set(cacheKey, cache);
        }
        const { value: summary, cacheStatus } = await cache.getOrLoad(() => fetchTrendMeta(config, filters));

        res.setHeader('X-Trends-Cache', cacheStatus);
        return sendJson(res, 200, {
            success: true,
            categories: summary.categories,
            sources: summary.sources,
            availableDates: summary.availableDates,
            dateRange: summary.dateRange,
            totalRows: summary.totalRows
        });
    } catch (error) {
        const statusCode = /must be|earlier than|less than or equal/.test(String(error.message || '')) ? 400 : 500;
        return sendJson(res, statusCode, { success: false, message: `Trend meta failed: ${error.message}` });
    }
}

function createServer(config = resolveApiConfig()) {
    const requestGate = createConcurrencyGate(config.maxConcurrentRequests);
    const metaCache = new Map();
    const readRateLimiter = createFixedWindowRateLimiter(config.readRateLimitPerMinute);
    const server = http.createServer(async (req, res) => {
        if (!requestGate.tryEnter()) {
            res.setHeader('Retry-After', '1');
            return sendJson(res, 503, { success: false, message: 'Server is busy. Retry shortly.' });
        }

        try {
            const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${config.host}:${config.port}`}`);

            if (req.method === 'GET' && requestUrl.pathname === '/health') {
                return sendJson(res, 200, {
                    success: true,
                    service: 'trends-api'
                });
            }

            if (req.method === 'POST' && requestUrl.pathname === '/internal/ingest/naver-trends') {
                if (!hasInternalAccess(req, config)) {
                    return sendJson(res, 401, { success: false, message: 'Unauthorized' });
                }
                return handleIngest(req, res, config, () => metaCache.clear());
            }

            if (req.method === 'GET' && requestUrl.pathname === '/api/v1/trends') {
                const access = resolveTrendReadAccess(req, config);
                if (!access) {
                    return sendJson(res, 401, { success: false, message: 'Unauthorized' });
                }
                if (access.type === 'user') {
                    const rateLimit = readRateLimiter.tryConsume(`license:${access.claims.sub}`);
                    if (!rateLimit.allowed) {
                        res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
                        return sendJson(res, 429, { success: false, message: 'Too many requests' });
                    }
                }
                return handleQuery(res, requestUrl, config, false);
            }

            if (req.method === 'GET' && requestUrl.pathname === '/api/v1/trends/meta') {
                const access = resolveTrendReadAccess(req, config);
                if (!access) {
                    return sendJson(res, 401, { success: false, message: 'Unauthorized' });
                }
                if (access.type === 'user') {
                    const rateLimit = readRateLimiter.tryConsume(`license:${access.claims.sub}`);
                    if (!rateLimit.allowed) {
                        res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
                        return sendJson(res, 429, { success: false, message: 'Too many requests' });
                    }
                }
                return handleMeta(res, requestUrl, config, metaCache);
            }

            if (req.method === 'GET' && requestUrl.pathname === '/exports/trends.csv') {
                if (!hasInternalAccess(req, config)) {
                    return sendJson(res, 401, { success: false, message: 'Unauthorized' });
                }
                return handleQuery(res, requestUrl, config, true);
            }

            if (req.method === 'GET' && requestUrl.pathname === '/exports/trends.xlsx') {
                if (!hasInternalAccess(req, config)) {
                    return sendJson(res, 401, { success: false, message: 'Unauthorized' });
                }
                return sendJson(res, 501, {
                    success: false,
                    message: 'XLSX export is not implemented yet. Use /exports/trends.csv for now.'
                });
            }

            return sendJson(res, 404, { success: false, message: 'Not found' });
        } catch (error) {
            console.error('[trends-api] unhandled request error', {
                method: req.method,
                url: req.url,
                message: error?.message
            });
            if (!res.headersSent) {
                return sendJson(res, 500, { success: false, message: 'Internal server error' });
            }
            return res.end();
        } finally {
            requestGate.leave();
        }
    });
    server.requestTimeout = config.requestTimeoutMs;
    server.headersTimeout = Math.min(config.requestTimeoutMs, 15000);
    server.keepAliveTimeout = 5000;
    return server;
}

function startServer(config = resolveApiConfig()) {
    const server = createServer(config);
    server.listen(config.port, config.host, () => {
        console.log(`trends-api listening on http://${config.host}:${config.port}`);
    });
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    buildTrendConflictKey,
    createServer,
    createSupabaseAdminClient,
    buildTrendExportFileName,
    buildDownloadContentDisposition,
    countExistingTrendRows,
    createConcurrencyGate,
    createFixedWindowRateLimiter,
    createTrendReadToken,
    createExpiringSingleFlightCache,
    dedupeTrendRows,
    fetchTrendMeta,
    fetchExistingTrendRows,
    getTrendItemsQuery,
    mapPayloadToTrendRows,
    normalizeIngestPayload,
    normalizeCategoryList,
    normalizeMetaPayload,
    readJsonBody,
    resolveTrendReadAccess,
    resolveTrendQueryParams,
    resolveApiConfig,
    verifyTrendReadToken,
    startServer,
    toTrendCsv
};
