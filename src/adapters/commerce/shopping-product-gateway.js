'use strict';

const { createKnowledgeServerGatewayClient } = require('../knowledge/server-gateway-client');

const SHOPPING_KIND = 'shopping_product';
const SHOPPING_PURPOSE = 'product_recovery';

function compact(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeProductId(value) {
    const productId = compact(value, 40);
    return /^\d{1,40}$/.test(productId) ? productId : '';
}

function safeHttpsUrl(value) {
    try {
        const parsed = new URL(compact(value, 2048));
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
        parsed.hash = '';
        return parsed.toString();
    } catch (_error) {
        return '';
    }
}

function price(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function formatPrice(value) {
    return value === null ? '' : `${value.toLocaleString('ko-KR')}원`;
}

function normalizeShoppingProductSnapshot(snapshot, expectedProductId) {
    const productId = normalizeProductId(expectedProductId);
    if (!productId || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('invalid shopping product snapshot');
    }
    if (Number(snapshot.schema_version) !== 1
        || snapshot.kind !== SHOPPING_KIND
        || snapshot.transport !== 'server_gateway') {
        throw new Error('invalid shopping product snapshot identity');
    }
    if (!Array.isArray(snapshot.items) || snapshot.items.length > 1) {
        throw new Error('invalid shopping product snapshot items');
    }
    if (snapshot.items.length === 0) return null;

    const raw = snapshot.items[0];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('invalid shopping product item');
    }
    if (normalizeProductId(raw.product_id) !== productId) {
        throw new Error('shopping product identity mismatch');
    }
    const title = compact(raw.title, 300);
    const productLink = safeHttpsUrl(raw.url);
    const imageUrl = raw.image_url ? safeHttpsUrl(raw.image_url) : '';
    if (!title || !productLink) throw new Error('invalid shopping product fields');

    const mallName = compact(raw.mall_name, 160);
    const categories = Array.isArray(raw.categories)
        ? raw.categories.map((entry) => compact(entry, 100)).filter(Boolean).slice(0, 4)
        : [];
    const lowPrice = price(raw.low_price);
    const highPrice = price(raw.high_price);
    const body = [
        `상품명: ${title}`,
        mallName ? `스토어: ${mallName}` : '',
        categories.length ? `카테고리: ${categories.join(' > ')}` : '',
        lowPrice !== null ? `최저가: ${formatPrice(lowPrice)}` : '',
        highPrice !== null ? `최고가: ${formatPrice(highPrice)}` : ''
    ].filter(Boolean).join('\n');

    return {
        title,
        description: '',
        body,
        imageUrls: imageUrl ? [imageUrl] : [],
        commerceData: {
            salePrice: lowPrice,
            originalPrice: highPrice,
            discountRate: null,
            freeShipping: false,
            deliveryMethods: [],
            installment: '',
            benefitHighlights: [],
            facts: []
        },
        reviewData: {
            reviewCount: null,
            averageRating: null,
            aiSummaryPoints: [],
            reviewSamples: [],
            reviewHighlights: [],
            facts: []
        },
        productLink
    };
}

function createShoppingProductGateway(options = {}) {
    const serverGatewayClient = options.serverGatewayClient || createKnowledgeServerGatewayClient({
        config: options.config,
        License: options.License,
        createClient: options.createClient,
        timeoutMs: options.timeoutMs
    });

    return {
        async recoverProduct(input = {}) {
            const productId = normalizeProductId(input.productId);
            if (!productId) return null;
            const productName = compact(input.productName, 180);
            const snapshot = await serverGatewayClient.fetchSnapshot({
                kind: SHOPPING_KIND,
                purpose: SHOPPING_PURPOSE,
                query: {
                    product_id: productId,
                    ...(productName ? { product_name: productName } : {}),
                    locale: 'ko-KR',
                    country: 'KR'
                }
            });
            return normalizeShoppingProductSnapshot(snapshot, productId);
        }
    };
}

async function recoverOptionalProduct(gateway, input = {}, onFailure = () => {}) {
    try {
        return await gateway.recoverProduct(input);
    } catch (error) {
        onFailure(error);
        return null;
    }
}

module.exports = {
    SHOPPING_KIND,
    SHOPPING_PURPOSE,
    createShoppingProductGateway,
    normalizeProductId,
    normalizeShoppingProductSnapshot,
    recoverOptionalProduct
};
