'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectBlogReferenceContext } = require('./blog-reference-context');

test('reference context collects automatic and manually selected sources for the shared writing prompt', async () => {
    const fetched = [];
    const result = await collectBlogReferenceContext({
        Utils: {
            async fetchNaverBlogTopPosts(keyword) { assert.equal(keyword, '제주'); return [{ title: '자동 자료', link: 'https://auto.test' }]; },
            convertToMobileNaverBlogUrl(url) { return `${url}?mobile=1`; },
            async fetchReferenceContent(url) { fetched.push(url); return `본문: ${url}`; },
            async sleep() {}
        },
        jobData: {
            subject: '제주 산책', keywords: ['제주'], use_external_ref: true,
            content_guide: { reference_urls: ['https://manual.test'] }
        }
    });

    assert.deepEqual(fetched, ['https://auto.test', 'https://manual.test?mobile=1']);
    assert.equal(result.referenceCount, 2);
    assert.match(result.referenceContext, /자동 참고글 1/);
    assert.match(result.referenceContext, /수동 참고글 2/);
    assert.match(result.referenceContext, /문장을 베끼기 위한 원문이 아니라/);
});

test('reference context avoids network reads when no references are requested', async () => {
    let reads = 0;
    const result = await collectBlogReferenceContext({
        Utils: { async fetchReferenceContent() { reads += 1; }, async sleep() {} },
        jobData: { subject: '주제', use_external_ref: false }
    });
    assert.equal(reads, 0);
    assert.equal(result.referenceCount, 0);
    assert.equal(result.referenceContext, '(No reference provided)');
});

test('reference discovery can be canceled while the external search is pending', async () => {
    const controller = new AbortController();
    const service = collectBlogReferenceContext({
        Utils: {
            fetchNaverBlogTopPosts() { return new Promise(() => {}); },
            async fetchReferenceContent() { throw new Error('must not continue after cancellation'); },
            async sleep() {}
        },
        signal: controller.signal,
        jobData: { subject: '제주', use_external_ref: true }
    });
    controller.abort();
    await assert.rejects(service, (error) => error.code === 'AI_GENERATION_CANCELED');
});
