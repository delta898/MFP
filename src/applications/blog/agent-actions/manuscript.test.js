'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogManuscriptCapabilities } = require('./manuscript');

test('generate and publish forwards the selected category through draft creation and publication settings', async () => {
    const requests = [];
    const capabilities = createBlogManuscriptCapabilities({
        CONFIG: { LISTEN_PORT: 4578 },
        Logger: { error() {}, warn() {} },
        axios: {
            async post(url, data) {
                requests.push({ url, data });
                if (url.endsWith('/api/v1/blog/manuscript-drafts/ai')) {
                    return { data: { data: { draftId: 'draft-123', revision: 1, title: '테스트 원고' } } };
                }
                if (url.endsWith('/settings')) return { data: { data: { revision: 2 } } };
                if (url.endsWith('/publish')) return { data: { data: { success: true } } };
                throw new Error(`Unexpected request: ${url}`);
            }
        }
    });
    const workflow = capabilities.find((item) => item.id === 'content.manuscript.generate_and_publish');

    const result = await workflow.execute({
        subject: '테스트 주제',
        target: 'naver',
        post_status: 'draft',
        naver_category: '기술'
    });

    assert.equal(result.success, true);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].data.naverCategory, '기술');
    assert.equal(requests[1].data.naverCategory, '기술');
    assert.equal(requests[2].data.revision, 2);
});
