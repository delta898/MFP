const crypto = require('crypto');
const {
    SNS_SHEET_HEADERS,
    SNS_DELIVERY_STATUSES
} = require('./sns-sheet-schema');

const FIELD_TO_HEADER = Object.freeze({
    deliveryKey: 'delivery_key',
    entryKey: 'entry_key',
    status: '상태',
    sourcePlatform: '원문 플랫폼',
    service: '서비스',
    channelName: '채널 이름',
    channelId: 'channel_id',
    title: '글 제목',
    summary: '글 요약',
    hashtags: '해시태그',
    originalUrl: '원문 URL',
    imageUrl: '대표 이미지 URL',
    rssPublishedAt: 'RSS 발행일시',
    processedAt: '처리일시',
    bufferPostId: 'buffer_post_id',
    log: '로그'
});

const HEADER_TO_FIELD = Object.freeze(
    Object.fromEntries(Object.entries(FIELD_TO_HEADER).map(([field, header]) => [header, field]))
);

function normalizeHeader(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s/_]/g, '');
}

function buildHeaderMap(headers) {
    const normalizedIndices = new Map();
    headers.forEach((header, index) => {
        const normalized = normalizeHeader(header);
        if (normalized && !normalizedIndices.has(normalized)) {
            normalizedIndices.set(normalized, index);
        }
    });

    const map = {};
    for (const [field, header] of Object.entries(FIELD_TO_HEADER)) {
        const index = normalizedIndices.get(normalizeHeader(header));
        if (index === undefined) {
            throw new Error(`SNS 시트 필수 헤더가 없습니다: ${header}`);
        }
        map[field] = index;
    }
    return map;
}

