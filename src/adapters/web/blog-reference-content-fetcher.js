'use strict';

const axiosDefault = require('axios');
const cheerio = require('cheerio');
const dns = require('node:dns');
const net = require('node:net');
const { raceWithCancellation, rethrowIfCanceled, throwIfCanceled } = require('../../utilities/async/cancellation');

const REFERENCE_FETCH_MAX_CHARS = 2400;
const REFERENCE_FETCH_MAX_BLOCKS = 20;
const REFERENCE_FETCH_MAX_TITLE_CHARS = 160;
const REFERENCE_CONTENT_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.se-main-container',
    '.entry-content',
    '.post-content',
    '.article_view',
    '.article_body',
    '.article-body',
    '.articleBodyContents',
    '.post-body',
    '.post_body',
    '.content-body',
    '.content_body',
    '.tt_article_useless_p_margin',
    '.story-content',
    '.story-body',
    '.news_end',
    '.post-view',
    '.entry-body'
];
const REFERENCE_NOISE_SELECTORS = [
    'script',
    'style',
    'nav',
    'footer',
    'header',
    'iframe',
    'noscript',
    'form',
    'button',
    'svg',
    'canvas',
    'figure button',
    'aside',
    '[role="navigation"]',
    '[role="complementary"]',
    '[role="dialog"]',
    '[hidden]',
    '[aria-hidden="true"]',
    '.ad',
    '.ads',
    '.advertisement',
    '.banner',
    '.breadcrumbs',
    '.breadcrumb',
    '.comment',
    '.comments',
    '.comment-area',
    '.commentArea',
    '.comment-box',
    '.commentBox',
    '.reply',
    '.reply-area',
    '.trackback',
    '.social',
    '.share',
    '.sharing',
    '.sns',
    '.toolbar',
    '.toolbox',
    '.sidebar',
    '.related',
    '.related-posts',
    '.recommend',
    '.recommendations',
    '.tag',
    '.tags',
    '.author',
    '.profile',
    '.byline',
    '.newsletter',
    '.pagination',
    '.paging',
    '.copyright',
    '.subscribe',
    '.promotion',
    '.promo',
    '#comments',
    '#comment',
    '#comment-area',
    '#reply',
    '#trackback',
    '#sidebar',
    '#aside',
    '#footer',
    '#header',
    '#nav',
    '#related',
    '#recommend'
];
const REFERENCE_NOISE_LINE_PATTERNS = [
    /^(댓글|답글|공감|좋아요|공유|신고|복사|수정|삭제|목록|이전|다음)$/i,
    /^(leave a reply|comments?|share|copy link|related posts?)$/i,
    /^(facebook|instagram|twitter|x|threads|kakao|naver)$/i,
    /^(copyright|all rights reserved)$/i,
    /^(본문 바로가기|메뉴 바로가기|콘텐츠 바로가기)$/i
];

