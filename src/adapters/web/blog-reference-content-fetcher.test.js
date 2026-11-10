'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const axios = require('axios');
const { createBlogReferenceContentFetcher } = require('./blog-reference-content-fetcher');
const logger = { debug() {} };
const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];
const html = '<html><title>Example</title><article><p>' + 'A readable paragraph with useful information. '.repeat(6) + '</p></article></html>';
const create = (options = {}) => createBlogReferenceContentFetcher({ logger, lookup: publicLookup, ...options });

test('blocks unsafe URL literals, credentials and schemes without a request', async () => {
    let calls = 0;
    const fetch = create({ axios: { get: async () => { calls++; } } });
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://[::ffff:7f00:1]/', 'http://192.168.1.1/', 'http://user:pass@example.com/', 'file:///etc/passwd', 'http://localhost/']) {
        assert.equal(await fetch(url), '');
    }
    assert.equal(calls, 0);
});

test('rejects mixed and private DNS answers before making a request', async () => {
    let calls = 0;
    for (const answers of [[{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}], [{address: 'fc00::1', family: 6}], []]) {
        const fetch = create({ lookup: async () => answers, axios: { get: async () => { calls++; } } });
        assert.equal(await fetch('https://example.com/'), '');
    }
    assert.equal(calls, 0);
});

test('validates each redirect and never follows a private destination', async () => {
    const calls = [];
    const fetch = create({ axios: { get: async (url, options) => {
        calls.push(url);
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.proxy, false);
        return { status: 302, headers: { location: 'http://127.0.0.1/private' } };
    } } });
    assert.equal(await fetch('https://example.com/'), '');
    assert.equal(calls.length, 1);
});

test('pins approved DNS results, revalidates redirected hostname, and returns content', async () => {
    const lookups = [];
    const fetch = create({ lookup: async (name) => { lookups.push(name); return publicLookup(); }, axios: { get: async (url, options) => {
        await new Promise((resolve, reject) => options.lookup(new URL(url).hostname, { all: true }, (err, addresses) => {
            if (err) return reject(err);
            assert.deepEqual(addresses, [{address: '8.8.8.8', family: 4}]); resolve();
        }));
        if (url.includes('example.com')) return { status: 302, headers: { location: 'https://other.example/article' } };
        return { status: 200, headers: {}, data: Buffer.from(html) };
    } } });
    assert.match(await fetch('https://example.com/'), /readable paragraph/);
    assert.deepEqual(lookups, ['example.com', 'other.example']);
});

test('enforces redirect count and propagates cancellation', async () => {
    let calls = 0;
    const fetch = create({ axios: { get: async () => { calls++; return {status: 302, headers: {location: '/again'}}; } } });
    assert.equal(await fetch('https://example.com/'), '');
    assert.equal(calls, 6);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(fetch('https://example.com/', {signal: controller.signal}));
});

test('real axios enforces decompressed size limit on local fixture', async (t) => {
    const server = http.createServer((req, res) => {
        if (req.url === '/large') {
            res.writeHead(200, {'content-encoding': 'gzip', 'content-type': 'text/html'});
            res.end(zlib.gzipSync(Buffer.alloc(1024 * 1024 + 1, 65)));
        } else { res.writeHead(200, {'content-type': 'text/html'}); res.end(html); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    // Override only the test transport after checking the production lookup is pinned.
    const transport = { get: async (url, options) => {
        await new Promise((resolve, reject) => options.lookup('fixture.example', {}, (err, address) => {
            if (err) return reject(err); assert.equal(address, '8.8.8.8'); resolve();
        }));
        const target = new URL(url); target.hostname = '127.0.0.1'; target.port = server.address().port;
        return axios.get(target.toString(), { ...options, lookup: undefined });
    } };
    const fetch = create({ axios: transport });
    assert.match(await fetch('http://fixture.example/ok'), /readable paragraph/);
    assert.equal(await fetch('http://fixture.example/large'), '');
});

test('reference context includes a public page but excludes rejected manual URLs', async () => {
    const { collectBlogReferenceContext } = require('../../applications/blog/posting/blog-reference-context');
    let requests = 0;
    const fetchReferenceContent = create({ axios: { get: async () => { requests++; return { status: 200, headers: {}, data: Buffer.from(html) }; } } });
    const result = await collectBlogReferenceContext({ fetchReferenceContent, jobData: {
        content_guide: { reference_urls: ['http://127.0.0.1/private', 'https://example.com/article'] }
    } });
    assert.equal(requests, 1);
    assert.equal(result.referenceCount, 1);
    assert.match(result.referenceContext, /readable paragraph/);
    assert.doesNotMatch(result.referenceContext, /127\.0\.0\.1/);
});

test('redirected hostname with private DNS answer is rejected before connection', async () => {
    let calls = 0;
    const fetch = create({
        lookup: async (hostname) => hostname === 'private.example' ? [{address: '172.16.0.1', family: 4}] : publicLookup(),
        axios: { get: async () => { calls++; return {status: 302, headers: {location: 'https://private.example/'}}; } }
    });
    assert.equal(await fetch('https://example.com/'), '');
    assert.equal(calls, 1);
});

test('DNS failure and oversized adapter response are handled as optional references', async () => {
    const failingDns = create({ lookup: async () => { throw new Error('DNS failed'); }, axios: { get: async () => { throw new Error('unexpected'); } } });
    assert.equal(await failingDns('https://example.com/'), '');
    const large = create({ axios: { get: async () => ({status: 200, headers: {}, data: Buffer.alloc(1024 * 1024 + 1)}) } });
    assert.equal(await large('https://example.com/'), '');
});

test('cancellation interrupts an in-progress DNS lookup without an HTTP request', async () => {
    const controller = new AbortController();
    let started;
    const lookupStarted = new Promise((resolve) => { started = resolve; });
    let requests = 0;
    const fetch = create({
        lookup: () => { started(); return new Promise(() => {}); },
        axios: { get: async () => { requests++; } },
        config: { SCRAPING_TIMEOUT: 1000 }
    });
    const pending = fetch('https://example.com/', { signal: controller.signal });
    await lookupStarted;
    controller.abort();
    await assert.rejects(pending, { code: 'AI_GENERATION_CANCELED' });
    assert.equal(requests, 0);
});

test('DNS timeout returns an empty reference without an HTTP request', async () => {
    let requests = 0;
    const fetch = create({
        lookup: () => new Promise(() => {}),
        axios: { get: async () => { requests++; } },
        config: { SCRAPING_TIMEOUT: 20 }
    });
    assert.equal(await fetch('https://example.com/'), '');
    assert.equal(requests, 0);
});
