const test = require('node:test');
const assert = require('node:assert/strict');
const { createShoppingQuickPublishHandler } = require('./quick-publish-handler');
const { isCommandEnabled, toFeatureMap } = require('../../../../services/licensing/feature-access');

test('shopping quick publish rejects an overlong instruction before external work', async () => {
    const runtime = createShoppingQuickPublishHandler({
        CONFIG: {},
        normalizePublishMode: (value) => value
    });

    const result = await runtime.executeShoppingQuickPublish({
        shortUrl: 'https://naver.me/example',
        instruction: '가'.repeat(1001),
        publishMode: 'append_only'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_SHOPPING_INSTRUCTION');
});

test('shopping quick save carries the selected writing strategy into the sheet item', async () => {
    let appendedItem;
    const runtime = createShoppingQuickPublishHandler({
        CONFIG: { GOOGLE_SHOPPING_SHEET: 'shopping' },
        Logger: { info() { }, warn() { }, error() { } },
        GoogleSheets: {
            async ensureAllSheetsExist() { },
            async appendGoogleSheetShopping(items) {
                [appendedItem] = items;
                return { success: true, rowNumbers: [2], rowIndices: [0] };
            }
        },
        License: {
            async checkLicenseStatus() { return { success: true, features: {} }; }
        },
        normalizePublishMode: (value) => value,
        toFeatureMap,
        isCommandEnabled,
    });

    const result = await runtime.executeShoppingQuickPublish({
        shortUrl: 'https://naver.me/example',
        product: '확인된 상품',
        instruction: '직접 사용한 관점을 담아주세요.',
        writingStrategy: 'discovery',
        contentFocus: 'comparison',
        publishMode: 'append_only',
        targets: ['naver']
    });

    assert.equal(result.success, true);
    assert.equal(appendedItem.writingStrategy, 'discovery');
    assert.equal(appendedItem.contentFocus, 'comparison');
    assert.equal(appendedItem.instruction, '직접 사용한 관점을 담아주세요.');
});

test('shopping quick save rejects an unknown writing strategy before external work', async () => {
    const runtime = createShoppingQuickPublishHandler({
        CONFIG: {},
        normalizePublishMode: (value) => value
    });

    const result = await runtime.executeShoppingQuickPublish({
        shortUrl: 'https://naver.me/example',
        writingStrategy: 'viral',
        publishMode: 'append_only'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_WRITING_STRATEGY');
});

test('shopping quick save rejects an unknown content focus before external work', async () => {
    const runtime = createShoppingQuickPublishHandler({ CONFIG: {}, normalizePublishMode: (value) => value });
    const result = await runtime.executeShoppingQuickPublish({
        shortUrl: 'https://naver.me/example',
        contentFocus: 'review_claim',
        publishMode: 'append_only'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_SHOPPING_CONTENT_FOCUS');
});
