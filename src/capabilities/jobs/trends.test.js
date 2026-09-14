const test = require('node:test');
const assert = require('node:assert/strict');
const { createTrendJobCapabilities } = require('./trends');

test('trend collection calls the UI server through the canonical LISTEN_PORT', async () => {
    const requests = [];
    const [capability] = createTrendJobCapabilities({
        CONFIG: { LISTEN_PORT: 4588 },
        axios: {
            async post(url, data) {
                requests.push({ url, data });
                return { data: { data: { trendsCollected: 3, trendsToTopics: 2 } } };
            }
        }
    });

    const result = await capability.execute({ force: true });

    assert.equal(requests[0].url, 'http://127.0.0.1:4588/api/v1/auto/collect/trends/run');
    assert.deepEqual(requests[0].data, { force: true });
    assert.equal(result.success, true);
});
