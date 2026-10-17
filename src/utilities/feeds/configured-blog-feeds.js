'use strict';

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

function resolveConfiguredBlogFeedDefinitions(config = {}) {
    const feeds = [];
    const naverId = String(config.NAVER_ID || '').trim();
    if (naverId) feeds.push({ sourcePlatform: 'naver', url: `https://rss.blog.naver.com/${encodeURIComponent(naverId)}.xml` });
    const wordpressFeedUrl = resolveWordPressFeedUrl(config.WORDPRESS_URL);
    if (wordpressFeedUrl) feeds.push({ sourcePlatform: 'wordpress', url: wordpressFeedUrl });
    return feeds;
}

function sortOldestFirst(items) {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => {
            const timestamp = Date.parse(String(item?.pubDate || ''));
            return { item, index, timestamp: Number.isFinite(timestamp) ? timestamp : null };
        })
        .sort((a, b) => {
            if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            if (a.timestamp !== null && b.timestamp === null) return -1;
            if (a.timestamp === null && b.timestamp !== null) return 1;
            return b.index - a.index;
        })
        .map((entry) => entry.item);
}

module.exports = { resolveWordPressFeedUrl, resolveConfiguredBlogFeedDefinitions, sortOldestFirst };
