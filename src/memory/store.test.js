const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAgentMemoryController } = require('./store');
const { resolveMemoryPaths } = require('./sqlite-lifecycle');

function logger() {
    const messages = [];
    return { messages, info(message) { messages.push(message); }, warn(message) { messages.push(message); } };
}

function fakeStore(options = {}) {
    return {
        disabled: false,
        tag: options.tag || '',
        isInitialized: false,
        database: { diagnostics: () => ({ file_bytes: options.bytes || 1, wal_bytes: 0 }) },
        async initialize() {
            if (options.error) throw options.error;
            this.isInitialized = true;
            return true;
        },
        async runMaintenance() { return { after: { file_bytes: options.bytes || 1, wal_bytes: 0 } }; },
        close() { this.closed = true; }
    };
}

test('controller는 고정 facade를 유지한 채 손상된 V2를 한 번 격리하고 재생성한다', async () => {
    const stores = [fakeStore({ tag: 'broken', error: new Error('corrupt') }), fakeStore({ tag: 'fresh' })];
    const quarantines = [];
    const controller = createAgentMemoryController({
        Logger: logger(),
        baseDir: '/test',
        createStore: () => stores.shift(),
        quarantineSQLiteMemory: () => { quarantines.push(true); return ['/test/data/quarantine']; },
        verifySQLiteStore: (store) => ({ owner_user_id: store.tag, storage_generation: 2 }),
        writeHealthMarker() {},
        cleanupLegacyMemory: () => ({ removed: [], failed: [] }),
        scheduleMaintenance: false
    });
    const facade = controller.facade;
    assert.equal(facade.tag, 'broken');
    assert.equal(await controller.initialize(), true);
    assert.equal(quarantines.length, 1);
    assert.equal(facade.tag, 'fresh');
    assert.equal(controller.facade, facade);
});

test('startup 이전 facade 비동기 호출도 health gate를 먼저 통과한다', async () => {
    const calls = [];
    const store = fakeStore({ tag: 'early-call' });
    store.listRecommendations = async () => { calls.push('read'); return []; };
    const controller = createAgentMemoryController({
        Logger: logger(),
        baseDir: '/test',
        createStore: () => store,
        verifySQLiteStore: () => { calls.push('verify'); return { owner_user_id: 'owner', storage_generation: 2 }; },
        writeHealthMarker: () => calls.push('marker'),
        cleanupLegacyMemory: () => ({ removed: [], failed: [] }),
        scheduleMaintenance: false
    });
    assert.deepEqual(await controller.facade.listRecommendations('owner'), []);
    assert.deepEqual(calls, ['verify', 'marker', 'read']);
});

test('재생성도 실패하면 같은 facade가 bounded disabled backend를 가리킨다', async () => {
    const stores = [fakeStore({ error: new Error('first') }), fakeStore({ error: new Error('second') })];
    const controller = createAgentMemoryController({
        Logger: logger(),
        baseDir: '/test',
        createStore: () => stores.shift(),
        quarantineSQLiteMemory: () => [],
        scheduleMaintenance: false
    });
    const facade = controller.facade;
    assert.equal(await controller.initialize(), false);
    assert.equal(facade.disabled, true);
    assert.deepEqual(await facade.listRecommendations('owner'), []);
});

test('health marker 기록 실패는 V2를 유지하고 legacy 정리만 보류한다', async () => {
    let cleanupCalls = 0;
    const controller = createAgentMemoryController({
        Logger: logger(),
        baseDir: '/test',
        createStore: () => fakeStore({ tag: 'healthy' }),
        verifySQLiteStore: () => ({ owner_user_id: 'owner', storage_generation: 2 }),
        writeHealthMarker() { throw new Error('read-only'); },
        cleanupLegacyMemory() { cleanupCalls += 1; return { removed: [], failed: [] }; },
        scheduleMaintenance: false
    });
    assert.equal(await controller.initialize(), true);
    assert.equal(controller.facade.disabled, false);
    assert.equal(cleanupCalls, 0);
});

test('512MB 이상 V2는 정상 선언 전에 폐기하고 fresh store를 검증한다', async () => {
    const stores = [fakeStore({ tag: 'large', bytes: 513 * 1024 * 1024 }), fakeStore({ tag: 'fresh' })];
    let quarantineCalls = 0;
    const controller = createAgentMemoryController({
        Logger: logger(),
        baseDir: '/test',
        createStore: () => stores.shift(),
        quarantineSQLiteMemory: () => { quarantineCalls += 1; return []; },
        verifySQLiteStore: (store) => ({ owner_user_id: store.tag, storage_generation: 2 }),
        writeHealthMarker() {},
        cleanupLegacyMemory: () => ({ removed: [], failed: [] }),
        scheduleMaintenance: false
    });
    assert.equal(await controller.initialize(), true);
    assert.equal(quarantineCalls, 1);
    assert.equal(controller.facade.tag, 'fresh');
});

test('safe mode는 SQLite 파일을 만들지 않고 비활성 facade를 반환한다', async () => {
    let createCalls = 0;
    const controller = createAgentMemoryController({
        Logger: logger(),
        safeMode: true,
        createStore() { createCalls += 1; return fakeStore(); },
        scheduleMaintenance: false
    });
    assert.equal(await controller.initialize(), false);
    assert.equal(controller.facade.disabled, true);
    assert.equal(createCalls, 0);
});

test('실제 corrupt V2는 재생성되고 health gate 통과 뒤 legacy V1이 제거된다', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-memory-controller-'));
    const paths = resolveMemoryPaths(baseDir);
    fs.mkdirSync(paths.dataDir, { recursive: true });
    fs.writeFileSync(paths.databasePath, 'not-a-sqlite-database');
    fs.mkdirSync(paths.legacyPaths[0], { recursive: true });
    fs.writeFileSync(path.join(paths.legacyPaths[0], 'legacy.kz'), 'legacy');
    const controller = createAgentMemoryController({
        Logger: logger(),
        baseDir,
        scheduleMaintenance: false
    });
    try {
        assert.equal(await controller.initialize(), true);
        assert.equal(controller.facade.disabled, false);
        assert.equal(controller.testing.getBackend().database.quickCheck().ok, true);
        assert.equal(fs.existsSync(paths.healthPath), true);
        assert.equal(fs.existsSync(paths.legacyPaths[0]), false);
        assert.equal(fs.readdirSync(paths.quarantineDir).some((name) => name.endsWith('agent_memory_v2.sqlite3')), true);
    } finally {
        controller.close();
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});
