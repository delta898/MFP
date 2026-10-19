'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectBlogReferenceContext } = require('./blog-reference-context');

test('reference context collects automatic and manually selected sources for the shared writing prompt', async () => {
    const fetched = [];
    const result = await collectBlogReferenceContext({
        convertNaverBlogUrl(url) { return `${url}?mobile=1`; },
        async fetchReferenceContent(url) { fetched.push(url); return `본문: ${url}`; },
        referenceSearchGateway: {
            async searchLatestReferences({ topic }) {
                assert.equal(topic, '제주');
                return [{ title: '자동 자료', link: 'https://auto.test' }];
            }
        },
        jobData: {
            subject: '제주 산책', keywords: ['제주'], use_external_ref: true,
            content_guide: { reference_urls: ['https://manual.test'] }
        }
    });

    assert.deepEqual(fetched, ['https://auto.test?mobile=1', 'https://manual.test?mobile=1']);
    assert.equal(result.referenceCount, 2);
    assert.match(result.referenceContext, /자동 참고글 1/);
    assert.match(result.referenceContext, /수동 참고글 2/);
    assert.match(result.referenceContext, /문장을 베끼기 위한 원문이 아니라/);
});

test('reference context avoids network reads when no references are requested', async () => {
    let reads = 0;
    const result = await collectBlogReferenceContext({
        async fetchReferenceContent() { reads += 1; },
        jobData: { subject: '주제', use_external_ref: false }
    });
    assert.equal(reads, 0);
    assert.equal(result.referenceCount, 0);
    assert.equal(result.referenceContext, '(No reference provided)');
});

test('reference discovery can be canceled while the external search is pending', async () => {
    const controller = new AbortController();
    const service = collectBlogReferenceContext({
        async fetchReferenceContent() { throw new Error('must not continue after cancellation'); },
        referenceSearchGateway: { searchLatestReferences() { return new Promise(() => {}); } },
        signal: controller.signal,
        jobData: { subject: '제주', use_external_ref: true }
    });
    controller.abort();
    await assert.rejects(service, (error) => error.code === 'AI_GENERATION_CANCELED');
});

test('reference search failure stays optional and does not block manuscript preparation', async () => {
    const result = await collectBlogReferenceContext({
        async fetchReferenceContent() { throw new Error('not used'); },
        Logger: { debug() {} },
        referenceSearchGateway: { async searchLatestReferences() { throw new Error('gateway unavailable'); } },
        jobData: { subject: '제주', use_external_ref: true }
    });

    assert.equal(result.referenceCount, 0);
    assert.equal(result.referenceContext, '(No reference provided)');
});
