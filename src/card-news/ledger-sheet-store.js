const crypto = require('node:crypto');
const {
    CARD_NEWS_SHEET_HEADERS,
    CARD_NEWS_WORKFLOW_STATUSES,
    CARD_NEWS_PUBLISHING_STATUSES
} = require('./ledger-sheet-schema');

const FIELD_TO_HEADER = Object.freeze({
    entryKey: 'entry_key',
    workflowStatus: '상태',
    publishingStatus: '발행 상태',
    sourcePlatform: '원문 플랫폼',
    title: '글 제목',
    originalUrl: '원문 URL',
    rssGuid: 'RSS GUID',
    rssPublishedAt: 'RSS 발행일시',
    collectedAt: '수집일시',
    generationId: 'generation_id',
    cardCount: '카드 수',
    channels: '발행 채널',
    postLinks: '게시물 링크',
    scheduledAt: '예약일시',
    processedAt: '처리일시',
    lastError: '마지막 오류'
});

const MUTABLE_FIELDS = Object.freeze([
    'workflowStatus', 'publishingStatus', 'generationId', 'cardCount', 'channels',
    'postLinks', 'scheduledAt', 'processedAt', 'lastError'
]);

function compact(value, maxLength = 4000) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeHeader(value) {
    return compact(value, 200).toLowerCase().replace(/[\s/_]/g, '');
}

function normalizeOriginalUrl(rawUrl) {
    const raw = compact(rawUrl);
    if (!raw) return '';
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_error) {
        throw new Error('카드뉴스 원문 URL이 올바르지 않습니다.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('카드뉴스 원문 URL은 HTTP 또는 HTTPS 주소여야 합니다.');
    }
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) parsed.port = '';
    const retainedParams = [...parsed.searchParams.entries()]
        .filter(([key]) => !/^utm_/i.test(key) && !/^(fbclid|gclid)$/i.test(key))
        .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    parsed.search = '';
    for (const [key, value] of retainedParams) parsed.searchParams.append(key, value);
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function buildEntryKey(source = {}) {
    const kind = compact(source.kind || source.sourceKind, 40).toLowerCase();
    const stableFeedIdentity = compact(source.item_key || source.itemKey || source.rss_guid || source.rssGuid || source.guid, 1000);
    if (kind === 'feed_item' && stableFeedIdentity) return sha256(`feed_item\n${stableFeedIdentity}`);
    if (kind === 'manuscript') {
        const managementId = compact(source.management_id || source.managementId, 1000);
        if (managementId) return sha256(`manuscript\n${managementId}`);
    }
    const originalUrl = normalizeOriginalUrl(source.canonical_url || source.canonicalUrl || source.original_url || source.originalUrl || source.url);
    if (originalUrl) return sha256(`url\n${originalUrl}`);
    throw new Error('카드뉴스 관리대장 등록에는 RSS 항목 식별자 또는 원문 URL이 필요합니다.');
}

function buildHeaderMap(headers = []) {
    const indices = new Map();
    headers.forEach((header, index) => {
        const normalized = normalizeHeader(header);
        if (normalized && !indices.has(normalized)) indices.set(normalized, index);
    });
    const map = {};
    for (const [field, header] of Object.entries(FIELD_TO_HEADER)) {
        const index = indices.get(normalizeHeader(header));
        if (index === undefined) throw new Error(`cardnews 시트 필수 헤더가 없습니다: ${header}`);
        map[field] = index;
    }
    return map;
}

function parseSheetRows(values = []) {
    const headers = Array.isArray(values[0]) ? values[0] : [];
    const headerMap = buildHeaderMap(headers);
    const items = values.slice(1).map((row, index) => {
        const item = { rowNumber: index + 2 };
        for (const [field, columnIndex] of Object.entries(headerMap)) item[field] = compact(row?.[columnIndex]);
        return item;
    }).filter((item) => Object.values(item).some((value) => value !== '' && value !== item.rowNumber));
    return { headers, headerMap, items };
}

function buildSheetRow(headerCount, headerMap, values = {}) {
    const row = new Array(headerCount).fill('');
    for (const [field, value] of Object.entries(values)) {
        if (headerMap[field] !== undefined) row[headerMap[field]] = compact(value);
    }
    return row;
}

function normalizeCandidate(input = {}, now) {
    const source = input.source && typeof input.source === 'object' ? input.source : input;
    const originalUrl = normalizeOriginalUrl(source.canonical_url || source.canonicalUrl || source.original_url || source.originalUrl || source.url);
    const entryKey = buildEntryKey(source);
    return {
        entryKey,
        workflowStatus: '후보',
        publishingStatus: '미발행',
        sourcePlatform: compact(input.source_platform || input.sourcePlatform || source.source_platform || source.sourcePlatform, 100),
        title: compact(input.title || source.title, 300),
        originalUrl,
        rssGuid: compact(input.rss_guid || input.rssGuid || source.guid || source.item_key || source.itemKey, 1000),
        rssPublishedAt: compact(input.rss_published_at || input.rssPublishedAt || source.published_at || source.publishedAt, 100),
        collectedAt: compact(input.collected_at || input.collectedAt || now(), 100)
    };
}

