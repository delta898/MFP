const test = require('node:test');
const assert = require('node:assert/strict');

const contractPromise = import('../supabase/functions/_shared/knowledge-gateway-contract.ts');

test('shopping product request requires a bounded numeric product identity', async () => {
    const { normalizeKnowledgeGatewayRequest } = await contractPromise;
    const normalized = normalizeKnowledgeGatewayRequest({
        schema_version: 1,
        kind: 'shopping_product',
        purpose: 'product_recovery',
        query: {
            product_id: '123456',
            product_name: ' 정확한   상품 ',
            locale: 'ko-KR',
            country: 'KR'
        },
        licenseKey: 'license',
        hwid: 'device'
    });

    assert.deepEqual(normalized.query, {
        product_id: '123456',
        product_name: '정확한 상품',
        locale: 'ko-KR',
        country: 'KR'
    });
    assert.throws(() => normalizeKnowledgeGatewayRequest({
        schema_version: 1,
        kind: 'shopping_product',
        purpose: 'product_recovery',
        query: { product_id: 'not-a-product' },
        licenseKey: 'license',
        hwid: 'device'
    }), /product_id_invalid/);
});

test('shopping product snapshots allow only minimal normalized commerce fields', async () => {
    const { validateServerKnowledgeSnapshot } = await contractPromise;
    const raw = {
        schema_version: 1,
        snapshot_id: 'ks_fixture',
        kind: 'shopping_product',
        provider_id: 'naver-shopping-product',
        transport: 'server_gateway',
        freshness: 'fresh',
        observed_at: '2026-08-29T03:00:00.000Z',
        expires_at: '2026-08-29T03:15:00.000Z',
        items: [{
            id: 'shopping_fixture',
            title: '정확한 상품',
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
        }]
    };

    const normalized = validateServerKnowledgeSnapshot(raw, {
        kind: 'shopping_product',
        providerId: 'naver-shopping-product'
    });
    assert.equal(normalized.items[0].product_id, '123456');
    assert.equal(normalized.items[0].low_price, 32800);
    assert.throws(() => validateServerKnowledgeSnapshot({
        ...raw,
        items: [{ ...raw.items[0], raw_payload: { secret: true } }]
    }, { kind: 'shopping_product', providerId: 'naver-shopping-product' }), /not_allowed|field_invalid/);
});
