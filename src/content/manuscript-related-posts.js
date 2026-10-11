// Canonical manuscript related-posts finalization.
//
// The related section is selected while a manuscript draft is created, then
// remains part of its editable Markdown body. Network and heading behavior is
// injected through `gateway` to keep this module pure and deterministic.

const RELATED_POSTS_STATUS = Object.freeze({
    INCLUDED: 'included',
    DISABLED: 'disabled',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed',
    REMOVED: 'removed'
});

const DEFAULT_HEADING = '함께 보면 좋은 글';
const MAX_RELATED_POSTS = 3;

const RELATED_HEADING_PATTERN = /^(?:(?:함께|같이|이어서)\s*(?:보면|읽어볼|읽어)\s*(?:좋은|볼만한|유익한|괜찮은)\s*(?:글|포스트|링크|정보|내용|기사|아티클)|관련\s*(?:글|포스팅|링크|포스트)(?:\s*더\s*보기)?|추천\s*(?:포스팅|글|링크)|다른\s*글도\s*확인해\s*보세요|(?:정보|참고|보충|더|또|계속)\s*(?:보면\s*)?좋은\s*(?:글|포스트|링크|정보|내용|기사|아티클)|(?:related|more|interesting|recommended)\s*(?:posts|links|articles|readings|content))$/i;

function findRelatedPostsSections(markdown = '') {
    const lines = String(markdown || '').split('\n');
    const sections = [];
    for (let index = 0; index < lines.length; index += 1) {
        const heading = lines[index].match(/^#{2,6}\s+(.+?)\s*#*\s*$/);
        if (!heading || !RELATED_HEADING_PATTERN.test(heading[1].trim())) continue;
        const level = lines[index].match(/^#+/)[0].length;
        let end = index + 1;
        while (end < lines.length) {
            const nextHeading = lines[end].match(/^(#{1,6})\s+/);
            if (nextHeading && nextHeading[1].length <= level) break;
            end += 1;
        }
        sections.push({ startLine: index, endLine: end, text: lines.slice(index, end).join('\n') });
        index = end - 1;
    }
    return sections;
}

function countRelatedPostLinks(section = '') {
    const urls = String(section || '').match(/https?:\/\/[^\s)]+/gi) || [];
    return Math.min(urls.length, MAX_RELATED_POSTS);
}

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
    const validPosts = (Array.isArray(posts) ? posts : [])
        .map((post) => ({
            title: String(post?.title || post?.name || '').replace(/[\r\n]+/g, ' ').trim(),
            url: String(post?.url || '').trim()
        }))
        .filter((post) => /^https?:\/\//i.test(post.url))
        .slice(0, MAX_RELATED_POSTS);
    for (const [index, post] of validPosts.entries()) {
        const url = typeof toMobileUrl === 'function'
            ? String(toMobileUrl(post.url) || post.url).trim()
            : post.url;
        const label = (post.title || `관련 글 ${index + 1}`)
            .replace(/\\/g, '\\\\')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');
        const markdownUrl = url.replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        lines.push(`- [${label}](${markdownUrl})`);
    }
    return lines.join('\n').trim();
}

async function finalizeManuscriptRelatedPosts(input = {}) {
    const source = String(input.markdownText || '');
    if (input.enabled !== true) {
        return { markdownText: source, status: RELATED_POSTS_STATUS.DISABLED, count: 0 };
    }
    const existingSections = findRelatedPostsSections(source);
    if (existingSections.length > 0) {
        return {
            markdownText: source,
            status: RELATED_POSTS_STATUS.INCLUDED,
            count: countRelatedPostLinks(existingSections[0].text),
            decision: 'user_managed'
        };
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
        count: Math.min(posts.length, MAX_RELATED_POSTS),
        decision: 'automatic'
    };
}

module.exports = {
    RELATED_POSTS_STATUS,
    DEFAULT_HEADING,
    MAX_RELATED_POSTS,
    extractManuscriptTitle,
    findRelatedPostsSections,
    countRelatedPostLinks,
    isHashtagLine,
    insertSectionAboveHashtags,
    buildRelatedSection,
    finalizeManuscriptRelatedPosts
};
