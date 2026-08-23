const test = require('node:test');
const assert = require('node:assert/strict');
const {
    collectCommerceAnchors,
    isConcreteProduct,
    meaningfulProductTokens,
    normalizeProductIdentity,
    productIdentityMatches
} = require('./commerce-grounding');

const NOW = '2026-08-24T06:00:00.000Z';

test('collects explicit shopping intent and supported owner shopping activity', () => {
    const anchors = collectCommerceAnchors({
        commerce_intent: { intent: 'shopping_content', product: '아이폰 18 프로' }
    }, {
        memory: { owner_memory: { activity: { signals: [
            {
                domain: 'shopping', stage: 'published', strength: 'strong', subject: '삼성 오디세이 G7 모니터',
                timestamp: '2026-08-24T05:00:00.000Z', evidence: { kind: 'event', id: 'event:shopping:1' }
            },
            {
                domain: 'blog', stage: 'published', strength: 'strong', subject: '게임',
                timestamp: '2026-08-24T05:10:00.000Z', evidence: { kind: 'event', id: 'event:blog:1' }
            },
            {
                domain: 'shopping', stage: 'generated', strength: 'weak', subject: '갤럭시 링',
                timestamp: '2026-08-24T05:20:00.000Z', evidence: { kind: 'artifact', id: 'idea:1' }
            }
        ] } } }
    }, { now: NOW });

    assert.deepEqual(anchors.map((item) => [item.lane, item.product]), [
        ['explicit', '아이폰 18 프로'],
        ['owner_activity', '삼성 오디세이 G7 모니터']
    ]);
});

test('requires explicit shopping intent instead of treating a product-shaped input as commerce', () => {
    assert.deepEqual(collectCommerceAnchors({
        commerce_intent: { intent: 'content_idea', product: '아이폰 18 프로' }
    }, {}, { now: NOW }), []);
    assert.equal(isConcreteProduct('인기 상품 추천'), false);
    assert.equal(isConcreteProduct('아이폰 18 프로'), true);
});

test('product matching is exact or based on at least two meaningful tokens', () => {
    assert.equal(normalizeProductIdentity(' 삼성 오디세이-G7! '), '삼성오디세이g7');
    assert.deepEqual(meaningfulProductTokens('인기 삼성 오디세이 G7 상품 추천'), ['삼성', '오디세이', 'g7']);
    assert.equal(productIdentityMatches('아이폰 18 프로', '아이폰 18 프로'), true);
    assert.equal(productIdentityMatches('삼성 오디세이 G7 게이밍 모니터', '오디세이 G7'), true);
    assert.equal(productIdentityMatches('삼성 오디세이 모니터', '삼성 냉장고'), false);
    assert.equal(productIdentityMatches('게이밍 모니터', '모니터 추천'), false);
});

test('deduplicates repeated owner signals without hiding distinct evidence lanes', () => {
    const signal = {
        domain: 'shopping', stage: 'saved', strength: 'medium', subject: '로지텍 MX Master 4',
        timestamp: '2026-08-24T05:00:00.000Z', evidence: { kind: 'artifact', id: 'shopping:1' }
    };
    const anchors = collectCommerceAnchors({}, {
        owner_activity: { signals: [signal] },
        memory: { owner_memory: { activity: { signals: [signal] } } }
    }, { now: NOW });
    assert.equal(anchors.length, 1);
});
