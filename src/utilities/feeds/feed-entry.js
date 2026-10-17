const cheerio = require('cheerio');

function elementName(element) {
    return String(element?.name || element?.tagName || '').trim().toLowerCase();
}

function findElementsByName($node, names) {
    const accepted = new Set((Array.isArray(names) ? names : [names]).map((name) => String(name).toLowerCase()));
    return $node.find('*').toArray().filter((element) => accepted.has(elementName(element)));
}

function firstText($, $node, names) {
    const element = findElementsByName($node, names)[0];
    return element ? $(element).text().trim() : '';
}

function firstAttribute($, $node, names, attribute) {
    const element = findElementsByName($node, names)[0];
    return element ? String($(element).attr(attribute) || '').trim() : '';
}

function resolveUrl(rawUrl, baseUrl = '') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw, String(baseUrl || '').trim() || undefined).toString();
    } catch (_error) {
        return '';
    }
}

function firstHtmlImage(html, baseUrl = '') {
    const raw = String(html || '').trim();
    if (!raw) return '';
    try {
        const $ = cheerio.load(raw);
        const image = $('img[src]').first().attr('src')
            || $('img[data-src]').first().attr('data-src')
            || '';
        return resolveUrl(image, baseUrl);
    } catch (_error) {
        return '';
    }
}

function htmlToPlainText(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';
    try {
        const $ = cheerio.load(raw);
        $('script, style, noscript').remove();
        return $.root().text().replace(/\s+/g, ' ').trim();
    } catch (_error) {
        return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

function truncateCodePoints(value, maxLength = 1000) {
    const text = String(value || '').trim();
    const limit = Math.max(1, Number.parseInt(maxLength, 10) || 1000);
    const points = Array.from(text);
    if (points.length <= limit) return text;
    return `${points.slice(0, Math.max(0, limit - 1)).join('').trimEnd()}…`;
}

function extractFeedSummary(description, content, maxLength = 1000) {
    const descriptionText = htmlToPlainText(description);
    const contentText = htmlToPlainText(content);
    return truncateCodePoints(descriptionText || contentText, maxLength);
}

function findFeedImage($, $node, entryUrl, feedUrl) {
    const baseUrl = entryUrl || feedUrl;
    for (const name of ['media:content', 'media:thumbnail']) {
        const url = firstAttribute($, $node, name, 'url');
        if (url) return resolveUrl(url, baseUrl);
    }

    const enclosure = findElementsByName($node, ['enclosure']).find((element) => {
        const type = String($(element).attr('type') || '').toLowerCase();
        const url = String($(element).attr('url') || '').trim();
        return url && (!type || type.startsWith('image/'));
    });
    if (enclosure) return resolveUrl($(enclosure).attr('url'), baseUrl);

    const atomImageLink = findElementsByName($node, ['link']).find((element) => {
        const rel = String($(element).attr('rel') || '').toLowerCase();
        const type = String($(element).attr('type') || '').toLowerCase();
        return rel === 'enclosure' && type.startsWith('image/');
    });
    if (atomImageLink) return resolveUrl($(atomImageLink).attr('href'), baseUrl);

    const content = firstText($, $node, ['content:encoded', 'content']);
    const description = firstText($, $node, ['description', 'summary']);
    return firstHtmlImage(content, baseUrl) || firstHtmlImage(description, baseUrl);
}

function normalizePublishedAt(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : raw;
}

function parseFeedXml(xml, options = {}) {
    const rawXml = String(xml || '');
    if (!rawXml.trim()) return [];
    const feedUrl = String(options.feedUrl || '').trim();
    const $ = cheerio.load(rawXml, { xmlMode: true, decodeEntities: true });
    const entries = [];

    if ($('item').length > 0) {
        $('item').each((_, element) => {
            const $item = $(element);
            const title = firstText($, $item, 'title');
            const guid = firstText($, $item, 'guid');
            const rawLink = firstText($, $item, 'link');
            const link = resolveUrl(rawLink, feedUrl) || (/^https?:\/\//i.test(guid) ? resolveUrl(guid, feedUrl) : '');
            if (!title || !link) return;
            const description = firstText($, $item, 'description');
            const content = firstText($, $item, 'content:encoded');
            entries.push({
                guid,
                title,
                link,
                pubDate: normalizePublishedAt(firstText($, $item, ['pubdate', 'dc:date'])),
                description,
                content,
                summary: extractFeedSummary(description, content),
                imageUrl: findFeedImage($, $item, link, feedUrl),
                source: 'rss'
            });
        });
        return entries;
    }

    $('entry').each((_, element) => {
        const $entry = $(element);
        const title = firstText($, $entry, 'title');
        const guid = firstText($, $entry, 'id');
        const links = findElementsByName($entry, 'link');
        const alternate = links.find((link) => {
            const rel = String($(link).attr('rel') || 'alternate').toLowerCase();
            return rel === 'alternate' && $(link).attr('href');
        });
        const anyHref = links.find((link) => $(link).attr('href'));
        const rawLink = alternate
            ? $(alternate).attr('href')
            : (anyHref ? $(anyHref).attr('href') : firstText($, $entry, 'link'));
        const link = resolveUrl(rawLink, feedUrl);
        if (!title || !link) return;
        const description = firstText($, $entry, 'summary');
        const content = firstText($, $entry, 'content');
        entries.push({
            guid,
            title,
            link,
            pubDate: normalizePublishedAt(firstText($, $entry, ['published', 'updated'])),
            description,
            content,
            summary: extractFeedSummary(description, content),
            imageUrl: findFeedImage($, $entry, link, feedUrl),
            source: 'atom'
        });
    });
    return entries;
}

function extractOgImage(html, pageUrl = '') {
    const rawHtml = String(html || '');
    if (!rawHtml.trim()) return '';
    const $ = cheerio.load(rawHtml);
    const raw = $('meta[property="og:image"]').first().attr('content')
        || $('meta[name="twitter:image"]').first().attr('content')
        || $('meta[property="twitter:image"]').first().attr('content')
        || '';
    return resolveUrl(raw, pageUrl);
}

function extractOgDescription(html, maxLength = 1000) {
    const rawHtml = String(html || '');
    if (!rawHtml.trim()) return '';
    const $ = cheerio.load(rawHtml);
    const raw = $('meta[property="og:description"]').first().attr('content')
        || $('meta[name="description"]').first().attr('content')
        || $('meta[name="twitter:description"]').first().attr('content')
        || '';
    return truncateCodePoints(htmlToPlainText(raw), maxLength);
}

module.exports = {
    resolveUrl,
    firstHtmlImage,
    htmlToPlainText,
    truncateCodePoints,
    extractFeedSummary,
    normalizePublishedAt,
    parseFeedXml,
    extractOgImage,
    extractOgDescription
};
