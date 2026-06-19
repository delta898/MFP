const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');

function createService(cmdShopping, state = {}) {
    return createContentService({
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    features: {
                        cmd_batch: true,
                        cmd_trends: false,
                        cmd_shopping: cmdShopping,
                        enable_related_posts_auto_link: false
                    }
                };
            }
        },
        ShoppingManager: {
            async previewFromShortUrl(url) {
                state.previewUrl = url;
                return { product: '상품' };
            }
        }
    });
}

test('shopping preview preserves data but blocks shopping execution when disabled', async () => {
    const state = {};
    const service = createService(false, state);

    await assert.rejects(
        () => service.shoppingPreview({ urlRaw: 'https://example.com/product' }),
        (error) => error?.code === 'FEATURE_DISABLED' || error?.apiCode === 'FEATURE_DISABLED'
    );
    assert.equal(state.previewUrl, undefined);
});

test('shopping preview runs when cmd_shopping is enabled', async () => {
    const state = {};
    const service = createService(true, state);

    const result = await service.shoppingPreview({ urlRaw: 'https://example.com/product' });

    assert.deepEqual(result, { product: '상품' });
    assert.equal(state.previewUrl, 'https://example.com/product');
});
