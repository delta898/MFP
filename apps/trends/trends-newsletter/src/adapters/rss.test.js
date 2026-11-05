import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeaturedBlogPost } from './rss.js';

const feeds = JSON.stringify([
    { name: 'BlogGenius', feedUrl: 'https://blog.gongzza.com/feed/', siteUrl: 'https://blog.gongzza.com/' },
    { name: 'Naver Blog', feedUrl: 'https://rss.blog.naver.com/amadejjs', siteUrl: 'https://blog.naver.com/amadejjs' }
]);

test('parses a WordPress RSS item into a short summary and never retains its full content', async () => {
    const originalFetch = globalThis.fetch;
    const called = [];
    globalThis.fetch = async (url, options) => {
        called.push({ url: new URL(url), options });
        return new Response(`<?xml version="1.0"?><rss><channel><item>
          <title><![CDATA[BlogGenius 글]]></title><link>https://blog.gongzza.com/guide/one/</link>
          <guid>https://blog.gongzza.com/guide/one/</guid><pubDate>Mon, 02 Nov 2026 00:00:00 +0000</pubDate>
          <description><![CDATA[<p>짧은 <b>요약</b></p>]]></description>
          <content:encoded><![CDATA[전체 본문은 포함하지 않습니다.]]></content:encoded>
          <media:thumbnail url="https://blog.gongzza.com/wp-content/cover.jpg" />
        </item></channel></rss>`, { headers: { 'content-type': 'application/rss+xml' } });
    };
    try {
        const post = await fetchFeaturedBlogPost(feeds, { random: () => 0 });
        assert.equal(called.length, 2);
        assert.equal(called[0].url.href, 'https://blog.gongzza.com/feed/');
        assert.equal(called[1].url.href, 'https://rss.blog.naver.com/amadejjs');
        assert.match(called[0].options.headers.accept, /application\/rss\+xml/);
        assert.equal(post.title, 'BlogGenius 글');
        assert.equal(post.excerpt, '짧은 요약');
        assert.equal(post.url, 'https://blog.gongzza.com/guide/one/');
        assert.equal(post.imageUrl, 'https://blog.gongzza.com/wp-content/cover.jpg');
        assert.equal(post.source, 'BlogGenius');
        assert.doesNotMatch(JSON.stringify(post), /전체 본문/);
    } finally { globalThis.fetch = originalFetch; }
});

test('continues after a feed failure and selects among posts from all available feeds', async () => {
    const originalFetch = globalThis.fetch;
    const called = [];
    globalThis.fetch = async (url) => {
        called.push(new URL(url).hostname);
        if (called.length === 1) return new Response('', { status: 503 });
        return new Response(`<feed><entry><title>네이버 글</title>
          <link href="https://blog.naver.com/amadejjs/223000000000" /><id>naver-id-1</id>
          <published>2026-11-02T01:00:00Z</published>
          <summary>네이버 요약 &amp;amp; 소개</summary>
        </entry></feed>`);
    };
    try {
        const post = await fetchFeaturedBlogPost(feeds, { random: () => 0.99 });
        assert.deepEqual(called, ['blog.gongzza.com', 'rss.blog.naver.com']);
        assert.equal(post.source, 'Naver Blog');
        assert.equal(post.id, 'naver-id-1');
        assert.equal(post.excerpt, '네이버 요약 & 소개');
    } finally { globalThis.fetch = originalFetch; }
});

test('randomly selects from every valid item across all configured feeds', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const isNaver = new URL(url).hostname === 'rss.blog.naver.com';
        const host = isNaver ? 'blog.naver.com' : 'blog.gongzza.com';
        const title = isNaver ? '네이버 글' : 'BlogGenius 글';
        return new Response(`<rss><channel><item><title>${title}</title>
          <link>https://${host}${isNaver ? '/amadejjs' : ''}/post/one</link><guid>${isNaver ? 'naver' : 'blog'}-one</guid>
          <pubDate>Mon, 02 Nov 2026 00:00:00 +0000</pubDate>
        </item><item><title>${title} 2</title><link>https://${host}${isNaver ? '/amadejjs' : ''}/post/two</link>
          <guid>${isNaver ? 'naver' : 'blog'}-two</guid><pubDate>Tue, 03 Nov 2026 00:00:00 +0000</pubDate>
        </item></channel></rss>`);
    };
    try {
        const first = await fetchFeaturedBlogPost(feeds, { random: () => 0 });
        const last = await fetchFeaturedBlogPost(feeds, { random: () => 0.99 });
        assert.equal(first.id, 'blog-one');
        assert.equal(last.id, 'naver-two');
    } finally { globalThis.fetch = originalFetch; }
});

test('rejects a post link outside the configured blog and fails if all feeds are unavailable', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => new URL(url).hostname === 'blog.gongzza.com'
        ? new Response('<rss><channel><item><title>bad</title><link>https://evil.example/post</link><pubDate>Mon, 02 Nov 2026 00:00:00 +0000</pubDate></item></channel></rss>')
        : new Response('', { status: 503 });
    try { await assert.rejects(fetchFeaturedBlogPost(feeds), /No configured newsletter RSS source/); }
    finally { globalThis.fetch = originalFetch; }
});

test('requires an explicit bounded HTTPS source list', async () => {
    await assert.rejects(fetchFeaturedBlogPost('not-json'), /valid JSON/);
    await assert.rejects(fetchFeaturedBlogPost('[]'), /between 1 and 8/);
    await assert.rejects(fetchFeaturedBlogPost(JSON.stringify([{ name: 'bad', feedUrl: 'http://example.com/rss', siteUrl: 'https://example.com' }])), /HTTPS URLs/);
});
