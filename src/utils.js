const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const CONFIG = require('./config-loader');
const Logger = require('./utilities/logging/logger');
const {
    buildRelatedPostContext,
    selectRelatedPosts
} = require('./content/related-post-selection');
const { parseFeedXml } = require('./utilities/feeds/feed-entry');
const {
    rethrowIfCanceled,
    sleepWithCancellation,
    throwIfCanceled
} = require('./utilities/async/cancellation');

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

function normalizeOpenAiCompatibleBaseUrl(rawBaseUrl) {
    return String(rawBaseUrl || '').trim().replace(/\/+$/, '');
}

function formatReadableErrorMessage(error) {
    const raw = String(error?.message || error || '').trim();
    if (!raw) return '알 수 없는 오류';
    return raw.replace(/timeout of (\d+)ms exceeded/gi, (_, ms) => {
        const seconds = Math.max(1, Math.round(Number(ms) / 1000));
        return `timeout (${seconds}초 초과)`;
    });
}

function formatAiRemoteErrorMessage(error) {
    const responseData = error?.response?.data;
    const remoteMessage = responseData?.error?.message
        || responseData?.error
        || responseData?.message
        || responseData?.msg
        || (typeof responseData === 'string' ? responseData : '');
    const raw = typeof remoteMessage === 'object'
        ? JSON.stringify(remoteMessage)
        : String(remoteMessage || '').trim();
    const readable = formatReadableErrorMessage(raw || error);
    return readable.length > 500 ? `${readable.slice(0, 500)}…` : readable;
}

function extractOpenAIChatContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';

    return content
        .map((part) => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            return '';
        })
        .join('')
        .trim();
}

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

function stripCodeFence(rawText) {
    return String(rawText || '')
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

function extractBalancedJsonCandidate(rawText) {
    const text = stripCodeFence(rawText);
    if (!text) return '';

    const starts = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{' || ch === '[') starts.push(i);
    }

    for (const start of starts) {
        const opening = text[start];
        const closing = opening === '{' ? '}' : ']';
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === opening) {
                depth += 1;
                continue;
            }

            if (ch === closing) {
                depth -= 1;
                if (depth === 0) {
                    return text.slice(start, i + 1).trim();
                }
            }
        }
    }

    return text;
}

