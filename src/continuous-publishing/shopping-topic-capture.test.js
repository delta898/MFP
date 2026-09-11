const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SHOPPING_TOPIC_STATUS,
    buildShoppingTopicSheetRow
} = require('./shopping-topic-capture');

test('shopping capture builds a saved Sheet row without publishing dependencies', () => {
    const row = buildShoppingTopicSheetRow({
        shortUrl: 'https://smartstore.naver.com/example/products/1',
        product: '테스트 상품',
        instruction: '직접 사용한 장면을 담아주세요.',
        writingStrategy: 'discovery',
        contentFocus: 'usage',
        targets: ['naver'],
        naverCategory: '생활',
        postStatus: 'draft'
    });

    assert.equal(row.status, SHOPPING_TOPIC_STATUS.SAVED);
    assert.equal(row.shortUrl, 'https://smartstore.naver.com/example/products/1');
    assert.equal(row.category, 'N:생활, W:');
    assert.equal(row.writingStrategy, 'discovery');
    assert.equal(row.contentFocus, 'usage');
    assert.deepEqual(row.targets, ['naver']);
});

test('shopping capture rejects a malformed URL before any Sheet work', () => {
    assert.throws(
        () => buildShoppingTopicSheetRow({ shortUrl: 'smartstore.naver.com/example' }),
        (error) => error.code === 'SHOPPING_URL_INVALID'
    );
});