function normalizeOriginalUrl(rawUrl) {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';

    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_error) {
        throw new Error('SNS 원문 URL이 올바르지 않습니다.');
    }

    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'https:' && parsed.port === '443')
        || (parsed.protocol === 'http:' && parsed.port === '80')) {
        parsed.port = '';
    }

    const retainedParams = [...parsed.searchParams.entries()]
        .filter(([key]) => !/^utm_/i.test(key) && !/^(fbclid|gclid)$/i.test(key))
        .sort(([aKey, aValue], [bKey, bValue]) => {
            const keyCompare = aKey.localeCompare(bKey);
            return keyCompare !== 0 ? keyCompare : aValue.localeCompare(bValue);
        });
    parsed.search = '';
    for (const [key, value] of retainedParams) {
        parsed.searchParams.append(key, value);
    }

    if (parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString();
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function buildEntryKey(entry = {}) {
    const guid = String(entry.guid || entry.rssGuid || '').trim();
    if (guid) return sha256(`guid\n${guid}`);

    const normalizedUrl = normalizeOriginalUrl(entry.originalUrl || entry.url);
    if (!normalizedUrl) {
        throw new Error('SNS entry_key 생성에는 RSS GUID 또는 원문 URL이 필요합니다.');
    }
    return sha256(`url\n${normalizedUrl}`);
}

function buildDeliveryKey(entryKey, channelId) {
    const normalizedEntryKey = String(entryKey || '').trim();
    const normalizedChannelId = String(channelId || '').trim();
    if (!normalizedEntryKey || !normalizedChannelId) {
        throw new Error('SNS delivery_key 생성에는 entry_key와 channel_id가 필요합니다.');
    }
    return sha256(`${normalizedEntryKey}\n${normalizedChannelId}`);
}

function normalizeChannels(channels) {
    const unique = new Map();
    for (const channel of Array.isArray(channels) ? channels : []) {
        const id = String(channel?.id || channel?.channelId || '').trim();
        if (!id || unique.has(id)) continue;
        unique.set(id, {
            id,
            service: String(channel?.service || '').trim().toLowerCase(),
            displayName: String(channel?.displayName || channel?.name || '').trim()
        });
    }
    const normalized = [...unique.values()];
    if (normalized.length > 3) {
        throw new Error('SNS 발행 채널은 최대 3개까지 등록할 수 있습니다.');
    }
    return normalized;
}

function parseSheetRows(values) {
    const rows = Array.isArray(values) ? values : [];
    const headers = Array.isArray(rows[0]) ? rows[0] : [];
    const headerMap = buildHeaderMap(headers);
    const items = rows.slice(1)
        .map((row, index) => {
            const source = Array.isArray(row) ? row : [];
            const item = { rowNumber: index + 2 };
            for (const [field, columnIndex] of Object.entries(headerMap)) {
                item[field] = String(source[columnIndex] ?? '').trim();
            }
            return item;
        })
        .filter((item) => Object.keys(FIELD_TO_HEADER).some((field) => item[field] !== ''));

    return { headers, headerMap, items };
}

function buildSheetRow(headerCount, headerMap, values) {
    const row = new Array(headerCount).fill('');
    for (const [field, value] of Object.entries(values)) {
        if (headerMap[field] === undefined) continue;
        row[headerMap[field]] = String(value ?? '').trim();
    }
    return row;
}

function joinLog(existingLog, message) {
    return [String(existingLog || '').trim(), String(message || '').trim()]
        .filter(Boolean)
        .join(' | ');
}

function createSnsSheetStore(options = {}) {
    const gateway = options.gateway;
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    if (!gateway
        || typeof gateway.prepare !== 'function'
        || typeof gateway.readAll !== 'function'
        || typeof gateway.appendRows !== 'function'
        || typeof gateway.updateCells !== 'function') {
        throw new Error('SNS Sheet Store gateway 계약이 올바르지 않습니다.');
    }

    async function readPreparedRows() {
        const values = await gateway.readAll();
        return parseSheetRows(values);
    }

    async function listRows() {
        await gateway.prepare();
        const parsed = await readPreparedRows();
        return parsed.items;
    }

    async function appendEntriesDeliveries(input = {}) {
        await gateway.prepare();
        const channels = normalizeChannels(input.channels);
        const parsed = await readPreparedRows();
        const trackedEntryKeys = new Set(parsed.items.map((item) => item.entryKey).filter(Boolean));
        const trackedDeliveryKeys = new Set(parsed.items.map((item) => item.deliveryKey).filter(Boolean));
        const entries = Array.isArray(input.entries) ? input.entries : [];
        const rows = [];
        const results = [];

        for (const candidate of entries) {
            const descriptor = candidate?.entry ? candidate : { entry: candidate };
            const entry = descriptor.entry || {};
            const entryKey = buildEntryKey(entry);
            const result = {
                success: true,
                addedCount: 0,
                rowNumbers: [],
                entryKey,
                deliveryKeys: []
            };

            if (channels.length === 0) {
                result.reason = 'no_channels';
                results.push(result);
                continue;
            }
            if (trackedEntryKeys.has(entryKey)) {
                result.reason = 'entry_already_tracked';
                results.push(result);
                continue;
            }

            const status = String(descriptor.status || input.status || '대기').trim() || '대기';
            if (!SNS_DELIVERY_STATUSES.includes(status)) {
                throw new Error(`허용되지 않은 SNS 상태입니다: ${status}`);
            }
            const originalUrl = normalizeOriginalUrl(entry.originalUrl || entry.url);
            if (!originalUrl) throw new Error('SNS 시트 등록에는 원문 URL이 필요합니다.');
            const sourcePlatform = String(entry.sourcePlatform || entry.platform || '').trim().toLowerCase();
            if (!sourcePlatform) throw new Error('SNS 시트 등록에는 원문 플랫폼이 필요합니다.');

            const rowValues = channels
                .map((channel) => ({
                    deliveryKey: buildDeliveryKey(entryKey, channel.id),
                    entryKey,
                    status,
                    sourcePlatform,
                    service: channel.service,
                    channelName: channel.displayName,
                    channelId: channel.id,
                    title: String(entry.title || '').trim(),
                    summary: String(entry.summary || entry.description || '').trim(),
                    hashtags: String(entry.hashtags || '').trim(),
                    originalUrl,
                    imageUrl: String(entry.imageUrl || entry.representativeImageUrl || '').trim(),
                    rssPublishedAt: String(entry.rssPublishedAt || entry.publishedAt || '').trim(),
                    processedAt: '',
                    bufferPostId: '',
                    log: String(descriptor.log || input.log || '').trim()
                }))
                .filter((item) => !trackedDeliveryKeys.has(item.deliveryKey));

            if (rowValues.length === 0) {
                result.reason = 'deliveries_already_tracked';
                results.push(result);
                continue;
            }

            trackedEntryKeys.add(entryKey);
            for (const values of rowValues) {
                trackedDeliveryKeys.add(values.deliveryKey);
                rows.push(buildSheetRow(parsed.headers.length, parsed.headerMap, values));
            }
            result.addedCount = rowValues.length;
            result.deliveryKeys = rowValues.map((item) => item.deliveryKey);
            result.rowOffset = rows.length - rowValues.length;
            results.push(result);
        }

        const appendResult = rows.length > 0
            ? await gateway.appendRows(rows)
            : { rowNumbers: [] };
        const rowNumbers = Array.isArray(appendResult?.rowNumbers) ? appendResult.rowNumbers : [];
        for (const result of results) {
            if (result.addedCount > 0) {
                result.rowNumbers = rowNumbers.slice(result.rowOffset, result.rowOffset + result.addedCount);
            }
            delete result.rowOffset;
        }

        return {
            success: true,
            addedCount: rows.length,
            addedEntryCount: results.filter((result) => result.addedCount > 0).length,
            rowNumbers,
            results
        };
    }

    async function appendEntryDeliveries(input = {}) {
        const batchResult = await appendEntriesDeliveries({
            entries: [{
                entry: input.entry || {},
                status: input.status,
                log: input.log
            }],
            channels: input.channels
        });
        return batchResult.results[0] || {
            success: true,
            addedCount: 0,
            rowNumbers: [],
            reason: 'no_entries'
        };
    }

    async function findFirstPending() {
        await gateway.prepare();
        const parsed = await readPreparedRows();
        return parsed.items.find((item) => item.status === '대기') || null;
    }

    async function findFirstPendingGroup() {
        await gateway.prepare();
        const parsed = await readPreparedRows();
        const first = parsed.items.find((item) => item.status === '대기') || null;
        if (!first) return null;
        const rows = parsed.items.filter(
            (item) => item.status === '대기' && item.entryKey === first.entryKey
        );
        return {
            entryKey: first.entryKey,
            firstRowNumber: first.rowNumber,
            rows
        };
    }

    async function updateRows(patches = []) {
        await gateway.prepare();
        const parsed = await readPreparedRows();
        const mutableFields = ['status', 'hashtags', 'processedAt', 'bufferPostId', 'log'];
        const updates = [];
        const results = [];
        for (const candidate of Array.isArray(patches) ? patches : []) {
            const normalizedRowNumber = Number.parseInt(candidate?.rowNumber, 10);
            if (!Number.isInteger(normalizedRowNumber) || normalizedRowNumber < 2) {
                throw new Error('SNS 시트 rowNumber는 2 이상이어야 합니다.');
            }
            const existing = parsed.items.find((item) => item.rowNumber === normalizedRowNumber);
            if (!existing) {
                throw new Error(`SNS 시트 ${normalizedRowNumber}행을 찾지 못했습니다.`);
            }
            const patch = candidate?.patch && typeof candidate.patch === 'object'
                ? candidate.patch
                : {};
            if (patch.status !== undefined && !SNS_DELIVERY_STATUSES.includes(String(patch.status).trim())) {
                throw new Error(`허용되지 않은 SNS 상태입니다: ${patch.status}`);
            }

            const effectivePatch = { ...patch };
            if (patch.appendLog !== undefined) {
                effectivePatch.log = joinLog(existing.log, patch.appendLog);
            }
            delete effectivePatch.appendLog;

            for (const field of mutableFields) {
                if (effectivePatch[field] === undefined) continue;
                updates.push({
                    rowNumber: normalizedRowNumber,
                    columnIndex: parsed.headerMap[field],
                    value: String(effectivePatch[field] ?? '').trim()
                });
            }
            results.push({ ...existing, ...effectivePatch, rowNumber: normalizedRowNumber });
        }
        if (updates.length > 0) await gateway.updateCells(updates);
        return results;
    }

    async function updateRow(rowNumber, patch = {}) {
        const results = await updateRows([{ rowNumber, patch }]);
        return results[0];
    }

    async function markProcessing(rowNumber, log = '') {
        const patch = { status: '처리 중' };
        if (String(log || '').trim()) patch.appendLog = String(log).trim();
        return updateRow(rowNumber, patch);
    }

    async function markCompleted(rowNumber, result = {}) {
        return updateRow(rowNumber, {
            status: '완료',
            processedAt: String(result.processedAt || now()).trim(),
            bufferPostId: String(result.bufferPostId || '').trim(),
            appendLog: String(result.log || '').trim()
        });
    }

    async function markFailed(rowNumber, result = {}) {
        return updateRow(rowNumber, {
            status: '실패',
            processedAt: String(result.processedAt || now()).trim(),
            appendLog: String(result.log || '').trim()
        });
    }

    async function markSkipped(rowNumber, result = {}) {
        return updateRow(rowNumber, {
            status: '건너뜀',
            processedAt: String(result.processedAt || now()).trim(),
            appendLog: String(result.log || '').trim()
        });
    }

    async function markGroupProcessing(rows, log = '') {
        const message = String(log || '').trim();
        return updateRows((Array.isArray(rows) ? rows : []).map((row) => ({
            rowNumber: row.rowNumber,
            patch: {
                status: '처리 중',
                ...(message ? { appendLog: message } : {})
            }
        })));
    }

    async function applyDeliveryResults(results = []) {
        const processedAt = now();
        return updateRows((Array.isArray(results) ? results : []).map((result) => {
            const status = String(result?.status || '').trim();
            if (!['완료', '실패', '건너뜀'].includes(status)) {
                throw new Error(`SNS delivery 결과 상태가 올바르지 않습니다: ${status}`);
            }
            return {
                rowNumber: result.rowNumber,
                patch: {
                    status,
                    processedAt: String(result.processedAt || processedAt).trim(),
                    ...(status === '완료'
                        ? { bufferPostId: String(result.bufferPostId || '').trim() }
                        : { bufferPostId: '' }),
                    appendLog: String(result.log || '').trim()
                }
            };
        }));
    }

    async function saveEntryHashtags(entryKey, hashtags) {
        await gateway.prepare();
        const normalizedEntryKey = String(entryKey || '').trim();
        const normalizedHashtags = String(hashtags || '').trim();
        if (!normalizedEntryKey) {
            throw new Error('해시태그 저장에는 SNS entry_key가 필요합니다.');
        }
        if (!normalizedHashtags) {
            return { success: true, updatedCount: 0, rowNumbers: [] };
        }

        const parsed = await readPreparedRows();
        const targets = parsed.items.filter(
            (item) => item.entryKey === normalizedEntryKey && !String(item.hashtags || '').trim()
        );
        const updates = targets.map((item) => ({
            rowNumber: item.rowNumber,
            columnIndex: parsed.headerMap.hashtags,
            value: normalizedHashtags
        }));
        if (updates.length > 0) await gateway.updateCells(updates);
        return {
            success: true,
            updatedCount: targets.length,
            rowNumbers: targets.map((item) => item.rowNumber)
        };
    }

    async function skipPendingBySource(sourcePlatform, reason = 'SNS 발행 대상 블로그에서 제외됨') {
        await gateway.prepare();
        const normalizedSource = String(sourcePlatform || '').trim().toLowerCase();
        if (!normalizedSource) throw new Error('건너뛸 원문 플랫폼이 필요합니다.');

        const parsed = await readPreparedRows();
        const targets = parsed.items.filter(
            (item) => item.sourcePlatform.toLowerCase() === normalizedSource && item.status === '대기'
        );
        const updates = [];
        const processedAt = now();
        for (const item of targets) {
            updates.push({
                rowNumber: item.rowNumber,
                columnIndex: parsed.headerMap.status,
                value: '건너뜀'
            });
            updates.push({
                rowNumber: item.rowNumber,
                columnIndex: parsed.headerMap.processedAt,
                value: processedAt
            });
            updates.push({
                rowNumber: item.rowNumber,
                columnIndex: parsed.headerMap.log,
                value: joinLog(item.log, reason)
            });
        }
        if (updates.length > 0) await gateway.updateCells(updates);
        return { success: true, updatedCount: targets.length, rowNumbers: targets.map((item) => item.rowNumber) };
    }

    return {
        listRows,
        appendEntriesDeliveries,
        appendEntryDeliveries,
        findFirstPending,
        findFirstPendingGroup,
        updateRows,
        updateRow,
        markProcessing,
        markCompleted,
        markFailed,
        markSkipped,
        markGroupProcessing,
        applyDeliveryResults,
        saveEntryHashtags,
        skipPendingBySource
    };
}

module.exports = {
    FIELD_TO_HEADER,
    HEADER_TO_FIELD,
    normalizeOriginalUrl,
    buildEntryKey,
    buildDeliveryKey,
    normalizeChannels,
    parseSheetRows,
    createSnsSheetStore
};
