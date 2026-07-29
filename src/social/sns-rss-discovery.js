const axios = require('axios');
const { buildEntryKey } = require('./sns-sheet-store');
const {
    extractFeedSummary,
    extractOgImage,
    extractOgDescription
} = require('./feed-entry');

function normalizeSourceBlogs(value) {
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map((item) => String(item || '').trim().toLowerCase()))]
        .filter((item) => item === 'naver' || item === 'wordpress');
}

function resolveWordPressFeedUrl(rawUrl) {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        parsed.hash = '';
        parsed.search = '';
        const path = parsed.pathname.replace(/\/+$/, '');
        parsed.pathname = /\/feed$/i.test(path) ? `${path}/` : `${path}/feed/`;
        return parsed.toString();
    } catch (_error) {
        return '';
    }
}

function resolveSnsFeedDefinitions(config = {}) {
    const feeds = [];
    const naverId = String(config.NAVER_ID || '').trim();
    if (naverId) {
        feeds.push({
            sourcePlatform: 'naver',
            url: `https://rss.blog.naver.com/${encodeURIComponent(naverId)}.xml`
        });
    }
    const wordpressFeedUrl = resolveWordPressFeedUrl(config.WORDPRESS_URL);
    if (wordpressFeedUrl) {
        feeds.push({
            sourcePlatform: 'wordpress',
            url: wordpressFeedUrl
        });
    }
    return feeds;
}

function sortOldestFirst(items) {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => {
            const timestamp = Date.parse(String(item?.pubDate || ''));
            return {
                item,
                index,
                timestamp: Number.isFinite(timestamp) ? timestamp : null
            };
        })
        .sort((a, b) => {
            if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
                return a.timestamp - b.timestamp;
            }
            if (a.timestamp !== null && b.timestamp === null) return -1;
            if (a.timestamp === null && b.timestamp !== null) return 1;
            return b.index - a.index;
        })
        .map((entry) => entry.item);
}

function validateSnsDiscoveryConfig(config = {}, feedDefinitions = resolveSnsFeedDefinitions(config)) {
    const errors = [];
    const channels = Array.isArray(config.BUFFER_CHANNELS) ? config.BUFFER_CHANNELS : [];
    const sourceBlogs = normalizeSourceBlogs(config.SNS_SOURCE_BLOGS);
    if (!String(config.BUFFER_API_KEY || '').trim()) errors.push('Buffer API Key');
    if (!String(config.BUFFER_ORGANIZATION_ID || '').trim()) errors.push('Buffer Organization');
    if (channels.length === 0) errors.push('Buffer 발행 채널');
    if (sourceBlogs.length === 0) errors.push('SNS 발행 대상 블로그');

    const configuredSources = new Set(feedDefinitions.map((feed) => feed.sourcePlatform));
    const effectiveSourceBlogs = sourceBlogs.filter((source) => configuredSources.has(source));
    const unavailableSourceBlogs = sourceBlogs.filter((source) => !configuredSources.has(source));
    if (sourceBlogs.length > 0 && effectiveSourceBlogs.length === 0) {
        for (const source of unavailableSourceBlogs) {
            errors.push(source === 'naver' ? '네이버 블로그 ID' : 'WordPress URL');
        }
    }
    return {
        ready: errors.length === 0,
        errors,
        channels,
        sourceBlogs,
        effectiveSourceBlogs,
        unavailableSourceBlogs
    };
}

