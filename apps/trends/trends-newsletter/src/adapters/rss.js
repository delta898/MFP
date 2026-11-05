import { parseRssFeed } from '../../../shared/lib/rss-feed.mjs';

const MAX_FEEDS = 8;
const MAX_ITEMS_PER_FEED = 10;

function parseSources(config) {
    let sources;
    try { sources = JSON.parse(String(config || '')); }
    catch { throw new Error('Newsletter RSS source configuration must be valid JSON.'); }
    if (!Array.isArray(sources) || sources.length < 1 || sources.length > MAX_FEEDS) {
        throw new Error(`Configure between 1 and ${MAX_FEEDS} newsletter RSS sources.`);
    }
    return sources.map((source) => {
        const name = String(source?.name || '').trim().slice(0, 80);
        let feedUrl;
        let siteUrl;
        try {
            feedUrl = new URL(String(source?.feedUrl || ''));
            siteUrl = new URL(String(source?.siteUrl || ''));
        } catch { throw new Error('Newsletter RSS source URL is invalid.'); }
        if (!name || feedUrl.protocol !== 'https:' || siteUrl.protocol !== 'https:'
            || feedUrl.username || feedUrl.password || siteUrl.username || siteUrl.password) {
            throw new Error('Newsletter RSS sources must have a name and HTTPS URLs.');
        }
        return {
            name,
            url: feedUrl.toString(),
            host: siteUrl.hostname,
            pathPrefix: siteUrl.pathname.replace(/\/$/, '')
        };
    });
}

export async function fetchFeaturedBlogPost(config, { random = Math.random } = {}) {
    const sources = parseSources(config);
    const failures = [];
    const candidates = [];
    for (const source of sources) {
        try {
            const response = await fetch(source.url, {
                headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
                signal: AbortSignal.timeout(12_000)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const xml = await response.text();
            const posts = parseRssFeed(xml, source, { maxItems: MAX_ITEMS_PER_FEED });
            if (posts.length) candidates.push(...posts);
            else failures.push(`${source.name}:no_valid_published_items`);
        } catch (error) {
            failures.push(`${source.name}:${error instanceof Error ? error.message : 'unknown_error'}`);
        }
    }
    if (!candidates.length) {
        throw new Error(`No configured newsletter RSS source returned a valid post (${failures.join(', ')}).`);
    }
    const value = Number(random());
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new Error('Newsletter RSS random source must return a number from 0 (inclusive) to 1 (exclusive).');
    }
    return candidates[Math.floor(value * candidates.length)];
}
