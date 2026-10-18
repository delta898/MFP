const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDisabledEventStore, createAgentMemoryController } = require('./runtime');
const { createRecommendation } = require('../../services/recommendations/core/test-fixtures');

test('SQLite 재생성 실패 때 recommendation store가 bounded volatile mode로 시작한다', async () => {
    const warnings = [];
    const backend = buildDisabledEventStore(new Error('sqlite unavailable'), { warn: (message) => warnings.push(message) });
    const controller = createAgentMemoryController({ createStore: () => backend, scheduleMaintenance: false });
    const store = controller.facade;
    const created = await store.createRecommendation(createRecommendation(), { operation_id: 'create-1' });
    assert.equal(created.recommendation.status, 'available');
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'volatile', reason: 'sqlite unavailable' });
    await store.listRecommendations('owner-local');
    assert.equal(warnings.length, 1);
    controller.close();
});

test('persistent mode가 시작된 뒤 repository 오류를 volatile로 전환하지 않는다', async () => {
    const backend = {
        disabled: false,
        async initialize() { this.database = { diagnostics: () => ({}) }; },
        close() {},
        async runMaintenance() { return {}; }
    };
    const persistentStore = {
        async createRecommendation() { throw new Error('persistent write failed'); },
        getRecommendationStoreStatus() { return { mode: 'persistent', reason: '' }; }
    };
    const controller = createAgentMemoryController({
        createStore: () => backend,
        createRecommendationStore: () => persistentStore,
        verifySQLiteStore: () => ({ owner_user_id: 'owner-local' }),
        writeHealthMarker() {},
        cleanupLegacyMemory: () => ({ removed: [], failed: [] }),
        scheduleMaintenance: false,
        Logger: { info() {}, warn() {} }
    });
    await controller.initialize();
    const store = controller.facade;
    await assert.rejects(store.createRecommendation(createRecommendation(), { operation_id: 'create-1' }), /persistent write failed/);
    assert.deepEqual(store.getRecommendationStoreStatus(), { mode: 'persistent', reason: '' });
    controller.close();
});
