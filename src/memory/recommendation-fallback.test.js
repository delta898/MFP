const test = require('node:test');
const assert = require('node:assert/strict');
const { KuzuEventStore } = require('./event-store');
const { createRecommendation } = require('../recommendations/core/test-fixtures');

test('Kuzu 초기화 실패 때만 recommendation store가 bounded volatile mode로 시작한다', async () => {
    const warnings = [];
    const store = new KuzuEventStore({ Logger: { warn: (message) => warnings.push(message) } });
    store.initialize = async () => { throw new Error('native unavailable'); };
    const created = await store.createRecommendation(createRecommendation(), { operation_id: 'create-1' });
    assert.equal(created.recommendation.status, 'available');
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'volatile', reason: 'native unavailable' });
    await store.listRecommendations('owner-local');
    assert.equal(warnings.length, 1);
});

test('persistent mode가 시작된 뒤 repository 오류를 volatile로 전환하지 않는다', async () => {
    const store = new KuzuEventStore({ Logger: { warn() {} } });
    store.isInitialized = true;
    store.recommendationStore = {
        async createRecommendation() { throw new Error('persistent write failed'); },
        getRecommendationStoreStatus() { return { mode: 'persistent', reason: '' }; }
    };
    await assert.rejects(store.createRecommendation(createRecommendation(), { operation_id: 'create-1' }), /persistent write failed/);
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'persistent', reason: '' });
});
