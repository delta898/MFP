const SAFE_TEXT_LIMITS = Object.freeze({ greeting: 100, introduction: 360 });

function cleanText(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function safeArticleUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
    } catch {
        return null;
    }
}

export function validateSharedCopy(copy) {
    if (!copy || typeof copy !== 'object' || Array.isArray(copy)) throw new Error('AI draft must be an object.');
    const greeting = cleanText(copy.greeting);
    const introduction = cleanText(copy.introduction);
    if (!greeting || greeting.length > SAFE_TEXT_LIMITS.greeting
        || !introduction || introduction.length > SAFE_TEXT_LIMITS.introduction
        || /https?:\/\/|www\.|<\/?[a-z][^>]*>/i.test(`${greeting} ${introduction}`)) {
        throw new Error('AI draft did not meet the shared-edition copy limits.');
    }
    return { greeting, introduction };
}

export function buildSharedEdition({ trendDate, post, copy, downloadUrl, downloadBannerUrl, model }) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(trendDate || ''));
    const parsedDate = dateMatch && new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== trendDate) {
        throw new Error('Invalid edition date.');
    }
    const publishedAt = Date.parse(post?.publishedAt || '');
    const selectedPost = {
        id: String(post?.id || post?.url || '').slice(0, 500),
        source: cleanText(post?.source).slice(0, 80),
        title: cleanText(post?.title),
        url: safeArticleUrl(post?.url),
        excerpt: cleanText(post?.excerpt).slice(0, 500),
        imageUrl: safeArticleUrl(post?.imageUrl),
        publishedAt: Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString() : null
    };
    if (!selectedPost.id || !selectedPost.source || !selectedPost.title || !selectedPost.url || !selectedPost.publishedAt) {
        throw new Error('RSS source returned no valid published article.');
    }
    const validatedCopy = validateSharedCopy(copy);
    const safeDownloadUrl = (() => {
        try {
            const url = new URL(downloadUrl);
            return url.protocol === 'https:' && url.hostname === 'www-dev.bloggenius.kr' ? url.toString() : null;
        } catch { return null; }
    })();
    const safeBannerUrl = (() => {
        try {
            const url = new URL(downloadBannerUrl);
            return url.protocol === 'https:' && url.hostname === 'www-dev.bloggenius.kr' ? url.toString() : null;
        } catch { return null; }
    })();
    if (!safeDownloadUrl || !safeBannerUrl) throw new Error('Development download links are missing or invalid.');
    return {
        trendDate,
        ...validatedCopy,
        featuredPost: selectedPost,
        downloadUrl: safeDownloadUrl,
        downloadBannerUrl: safeBannerUrl,
        aiProvider: 'cloudflare-ai-gateway',
        aiModel: String(model || '').trim(),
        promptVersion: 'shared-edition-v1'
    };
}
