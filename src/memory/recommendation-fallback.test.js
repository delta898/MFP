const test = require('node:test');
const assert = require('node:assert/strict');
const { SQLiteEventStore } = require('./sqlite-event-store');
const { buildDisabledEventStore } = require('./store');
const { createRecommendation } = require('../recommendations/core/test-fixtures');

test('SQLite 재생성 실패 때 recommendation store가 bounded volatile mode로 시작한다', async () => {
    const warnings = [];
    const store = buildDisabledEventStore(new Error('sqlite unavailable'), { warn: (message) => warnings.push(message) });
    const created = await store.createRecommendation(createRecommendation(), { operation_id: 'create-1' });
    assert.equal(created.recommendation.status, 'available');
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'volatile', reason: 'sqlite unavailable' });
    await store.listRecommendations('owner-local');
    assert.equal(warnings.length, 1);
});

test('persistent mode가 시작된 뒤 repository 오류를 volatile로 전환하지 않는다', async () => {
    const store = new SQLiteEventStore({ Logger: { warn() {} } });
    store.isInitialized = true;
    store.recommendationStore = {
        async createRecommendation() { throw new Error('persistent write failed'); },
        getRecommendationStoreStatus() { return { mode: 'persistent', reason: '' }; }
    };
    await assert.rejects(store.createRecommendation(createRecommendation(), { operation_id: 'create-1' }), /persistent write failed/);
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'persistent', reason: '' });
});
