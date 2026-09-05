const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsFeedFetcher } = require('./feed-fetcher');

test('card news feed fetcher applies bounded RSS request options and parses entries', async () => {
    const calls = [];
    const fetchFeed = createCardNewsFeedFetcher({
        httpClient: {
            async get(url, options) {
                calls.push({ url, options });
                return {
                    data: '<rss><channel><item><guid>one</guid><title>첫 글</title><link>https://example.com/one</link></item></channel></rss>'
                };
            }
        }
    });

    const items = await fetchFeed('https://example.com/feed/');

    assert.equal(items.length, 1);
    assert.equal(items[0].guid, 'one');
    assert.equal(calls[0].options.timeout, 10000);
    assert.match(calls[0].options.headers.Accept, /rss\+xml/);
});
