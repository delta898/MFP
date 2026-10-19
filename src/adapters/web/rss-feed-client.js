'use strict';

const axiosDefault = require('axios');
const { parseFeedXml } = require('../../utilities/feeds/feed-entry');

function createRssFeedClient(options = {}) {
    const httpClient = options.httpClient || axiosDefault;
    const logger = options.logger || console;

    return Object.freeze({
        async fetchAndParse(url) {
            if (!url) return [];
            const startedAt = Date.now();
            const heartbeat = setInterval(() => {
                const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
                logger.info?.(`   ⏳ RSS 수집 (${url}) 진행 중... (${elapsedSeconds}초 경과)`);
            }, 7000);
            try {
                const response = await httpClient.get(url, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: () => true
                });
                if (response.status >= 200 && response.status < 300 && typeof response.data === 'string') {
                    return parseFeedXml(response.data, { feedUrl: url });
                }
            } catch (error) {
                logger.warn?.(`⚠️ RSS 수집 실패 (${url}): ${error.message}`);
            } finally {
                clearInterval(heartbeat);
            }
            return [];
        }
    });
}

module.exports = { createRssFeedClient };
