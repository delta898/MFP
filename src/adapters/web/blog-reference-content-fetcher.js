'use strict';

const axiosDefault = require('axios');
const cheerio = require('cheerio');
const { rethrowIfCanceled, throwIfCanceled } = require('../../utilities/async/cancellation');

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


function createBlogReferenceContentFetcher(options = {}) {
    const axios = options.axios || axiosDefault;
    const config = options.config || {};
    const Logger = options.logger || console;

    return async function fetchReferenceContent(url, options = {}) {
        const signal = options?.signal;
        throwIfCanceled(signal);
        if (!url) return "";
        Logger.debug(`🌐 [참고자료 Fetch] 요청 시작: ${url}`);
        Logger.debug(`🌐 [Scraping] 접속 시도: ${url}`);
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: config.SCRAPING_TIMEOUT || 20000,
                maxRedirects: 5,
                ...(signal ? { signal } : {})
            });
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
