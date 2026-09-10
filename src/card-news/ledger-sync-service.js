const { buildEntryKey, normalizeOriginalUrl } = require('./ledger-sheet-store');
const { toCardNewsManagementFields } = require('./management-status');

function compact(value, maxLength = 4000) {
    return String(value || '').trim().slice(0, maxLength);
}

function buildLedgerCandidate(source = {}, snapshot = {}) {
    return {
        source,
        source_platform: compact(source.feed_label || source.feedLabel || source.source_platform || source.sourcePlatform || (source.kind === 'manuscript' ? '직접 입력' : 'URL 직접 입력'), 100),
        title: compact(snapshot.title || source.title, 300),
        original_url: compact(snapshot.canonical_url || source.canonical_url || source.canonicalUrl, 4000),
        rss_guid: compact(source.item_key || source.itemKey || source.guid, 1000),
        rss_published_at: compact(source.published_at || source.publishedAt, 100),
        collected_at: compact(snapshot.retrieved_at, 100)
    };
}

function workflowStatusForGeneration(generation = {}) {
    return compact(generation.status, 100) === 'completed' ? '제작 완료' : '제작 중';
}

function sourceSetSignature(sources = []) {
    return (Array.isArray(sources) ? sources : [])
        .map((source) => [
            compact(source?.kind, 40),
            compact(source?.item_key || source?.itemKey || source?.guid, 1000),
            compact(source?.canonical_url || source?.canonicalUrl, 4000)
        ].join('\n'))
        .sort()
        .join('\n---\n');
}

function buildPublishingPatch(result = {}, now = () => new Date().toISOString()) {
    const items = Array.isArray(result.results) ? result.results : [];
    const successes = items.filter((item) => item?.success === true);
    const channels = items
        .map((item) => compact(item?.channel_name || item?.service || item?.channel_id, 200))
        .filter(Boolean);
    const links = successes.map((item) => compact(item?.external_link, 4000)).filter(Boolean);
    const publishingStatus = result.confirmed !== true
        ? '발행 중'
        : (successes.length === items.length && items.length > 0
            ? '발행 완료'
            : (successes.length > 0 ? '일부 완료' : '실패'));
    const errors = items
        .filter((item) => item?.success !== true)
        .map((item) => compact(item?.message || item?.code, 500))
        .filter(Boolean);
    return {
        publishingStatus,
        channels: channels.join(', '),
        postLinks: links.join('\n'),
        processedAt: compact(now(), 100),
        lastError: errors.join(' / ')
    };
}

