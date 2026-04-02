const http = require('http');
const path = require('path');
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
        supabaseUrl: String(env.SUPABASE_URL || '').trim(),
        supabaseAdminKey: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
        supabaseSchema: String(env.TRENDS_SUPABASE_SCHEMA || 'trends').trim() || 'trends',
        supabaseTable: String(env.TRENDS_SUPABASE_TABLE || 'items').trim() || 'items',
        onConflict: String(env.TRENDS_SUPABASE_ON_CONFLICT || 'source,trend_date,category,keyword').trim() || 'source,trend_date,category,keyword',
        exportMaxRows: Math.max(1, toInt(env.TRENDS_EXPORT_MAX_ROWS, 5000)),
        metaScanLimit: Math.max(100, toInt(env.TRENDS_META_SCAN_LIMIT, 20000))
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

async function collectPagedRows(fetchPage, scanLimit, pageSize = 1000) {
    const limit = Math.max(0, Number(scanLimit) || 0);
    if (limit === 0) return [];

    const batchSize = Math.max(1, Math.min(Number(pageSize) || 1000, limit));
    const rows = [];

    for (let offset = 0; offset < limit; offset += batchSize) {
        const end = Math.min(limit - 1, offset + batchSize - 1);
        const batch = await fetchPage(offset, end);
        const normalizedBatch = Array.isArray(batch) ? batch : [];
        rows.push(...normalizedBatch);

        if (normalizedBatch.length < (end - offset + 1)) {
            break;
        }
    }

    return rows;
}

function buildTrendMetaSummary(rows = []) {
    const categories = Array.from(new Set(
        rows.map((row) => String(row?.category || '').trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'ko'));
    const sources = Array.from(new Set(
        rows.map((row) => String(row?.source || '').trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'en'));
    const availableDates = Array.from(new Set(
        rows.map((row) => String(row?.trend_date || '').trim()).filter(Boolean)
    )).sort();

    return {
        categories,
        sources,
        availableDates,
        dateRange: {
            min: availableDates[0] || null,
            max: availableDates[availableDates.length - 1] || null
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

async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
}

function ensureInternalAccess(req, config) {
    if (!config.internalToken) return true;
    const authHeader = String(req.headers.authorization || '').trim();
    return authHeader === `Bearer ${config.internalToken}`;
}

async function handleIngest(req, res, config) {
    if (!ensureInternalAccess(req, config)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch (error) {
        return sendJson(res, 400, { success: false, message: `Invalid JSON body: ${error.message}` });
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

async function handleMeta(res, queryUrl, config) {
    try {
        const filters = resolveTrendQueryParams(queryUrl.searchParams, {
            ...config,
            exportMaxRows: config.metaScanLimit
        });

        const rows = await collectPagedRows(async (offset, end) => {
            let categoryQuery = getTrendItemsQuery(config)
                .select('category, source, trend_date, keyword')
                .order('trend_date', { ascending: false })
                .order('category', { ascending: true })
                .order('keyword', { ascending: true })
                .range(offset, end);

            if (filters.source) categoryQuery = categoryQuery.eq('source', filters.source);
            if (filters.trendDate) categoryQuery = categoryQuery.eq('trend_date', filters.trendDate);
            if (filters.dateFrom) categoryQuery = categoryQuery.gte('trend_date', filters.dateFrom);
            if (filters.dateTo) categoryQuery = categoryQuery.lte('trend_date', filters.dateTo);

            const { data, error } = await categoryQuery;
            if (error) {
                throw error;
            }
            return data;
        }, config.metaScanLimit);
        const summary = buildTrendMetaSummary(rows);

        return sendJson(res, 200, {
            success: true,
            categories: summary.categories,
            sources: summary.sources,
            availableDates: summary.availableDates,
            dateRange: summary.dateRange,
            scannedRows: rows.length,
            scanLimit: config.metaScanLimit
        });
    } catch (error) {
        const statusCode = /must be|earlier than|less than or equal/.test(String(error.message || '')) ? 400 : 500;
        return sendJson(res, statusCode, { success: false, message: `Trend meta failed: ${error.message}` });
    }
}

function createServer(config = resolveApiConfig()) {
    return http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${config.host}:${config.port}`}`);

        if (req.method === 'GET' && requestUrl.pathname === '/health') {
            return sendJson(res, 200, {
                success: true,
                service: 'trends-api'
            });
        }

        if (req.method === 'POST' && requestUrl.pathname === '/internal/ingest/naver-trends') {
            return handleIngest(req, res, config);
        }

        if (req.method === 'GET' && requestUrl.pathname === '/api/v1/trends') {
            return handleQuery(res, requestUrl, config, false);
        }

        if (req.method === 'GET' && requestUrl.pathname === '/api/v1/trends/meta') {
            return handleMeta(res, requestUrl, config);
        }

        if (req.method === 'GET' && requestUrl.pathname === '/exports/trends.csv') {
            return handleQuery(res, requestUrl, config, true);
        }

        if (req.method === 'GET' && requestUrl.pathname === '/exports/trends.xlsx') {
            return sendJson(res, 501, {
                success: false,
                message: 'XLSX export is not implemented yet. Use /exports/trends.csv for now.'
            });
        }

        return sendJson(res, 404, { success: false, message: 'Not found' });
    });
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
    buildTrendMetaSummary,
    createServer,
    createSupabaseAdminClient,
    buildTrendExportFileName,
    buildDownloadContentDisposition,
    collectPagedRows,
    countExistingTrendRows,
    dedupeTrendRows,
    fetchExistingTrendRows,
    getTrendItemsQuery,
    mapPayloadToTrendRows,
    normalizeIngestPayload,
    normalizeCategoryList,
    resolveTrendQueryParams,
    resolveApiConfig,
    startServer,
    toTrendCsv
};
