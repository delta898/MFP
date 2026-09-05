const { parseFeedXml } = require('../social/feed-entry');

function createCardNewsFeedFetcher(options = {}) {
    const httpClient = options.httpClient;
    const timeoutMs = Number(options.timeoutMs || 10000);
    if (!httpClient || typeof httpClient.get !== 'function') {
        throw new Error('카드뉴스 RSS HTTP 클라이언트가 필요합니다.');
    }

    return async function fetchCardNewsFeed(url) {
        const response = await httpClient.get(url, {
            responseType: 'text',
            timeout: timeoutMs,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 300,
            headers: {
                'User-Agent': 'BlogGenius Card News/1.0',
                Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml'
            }
        });
        return parseFeedXml(String(response.data || ''), { feedUrl: url });
    };
}

module.exports = { createCardNewsFeedFetcher };
