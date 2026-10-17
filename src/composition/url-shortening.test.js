'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUrlShorteningSystem } = require('./url-shortening');

test('URL shortening composition connects the configured credential to the Bitly adapter', async () => {
    const calls = [];
    const system = createUrlShorteningSystem({
        CONFIG: { NOTIFY_BITLY_TOKEN: 'runtime-secret' },
        endpoint: 'https://shortener.example/v4/shorten',
        httpClient: {
            async post(url, body, options) {
                calls.push({ url, body, options });
                return { data: { link: 'https://short.example/runtime' } };
            }
        }
    });

    assert.equal(system.service.isConfigured(), true);
    assert.equal(await system.service.shorten('https://long.example/runtime'), 'https://short.example/runtime');
    assert.equal(calls[0].url, 'https://shortener.example/v4/shorten');
    assert.deepEqual(calls[0].body, { long_url: 'https://long.example/runtime' });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer runtime-secret');
});