function createCardNewsLedgerSyncService(options = {}) {
    const store = options.store;
    const logger = options.logger;
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    let lastRegisteredSourceSignature = '';
    let lastRegistrationResult = null;

    async function safely(label, operation) {
        if (!store) return null;
        try {
            return await operation();
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 관리대장 ${label} 실패: ${error.message}`);
            return null;
        }
    }

    function refreshCachedRow(updated) {
        if (!updated || !lastRegistrationResult?.results) return;
        lastRegistrationResult = {
            ...lastRegistrationResult,
            results: lastRegistrationResult.results.map((result) => {
                const item = result.item || {};
                const sameEntry = updated.entryKey && item.entryKey === updated.entryKey;
                const sameGeneration = updated.generationId && item.generationId === updated.generationId;
                return sameEntry || sameGeneration ? { ...result, item: { ...item, ...updated } } : result;
            })
        };
    }

    async function registerSources(sources = []) {
        const items = Array.isArray(sources) ? sources : [];
        if (items.length === 0) return null;
        const signature = sourceSetSignature(items);
        if (signature && signature === lastRegisteredSourceSignature) return { ...lastRegistrationResult, skipped: true };
        const result = await safely('RSS 동기화', () => store.upsertCandidates(
            items.map((source) => buildLedgerCandidate(source, source))
        ));
        if (result) {
            lastRegisteredSourceSignature = signature;
            lastRegistrationResult = result;
        }
        return result;
    }

    function annotateSources(sources = [], registrationResult = lastRegistrationResult) {
        const rows = new Map((registrationResult?.results || []).map((result) => [result.entryKey, result.item || {}]));
        return (Array.isArray(sources) ? sources : []).map((source) => {
            let row = null;
            try { row = rows.get(buildEntryKey(source)) || null; } catch (_error) { }
            if (!row) return source;
            return {
                ...source,
                management: {
                    workflow_status: compact(row.workflowStatus, 100),
                    publishing_status: compact(row.publishingStatus, 100),
                    generation_id: compact(row.generationId, 500),
                    ...toCardNewsManagementFields(row)
                }
            };
        });
    }

    async function listManagedRows() {
        if (!store) throw new Error('카드뉴스 관리대장이 준비되지 않았습니다.');
        try {
            const rows = await store.listRows();
            return Array.isArray(rows) ? rows.filter((row) => compact(row.generationId, 500)) : [];
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 관리대장 목록 조회 실패: ${error.message}`);
            throw error;
        }
    }

    async function recordGeneration(snapshot = {}, generation = {}) {
        const result = await safely('생성 결과 동기화', async () => {
            const source = snapshot.source && typeof snapshot.source === 'object' ? snapshot.source : {};
            return store.upsertCandidateWithPatch(buildLedgerCandidate(source, snapshot), {
                workflowStatus: workflowStatusForGeneration(generation),
                generationId: compact(generation.id, 500),
                cardCount: String(Array.isArray(generation.cards) ? generation.cards.length : 0),
                lastError: ''
            });
        });
        refreshCachedRow(result);
        return result;
    }

    async function recordGenerationProgress(generation = {}) {
        const result = await safely('이미지 결과 동기화', () => store.updateByGenerationId(generation.id, {
                workflowStatus: workflowStatusForGeneration(generation),
                cardCount: String(Array.isArray(generation.cards) ? generation.cards.length : 0),
                lastError: ''
            }));
        refreshCachedRow(result);
        return result;
    }

    async function recordImportedGeneration(snapshot = {}, generation = {}) {
        const originalUrl = normalizeOriginalUrl(snapshot.canonical_url || snapshot.source?.canonical_url || '');
        if (originalUrl && store?.listRows && store?.updateRow) {
            const linked = await safely('ZIP 가져오기 연결', async () => {
                const rows = await store.listRows();
                const existing = rows.find((row) => normalizeOriginalUrl(row.originalUrl) === originalUrl);
                if (!existing) return null;
                return store.updateRow(existing.rowNumber, {
                    workflowStatus: workflowStatusForGeneration(generation),
                    generationId: compact(generation.id, 500),
                    cardCount: String(Array.isArray(generation.cards) ? generation.cards.length : 0),
                    lastError: ''
                });
            });
            if (linked) {
                refreshCachedRow(linked);
                return linked;
            }
        }
        return recordGeneration(snapshot, generation);
    }

    async function recordPublishing(generationId, result = {}) {
        const updated = await safely('발행 결과 동기화', () => store.updateByGenerationId(
            generationId,
            buildPublishingPatch(result, now)
        ));
        refreshCachedRow(updated);
        return updated;
    }

    async function recordPublishingFailure(generationId, error) {
        const result = await safely('발행 실패 동기화', () => store.updateByGenerationId(generationId, {
                publishingStatus: '실패',
                processedAt: compact(now(), 100),
                lastError: compact(error?.message || error?.code || 'SNS 발행 실패', 1000)
            }));
        refreshCachedRow(result);
        return result;
    }

    return {
        registerSources,
        annotateSources,
        listManagedRows,
        recordGeneration,
        recordImportedGeneration,
        recordGenerationProgress,
        recordPublishing,
        recordPublishingFailure
    };
}

module.exports = {
    buildLedgerCandidate,
    sourceSetSignature,
    workflowStatusForGeneration,
    buildPublishingPatch,
    createCardNewsLedgerSyncService
};
