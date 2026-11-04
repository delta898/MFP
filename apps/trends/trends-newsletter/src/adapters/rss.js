const MAX_FEED_BYTES = 1_000_000;
const MAX_FEEDS = 8;
const MAX_ITEMS_PER_FEED = 10;

function decodeEntities(value) {
    return String(value || '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function elementText(xml, names) {
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i'));
        if (match) return decodeEntities(match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim());
    }
    return '';
}

function elementAttribute(xml, names, attribute) {
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = xml.match(new RegExp(`<${escaped}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*\\/?\\s*>`, 'i'));
        if (match) return decodeEntities(match[1]);
    }
    return '';
}

function cleanSummary(value) {
    return decodeEntities(value)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}

function safeUrl(value, source) {
    try {
        const url = new URL(value);
        const pathAllowed = !source.pathPrefix || url.pathname === source.pathPrefix
            || url.pathname.startsWith(`${source.pathPrefix}/`);
        return url.protocol === 'https:' && url.hostname === source.host && pathAllowed
            && !url.username && !url.password ? url.toString() : null;
    } catch { return null; }
}

function parseFeed(xml, source) {
    const itemBlocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
        .slice(0, MAX_ITEMS_PER_FEED).map((match) => match[2]);
    return itemBlocks.map((item) => {
        const title = cleanSummary(elementText(item, ['title']));
        const rawLink = elementText(item, ['link']) || elementAttribute(item, ['link'], 'href');
        const url = safeUrl(rawLink, source);
        const summary = cleanSummary(elementText(item, ['description', 'summary']));
        const dateText = elementText(item, ['pubDate', 'published', 'updated', 'dc:date']);
        const timestamp = Date.parse(dateText);
        const image = elementAttribute(item, ['media:thumbnail', 'media:content', 'enclosure'], 'url')
            || item.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
            || '';
        const imageUrl = (() => {
            try {
                const imageParsed = new URL(image);
                return imageParsed.protocol === 'https:' && !imageParsed.username && !imageParsed.password ? imageParsed.toString() : null;
            } catch { return null; }
        })();
        if (!title || !url || !Number.isFinite(timestamp)) return null;
        const idText = elementText(item, ['guid', 'id']);
        return {
            id: idText || url,
            source: source.name,
            title,
            url,
            excerpt: summary,
            imageUrl,
            publishedAt: new Date(timestamp).toISOString()
        };
    }).filter(Boolean);
}

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
            if (new TextEncoder().encode(xml).byteLength > MAX_FEED_BYTES) throw new Error('feed_too_large');
            const posts = parseFeed(xml, source);
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