function parseStructuredJsonResponse(rawText) {
    const direct = stripCodeFence(rawText);
    if (!direct) {
        throw new Error('AI 응답이 비어 있습니다.');
    }

    try {
        return JSON.parse(direct);
    } catch (_ignore) { }

    const extracted = extractBalancedJsonCandidate(direct);
    if (!extracted) {
        throw new Error('AI 응답에서 JSON 블록을 찾지 못했습니다.');
    }

    return JSON.parse(extracted);
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

const Utils = {
    formatKstDateTime: function (date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(date);
        const get = (type) => parts.find((p) => p.type === type)?.value || '';
        const year = get('year');
        const month = get('month');
        const day = get('day');
        const hour = get('hour');
        const minute = get('minute');
        const second = get('second');
        if (!year || !month || !day || !hour || !minute || !second) {
            return new Date().toISOString().replace('T', ' ').slice(0, 19);
        }
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    },

    formatAxiosError: function (e) {
        const status = e?.response?.status;
        const data = e?.response?.data;
        const apiMessage =
            data?.error?.message ||
            data?.error_description ||
            (typeof data === 'string' ? data : '');
        const baseMessage = String(e?.message || '요청 실패');
        if (status) {
            return apiMessage ? `status=${status} ${apiMessage}` : `status=${status} ${baseMessage}`;
        }
        return apiMessage || baseMessage;
    },

    sanitizeFileName: function (str) {
        if (!str) return "untitled";
        // 🔧 [Fixed] 파일명 길이 제한 추가 (파일 시스템 에러 방지)
        let cleaned = str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
        // 파일명 최대 200자로 제한 (확장자 및 경로 고려)
        if (cleaned.length > 200) {
            cleaned = cleaned.substring(0, 200);
        }
        return cleaned;
    },

    sleep: (ms) => new Promise(res => setTimeout(res, ms)),

    runWithHeartbeat: async function (taskLabel, fn, intervalMs = 7000) {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
            Logger.info(`   ⏳ ${taskLabel} 진행 중... (${elapsedSec}초 경과)`);
        }, intervalMs);

        try {
            return await fn();
        } finally {
            clearInterval(timer);
        }
    },

    // 🔒 토큰 캐싱을 위한 변수
    convertToMobileNaverBlogUrl: function (url) {
        if (!url) return url;
        try {
            const trimmed = String(url).trim();
            if (!trimmed.includes('blog.naver.com')) return trimmed;

            // 이미 m.blog.naver.com 이면 통과
            if (trimmed.includes('m.blog.naver.com')) return trimmed;

            // PC URL 패턴 (blog.naver.com/id/logNo) -> (m.blog.naver.com/id/logNo)
            // http/https 모두 대응
            let converted = trimmed
                .replace(/^http:\/\/blog\.naver\.com/i, 'https://m.blog.naver.com')
                .replace(/^https:\/\/blog\.naver\.com/i, 'https://m.blog.naver.com');

            // 쿼리 파라미터가 있는 경우 (PostView.naver?blogId=... 등)
            // 사실 m.blog.naver.com 은 쿼리 파라미터 방식도 어느 정도 지원하지만,
            // 가급적 경로 기반 주소인 경우가 스크래퍼에 유리함.
            return converted;
        } catch (e) {
            return url;
        }
    },

    /**
     * 1-4. 네이버 연관검색어 추출
     */
    fetchNaverRelatedKeywords: async function (keyword) {
        try {
            const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&st=1000&frm=nv&ans=1`;
            const res = await axios.get(url);

            // items 배열 추출
            const items = res.data?.items?.[0];
            if (!items || !Array.isArray(items)) return [];

            // items는 [[keyword, ...], [keyword, ...]] 형태
            const keywords = items.map(item => item[0]);
            return keywords;

        } catch (e) {
            Logger.warn(`⚠️ 연관검색어 추출 실패 (${keyword}): ${e.message}`);
            return [];
        }
    },

    _resolveOwnBlogId: function () {
        const configured = String(CONFIG.NAVER_ID || '').trim();
        if (configured && !configured.includes('본인의_네이버_아이디')) return configured;

        const writeUrl = String(CONFIG.WRITE_URL || '').trim();
        if (!writeUrl) return '';
        try {
            const parsed = new URL(writeUrl);
            const chunks = parsed.pathname.split('/').filter(Boolean);
            return chunks[0] || '';
        } catch (e) {
            return '';
        }
    },

    _normalizeNaverBlogPostUrl: function (rawUrl, blogId = '') {
        const href = String(rawUrl || '').trim();
        if (!href) return '';

        try {
            const parsed = new URL(href, 'https://blog.naver.com');
            const host = parsed.hostname.toLowerCase();
            const pathChunks = parsed.pathname.split('/').filter(Boolean);

            if (parsed.pathname.includes('/PostView.naver')) {
                const id = parsed.searchParams.get('blogId') || blogId;
                const logNo = parsed.searchParams.get('logNo');
                if (id && logNo && /^\d{6,}$/.test(String(logNo))) {
                    return `https://blog.naver.com/${id}/${logNo}`;
                }
            }

            if ((host === 'blog.naver.com' || host === 'm.blog.naver.com') && pathChunks.length >= 2) {
                const id = pathChunks[0];
                const logNo = pathChunks[1];
                if (id && /^\d{6,}$/.test(String(logNo))) {
                    return `https://blog.naver.com/${id}/${logNo}`;
                }
            }
            return '';
        } catch (e) {
            return '';
        }
    },

    toMobileNaverBlogPostUrl: function (rawUrl) {
        const originalUrl = String(rawUrl || '').trim();
        if (!originalUrl) return '';

        const canonicalUrl = this._normalizeNaverBlogPostUrl(originalUrl);
        if (!canonicalUrl) return originalUrl;

        try {
            const parsed = new URL(canonicalUrl);
            const [blogId, logNo] = parsed.pathname.split('/').filter(Boolean);
            if (!blogId || !logNo) return originalUrl;
            return `https://m.blog.naver.com/${blogId}/${logNo}`;
        } catch (e) {
            return originalUrl;
        }
    },

    _shuffleArray: function (list) {
        const arr = Array.isArray(list) ? [...list] : [];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    pickRelatedPostsHeading: function () {
        const headings = [
            '함께 보면 좋은 글',
            '같이 보면 좋은 글',
            '이어서 보면 좋은 글',
            '추천 포스팅',
            '관련 글 더 보기',
            '다른 글도 확인해 보세요'
        ];
        return headings[Math.floor(Math.random() * headings.length)];
    },

    fetchWordPressRandomPosts: async function (wpUrl, count = 3) {
        if (!wpUrl) return [];
        const targetCount = Math.max(1, Math.min(10, parseInt(count, 10) || 3));

        // WP RSS URL can be /feed or /?feed=rss2
        const rssUrl = wpUrl.replace(/\/$/, '') + '/feed';
        const collected = [];

        try {
            const cheerio = require('cheerio');
            const axios = require('axios');
            const rssRes = await this.runWithHeartbeat(
                'WP 관련 글 RSS 수집',
                () => axios.get(rssUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: () => true
                })
            );

            if (rssRes.status >= 200 && rssRes.status < 300 && typeof rssRes.data === 'string') {
                const $ = cheerio.load(rssRes.data, { xmlMode: true });
                $('item').each((_, el) => {
                    const title = $(el).find('title').first().text().trim();
                    const link = $(el).find('link').first().text().trim();
                    if (title && link) {
                        collected.push({ title, url: link, source: 'wordpress' });
                    }
                });
            }
        } catch (e) {
            Logger.debug(`🔎 [WP 관련글] RSS 수집 실패: ${e.message}`);
        }

        return this._shuffleArray(collected).slice(0, targetCount);
    },

    generateRelatedPostsMarkdown: function (posts) {
        if (!Array.isArray(posts) || posts.length === 0) return '';

        const heading = this.pickRelatedPostsHeading();
        let markdown = `\n\n## ${heading}\n\n`;

        posts.forEach(post => {
            const postUrl = this.toMobileNaverBlogPostUrl(post.url);
            markdown += `* [${post.title}](${postUrl})\n`;
        });

        return markdown;
    },

    fetchOwnBlogRelatedPostCandidates: async function () {
        const blogId = this._resolveOwnBlogId();
        if (!blogId) return [];

        const collected = [];
        const seen = new Set();
        const addPost = (title, link, extra = {}) => {
            const cleanTitle = String(title || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            const cleanLink = this._normalizeNaverBlogPostUrl(link, blogId);
            if (!cleanTitle || !cleanLink || seen.has(cleanLink)) return;
            seen.add(cleanLink);
            collected.push({
                title: cleanTitle,
                url: cleanLink,
                source: 'naver',
                description: String(extra.description || extra.summary || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                publishedAt: String(extra.publishedAt || extra.pubDate || '').trim()
            });
        };

        // 1) RSS 우선 수집
        try {
            const cheerio = require('cheerio');
            const rssUrl = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
            const rssRes = await this.runWithHeartbeat(
                '관련 글 RSS 수집',
                () => axios.get(rssUrl, {
                    timeout: 10000,
                    maxRedirects: 3,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
                    validateStatus: () => true
                })
            );
            if (rssRes.status >= 200 && rssRes.status < 300 && typeof rssRes.data === 'string') {
                const $ = cheerio.load(rssRes.data, { xmlMode: true, decodeEntities: true });
                $('item').each((_, el) => {
                    const title = $(el).find('title').first().text();
                    const link = $(el).find('link').first().text();
                    const description = $(el).find('description').first().text();
                    const publishedAt = $(el).find('pubDate').first().text();
                    addPost(title, link, { description, publishedAt });
                });
            }
        } catch (e) {
            Logger.debug(`🔎 [관련글] RSS 수집 실패: ${e.message}`);
        }

        // RSS 후보가 적을 때는 네이버 목록 페이지에서 후보를 더 수집한다.
        if (collected.length < 10) {
            try {
                const cheerio = require('cheerio');
                const listUrl = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&from=postList&categoryNo=0&currentPage=1`;
                const listRes = await this.runWithHeartbeat(
                    '관련 글 목록 페이지 수집',
                    () => axios.get(listUrl, {
                        timeout: 12000,
                        maxRedirects: 3,
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xhtml+xml' },
                        validateStatus: () => true
                    })
                );
                if (listRes.status >= 200 && listRes.status < 300 && typeof listRes.data === 'string') {
                    const $ = cheerio.load(listRes.data);
                    $('a[href]').each((_, el) => {
                        const link = $(el).attr('href') || '';
                        const title = $(el).text() || '';
                        if (String(title).trim().length < 6) return;
                        if (/카테고리|메뉴|태그|이웃|프로필|공지|로그인/.test(String(title))) return;
                        addPost(title, link);
                    });
                }
            } catch (e) {
                Logger.debug(`🔎 [관련글] HTML 수집 실패: ${e.message}`);
            }
        }

        return collected;
    },

    fetchOwnBlogRelatedPosts: async function (context = {}, count = 3, options = {}) {
        const targetCount = Math.max(1, Math.min(10, parseInt(count, 10) || 3));
        const collected = await this.fetchOwnBlogRelatedPostCandidates(context);
        const selection = selectRelatedPosts(
            collected,
            buildRelatedPostContext(context),
            targetCount,
            { shuffle: (items) => this._shuffleArray(items), ...options }
        );
        Logger.info(`🔎 [관련글] 후보 ${selection.totalCandidates}건 중 연관 선택 ${selection.heuristicCount}건, 랜덤 보강 ${selection.fallbackCount}건`);
        return selection.posts;
    },

    fetchConfiguredRelatedPosts: async function (context = {}, count = 3) {
        const [naverCandidates, wordpressCandidates] = await Promise.all([
            this.fetchOwnBlogRelatedPostCandidates(context),
            this.fetchWordPressRelatedPostCandidates()
        ]);
        const candidates = [...naverCandidates, ...wordpressCandidates];
        const selection = selectRelatedPosts(
            candidates,
            buildRelatedPostContext(context),
            count,
            {
                shuffle: (items) => this._shuffleArray(items),
                preferSourceDiversity: true
            }
        );
        Logger.info(`🔎 [연관글] Naver ${naverCandidates.length}건 + WordPress ${wordpressCandidates.length}건을 함께 평가해 연관 ${selection.heuristicCount}건, 랜덤 보강 ${selection.fallbackCount}건 선택`);
        return selection.posts;
    },

    fetchWordPressRelatedPostCandidates: async function (wpUrl = CONFIG.WORDPRESS_URL) {
        if (!wpUrl) return [];
        const rssUrl = String(wpUrl).replace(/\/$/, '') + '/feed';
        const collected = [];
        try {
            const rssRes = await this.runWithHeartbeat(
                'WordPress 관련 글 RSS 수집',
                () => axios.get(rssUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: () => true
                })
            );
            if (rssRes.status >= 200 && rssRes.status < 300 && typeof rssRes.data === 'string') {
                const $ = cheerio.load(rssRes.data, { xmlMode: true, decodeEntities: true });
                $('item').each((_, el) => {
                    const title = $(el).find('title').first().text().trim();
                    const url = $(el).find('link').first().text().trim();
                    const description = $(el).find('description').first().text().trim();
                    if (title && url) collected.push({ title, url, description, source: 'wordpress' });
                });
            }
        } catch (e) {
            Logger.debug(`🔎 [WordPress 관련글] RSS 수집 실패: ${e.message}`);
        }
        return collected;
    },

    fetchOwnBlogRandomPosts: async function (count = 3) {
        return this.fetchOwnBlogRelatedPosts({}, count);
    },

    /**
     * 🌐 RSS/Atom 피드 수집 및 파싱
     */
    fetchAndParseRss: async function (url) {
        if (!url) return [];
        try {
            const res = await this.runWithHeartbeat(
                `RSS 수집 (${url})`,
                () => axios.get(url, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: () => true
                })
            );

            if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') {
                return parseFeedXml(res.data, { feedUrl: url });
            }
        } catch (e) {
            Logger.warn(`⚠️ RSS 수집 실패 (${url}): ${e.message}`);
        }
        return [];
    },

    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Fixed] 재시도 로직 추가 및 백업 로깅
     */
    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Refactored] callWithRetry 사용 및 백업 로깅 유지
     */
    fetchReferenceContent: async function (url, options = {}) {
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
                timeout: CONFIG.SCRAPING_TIMEOUT || 20000,
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
    },

    parseStructuredJsonResponse,

    parseMarkdown: function (raw) {
        const lines = raw.split('\n');
        let title = '';
        const contents = [];
        let skipImageBlock = false;
        let currentImageIndex = null;
        let currentImageIndexProvided = false;
        let currentImageLines = [];
        const usedImageIndexes = new Set(
            Array.from(String(raw || '').matchAll(/^\s*\[\[IMAGE_(\d+)/gm), (match) => Number(match[1]))
        );
        const nextAvailableImageIndex = () => {
            let index = 0;
            while (usedImageIndexes.has(index)) index += 1;
            usedImageIndexes.add(index);
            return index;
        };

        const createTextContent = (type, source, extra = {}) => {
            const rawText = String(source || '');
            const boldRanges = [];
            let text = '';
            let cursor = 0;
            const boldPattern = /\*\*([^*\n]+)\*\*/g;
            let match;

            while ((match = boldPattern.exec(rawText)) !== null) {
                text += rawText.slice(cursor, match.index);
                const start = text.length;
                text += match[1];
                boldRanges.push({ start, end: text.length });
                cursor = match.index + match[0].length;
            }
            text += rawText.slice(cursor);

            return {
                type,
                ...extra,
                text,
                ...(boldRanges.length > 0 ? { boldRanges } : {})
            };
        };

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!title && trimmedLine.startsWith('# ')) {
                title = trimmedLine.replace(/^#\s+/, '').trim();
                continue;
            }
            const imageStart = trimmedLine.match(/^\[\[IMAGE(?:_(\d+))?(?:\s|\]\]|$)/);
            if (imageStart) {
                // 🔧 [Fixed] 중첩된 이미지 블록 감지 및 처리
                if (skipImageBlock) {
                    Logger.warn(`⚠️ 중첩된 이미지 블록 감지: ${trimmedLine}`);
                    // 이전 블록 강제 종료
                    contents.push({
                        type: 'image',
                        index: currentImageIndex,
                        raw: currentImageLines.join('\n'),
                        text: 'Error: Nested block detected',
                        prompt: 'Invalid nested block'
                    });
                }

                skipImageBlock = true;
                currentImageIndexProvided = imageStart[1] !== undefined;
                currentImageIndex = currentImageIndexProvided ? Number(imageStart[1]) : nextAvailableImageIndex();
                currentImageLines = [line];
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, indexProvided: currentImageIndexProvided, raw: blockText,
                        ...(this.extractInfo(blockText, 'id') ? { blockId: this.extractInfo(blockText, 'id') } : {}),
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (skipImageBlock) {
                currentImageLines.push(line);
                if (trimmedLine.includes(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, indexProvided: currentImageIndexProvided, raw: blockText,
                        ...(this.extractInfo(blockText, 'id') ? { blockId: this.extractInfo(blockText, 'id') } : {}),
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
            if (/^-{3,}$/.test(trimmedLine)) {
                contents.push({ type: 'separator' });
                continue;
            }
            if (/^###\s+/.test(trimmedLine)) {
                contents.push(createTextContent('header-h3', trimmedLine.replace(/^###\s+/, '').trim()));
                continue;
            }
            if (/^##\s+/.test(trimmedLine)) {
                contents.push(createTextContent('header-h2', trimmedLine.replace(/^##\s+/, '').trim()));
                continue;
            }
            if (/^>\s*/.test(trimmedLine)) {
                contents.push(createTextContent('quote', trimmedLine.replace(/^>\s*/, '').trim()));
                continue;
            }
            if (/^[-*]\s+/.test(trimmedLine)) {
                contents.push(createTextContent(
                    'list-item',
                    trimmedLine.replace(/^[-*]\s+/, '').trim(),
                    { listType: 'unordered' }
                ));
                continue;
            }
            if (/^\d+[.)]\s+/.test(trimmedLine)) {
                contents.push(createTextContent(
                    'list-item',
                    trimmedLine.replace(/^\d+[.)]\s+/, '').trim(),
                    { listType: 'ordered' }
                ));
                continue;
            }
            contents.push(createTextContent('paragraph', line));
        }
        return { title, contents };
    },

    extractInfo: function (txt, key) {
        let val = '';
        const regex = new RegExp(`^${key}\\s*:`, 'i');
        txt.split('\n').forEach(l => {
            const trimmed = l.trim();
            if (regex.test(trimmed)) { val = trimmed.replace(regex, '').trim(); }
        });
        return val;
    },

    /**
     * 📂 플랫폼별 워크스페이스 베이스 디렉토리 결정
     * @param {string} platformHint 'naver' | 'wordpress'
     * @returns {string} 플랫폼별 하위 디렉토리를 포함한 워크스페이스 절대 경로
     */
    resolvePlatformWorkspaceDir: function (platformHint = 'naver') {
        const wsBase = CONFIG.WORKSPACE_DIR || path.join(process.cwd(), 'workspace');
        const platform = String(platformHint || 'naver').toLowerCase();

        let platformDir;
        if (platform === 'wordpress') {
            const wpUrl = String(CONFIG.WORDPRESS_URL || '').trim();
            const domain = wpUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'wp_unknown';
            platformDir = `wp_${domain}`;
        } else {
            const naverId = String(CONFIG.NAVER_ID || '').trim();
            platformDir = naverId ? `naver_${naverId}` : 'naver';
        }

        const wsPath = path.join(wsBase, platformDir);
        if (!fs.existsSync(wsPath)) {
            try {
                fs.mkdirSync(wsPath, { recursive: true });
            } catch (e) {
                Logger.error(`❌ 플랫폼 워크스페이스 폴더 생성 실패 (${wsPath}): ${e.message}`);
            }
        }
        return wsPath;
    },

    /**
     * 🔍 디렉토리 내에서 숫자로 시작하는 이미지 파일 찾기
     * @param {string} dirPath 탐색할 디렉토리 경로
     * @param {number|string} index 이미지 인덱스 (0, 1, 2...)
     * @returns {string|null} 찾은 이미지의 절대 경로 또는 null
     */
    findImageByPrefix: function (dirPath, index) {
        if (!dirPath || !fs.existsSync(dirPath)) return null;

        try {
            const prefix = String(index).padStart(2, '0');
            const allFiles = fs.readdirSync(dirPath);

            // Priority: avif > webp > png > jpg > jpeg
            const priority = ['.avif', '.webp', '.png', '.jpg', '.jpeg'];

            const candidates = allFiles
                .filter(f => f.startsWith(`${prefix}_`))
                .filter(f => /\.(png|jpg|jpeg|webp|avif)$/i.test(f));

            if (candidates.length === 0) return null;

            // Sort by priority
            candidates.sort((a, b) => {
                const extA = path.extname(a).toLowerCase();
                const extB = path.extname(b).toLowerCase();

                let idxA = priority.indexOf(extA);
                let idxB = priority.indexOf(extB);

                if (idxA === -1) idxA = 99;
                if (idxB === -1) idxB = 99;

                return idxA - idxB;
            });

            return path.join(dirPath, candidates[0]);
        } catch (e) {
            Logger.error(`❌ 이미지 파일 탐색 실패 (Index: ${index}): ${e.message}`);
            return null;
        }
    },

    /**
     * config.json 파일 내의 특정 필드를 업데이트하고 메모리(CONFIG)에도 반영한다.
     */
    updateConfigValue: (key, value) => {
        try {
            const configPath = CONFIG.CONFIG_SOURCE_PATH;
            if (!configPath || !fs.existsSync(configPath)) return false;

            if (configPath.endsWith('.json')) {
                const configRaw = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configRaw);

                // Legacy Flat Keys => Structured Paths Mapping
                const mapping = {
                    'WP_PERMANENT_FTC_URL': ['platforms', 'wordpress', 'assets', 'ftc_image'],
                    'WP_PERMANENT_CTA_URL1': ['platforms', 'wordpress', 'assets', 'cta_images', 0],
                    'WP_PERMANENT_CTA_URL2': ['platforms', 'wordpress', 'assets', 'cta_images', 1],
                    'WP_PERMANENT_CTA_URL3': ['platforms', 'wordpress', 'assets', 'cta_images', 2]
                };

                const targetPath = mapping[key];
                if (targetPath) {
                    let curr = config;
                    for (let i = 0; i < targetPath.length - 1; i++) {
                        const p = targetPath[i];
                        const nextP = targetPath[i + 1];
                        if (!curr[p]) curr[p] = (typeof nextP === 'number' ? [] : {});
                        curr = curr[p];
                    }
                    curr[targetPath[targetPath.length - 1]] = value;
                } else {
                    // Fallback to top-level for unknown keys
                    config[key] = value;
                }

                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                CONFIG[key] = value; // Sync memory
                return true;
            }

            // config.json 기반의 구조적 업데이트 (Surgical Update) 지원
            return false;
        } catch (e) {
            Logger.error(`❌ 설정 파일 업데이트 실패 (${key}): ${e.message}`);
            return false;
        }
    }
};

module.exports = Utils;
