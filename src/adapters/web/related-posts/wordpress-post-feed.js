'use strict';

const axiosDefault = require('axios');
const cheerioDefault = require('cheerio');

function createWordPressPostFeed(options = {}) {
    const axios = options.axios || axiosDefault;
    const cheerio = options.cheerio || cheerioDefault;
    const logger = options.logger || console;
    const withHeartbeat = options.withHeartbeat || ((_label, fn) => fn());

    return async function fetchWordPressPostCandidates(baseUrl) {
        if (!baseUrl) return [];
        const rssUrl = String(baseUrl).replace(/\/$/, '') + '/feed';
        try {
            const response = await withHeartbeat('WordPress 관련 글 RSS 수집', () => axios.get(rssUrl, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                validateStatus: () => true
            }));
            if (response.status < 200 || response.status >= 300 || typeof response.data !== 'string') return [];
            const $ = cheerio.load(response.data, { xmlMode: true, decodeEntities: true });
            const posts = [];
            $('item').each((_, el) => {
                const title = $(el).find('title').first().text().trim();
                const url = $(el).find('link').first().text().trim();
                const description = $(el).find('description').first().text().trim();
                if (title && url) posts.push({ title, url, description, source: 'wordpress' });
            });
            return posts;
        } catch (error) {
            logger.debug?.(`🔎 [WordPress 관련글] RSS 수집 실패: ${error.message}`);
            return [];
        }
    };
}

module.exports = { createWordPressPostFeed };
