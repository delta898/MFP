const { NAVER_DEFAULT_USER_AGENT } = require('../naver-auth-flow');

const DEFAULT_EXCERPT_MAX_CHARS = 400;

function normalizeVisibleText(value, maxChars = 0) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!maxChars || text.length <= maxChars) return text;

    const sliced = text.slice(0, maxChars).trim();
    const sentenceCut = Math.max(
        sliced.lastIndexOf('.'),
        sliced.lastIndexOf('!'),
        sliced.lastIndexOf('?'),
        sliced.lastIndexOf('。')
    );
    if (sentenceCut >= Math.floor(maxChars * 0.6)) {
        return sliced.slice(0, sentenceCut + 1).trim();
    }
    const wordCut = sliced.lastIndexOf(' ');
    return wordCut >= Math.floor(maxChars * 0.6)
        ? sliced.slice(0, wordCut).trim()
        : sliced;
}

function buildNeighborFeedUrl() {
    return 'https://blog.naver.com';
}

function extractNeighborFeedCards(maxCount) {
    const textOf = (element) => String(element?.textContent || '').replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
        if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
        if (String(element.className || '').split(/\s+/).includes('ng-hide')) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const canonicalPostUrl = (rawUrl) => {
        try {
            const parsed = new URL(rawUrl, document.baseURI);
            if (!['blog.naver.com', 'm.blog.naver.com'].includes(parsed.hostname.toLowerCase())) return '';
            const chunks = parsed.pathname.split('/').filter(Boolean);
            if (parsed.pathname.includes('/PostView.naver')) {
                const blogId = parsed.searchParams.get('blogId');
                const logNo = parsed.searchParams.get('logNo');
                return blogId && /^\d{6,}$/.test(String(logNo || ''))
                    ? `https://blog.naver.com/${blogId}/${logNo}`
                    : '';
            }
            return chunks.length >= 2 && /^\d{6,}$/.test(String(chunks[1] || ''))
                ? `https://blog.naver.com/${chunks[0]}/${chunks[1]}`
                : '';
        } catch (_error) {
            return '';
        }
    };
    const findCard = (anchor) => {
        let node = anchor;
        let fallback = null;
        for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
            if (!isVisible(node)) continue;
            const text = textOf(node);
            if (text.length < 30 || text.length > 2500) continue;
            if (!fallback) fallback = node;
            const hasTitle = Boolean(node.querySelector('h2, h3, strong, [class*="title"], [class*="tit"]'));
            const hasExcerpt = Boolean(node.querySelector('p, [class*="text"], [class*="desc"], [class*="summary"], [class*="content"]'));
            if (hasTitle && hasExcerpt) return node;
        }
        return fallback;
    };
    const imageOf = (card) => {
        const image = card?.querySelector('img[bg-image], img[data-src], img[data-lazy-src], img[src]');
        const raw = image?.getAttribute('bg-image')
            || image?.getAttribute('data-src')
            || image?.getAttribute('data-lazy-src')
            || image?.currentSrc
            || image?.getAttribute('src')
            || '';
        try { return raw ? new URL(raw, document.baseURI).toString() : ''; } catch (_error) { return raw; }
    };
    const isActionText = (text) => /^(공감|댓글|공유|이웃추가|글로 이동|더보기|접기|펼치기)(\s*\d+)?$/i.test(String(text || '').trim());
    const pickBestText = (elements, scorer) => elements
        .map((element) => ({ element, text: textOf(element) }))
        .filter((candidate) => candidate.text && !isActionText(candidate.text))
        .map((candidate) => ({ ...candidate, score: scorer(candidate.element, candidate.text) }))
        .filter((candidate) => Number.isFinite(candidate.score))
        .sort((left, right) => right.score - left.score)[0]?.text || '';

    const neighborHeading = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"], strong'))
        .find((element) => isVisible(element) && textOf(element) === '이웃새글');
    if (!neighborHeading) return [];
    const neighborHeadingBottom = neighborHeading.getBoundingClientRect().bottom;

    const results = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll('a[href]'))
        .filter((anchor) => anchor.getBoundingClientRect().top >= neighborHeadingBottom - 1);
    for (const anchor of anchors) {
        if (!isVisible(anchor)) continue;
        const postUrl = canonicalPostUrl(anchor.getAttribute('href') || '');
        if (!postUrl || seen.has(postUrl)) continue;
        const card = findCard(anchor);
        if (!card) continue;

        const title = pickBestText(
            [anchor, ...card.querySelectorAll('[class*="title"], [class*="tit"], h2, h3')],
            (element, text) => {
                if (text.length < 2 || text.length > 180) return Number.NEGATIVE_INFINITY;
                const className = String(element.className || '').toLowerCase();
                let score = element === anchor ? 20 : 0;
                if (/title|(^|[_-])tit([_-]|$)/.test(className)) score += 80;
                if (/^h[23]$/i.test(element.tagName || '')) score += 40;
                if (element.closest?.('[class*="like"], [class*="sympathy"], [class*="reaction"]')) score -= 150;
                score += Math.min(text.length, 80) / 10;
                return score;
            }
        );
        const excerpt = pickBestText(
            [...card.querySelectorAll('[class*="summary"], [class*="desc"], [class*="text"], [class*="content"], p')],
            (element, text) => {
                if (text.length < 20 || text.length > 1200 || text === title) return Number.NEGATIVE_INFINITY;
                const className = String(element.className || '').toLowerCase();
                let score = 0;
                if (/summary|desc/.test(className)) score += 100;
                if (/text|content/.test(className)) score += 50;
                if (String(element.tagName || '').toLowerCase() === 'p') score += 35;
                if (text.includes(title)) score -= 60;
                score += Math.min(text.length, 400) / 20;
                return score;
            }
        );
        const authorName = pickBestText(
            [...card.querySelectorAll('[class*="nick"], [class*="author"], [class*="name"]')],
            (element, text) => {
                if (text.length < 2 || text.length > 40 || text === title) return Number.NEGATIVE_INFINITY;
                const className = String(element.className || '').toLowerCase();
                return (/nick|author/.test(className) ? 80 : 30) - text.length / 100;
            }
        );
        if (!title || !excerpt || title === '핫토픽' || title === '이웃새글') continue;

        const likeElement = card.querySelector('[aria-pressed], .u_likeit_button, .u_likeit_icon, [class*="sympathy"], [class*="like"]');
        const pressed = String(likeElement?.getAttribute('aria-pressed') || '').trim().toLowerCase();
        const likeClass = String(likeElement?.className || '').toLowerCase();
        const likedStateKnown = pressed === 'true' || pressed === 'false' || /__reaction__like|__reaction__zeroface/.test(likeClass);
        const liked = pressed === 'true' || /__reaction__like|\bon\b|active|selected/.test(likeClass);

        seen.add(postUrl);
        results.push({
            postUrl,
            authorName,
            title,
            excerpt,
            thumbnailUrl: imageOf(card),
            liked,
            likedStateKnown
        });
        if (results.length >= maxCount) break;
    }
    return results;
}

