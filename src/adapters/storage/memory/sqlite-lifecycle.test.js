const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SQLiteEventStore } = require('./sqlite-event-store');
const {
    SQLITE_HEALTH_FILENAME,
    cleanupLegacyMemory,
    quarantineSQLiteMemory,
    resolveMemoryPaths,
    verifySQLiteStore,
    writeHealthMarker
} = require('./sqlite-lifecycle');

function fixture() {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-memory-lifecycle-'));
    return { baseDir, close() { fs.rmSync(baseDir, { recursive: true, force: true }); } };
}

test('health gate는 실제 write/read/delete와 quick_check 후 marker를 원자 기록한다', async () => {
    const f = fixture();
    const store = new SQLiteEventStore({ baseDir: f.baseDir, Logger: { info() {}, warn() {} } });
    try {
        await store.initialize();
        const marker = verifySQLiteStore(store, new Date('2026-09-15T00:00:00.000Z'));
        const markerPath = writeHealthMarker(f.baseDir, marker);
        assert.equal(marker.storage_generation, 2);
        assert.equal(store.database.get("SELECT count(*) AS count FROM memory_meta WHERE key = 'health_probe'").count, 0);
        assert.deepEqual(JSON.parse(fs.readFileSync(markerPath, 'utf8')), marker);
        assert.equal(fs.readdirSync(path.dirname(markerPath)).some((name) => name.endsWith('.tmp')), false);
    } finally {
        store.close();
        f.close();
    }
});

test('알 수 없는 future generation은 schema 준비로 덮어쓰지 않고 health gate에서 거부한다', async () => {
    const f = fixture();
    const first = new SQLiteEventStore({ baseDir: f.baseDir, Logger: { info() {}, warn() {} } });
    try {
        await first.initialize();
        first.database.run("UPDATE memory_meta SET value = '3' WHERE key = 'storage_generation'");
        first.close();
        const reopened = new SQLiteEventStore({ baseDir: f.baseDir, Logger: { info() {}, warn() {} } });
        try {
            await reopened.initialize();
            assert.equal(reopened.database.get("SELECT value FROM memory_meta WHERE key = 'storage_generation'").value, '3');
            assert.throws(() => verifySQLiteStore(reopened), /지원하지 않는 SQLite memory generation/);
        } finally { reopened.close(); }
    } finally {
        first.close();
        f.close();
    }
});

test('legacy V1은 health marker 전에는 보존하고 marker 이후에만 정리한다', () => {
    const f = fixture();
    try {
        const paths = resolveMemoryPaths(f.baseDir);
        fs.mkdirSync(paths.legacyPaths[0], { recursive: true });
        fs.writeFileSync(path.join(paths.legacyPaths[0], 'data.kz'), 'legacy');
        assert.equal(cleanupLegacyMemory(f.baseDir).attempted, false);
        assert.equal(fs.existsSync(paths.legacyPaths[0]), true);

        fs.mkdirSync(paths.dataDir, { recursive: true });
        fs.writeFileSync(path.join(paths.dataDir, SQLITE_HEALTH_FILENAME), '{}');
        const cleanup = cleanupLegacyMemory(f.baseDir);
        assert.equal(cleanup.removed.length, 1);
        assert.equal(fs.existsSync(paths.legacyPaths[0]), false);
    } finally { f.close(); }
});

test('legacy V1 파일 잠금 오류는 나머지 정리를 막지 않고 재시도 대상으로 남긴다', () => {
    const f = fixture();
    try {
        const paths = resolveMemoryPaths(f.baseDir);
        fs.mkdirSync(paths.dataDir, { recursive: true });
        fs.writeFileSync(paths.healthPath, '{}');
        fs.writeFileSync(paths.legacyPaths[1], 'locked');
        fs.writeFileSync(paths.legacyPaths[2], 'free');
        const fileSystem = {
            ...fs,
            rmSync(target, options) {
                if (target === paths.legacyPaths[1]) throw new Error('EPERM: locked');
                return fs.rmSync(target, options);
            }
        };
        const cleanup = cleanupLegacyMemory(f.baseDir, { fileSystem });
        assert.equal(cleanup.failed.length, 1);
        assert.equal(cleanup.removed.length, 1);
        assert.equal(fs.existsSync(paths.legacyPaths[1]), true);
        assert.equal(fs.existsSync(paths.legacyPaths[2]), false);
    } finally { f.close(); }
});

test('corrupt V2 family는 legacy 경로와 분리된 bounded quarantine으로 이동한다', () => {
    const f = fixture();
    try {
        const paths = resolveMemoryPaths(f.baseDir);
        fs.mkdirSync(paths.dataDir, { recursive: true });
        fs.writeFileSync(paths.databasePath, 'corrupt');
        fs.writeFileSync(`${paths.databasePath}-wal`, 'wal');
        fs.writeFileSync(paths.healthPath, '{}');
        const moved = quarantineSQLiteMemory(f.baseDir, { stamp: '2026-09-15T01:02:03.000Z' });
        assert.equal(moved.length, 3);
        assert.equal(fs.existsSync(paths.databasePath), false);
        assert.equal(fs.existsSync(paths.healthPath), false);
        assert.equal(fs.existsSync(paths.quarantineDir), true);
        assert.equal(paths.legacyPaths.some((legacyPath) => moved.includes(legacyPath)), false);
    } finally { f.close(); }
});
