const test = require('node:test');
const assert = require('node:assert/strict');

const Utils = require('../utils');
const Core = require('../core');

test('toMobileNaverBlogPostUrl converts supported Naver post URL forms', () => {
    assert.equal(
        Utils.toMobileNaverBlogPostUrl('https://blog.naver.com/example_blog/1234567890'),
        'https://m.blog.naver.com/example_blog/1234567890'
    );
    assert.equal(
        Utils.toMobileNaverBlogPostUrl('https://m.blog.naver.com/example_blog/1234567890'),
        'https://m.blog.naver.com/example_blog/1234567890'
    );
    assert.equal(
        Utils.toMobileNaverBlogPostUrl('https://blog.naver.com/PostView.naver?blogId=example_blog&logNo=1234567890'),
        'https://m.blog.naver.com/example_blog/1234567890'
    );
});

test('toMobileNaverBlogPostUrl keeps non-Naver URLs unchanged', () => {
    const wordpressUrl = 'https://example.com/wordpress-post';

    assert.equal(Utils.toMobileNaverBlogPostUrl(wordpressUrl), wordpressUrl);
});

test('generateRelatedPostsMarkdown uses mobile Naver links and preserves WordPress links', () => {
    const markdown = Utils.generateRelatedPostsMarkdown([
        { title: '네이버 글', url: 'https://blog.naver.com/example_blog/1234567890' },
        { title: '워드프레스 글', url: 'https://example.com/wordpress-post' }
    ]);

    assert.match(markdown, /\[네이버 글\]\(https:\/\/m\.blog\.naver\.com\/example_blog\/1234567890\)/);
    assert.match(markdown, /\[워드프레스 글\]\(https:\/\/example\.com\/wordpress-post\)/);
});

test('buildRelatedPostsSectionMarkdown uses mobile Naver links for Naver publishing', () => {
    const markdown = Core.buildRelatedPostsSectionMarkdown([
        { title: '네이버 글', url: 'https://blog.naver.com/example_blog/1234567890' },
        { title: '워드프레스 글', url: 'https://example.com/wordpress-post' }
    ], '함께 보면 좋은 글');

    assert.match(markdown, /https:\/\/m\.blog\.naver\.com\/example_blog\/1234567890/);
    assert.match(markdown, /https:\/\/example\.com\/wordpress-post/);
});
