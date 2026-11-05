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

export function cleanRssText(value, maxLength = 500) {
    return decodeEntities(value)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
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

export function parseRssFeed(xml, source, { maxItems = 10, maxBytes = 1_000_000 } = {}) {
    if (new TextEncoder().encode(String(xml || '')).byteLength > maxBytes) throw new Error('feed_too_large');
    const itemBlocks = [...String(xml || '').matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
        .slice(0, maxItems).map((match) => match[2]);
    return itemBlocks.map((item) => {
        const title = cleanRssText(elementText(item, ['title']));
        const rawLink = elementText(item, ['link']) || elementAttribute(item, ['link'], 'href');
        const url = safeUrl(rawLink, source);
        const summary = cleanRssText(elementText(item, ['description', 'summary']));
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
