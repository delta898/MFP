'use strict';

function convertToMobileNaverBlogUrl(url) {
    if (!url) return url;
    try {
        const trimmed = String(url).trim();
        if (!trimmed.includes('blog.naver.com') || trimmed.includes('m.blog.naver.com')) return trimmed;
        return trimmed
            .replace(/^http:\/\/blog\.naver\.com/i, 'https://m.blog.naver.com')
            .replace(/^https:\/\/blog\.naver\.com/i, 'https://m.blog.naver.com');
    } catch (_) {
        return url;
    }
}

function normalizeNaverBlogPostUrl(rawUrl, blogId = '') {
    const href = String(rawUrl || '').trim();
    if (!href) return '';
    try {
        const parsed = new URL(href, 'https://blog.naver.com');
        const host = parsed.hostname.toLowerCase();
        const pathChunks = parsed.pathname.split('/').filter(Boolean);
        if (parsed.pathname.includes('/PostView.naver')) {
            const id = parsed.searchParams.get('blogId') || blogId;
            const logNo = parsed.searchParams.get('logNo');
            if (id && logNo && /^\d{6,}$/.test(String(logNo))) return `https://blog.naver.com/${id}/${logNo}`;
        }
        if ((host === 'blog.naver.com' || host === 'm.blog.naver.com') && pathChunks.length >= 2) {
            const [id, logNo] = pathChunks;
            if (id && /^\d{6,}$/.test(String(logNo))) return `https://blog.naver.com/${id}/${logNo}`;
        }
        return '';
    } catch (_) {
        return '';
    }
}

function toMobileNaverBlogPostUrl(rawUrl) {
    const originalUrl = String(rawUrl || '').trim();
    if (!originalUrl) return '';
    const canonicalUrl = normalizeNaverBlogPostUrl(originalUrl);
    if (!canonicalUrl) return originalUrl;
    try {
        const parsed = new URL(canonicalUrl);
        const [blogId, logNo] = parsed.pathname.split('/').filter(Boolean);
        return blogId && logNo ? `https://m.blog.naver.com/${blogId}/${logNo}` : originalUrl;
    } catch (_) {
        return originalUrl;
    }
}

module.exports = { convertToMobileNaverBlogUrl, normalizeNaverBlogPostUrl, toMobileNaverBlogPostUrl };
