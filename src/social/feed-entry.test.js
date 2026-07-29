const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseFeedXml,
    extractOgImage,
    extractOgDescription
} = require('./feed-entry');

test('RSS parser preserves GUID, publication time, and media image', () => {
    const xml = `<?xml version="1.0"?>
        <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
          <channel>
            <item>
              <title>첫 글</title>
              <guid>post-guid-1</guid>
              <link>https://blog.example/posts/1</link>
              <pubDate>Wed, 29 Jul 2026 01:00:00 GMT</pubDate>
              <description><![CDATA[<p>본문</p>]]></description>
              <media:content url="https://cdn.example/cover.jpg" type="image/jpeg" />
            </item>
          </channel>
        </rss>`;

    const entries = parseFeedXml(xml, { feedUrl: 'https://blog.example/feed/' });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].guid, 'post-guid-1');
    assert.equal(entries[0].link, 'https://blog.example/posts/1');
    assert.equal(entries[0].pubDate, '2026-07-29T01:00:00.000Z');
    assert.equal(entries[0].imageUrl, 'https://cdn.example/cover.jpg');
    assert.equal(entries[0].summary, '본문');
});

test('RSS parser falls back to the first content image', () => {
    const xml = `<?xml version="1.0"?>
        <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
          <channel>
            <item>
              <title>이미지 글</title>
              <guid>post-guid-2</guid>
              <link>https://blog.example/posts/2</link>
              <content:encoded><![CDATA[
                <p>본문에서 가져온 요약입니다.</p><img src="/images/content.jpg" />
              ]]></content:encoded>
            </item>
          </channel>
        </rss>`;

    const entries = parseFeedXml(xml, { feedUrl: 'https://blog.example/feed/' });

    assert.equal(entries[0].imageUrl, 'https://blog.example/images/content.jpg');
    assert.equal(entries[0].summary, '본문에서 가져온 요약입니다.');
});

test('Atom parser uses alternate links and entry IDs', () => {
    const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>tag:example.com,2026:1</id>
            <title>Atom 글</title>
            <link rel="alternate" href="/posts/3" />
            <updated>2026-07-29T02:00:00Z</updated>
            <summary>요약</summary>
          </entry>
        </feed>`;

    const entries = parseFeedXml(xml, { feedUrl: 'https://blog.example/feed/' });

    assert.equal(entries[0].guid, 'tag:example.com,2026:1');
    assert.equal(entries[0].link, 'https://blog.example/posts/3');
    assert.equal(entries[0].source, 'atom');
    assert.equal(entries[0].summary, '요약');
});

test('OG image extraction resolves relative URLs', () => {
    const html = '<html><head><meta property="og:image" content="/cover.png"><meta property="og:description" content="원문 설명"></head></html>';
    assert.equal(
        extractOgImage(html, 'https://blog.example/posts/4'),
        'https://blog.example/cover.png'
    );
    assert.equal(extractOgDescription(html), '원문 설명');
});
