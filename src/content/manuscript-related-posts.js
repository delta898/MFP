// Canonical manuscript related-posts finalization.
//
// The related section is finalized when a manuscript draft is created or
// updated, so the user-visible preview and the publish payload always carry
// the same body. Network and heading behavior is injected through `gateway`
// to keep this module pure and deterministic in tests.

const RELATED_POSTS_STATUS = Object.freeze({
    INCLUDED: 'included',
    DISABLED: 'disabled',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

const DEFAULT_HEADING = '함께 보면 좋은 글';
const MAX_RELATED_POSTS = 3;

function extractManuscriptTitle(markdown = '') {
    const match = String(markdown || '').match(/^#\s+(.+)$/m);
    return (match ? match[1] : '').trim().slice(0, 200);
}

function isHashtagLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    return /^#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*$/u.test(trimmed);
}

function insertSectionAboveHashtags(markdown = '', section = '') {
    const body = String(markdown || '').replace(/\s+$/, '');
    const cleanSection = String(section || '').trim();
    if (!cleanSection) return body ? `${body}\n` : '';
    if (!body) return `${cleanSection}\n`;
    const lines = body.split('\n');
    let splitIndex = lines.length;
    while (splitIndex > 0 && isHashtagLine(lines[splitIndex - 1])) {
        splitIndex -= 1;
    }
    if (splitIndex === lines.length) {
        return `${body}\n\n${cleanSection}\n`;
    }
    const head = lines.slice(0, splitIndex).join('\n').trim();
    const tail = lines.slice(splitIndex).join('\n').trim();
    if (!head) return `${cleanSection}\n\n${tail}\n`;
    return `${head}\n\n${cleanSection}\n\n${tail}\n`;
}

function buildRelatedSection(posts, heading, toMobileUrl) {
    const title = String(heading || DEFAULT_HEADING).trim() || DEFAULT_HEADING;
    const lines = [`## ${title}`];
    const urls = (Array.isArray(posts) ? posts : [])
        .map((post) => String(post?.url || '').trim())
        .filter((url) => /^https?:\/\//i.test(url))
        .slice(0, MAX_RELATED_POSTS)
        .map((url) => (typeof toMobileUrl === 'function' ? String(toMobileUrl(url) || url).trim() : url))
        .filter(Boolean);
    for (const url of urls) lines.push(url);
    return lines.join('\n').trim();
}

async function finalizeManuscriptRelatedPosts(input = {}) {
    const source = String(input.markdownText || '');
    if (input.enabled !== true) {
        return { markdownText: source, status: RELATED_POSTS_STATUS.DISABLED, count: 0 };
    }
    const gateway = input.gateway || {};
    const strip = typeof gateway.stripSection === 'function'
        ? gateway.stripSection
        : (text) => String(text || '');
    const stripped = String(strip(source) || '').trim();
    if (typeof gateway.fetchPosts !== 'function') {
        return { markdownText: stripped ? `${stripped}\n` : '', status: RELATED_POSTS_STATUS.FAILED, count: 0 };
    }
    let posts = [];
    try {
        posts = await gateway.fetchPosts({
            title: input.title !== undefined ? String(input.title || '') : extractManuscriptTitle(stripped),
            content: stripped
        }) || [];
    } catch (_) {
        return { markdownText: stripped ? `${stripped}\n` : '', status: RELATED_POSTS_STATUS.FAILED, count: 0 };
    }
    if (!Array.isArray(posts) || posts.length === 0) {
        return { markdownText: stripped ? `${stripped}\n` : '', status: RELATED_POSTS_STATUS.UNAVAILABLE, count: 0 };
    }
    const heading = typeof gateway.pickHeading === 'function' ? gateway.pickHeading() : DEFAULT_HEADING;
    const build = typeof gateway.buildSection === 'function'
        ? gateway.buildSection
        : (list, text) => buildRelatedSection(list, text, gateway.toMobileUrl);
    const section = String(build(posts.slice(0, MAX_RELATED_POSTS), heading) || '').trim();
    if (!section) {
        return { markdownText: stripped ? `${stripped}\n` : '', status: RELATED_POSTS_STATUS.UNAVAILABLE, count: 0 };
    }
    return {
        markdownText: insertSectionAboveHashtags(stripped, section),
        status: RELATED_POSTS_STATUS.INCLUDED,
        count: Math.min(posts.length, MAX_RELATED_POSTS)
    };
}

module.exports = {
    RELATED_POSTS_STATUS,
    DEFAULT_HEADING,
    MAX_RELATED_POSTS,
    extractManuscriptTitle,
    isHashtagLine,
    insertSectionAboveHashtags,
    buildRelatedSection,
    finalizeManuscriptRelatedPosts
};
