const test = require('node:test');
const assert = require('node:assert/strict');
const { createUrlShorteningService, createDefaultUrlShorteningService } = require('./url-shortening-service');

test('URL shortening capability resolves the configured provider behind a provider-neutral contract', async () => {
    let configuration = { provider: 'bitly', credential: 'secret' };
    const calls = [];
    const service = createUrlShorteningService({
        resolveConfiguration: () => configuration,
        providers: {
            bitly: {
                async shorten(url, options) {
                    calls.push({ url, credential: options.credential });
                    return 'https://short.example/a';
                }
            }
        }
    });

    assert.equal(service.isConfigured(), true);
    assert.equal(await service.shorten('https://long.example/article'), 'https://short.example/a');
    assert.deepEqual(calls, [{ url: 'https://long.example/article', credential: 'secret' }]);

    configuration = { provider: 'another-provider', credential: 'secret' };
    assert.equal(service.isConfigured(), false);
    assert.equal(await service.shorten('https://long.example/article'), 'https://long.example/article');
});

test('URL shortening capability keeps the original URL when a provider fails', async () => {
    const warnings = [];
    const service = createUrlShorteningService({
        resolveConfiguration: () => ({ provider: 'bitly', credential: 'secret' }),
        providers: { bitly: { async shorten() { throw new Error('offline'); } } },
        logger: { warn(message) { warnings.push(message); } }
    });

    assert.equal(await service.shorten('https://long.example/article'), 'https://long.example/article');
    assert.match(warnings[0], /URL Shortening/);
});

test('default runtime composition keeps the current provider adapter behind the generic contract', async () => {
    const calls = [];
    const service = createDefaultUrlShorteningService({
        CONFIG: { NOTIFY_BITLY_TOKEN: 'runtime-secret' },
        urlService: {
            async shorten(url, credential) {
                calls.push({ url, credential });
                return 'https://short.example/runtime';
            }
        }
    });

    assert.equal(service.isConfigured(), true);
    assert.equal(await service.shorten('https://long.example/runtime'), 'https://short.example/runtime');
    assert.deepEqual(calls, [{ url: 'https://long.example/runtime', credential: 'runtime-secret' }]);
});
