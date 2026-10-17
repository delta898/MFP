const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');

test('WordPress category lookup delegates to the Blog Publishing Application', async () => {
    const categories = [{ id: 7, name: '여행' }];
    let calls = 0;
    const service = createContentService({
        Logger: { info() {} },
        blogPublishingApplication: {
            async listWordPressCategories() {
                calls += 1;
                return categories;
            }
        }
    });

    assert.equal(await service.getWordPressCategories(), categories);
    assert.equal(calls, 1);
});

test('WordPress category lookup reports a missing application instead of using a direct client fallback', async () => {
    const service = createContentService();

    await assert.rejects(
        () => service.getWordPressCategories(),
        (error) => error.status === 503 && error.apiCode === 'BLOG_PUBLISHING_APPLICATION_UNAVAILABLE'
    );
});
