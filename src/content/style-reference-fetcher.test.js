const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { parsePublicHttpsUrl, isPrivateIp, createStyleReferenceFetcher } = require('./style-reference-fetcher');

test('style reference URL boundary rejects credentials, non-HTTPS and private destinations', () => {
    for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://localhost/post', 'https://127.0.0.1/post', 'https://[::1]/post']) {
        assert.throws(() => parsePublicHttpsUrl(url));
    }
    for (const ip of ['10.0.0.1', '172.20.1.1', '192.168.1.1', '169.254.1.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1', 'fd00::1', 'fe80::1', '2001:db8::1', '::ffff:7f00:1']) assert.equal(isPrivateIp(ip), true);
    assert.equal(isPrivateIp('8.8.8.8'), false);
    assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('safe fetcher revalidates redirects and strips executable or navigational HTML', async () => {
    const calls = [];
    const fetchReference = createStyleReferenceFetcher({
        cheerio,
        lookup: async (hostname) => [{ address: hostname === 'public.example' ? '8.8.8.8' : '1.1.1.1', family: 4 }],
        axios: {
            async get(url) {
                calls.push(url);
                if (calls.length === 1) return { status: 302, headers: { location: 'https://blog.example/post' }, data: Buffer.alloc(0) };
                return {
                    status: 200,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                    data: Buffer.from('<html><head><title> 글 제목 </title><script>ignore me</script></head><body><nav>menu</nav><article><h1>도입</h1><p>짧은 문단입니다.</p></article></body></html>')
                };
            }
        }
    });
    const result = await fetchReference('https://public.example/start');
    assert.equal(calls.length, 2);
    assert.equal(result.url, 'https://blog.example/post');
    assert.equal(result.title, '글 제목');
    assert.match(result.text, /짧은 문단/);
    assert.doesNotMatch(result.text, /ignore me|menu/);
});

test('safe fetcher blocks a redirect to a private destination before requesting it', async () => {
    let calls = 0;
    const fetchReference = createStyleReferenceFetcher({
        cheerio,
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        axios: { async get() { calls += 1; return { status: 302, headers: { location: 'https://127.0.0.1/admin' }, data: Buffer.alloc(0) }; } }
    });
    await assert.rejects(() => fetchReference('https://public.example'), (error) => error.code === 'STYLE_REFERENCE_URL_PRIVATE');
    assert.equal(calls, 1);
});

test('safe fetcher blocks private DNS answers, non-HTML and oversized responses', async () => {
    let calls = 0;
    const privateDnsFetcher = createStyleReferenceFetcher({
        cheerio,
        lookup: async () => [{ address: '10.0.0.8', family: 4 }],
        axios: { async get() { calls += 1; return {}; } }
    });
    await assert.rejects(() => privateDnsFetcher('https://public.example'), (error) => error.code === 'STYLE_REFERENCE_URL_PRIVATE');
    assert.equal(calls, 0);

    for (const response of [
        { status: 200, headers: { 'content-type': 'application/pdf' }, data: Buffer.from('pdf') },
        { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(2 * 1024 * 1024) }, data: Buffer.from('<p>x</p>') }
    ]) {
        const fetchReference = createStyleReferenceFetcher({
            cheerio,
            lookup: async () => [{ address: '8.8.8.8', family: 4 }],
            axios: { async get() { return response; } }
        });
        await assert.rejects(() => fetchReference('https://public.example'));
    }
});