function normalizeTextWhitespace(value) {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function truncateText(value, maxLength) {
    const text = String(value || '').trim();
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function cleanTitleText(value) {
    const raw = normalizeTextWhitespace(String(value || '').replace(/\s+/g, ' '));
    if (!raw) return '';
    const parts = raw.split(/\s+[|\-·•»]\s+/).map((part) => part.trim()).filter(Boolean);
    const picked = parts.length > 0 ? parts[0] : raw;
    return truncateText(picked, REFERENCE_FETCH_MAX_TITLE_CHARS);
}

function removeNoiseNodes($root) {
    for (const selector of REFERENCE_NOISE_SELECTORS) {
        try {
            $root.find(selector).remove();
        } catch (e) { }
    }
}

function extractTextBlocksFromNode($, $node) {
    if (!$node || $node.length === 0) return [];

    const html = String($node.html() || '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*(p|div|section|article|li|ul|ol|blockquote|h1|h2|h3|h4|h5|h6|pre|tr|table)\s*>/gi, '$&\n');

    if (!html.trim()) return [];

    const $$ = cheerio.load(`<div id="__codex_ref_extract__">${html}</div>`);
    const text = $$('#__codex_ref_extract__').text();
    const blocks = String(text || '')
        .split(/\n+/)
        .map((line) => normalizeTextWhitespace(line))
        .filter(Boolean)
        .filter((line) => line.length >= 12)
        .filter((line) => !REFERENCE_NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));

    const deduped = [];
    const seen = new Set();
    for (const block of blocks) {
        const key = block.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(block);
    }
    return deduped;
}

function scoreReferenceCandidate($, $node, blocks) {
    const joined = blocks.join('\n');
    const textLength = joined.length;
    if (textLength < 120) return -1;

    const attrs = `${String($node.attr('id') || '')} ${String($node.attr('class') || '')}`.toLowerCase();
    const tagName = String($node.get(0)?.tagName || '').toLowerCase();
    const paragraphCount = $node.find('p').length;
    const headingCount = $node.find('h1, h2, h3').length;

    let score = textLength;
    if (tagName === 'article') score += 1200;
    if (tagName === 'main') score += 900;
    if (attrs.includes('content')) score += 700;
    if (attrs.includes('article')) score += 700;
    if (attrs.includes('entry')) score += 650;
    if (attrs.includes('post')) score += 650;
    if (attrs.includes('main')) score += 500;
    if (attrs.includes('comment')) score -= 4000;
    if (attrs.includes('reply')) score -= 3000;
    if (attrs.includes('sidebar')) score -= 3000;
    if (attrs.includes('share')) score -= 2000;
    if (attrs.includes('footer')) score -= 2000;
    score += Math.min(paragraphCount, 12) * 120;
    score += Math.min(headingCount, 6) * 80;

    return score;
}

function extractReferenceContentFromHtml(html, url) {
    const $ = cheerio.load(html || '');
    const pageTitle =
        cleanTitleText($('meta[property="og:title"]').attr('content'))
        || cleanTitleText($('meta[name="twitter:title"]').attr('content'))
        || cleanTitleText($('title').first().text())
        || cleanTitleText($('h1').first().text());

    removeNoiseNodes($.root());

    const candidates = [];
    for (const selector of REFERENCE_CONTENT_SELECTORS) {
        const nodes = $(selector);
        if (!nodes || nodes.length === 0) continue;
        nodes.each((_, el) => {
            const $node = $(el);
            const blocks = extractTextBlocksFromNode($, $node);
            const score = scoreReferenceCandidate($, $node, blocks);
            if (score > 0) {
                candidates.push({ selector, score, blocks });
            }
        });
    }

    let picked = candidates.sort((a, b) => b.score - a.score)[0] || null;
    if (!picked) {
        const bodyBlocks = extractTextBlocksFromNode($, $('body').first());
        picked = {
            selector: 'body',
            score: bodyBlocks.join('\n').length,
            blocks: bodyBlocks
        };
    }

    const limitedBlocks = [];
    let totalLength = 0;
    for (const block of picked.blocks) {
        if (limitedBlocks.length >= REFERENCE_FETCH_MAX_BLOCKS) break;
        const nextLength = totalLength + block.length + 1;
        if (limitedBlocks.length > 0 && nextLength > REFERENCE_FETCH_MAX_CHARS) break;
        limitedBlocks.push(block);
        totalLength = nextLength;
    }

    let bodyText = limitedBlocks.join('\n\n').trim();
    if (!bodyText && picked.blocks.length > 0) {
        bodyText = truncateText(picked.blocks.join('\n\n'), REFERENCE_FETCH_MAX_CHARS);
    }

    const finalText = [pageTitle ? `[제목] ${pageTitle}` : '', bodyText]
        .filter(Boolean)
        .join('\n\n')
        .trim();

    return {
        title: pageTitle,
        text: truncateText(finalText, REFERENCE_FETCH_MAX_CHARS),
        bodyLength: bodyText.length,
        selector: picked.selector || 'body',
        url: String(url || '').trim()
    };
}


// Only globally routable addresses are eligible; rejecting mixed DNS answers also
// prevents fallback to an internal address when address-family selection changes.
const blockedAddresses = new net.BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
    ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blockedAddresses.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
]) blockedAddresses.addSubnet(address, prefix, 'ipv6');
const globalIpv6 = new net.BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const MAX_REFERENCE_RESPONSE_BYTES = 1024 * 1024;
const MAX_REFERENCE_REDIRECTS = 5;

function isPublicAddress(address) {
    const version = net.isIP(address);
    if (version === 4) return !blockedAddresses.check(address, 'ipv4');
    if (version === 6) return globalIpv6.check(address, 'ipv6') && !blockedAddresses.check(address, 'ipv6');
    return false;
}

function parseReferenceUrl(raw) {
    const url = new URL(raw);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !hostname
        || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
        || (net.isIP(hostname) && !isPublicAddress(hostname))) {
        throw new Error('Reference URL is not public');
    }
    return url;
}