function createNaverSmartCommentCollector(deps = {}) {
    const {
        BrowserLauncher,
        CONFIG,
        Logger = { info() {}, warn() {}, debug() {} },
        excerptMaxChars = DEFAULT_EXCERPT_MAX_CHARS
    } = deps;

    if (!BrowserLauncher?.launchBrowser) throw new Error('BrowserLauncher가 필요합니다.');
    if (!CONFIG) throw new Error('CONFIG가 필요합니다.');

    return {
        async collect({ fetchLimit = 10, headless = true } = {}) {
            const limit = Math.min(10, Math.max(1, parseInt(fetchLimit, 10) || 10));
            const feedUrl = buildNeighborFeedUrl();
            let browser = null;
            let context = null;
            try {
                Logger.info(`🧭 [NaverCommentDraft] 이웃새글 후보 수집 시작 (최대 ${limit}건)`);
                browser = await BrowserLauncher.launchBrowser({ headless: Boolean(headless) });
                context = await browser.newContext({
                    storageState: CONFIG.AUTH_FILE_PATH,
                    userAgent: NAVER_DEFAULT_USER_AGENT
                });
                const page = await context.newPage();
                await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
                const currentUrl = String(page.url?.() || '');
                if (/nid\.naver\.com|nidlogin\.login/i.test(currentUrl)) {
                    const error = new Error('네이버 로그인 세션이 만료되었습니다. 설정에서 다시 로그인해 주세요.');
                    error.code = 'NAVER_SESSION_INVALID';
                    throw error;
                }
                if (typeof page.waitForFunction === 'function') {
                    try {
                        await page.waitForFunction(() => {
                            const heading = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"], strong'))
                                .find((element) => String(element.textContent || '').replace(/\s+/g, ' ').trim() === '이웃새글');
                            if (!heading) return false;
                            const headingBottom = heading.getBoundingClientRect().bottom;
                            return Array.from(document.querySelectorAll('a[href]')).some((anchor) => {
                                if (anchor.getBoundingClientRect().top < headingBottom - 1) return false;
                                try {
                                    const parsed = new URL(anchor.href, document.baseURI);
                                    if (!['blog.naver.com', 'm.blog.naver.com'].includes(parsed.hostname.toLowerCase())) return false;
                                    if (parsed.pathname.includes('/PostView.naver')) {
                                        return Boolean(parsed.searchParams.get('blogId'))
                                            && /^\d{6,}$/.test(String(parsed.searchParams.get('logNo') || ''));
                                    }
                                    const chunks = parsed.pathname.split('/').filter(Boolean);
                                    return chunks.length >= 2 && /^\d{6,}$/.test(String(chunks[1] || ''));
                                } catch (_error) {
                                    return false;
                                }
                            });
                        }, { timeout: 10000 });
                    } catch (_error) {
                        Logger.debug('⚠️ [NaverCommentDraft] 이웃새글 카드 준비 대기 시간이 초과되어 현재 DOM을 확인합니다.');
                    }
                }
                if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(300);
                const rawItems = await page.evaluate(extractNeighborFeedCards, limit);
                const ownBlogId = String(CONFIG.NAVER_ID || '').trim().toLowerCase();
                const items = (Array.isArray(rawItems) ? rawItems : [])
                    .map((item) => {
                        const postUrl = String(item?.postUrl || '').trim();
                        let fallbackAuthor = '';
                        try { fallbackAuthor = new URL(postUrl).pathname.split('/').filter(Boolean)[0] || ''; } catch (_error) { }
                        return {
                            authorName: normalizeVisibleText(item?.authorName) || fallbackAuthor || '작성자 미상',
                            title: normalizeVisibleText(item?.title, 160),
                            excerpt: normalizeVisibleText(item?.excerpt, excerptMaxChars),
                            postUrl,
                            commentUrl: `${postUrl}?copen=1`,
                            thumbnailUrl: String(item?.thumbnailUrl || '').trim(),
                            liked: item?.liked === true,
                            likedStateKnown: item?.likedStateKnown === true
                        };
                    })
                    .filter((item) => item.title && item.excerpt && item.postUrl)
                    .filter((item) => {
                        try {
                            const blogId = new URL(item.postUrl).pathname.split('/').filter(Boolean)[0] || '';
                            return !ownBlogId || blogId.toLowerCase() !== ownBlogId;
                        } catch (_error) {
                            return false;
                        }
                    })
                    .filter((item) => !(item.likedStateKnown && item.liked))
                    .slice(0, limit);
                Logger.info(`✅ [NaverCommentDraft] 이웃새글 후보 수집 완료 (${items.length}건)`);
                return items;
            } finally {
                try { if (context) await context.close(); } catch (_error) { }
                try { if (browser) await browser.close(); } catch (_error) { }
            }
        }
    };
}

module.exports = {
    DEFAULT_EXCERPT_MAX_CHARS,
    buildNeighborFeedUrl,
    createNaverSmartCommentCollector,
    extractNeighborFeedCards,
    normalizeVisibleText
};
