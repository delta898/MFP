'use strict';

const SHOPPING_CONTENT_FOCUS_LABELS = Object.freeze({
    auto: '자동 구성',
    product_intro: '상품 소개',
    comparison: '비교·선택 가이드',
    usage: '사용 상황 제안'
});

function normalizeShoppingContentFocus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(SHOPPING_CONTENT_FOCUS_LABELS, normalized)
        ? normalized
        : 'auto';
}

module.exports = { SHOPPING_CONTENT_FOCUS_LABELS, normalizeShoppingContentFocus };