async function resolveReferenceAddresses(hostname, lookup, timeout, signal) {
    const literal = net.isIP(hostname);
    let addresses;
    if (literal) {
        addresses = [{ address: hostname, family: literal }];
    } else {
        let timer;
        try {
            addresses = await raceWithCancellation(() => Promise.race([
                Promise.resolve().then(() => lookup(hostname, { all: true, verbatim: true })),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Reference DNS lookup timed out')), timeout);
                })
            ]), signal);
        } finally {
            clearTimeout(timer);
        }
    }
    if (!Array.isArray(addresses) || !addresses.length || addresses.some(({ address, family }) =>
        !isPublicAddress(address) || (family && family !== net.isIP(address)))) {
        throw new Error('Reference hostname did not resolve exclusively to public addresses');
    }
    return addresses.map(({ address }) => ({ address, family: net.isIP(address) }));
}

function createBlogReferenceContentFetcher(options = {}) {
    const axios = options.axios || axiosDefault;
    const config = options.config || {};
    const Logger = options.logger || console;
    const lookup = options.lookup || dns.promises.lookup;

    return async function fetchReferenceContent(url, options = {}) {
        const signal = options?.signal;
        throwIfCanceled(signal);
        if (!url) return "";
        Logger.debug(`🌐 [참고자료 Fetch] 요청 시작: ${url}`);
        Logger.debug(`🌐 [Scraping] 접속 시도: ${url}`);
        try {
            let current = parseReferenceUrl(url);
            let response;
            for (let redirects = 0; ; redirects += 1) {
                const hostname = current.hostname.replace(/^\[|\]$/g, '');
                const approved = await resolveReferenceAddresses(hostname, lookup, config.SCRAPING_TIMEOUT || 20000, signal);
                throwIfCanceled(signal);
                response = await axios.get(current.toString(), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                    },
                    timeout: config.SCRAPING_TIMEOUT || 20000,
                    maxRedirects: 0,
                    proxy: false,
                    maxContentLength: MAX_REFERENCE_RESPONSE_BYTES,
                    responseType: 'arraybuffer',
                    validateStatus: (status) => status >= 200 && status < 400,
                    lookup: (requestedHost, lookupOptions, callback) => {
                        if (requestedHost.toLowerCase().replace(/\.$/, '') !== hostname.toLowerCase().replace(/\.$/, '')) {
                            return callback(new Error('Unexpected DNS lookup target'));
                        }
                        const family = typeof lookupOptions === 'object' ? lookupOptions.family : lookupOptions;
                        const candidates = family ? approved.filter((item) => item.family === family) : approved;
                        if (!candidates.length) return callback(new Error('No approved address for requested family'));
                        if (lookupOptions?.all) return callback(null, candidates.map((item) => ({ ...item })));
                        return callback(null, candidates[0].address, candidates[0].family);
                    },
                    ...(signal ? { signal } : {})
                });
                throwIfCanceled(signal);
                if (response.status >= 300 && response.status < 400) {
                    if (redirects >= MAX_REFERENCE_REDIRECTS || !response.headers?.location) throw new Error('Invalid or excessive redirects');
                    current = parseReferenceUrl(new URL(response.headers.location, current).toString());
                    continue;
                }
                const bytes = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data || '');
                if (bytes.length > MAX_REFERENCE_RESPONSE_BYTES) throw new Error('Reference response too large');
                response.data = bytes.toString('utf8');
                break;
            }
            throwIfCanceled(signal);
            const extracted = extractReferenceContentFromHtml(response.data, url);
            if (!extracted.text) {
                Logger.debug(`⚠️ [참고자료 Fetch] 본문 추출 결과 비어 있음: ${url}`);
                return "";
            }
            Logger.debug(
                `✅ [참고자료 Fetch] 완료: ${url} (제목: ${extracted.title || '없음'}, 본문 길이: ${extracted.bodyLength}자, 선택영역: ${extracted.selector})`
            );
            Logger.debug(`   ✅ 스크래핑 성공 (길이: ${extracted.text.length}자)`);
            return extracted.text;
        } catch (e) {
            rethrowIfCanceled(e, signal);
            Logger.debug(`⚠️ [참고자료 Fetch] 실패: ${url} (${e.message})`);
            Logger.debug(`⚠️ 스크래핑 실패 (${url}): ${e.message}`);
            return "";
        }
    };
}

module.exports = { createBlogReferenceContentFetcher };