function createCardNewsLedgerStore(options = {}) {
    const gateway = options.gateway;
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    if (!gateway || typeof gateway.prepare !== 'function' || typeof gateway.readAll !== 'function'
        || typeof gateway.appendRows !== 'function' || typeof gateway.updateCells !== 'function') {
        throw new Error('Card News ledger gateway 계약이 올바르지 않습니다.');
    }

    async function readPreparedRows() {
        return parseSheetRows(await gateway.readAll());
    }

    async function listRows() {
        await gateway.prepare();
        return (await readPreparedRows()).items;
    }

    async function findByGenerationId(generationId) {
        const normalizedId = compact(generationId, 500);
        if (!normalizedId) return null;
        return (await listRows()).find((item) => item.generationId === normalizedId) || null;
    }

    function normalizeMutablePatch(patch = {}) {
        if (patch.workflowStatus !== undefined && !CARD_NEWS_WORKFLOW_STATUSES.includes(compact(patch.workflowStatus, 100))) {
            throw new Error(`허용되지 않은 카드뉴스 상태입니다: ${patch.workflowStatus}`);
        }
        if (patch.publishingStatus !== undefined && !CARD_NEWS_PUBLISHING_STATUSES.includes(compact(patch.publishingStatus, 100))) {
            throw new Error(`허용되지 않은 카드뉴스 발행 상태입니다: ${patch.publishingStatus}`);
        }
        return Object.fromEntries(MUTABLE_FIELDS
            .filter((field) => patch[field] !== undefined)
            .map((field) => [field, compact(patch[field])]));
    }

    async function updateParsedRow(parsed, existing, patch = {}) {
        const normalizedPatch = normalizeMutablePatch(patch);
        const changedEntries = Object.entries(normalizedPatch)
            .filter(([field, value]) => compact(existing[field]) !== value);
        const updates = changedEntries.map(([field, value]) => ({
            rowNumber: existing.rowNumber,
            columnIndex: parsed.headerMap[field],
            value
        }));
        if (updates.length > 0) await gateway.updateCells(updates);
        return { ...existing, ...Object.fromEntries(changedEntries), rowNumber: existing.rowNumber };
    }

    async function upsertCandidates(candidates = []) {
        await gateway.prepare();
        const parsed = await readPreparedRows();
        const byEntryKey = new Map(parsed.items.map((item) => [item.entryKey, item]));
        const appended = [];
        const results = [];
        for (const input of Array.isArray(candidates) ? candidates : []) {
            const candidate = normalizeCandidate(input, now);
            const existing = byEntryKey.get(candidate.entryKey);
            if (existing) {
                results.push({ entryKey: candidate.entryKey, action: 'existing', rowNumber: existing.rowNumber, item: existing });
                continue;
            }
            const row = buildSheetRow(parsed.headers.length, parsed.headerMap, candidate);
            appended.push({ candidate, row });
            byEntryKey.set(candidate.entryKey, candidate);
        }
        const appendResult = appended.length > 0 ? await gateway.appendRows(appended.map((item) => item.row)) : { rowNumbers: [] };
        const rowNumbers = Array.isArray(appendResult?.rowNumbers) ? appendResult.rowNumbers : [];
        appended.forEach((item, index) => results.push({
            entryKey: item.candidate.entryKey,
            action: 'created',
            rowNumber: rowNumbers[index] || null,
            item: { ...item.candidate, rowNumber: rowNumbers[index] || null }
        }));
        return { success: true, createdCount: appended.length, existingCount: results.filter((item) => item.action === 'existing').length, results };
    }

    async function updateRow(rowNumber, patch = {}) {
        await gateway.prepare();
        const normalizedRowNumber = Number.parseInt(rowNumber, 10);
        if (!Number.isInteger(normalizedRowNumber) || normalizedRowNumber < 2) throw new Error('cardnews 시트 rowNumber는 2 이상이어야 합니다.');
        const parsed = await readPreparedRows();
        const existing = parsed.items.find((item) => item.rowNumber === normalizedRowNumber);
        if (!existing) throw new Error(`cardnews 시트 ${normalizedRowNumber}행을 찾지 못했습니다.`);
        return updateParsedRow(parsed, existing, patch);
    }

    async function updateByGenerationId(generationId, patch = {}) {
        await gateway.prepare();
        const normalizedId = compact(generationId, 500);
        if (!normalizedId) return null;
        const parsed = await readPreparedRows();
        const existing = parsed.items.find((item) => item.generationId === normalizedId);
        if (!existing) return null;
        return updateParsedRow(parsed, existing, patch);
    }

    async function upsertCandidateWithPatch(input = {}, patch = {}) {
        await gateway.prepare();
        const parsed = await readPreparedRows();
        const candidate = normalizeCandidate(input, now);
        const existing = parsed.items.find((item) => item.entryKey === candidate.entryKey);
        if (existing) return updateParsedRow(parsed, existing, patch);
        const normalizedPatch = normalizeMutablePatch(patch);
        const item = { ...candidate, ...normalizedPatch };
        const appendResult = await gateway.appendRows([
            buildSheetRow(parsed.headers.length, parsed.headerMap, item)
        ]);
        return { ...item, rowNumber: appendResult?.rowNumbers?.[0] || null };
    }

    return { listRows, findByGenerationId, upsertCandidates, updateRow, updateByGenerationId, upsertCandidateWithPatch };
}

module.exports = {
    FIELD_TO_HEADER,
    MUTABLE_FIELDS,
    normalizeOriginalUrl,
    buildEntryKey,
    buildHeaderMap,
    parseSheetRows,
    createCardNewsLedgerStore
};