function createSnsRssDiscovery(options = {}) {
    const {
        CONFIG,
        License,
        Utils,
        store,
        getEnableSnsDistribution,
        Logger
    } = options;
    const httpClient = options.httpClient || axios;
    if (!CONFIG || !License || !Utils || !store || typeof getEnableSnsDistribution !== 'function') {
        throw new Error('SNS RSS Discovery 의존성이 올바르지 않습니다.');
    }

    async function resolvePageMetadata(pageUrl) {
        try {
            const response = await httpClient.get(pageUrl, {
                timeout: 8000,
                maxRedirects: 3,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                validateStatus: () => true
            });
            if (response.status < 200 || response.status >= 300 || typeof response.data !== 'string') {
                return { imageUrl: '', summary: '' };
            }
            return {
                imageUrl: extractOgImage(response.data, pageUrl),
                summary: extractOgDescription(response.data)
            };
        } catch (error) {
            Logger?.debug?.(`🔎 [SNS] 원문 메타데이터 조회 실패 (${pageUrl}): ${error.message}`);
            return { imageUrl: '', summary: '' };
        }
    }

    async function resolvePageImage(pageUrl) {
        const metadata = await resolvePageMetadata(pageUrl);
        return metadata.imageUrl;
    }

    async function run(trigger = 'auto') {
        if (CONFIG.SNS_PUBLISH_ENABLED !== true) {
            return {
                success: false,
                code: 'SNS_DISTRIBUTION_DISABLED',
                message: 'SNS 자동 발행이 비활성화되어 있습니다.'
            };
        }

        const license = await License.checkLicenseStatus({ quiet: true });
        if (!license?.success) {
            return {
                success: false,
                code: 'LICENSE_STATUS_FAILED',
                message: license?.message || '라이선스 확인에 실패했습니다.'
            };
        }
        if (!getEnableSnsDistribution(license.features)) {
            return {
                success: false,
                code: 'SNS_CAPABILITY_DISABLED',
                message: 'SNS 자동 발행 capability가 비활성화되어 있습니다.'
            };
        }

        const feedDefinitions = resolveSnsFeedDefinitions(CONFIG);
        const readiness = validateSnsDiscoveryConfig(CONFIG, feedDefinitions);
        if (!readiness.ready) {
            return {
                success: false,
                code: 'SNS_CONFIG_INCOMPLETE',
                message: `SNS 자동 발행 설정이 부족합니다: ${readiness.errors.join(', ')}`
            };
        }

        const selectedSources = new Set(readiness.effectiveSourceBlogs);
        const existingRows = await store.listRows();
        const trackedEntryKeys = new Set(
            existingRows.map((row) => String(row.entryKey || '').trim()).filter(Boolean)
        );
        const descriptors = [];
        const feedSummaries = [];
        let discoveredCount = 0;
        let duplicateCount = 0;

        for (const feed of feedDefinitions) {
            const items = await Utils.fetchAndParseRss(feed.url);
            discoveredCount += items.length;
            const summary = {
                sourcePlatform: feed.sourcePlatform,
                feedUrl: feed.url,
                discoveredCount: items.length,
                newCount: 0
            };

            for (const item of sortOldestFirst(items)) {
                const entry = {
                    guid: String(item.guid || '').trim(),
                    sourcePlatform: feed.sourcePlatform,
                    title: String(item.title || '').trim(),
                    summary: String(item.summary || extractFeedSummary(item.description, item.content)).trim(),
                    originalUrl: String(item.link || '').trim(),
                    imageUrl: String(item.imageUrl || '').trim(),
                    rssPublishedAt: String(item.pubDate || '').trim()
                };

                let entryKey;
                try {
                    entryKey = buildEntryKey(entry);
                } catch (error) {
                    Logger?.warn?.(`⚠️ [SNS] RSS 항목 식별 실패 (${entry.originalUrl || entry.title}): ${error.message}`);
                    continue;
                }
                if (trackedEntryKeys.has(entryKey)) {
                    duplicateCount += 1;
                    continue;
                }

                trackedEntryKeys.add(entryKey);
                if (!entry.imageUrl || !entry.summary) {
                    const metadata = await resolvePageMetadata(entry.originalUrl);
                    if (!entry.imageUrl) entry.imageUrl = metadata.imageUrl;
                    if (!entry.summary) entry.summary = metadata.summary;
                }
                const selected = selectedSources.has(feed.sourcePlatform);
                descriptors.push({
                    entry,
                    status: selected ? '대기' : '건너뜀',
                    log: selected ? '' : 'SNS 발행 대상 블로그에서 제외됨'
                });
                summary.newCount += 1;
            }
            feedSummaries.push(summary);
        }

        const appendResult = await store.appendEntriesDeliveries({
            entries: descriptors,
            channels: readiness.channels
        });
        const result = {
            success: true,
            code: 'SNS_DISCOVERY_COMPLETED',
            data: {
                trigger,
                discoveredCount,
                newEntryCount: Number(appendResult?.addedEntryCount || 0),
                addedDeliveryCount: Number(appendResult?.addedCount || 0),
                duplicateCount,
                unavailableSourceBlogs: readiness.unavailableSourceBlogs,
                feedSummaries
            }
        };
        Logger?.info?.(
            `✅ [SNS] RSS 확인 완료: 발견 ${discoveredCount}건, 신규 원문 ${result.data.newEntryCount}건, `
            + `채널별 행 ${result.data.addedDeliveryCount}건, 중복 ${duplicateCount}건`
        );
        return result;
    }

    return {
        run,
        resolvePageMetadata,
        resolvePageImage
    };
}

module.exports = {
    normalizeSourceBlogs,
    resolveWordPressFeedUrl,
    resolveSnsFeedDefinitions,
    sortOldestFirst,
    validateSnsDiscoveryConfig,
    createSnsRssDiscovery
};
