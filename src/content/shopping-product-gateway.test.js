const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createShoppingProductGateway,
    normalizeShoppingProductSnapshot,
    recoverOptionalProduct
} = require('./shopping-product-gateway');

function snapshot(item) {
    return {
        schema_version: 1,
        kind: 'shopping_product',
        provider_id: 'naver-shopping-product',
        transport: 'server_gateway',
        items: item ? [item] : []
    };
}

test('shopping product gateway sends only bounded recovery input and maps an exact result', async () => {
    let request;
    const gateway = createShoppingProductGateway({
        serverGatewayClient: {
            fetchSnapshot: async (input) => {
                request = input;
                return snapshot({
                    product_id: '123456',
                    title: '정확한 상품',
                    url: 'https://smartstore.naver.com/example/products/123456',
                    image_url: 'https://shop-phinf.pstatic.net/example.jpg',
                    mall_name: '예시 스토어',
                    categories: ['생활', '주방'],
                    low_price: 32800,
                    high_price: 54000
                });
            }
        }
    });

    const result = await gateway.recoverProduct({ productId: '123456', productName: '  정확한   상품  ' });

    assert.deepEqual(request, {
        kind: 'shopping_product',
        purpose: 'product_recovery',
        query: {
            product_id: '123456',
            product_name: '정확한 상품',
            locale: 'ko-KR',
            country: 'KR'
        }
    });
    assert.equal(result.title, '정확한 상품');
    assert.equal(result.productLink, 'https://smartstore.naver.com/example/products/123456');
    assert.deepEqual(result.imageUrls, ['https://shop-phinf.pstatic.net/example.jpg']);
    assert.equal(result.commerceData.salePrice, 32800);
    assert.equal(result.commerceData.originalPrice, 54000);
});

test('shopping product snapshot rejects a mismatched product identity', () => {
    assert.throws(() => normalizeShoppingProductSnapshot(snapshot({
        product_id: '999',
        title: '다른 상품',
        url: 'https://smartstore.naver.com/example/products/999'
    }), '123456'), /identity mismatch/);
});

test('optional shopping recovery preserves the caller flow on gateway failure', async () => {
    let failure;
    const result = await recoverOptionalProduct({
        recoverProduct: async () => {
            throw new Error('gateway unavailable');
        }
    }, { productId: '123456' }, (error) => {
        failure = error;
    });

    assert.equal(result, null);
    assert.equal(failure.message, 'gateway unavailable');
});
