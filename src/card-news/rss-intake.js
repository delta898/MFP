const { buildLedgerCandidate } = require('./ledger-sync-service');

function createCardNewsRssIntake(options = {}) {
    const CONFIG = options.CONFIG || {};
    const discoverConfiguredArticles = options.discoverConfiguredArticles;
    const ledgerStore = options.ledgerStore;
    const logger = options.logger;
    let inFlight = null;

    if (typeof discoverConfiguredArticles !== 'function') {
        throw new Error('Card News RSS intake에는 글 목록 조회 기능이 필요합니다.');
    }
    if (!ledgerStore || typeof ledgerStore.upsertCandidates !== 'function') {
        throw new Error('Card News RSS intake에는 관리대장 저장소가 필요합니다.');
    }

    async function collect(trigger = 'scheduled') {
        if (inFlight) {
            return {
                success: true,
                skipped: true,
                reason: 'in_progress',
                trigger
            };
        }

        inFlight = (async () => {
            if (!String(CONFIG.GOOGLE_SHEET_ID || '').trim()) {
                return {
                    success: true,
                    skipped: true,
                    reason: 'sheet_not_configured',
                    trigger
                };
            }

            const discovery = await discoverConfiguredArticles(CONFIG);
            const articles = Array.isArray(discovery?.articles) ? discovery.articles : [];
            const failures = Array.isArray(discovery?.failures) ? discovery.failures : [];
            const configuredFeedCount = Number(discovery?.configured_feed_count || 0);

            if (configuredFeedCount === 0) {
                return {
                    success: true,
                    skipped: true,
                    reason: 'feeds_not_configured',
                    trigger,
                    configuredFeedCount: 0,
                    failureCount: 0
                };
            }

            let ledgerResult = { createdCount: 0, existingCount: 0, results: [] };
            if (articles.length > 0) {
                ledgerResult = await ledgerStore.upsertCandidates(
                    articles.map((source) => buildLedgerCandidate(source, source))
                );
            }

            const summary = {
                success: failures.length < configuredFeedCount,
                skipped: false,
                trigger,
                configuredFeedCount,
                discoveredCount: articles.length,
                createdCount: Number(ledgerResult?.createdCount || 0),
                existingCount: Number(ledgerResult?.existingCount || 0),
                failureCount: failures.length,
                failures
            };

            if (summary.createdCount > 0) {
                logger?.info?.(`✅ [CardNews RSS] 새 글 ${summary.createdCount}건을 관리대장에 추가했습니다.`);
            }
            if (summary.failureCount > 0) {
                const failedSources = failures.map((failure) => failure.feed_label || failure.source_platform || failure.feed_url).filter(Boolean).join(', ');
                logger?.warn?.(`⚠️ [CardNews RSS] 일부 피드 확인 실패 (${summary.failureCount}/${configuredFeedCount}${failedSources ? `: ${failedSources}` : ''})`);
            }
            return summary;
        })();

        try {
            return await inFlight;
        } finally {
            inFlight = null;
        }
    }

    return { collect };
}

module.exports = { createCardNewsRssIntake };
