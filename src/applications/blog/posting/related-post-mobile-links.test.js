const test = require('node:test');
const assert = require('node:assert/strict');

const { toMobileNaverBlogPostUrl } = require('../../../utilities/text/naver-blog-url');
const { createRelatedPostsService } = require('../../../services/related-posts/service');
const { buildRelatedPostsSectionMarkdown } = require('./related-posts-markdown');

test('toMobileNaverBlogPostUrl converts supported Naver post URL forms', () => {
    assert.equal(
        toMobileNaverBlogPostUrl('https://blog.naver.com/example_blog/1234567890'),
        'https://m.blog.naver.com/example_blog/1234567890'
    );
    assert.equal(
        toMobileNaverBlogPostUrl('https://m.blog.naver.com/example_blog/1234567890'),
        'https://m.blog.naver.com/example_blog/1234567890'
    );
    assert.equal(
        toMobileNaverBlogPostUrl('https://blog.naver.com/PostView.naver?blogId=example_blog&logNo=1234567890'),
        'https://m.blog.naver.com/example_blog/1234567890'
    );
});

test('toMobileNaverBlogPostUrl keeps non-Naver URLs unchanged', () => {
    const wordpressUrl = 'https://example.com/wordpress-post';

    assert.equal(toMobileNaverBlogPostUrl(wordpressUrl), wordpressUrl);
});

test('generateRelatedPostsMarkdown uses mobile Naver links and preserves WordPress links', () => {
    const service = createRelatedPostsService();
    const markdown = `\n\n${buildRelatedPostsSectionMarkdown([
        { title: '네이버 글', url: 'https://blog.naver.com/example_blog/1234567890' },
        { title: '워드프레스 글', url: 'https://example.com/wordpress-post' }
    ], service.pickHeading(), true, { toMobileNaverBlogPostUrl })}`;

    assert.match(markdown, /\[네이버 글\]\(https:\/\/m\.blog\.naver\.com\/example_blog\/1234567890\)/);
    assert.match(markdown, /\[워드프레스 글\]\(https:\/\/example\.com\/wordpress-post\)/);
});

test('buildRelatedPostsSectionMarkdown uses mobile Naver links for Naver publishing', () => {
    const markdown = buildRelatedPostsSectionMarkdown([
        { title: '네이버 글', url: 'https://blog.naver.com/example_blog/1234567890' },
        { title: '워드프레스 글', url: 'https://example.com/wordpress-post' }
    ], '함께 보면 좋은 글', true, { toMobileNaverBlogPostUrl });

    assert.match(markdown, /\[네이버 글\]\(https:\/\/m\.blog\.naver\.com\/example_blog\/1234567890\)/);
    assert.match(markdown, /\[워드프레스 글\]\(https:\/\/example\.com\/wordpress-post\)/);
});
