const { createApiError } = require('../errors');

function createSystemService(deps = {}) {
    const {
        APP_VERSION,
        Utils,
        fs,
        path,
        CONFIG,
        parseBoolQuery,
        ensureSheetsReadyForUi,
        logger,
        axios,
        cheerio
    } = deps;

    const DASHBOARD_CONTENT_SOURCES = [
        {
            key: 'naver',
            label: '네이버 블로그',
            feedType: 'rss',
            rssUrl: 'https://rss.blog.naver.com/amadejjs.xml',
            homeUrl: 'https://blog.naver.com/amadejjs'
        },
        {
            key: 'wordpress',
            label: '워드프레스',
            feedType: 'rss',
            rssUrl: 'https://itmania.hangadac.com/feed/',
            homeUrl: 'https://itmania.hangadac.com'
        },
        {
            key: 'youtubePlaylist',
            label: '유튜브 쇼츠',
            feedType: 'atom',
            rssUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4Sl4m-ZV65knmWTl0UFYkw',
            homeUrl: 'https://www.youtube.com/playlist?list=PLm2fQEuE3U-NafRxEALr8Us7mtm5cV7ob'
        },
        {
            key: 'noworry',
            label: 'No Worry Blog',
            feedType: 'rss',
            rssUrl: 'https://noworrybehappy.com/feed/',
            homeUrl: 'https://noworrybehappy.com'
        }
    ];

    const FEED_FETCH_TIMEOUT_MS = 10000;
    const MAX_FEED_ITEMS = 10;

    function clampFeedLimit(raw) {
        const value = Number(raw);
        if (!Number.isFinite(value)) return 4;
        return Math.max(1, Math.min(MAX_FEED_ITEMS, Math.floor(value)));
    }

    function clampDashboardLogLimit(raw) {
        const value = Number(raw);
        if (!Number.isFinite(value)) return 80;
        return Math.max(10, Math.min(200, Math.floor(value)));
    }

    function parseLogLine(line = '') {
        const text = String(line || '').trim();
        if (!text) return null;
        const m = text.match(/^\[([^\]]+)\]\s+\[([A-Z]+)\]\s+(.+)$/);
        if (!m) return null;
        return {
            timestamp: m[1],
            level: String(m[2] || '').toLowerCase(),
            message: String(m[3] || '').trim()
        };
    }

    function getRecentLogsFromFile(limit = 80) {
        try {
            const date = new Date();
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const logFile = path.join(CONFIG.ROOT_DIR, 'logs', `${y}-${m}-${d}.log`);
            if (!fs.existsSync(logFile)) return [];

            const content = String(fs.readFileSync(logFile, 'utf-8') || '');
            if (!content.trim()) return [];

            const lines = content.split('\n').filter(Boolean);
            const out = [];
            for (let i = lines.length - 1; i >= 0; i -= 1) {
                const parsed = parseLogLine(lines[i]);
                if (!parsed) continue;
                out.push(parsed);
                if (out.length >= limit) break;
            }
            return out;
        } catch (_) {
            return [];
        }
    }

    function collapseText(raw = '') {
        return String(raw || '').replace(/\s+/g, ' ').trim();
    }

    function extractFirstImageUrl(rawHtml = '') {
        const html = String(rawHtml || '');
        if (!html) return '';
        const m = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
        return m?.[1] || '';
    }

    function parseRssItems({ xml, limit, sourceKey }) {
        const items = [];
        if (!xml || typeof xml !== 'string') return items;
        const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });
        $('item').each((_, el) => {
            if (items.length >= limit) return false;
            const node = $(el);
            const title = collapseText(node.find('title').first().text());
            const link = collapseText(node.find('link').first().text());
            const pubDate = collapseText(node.find('pubDate').first().text());
            const descriptionHtml = node.find('description').first().text() || '';
            const contentEncodedHtml = node.find('content\\:encoded').first().text() || '';
            const descriptionRaw = descriptionHtml || contentEncodedHtml;
            const description = collapseText((descriptionRaw || '').replace(/<[^>]*>/g, ' '));
            let thumbnail = '';
            const mediaThumb = node.find('media\\:thumbnail').first();
            if (mediaThumb.length > 0) {
                thumbnail = collapseText(mediaThumb.attr('url'));
            }
            if (!thumbnail) {
                const mediaContent = node.find('media\\:content').first();
                const contentType = String(mediaContent.attr('type') || '');
                const medium = String(mediaContent.attr('medium') || '');
                if (mediaContent.length > 0 && (contentType.startsWith('image/') || medium === 'image')) {
                    thumbnail = collapseText(mediaContent.attr('url'));
                }
            }
            if (!thumbnail) {
                const enclosure = node.find('enclosure').first();
                const contentType = String(enclosure.attr('type') || '');
                if (enclosure.length > 0 && contentType.startsWith('image/')) {
                    thumbnail = collapseText(enclosure.attr('url'));
                }
            }
            if (!thumbnail) {
                // WordPress는 description에 요약만 들어가고 content:encoded에 본문 이미지가 들어가는 경우가 많음
                thumbnail = extractFirstImageUrl(contentEncodedHtml || descriptionHtml || descriptionRaw);
            }
            if (!title || !link) return;
            items.push({
                source: sourceKey,
                title,
                link,
                publishedAt: pubDate,
                summary: description,
                thumbnail
            });
        });
        return items;
    }

    function parseYoutubeAtomItems({ xml, limit, sourceKey }) {
        const items = [];
        if (!xml || typeof xml !== 'string') return items;
        const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });
        $('entry').each((_, el) => {
            if (items.length >= limit) return false;
            const node = $(el);
            const title = collapseText(node.find('title').first().text());
            const linkNode = node.find('link[rel="alternate"]').first();
            const link = collapseText(linkNode.attr('href') || node.find('link').first().attr('href') || '');
            const publishedAt = collapseText(node.find('published').first().text() || node.find('updated').first().text());
            const summary = collapseText(
                node.find('media\\:group > media\\:description').first().text()
                || node.find('summary').first().text()
            );
            const thumbnail = collapseText(
                node.find('media\\:group > media\\:thumbnail').first().attr('url')
                || node.find('media\\:thumbnail').first().attr('url')
                || ''
            );
            if (!title || !link) return;
            items.push({
                source: sourceKey,
                title,
                link,
                publishedAt,
                summary,
                thumbnail
            });
        });
        return items;
    }

    async function fetchFeedItems(source, limit) {
        const url = String(source.rssUrl || '').trim();
        if (!url) return { ...source, items: [], error: '피드 URL 없음' };

        try {
            const response = await axios.get(url, {
                responseType: 'text',
                timeout: FEED_FETCH_TIMEOUT_MS,
                headers: {
                    'User-Agent': 'BlogGenius/1.0 (+https://blog.naver.com/amadejjs)',
                    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
                },
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });

            const xml = String(response.data || '');
            const feedType = String(source.feedType || 'rss').trim().toLowerCase();
            const items = feedType === 'atom'
                ? parseYoutubeAtomItems({ xml, limit, sourceKey: source.key })
                : parseRssItems({ xml, limit, sourceKey: source.key });

            return {
                key: source.key,
                label: source.label,
                homeUrl: source.homeUrl,
                rssUrl: url,
                items
            };
        } catch (error) {
            Logger.warn(`⚠️ 대시보드 피드 조회 실패: ${source.label} (URL: ${url}) - ${error?.message || 'unknown error'}`);
            return {
                key: source.key,
                label: source.label,
                homeUrl: source.homeUrl,
                rssUrl: url,
                items: [],
                error: String(error?.message || '피드 조회 실패')
            };
        }
    }

    return {
        async getHealth() {
            return { status: 'ok', version: APP_VERSION };
        },

        async checkUpdate({ updater, forceRaw }) {
            const force = forceRaw === 'true' || forceRaw === true;
            return (await updater.checkForUpdate({ force })) || { hasUpdate: false };
        },

        async getUpdateProgress({ updater }) {
            return { ...updater.progress };
        },

        async applyUpdate({ updater }) {
            await updater.applyUpdate(() => { });
            return { success: true };
        },

        async getDashboardSummary() {
            return Utils.getDashboardSummary();
        },

        async getDashboardLogs({ limitRaw } = {}) {
            const limit = clampDashboardLogLimit(limitRaw);
            const memoryLogs = Array.isArray(logger.getRecentLogs(limit)) ? logger.getRecentLogs(limit) : [];
            const fileLogs = getRecentLogsFromFile(limit);

            // 메모리/파일 로그 합치고 중복 제거 (timestamp + level + message)
            const merged = [];
            const seen = new Set();
            [...memoryLogs, ...fileLogs].forEach((item) => {
                const ts = String(item?.timestamp || '').trim();
                const lv = String(item?.level || '').trim().toLowerCase();
                const msg = String(item?.message || '').trim();
                if (!ts || !msg) return;
                const key = `${ts}__${lv}__${msg}`;
                if (seen.has(key)) return;
                seen.add(key);
                merged.push({ timestamp: ts, level: lv, message: msg });
            });

            return { logs: merged.slice(0, limit) };
        },

        async getLogFiles() {
            const logDir = path.join(CONFIG.ROOT_DIR, 'logs');
            if (!fs.existsSync(logDir)) {
                return { files: [] };
            }
            const files = fs.readdirSync(logDir)
                .filter((f) => f.endsWith('.log'))
                .sort((a, b) => b.localeCompare(a));
            return { files };
        },

        async readLogFile({ filename }) {
            if (!filename || !filename.endsWith('.log') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                throw createApiError(400, 'INVALID_FILE', '잘못된 파일 이름입니다.');
            }
            const logFile = path.join(CONFIG.ROOT_DIR, 'logs', filename);
            if (!fs.existsSync(logFile)) {
                throw createApiError(404, 'FILE_NOT_FOUND', '로그 파일을 찾을 수 없습니다.');
            }
            const content = fs.readFileSync(logFile, 'utf-8');
            return { file: filename, content };
        },

        async getConfigStatus() {
            return {
                ready: CONFIG.CONFIG_READY === true,
                sourceType: String(CONFIG.CONFIG_SOURCE_TYPE || ''),
                sourcePath: String(CONFIG.CONFIG_SOURCE_PATH || ''),
                message: String(CONFIG.CONFIG_ERROR_MESSAGE || ''),
                version: String(APP_VERSION || '0.0.0'),
                isEssentialSet: CONFIG.CONFIG_IS_ESSENTIAL_SET === true,
                isNaverSet: CONFIG.CONFIG_IS_NAVER_SET === true,
                isWpSet: CONFIG.CONFIG_IS_WP_SET === true
            };
        },

        async getDashboardExternalContent({ limitRaw }) {
            const limit = clampFeedLimit(limitRaw);
            const results = await Promise.all(
                DASHBOARD_CONTENT_SOURCES.map((source) => fetchFeedItems(source, limit))
            );

            return {
                updatedAt: new Date().toISOString(),
                limit,
                sources: results
            };
        },

        async ensureSheets({ forceRaw }) {
            const force = parseBoolQuery(forceRaw);
            return ensureSheetsReadyForUi({ force });
        }
    };
}

module.exports = {
    createSystemService
};
