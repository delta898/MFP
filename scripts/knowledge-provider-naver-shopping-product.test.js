const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../supabase/functions/_shared/knowledge-provider-naver-shopping-product.ts');

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

test('Naver shopping provider returns only an exact product match with bounded fields', async () => {
    const { createNaverShoppingProductRoute } = await modulePromise;
    const requests = [];
    const route = createNaverShoppingProductRoute({
        now: () => new Date('2026-08-29T03:00:00.000Z'),
        getEnv: (name) => ({
            NAVER_CLIENT_ID: 'fixture-client',
            NAVER_CLIENT_SECRET: 'fixture-secret'
        })[name],
        fetchImpl: async (url, init) => {
            requests.push({ url: new URL(url), init });
            return jsonResponse(200, {
                items: [
                    {
                        productId: '999',
                        title: '<b>다른 상품</b>',
                        link: 'https://smartstore.naver.com/example/products/999'
                    },
                    {
                        productId: '123456',
                        title: '<b>정확한 &amp; 상품</b>',
                        link: 'https://smartstore.naver.com/example/products/123456',
                        image: 'https://shop-phinf.pstatic.net/example.jpg',
                        mallName: '예시 스토어',
                        category1: '생활',
                        category2: '주방',
                        lprice: '32800',
                        hprice: '54000'
                    }
                ]
            });
        }
    });

    const snapshot = await route.fetchSnapshot({ product_id: '123456', product_name: '정확한 상품' });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.searchParams.get('query'), '123456');
    assert.equal(requests[0].init.headers['X-Naver-Client-Id'], 'fixture-client');
    assert.equal(requests[0].init.headers['X-Naver-Client-Secret'], 'fixture-secret');
    assert.equal(snapshot.kind, 'shopping_product');
    assert.equal(snapshot.items.length, 1);
    assert.deepEqual(snapshot.items[0], {
        id: snapshot.items[0].id,
        title: '정확한 & 상품',
        summary: '',
        observed_at: '2026-08-29T03:00:00.000Z',
        url: 'https://smartstore.naver.com/example/products/123456',
        source: 'naver-search-shopping',
        publisher: '예시 스토어',
        product_id: '123456',
        image_url: 'https://shop-phinf.pstatic.net/example.jpg',
        mall_name: '예시 스토어',
        categories: ['생활', '주방'],
        low_price: 32800,
        high_price: 54000
    });
});

test('Naver shopping provider never substitutes the first similar result', async () => {
    const { createNaverShoppingProductRoute } = await modulePromise;
    const queries = [];
    const route = createNaverShoppingProductRoute({
        now: () => new Date('2026-08-29T03:00:00.000Z'),
        getEnv: () => 'configured',
        fetchImpl: async (url) => {
            queries.push(new URL(url).searchParams.get('query'));
            return jsonResponse(200, {
                items: [{
                    productId: '999',
                    title: '이름이 비슷하지만 다른 상품',
                    link: 'https://smartstore.naver.com/example/products/999'
                }]
            });
        }
    });

    const snapshot = await route.fetchSnapshot({ product_id: '123456', product_name: '비슷한 상품' });

    assert.deepEqual(queries, ['123456', '비슷한 상품']);
    assert.deepEqual(snapshot.items, []);
});

test('Naver shopping provider fails safely without Developers credentials', async () => {
    const { createNaverShoppingProductRoute } = await modulePromise;
    const route = createNaverShoppingProductRoute({
        getEnv: () => '',
        fetchImpl: async () => {
            throw new Error('upstream must not be called');
        }
    });

    await assert.rejects(
        route.fetchSnapshot({ product_id: '123456' }),
        (error) => error.code === 'NAVER_SHOPPING_NOT_CONFIGURED'
    );
});
