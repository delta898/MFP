function compact(value, maxLength = 4000) {
    return String(value || '').trim().slice(0, maxLength);
}

function buildLedgerCandidate(source = {}, snapshot = {}) {
    return {
        source,
        source_platform: compact(source.source_platform || source.sourcePlatform || (source.kind === 'manuscript' ? '직접 입력' : 'URL 직접 입력'), 100),
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

    async function safely(label, operation) {
        if (!store) return null;
        try {
            return await operation();
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 관리대장 ${label} 실패: ${error.message}`);
            return null;
        }
    }

    async function registerSources(sources = []) {
        const items = Array.isArray(sources) ? sources : [];
        if (items.length === 0) return null;
        const signature = sourceSetSignature(items);
        if (signature && signature === lastRegisteredSourceSignature) return { success: true, skipped: true };
        const result = await safely('RSS 동기화', () => store.upsertCandidates(
            items.map((source) => buildLedgerCandidate(source, source))
        ));
        if (result) lastRegisteredSourceSignature = signature;
        return result;
    }

    async function recordGeneration(snapshot = {}, generation = {}) {
        return safely('생성 결과 동기화', async () => {
            const source = snapshot.source && typeof snapshot.source === 'object' ? snapshot.source : {};
            return store.upsertCandidateWithPatch(buildLedgerCandidate(source, snapshot), {
                workflowStatus: workflowStatusForGeneration(generation),
                generationId: compact(generation.id, 500),
                cardCount: String(Array.isArray(generation.cards) ? generation.cards.length : 0),
                lastError: ''
            });
        });
    }

    async function recordGenerationProgress(generation = {}) {
        return safely('이미지 결과 동기화', () => store.updateByGenerationId(generation.id, {
                workflowStatus: workflowStatusForGeneration(generation),
                cardCount: String(Array.isArray(generation.cards) ? generation.cards.length : 0),
                lastError: ''
            }));
    }

    async function recordPublishing(generationId, result = {}) {
        return safely('발행 결과 동기화', () => store.updateByGenerationId(
            generationId,
            buildPublishingPatch(result, now)
        ));
    }

    async function recordPublishingFailure(generationId, error) {
        return safely('발행 실패 동기화', () => store.updateByGenerationId(generationId, {
                publishingStatus: '실패',
                processedAt: compact(now(), 100),
                lastError: compact(error?.message || error?.code || 'SNS 발행 실패', 1000)
            }));
    }

    return { registerSources, recordGeneration, recordGenerationProgress, recordPublishing, recordPublishingFailure };
}

module.exports = {
    buildLedgerCandidate,
    sourceSetSignature,
    workflowStatusForGeneration,
    buildPublishingPatch,
    createCardNewsLedgerSyncService
};
