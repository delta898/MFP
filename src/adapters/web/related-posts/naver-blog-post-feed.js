'use strict';

const axiosDefault = require('axios');
const cheerioDefault = require('cheerio');
const { normalizeNaverBlogPostUrl } = require('../../../utilities/text/naver-blog-url');

function createNaverBlogPostFeed(options = {}) {
    const config = options.config || {};
    const axios = options.axios || axiosDefault;
    const cheerio = options.cheerio || cheerioDefault;
    const logger = options.logger || console;
    const withHeartbeat = options.withHeartbeat || ((_label, fn) => fn());

    function resolveBlogId() {
        const configured = String(config.NAVER_ID || '').trim();
        if (configured && !configured.includes('본인의_네이버_아이디')) return configured;
        const writeUrl = String(config.WRITE_URL || '').trim();
        try { return new URL(writeUrl).pathname.split('/').filter(Boolean)[0] || ''; }
        catch (_) { return ''; }
    }

    return async function fetchNaverBlogPostCandidates() {
        const blogId = resolveBlogId();
        if (!blogId) return [];
        const collected = [];
        const seen = new Set();
        const addPost = (title, link, extra = {}) => {
            const cleanTitle = String(title || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            const cleanLink = normalizeNaverBlogPostUrl(link, blogId);
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

        try {
            const rssUrl = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
            const response = await withHeartbeat('관련 글 RSS 수집', () => axios.get(rssUrl, {
                timeout: 10000,
                maxRedirects: 3,
                headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
                validateStatus: () => true
            }));
            if (response.status >= 200 && response.status < 300 && typeof response.data === 'string') {
                const $ = cheerio.load(response.data, { xmlMode: true, decodeEntities: true });
                $('item').each((_, el) => addPost(
                    $(el).find('title').first().text(),
                    $(el).find('link').first().text(),
                    { description: $(el).find('description').first().text(), publishedAt: $(el).find('pubDate').first().text() }
                ));
            }
        } catch (error) {
            logger.debug?.(`🔎 [관련글] RSS 수집 실패: ${error.message}`);
        }

        if (collected.length < 10) {
            try {
                const listUrl = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&from=postList&categoryNo=0&currentPage=1`;
                const response = await withHeartbeat('관련 글 목록 페이지 수집', () => axios.get(listUrl, {
                    timeout: 12000,
                    maxRedirects: 3,
                    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml' },
                    validateStatus: () => true
                }));
                if (response.status >= 200 && response.status < 300 && typeof response.data === 'string') {
                    const $ = cheerio.load(response.data);
                    $('a[href]').each((_, el) => {
                        const title = $(el).text() || '';
                        if (String(title).trim().length < 6 || /카테고리|메뉴|태그|이웃|프로필|공지|로그인/.test(String(title))) return;
                        addPost(title, $(el).attr('href') || '');
                    });
                }
            } catch (error) {
                logger.debug?.(`🔎 [관련글] HTML 수집 실패: ${error.message}`);
            }
        }
        return collected;
    };
}

module.exports = { createNaverBlogPostFeed };
