const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { SQLITE_MEMORY_FILENAME, SQLITE_MEMORY_GENERATION } = require('./sqlite-event-store');

const SQLITE_HEALTH_FILENAME = 'agent_memory_v2.health.json';
const SQLITE_QUARANTINE_DIRECTORY = 'agent_memory_quarantine';
const LEGACY_MEMORY_NAMES = Object.freeze(['agent_memory_db', 'agent_memory_db.wal', 'agent_memory_db.shm']);
const MEMORY_SIZE_THRESHOLDS = Object.freeze({
    warning_bytes: 128 * 1024 * 1024,
    aggressive_bytes: 256 * 1024 * 1024,
    rebuild_bytes: 512 * 1024 * 1024
});

function resolveMemoryPaths(baseDir) {
    const dataDir = path.join(String(baseDir || process.cwd()), 'data');
    const databasePath = path.join(dataDir, SQLITE_MEMORY_FILENAME);
    return {
        dataDir,
        databasePath,
        databaseFamily: [databasePath, `${databasePath}-wal`, `${databasePath}-shm`],
        healthPath: path.join(dataDir, SQLITE_HEALTH_FILENAME),
        quarantineDir: path.join(dataDir, SQLITE_QUARANTINE_DIRECTORY),
        legacyPaths: LEGACY_MEMORY_NAMES.map((name) => path.join(dataDir, name))
    };
}

function totalDatabaseBytes(diagnostics = {}) {
    return Number(diagnostics.file_bytes || 0) + Number(diagnostics.wal_bytes || 0);
}

function verifySQLiteStore(store, now = new Date()) {
    if (!store?.database || store.isInitialized !== true) throw new Error('SQLite V2가 초기화되지 않았습니다.');
    const probeId = `health:${crypto.randomUUID()}`;
    const verifiedAt = new Date(now).toISOString();
    store.database.transaction(() => {
        store.database.run(`INSERT INTO memory_meta(key, value) VALUES ('health_probe', :value)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`, { value: probeId });
        const stored = store.database.get("SELECT value FROM memory_meta WHERE key = 'health_probe'");
        if (String(stored?.value || '') !== probeId) throw new Error('SQLite V2 write/read probe가 일치하지 않습니다.');
        store.database.run("DELETE FROM memory_meta WHERE key = 'health_probe'");
    });
    const check = store.database.quickCheck();
    if (!check.ok) throw new Error(`SQLite V2 quick_check 실패: ${check.result || 'unknown'}`);
    const generation = String(store.database.get("SELECT value FROM memory_meta WHERE key = 'storage_generation'")?.value || '');
    if (generation !== String(SQLITE_MEMORY_GENERATION)) throw new Error(`지원하지 않는 SQLite memory generation입니다: ${generation || 'missing'}`);
    return {
        schema_version: 1,
        storage_generation: SQLITE_MEMORY_GENERATION,
        database_file: SQLITE_MEMORY_FILENAME,
        owner_user_id: String(store.getLocalOwnerIdentity?.()?.owner_user_id || ''),
        verified_at: verifiedAt
    };
}

function writeHealthMarker(baseDir, marker, fileSystem = fs) {
    const paths = resolveMemoryPaths(baseDir);
    fileSystem.mkdirSync(paths.dataDir, { recursive: true });
    const temporaryPath = `${paths.healthPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        fileSystem.writeFileSync(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(temporaryPath, paths.healthPath);
    } catch (error) {
        try { fileSystem.rmSync(temporaryPath, { force: true }); } catch (_ignore) { }
        throw error;
    }
    return paths.healthPath;
}

function removePath(targetPath, fileSystem = fs) {
    if (!fileSystem.existsSync(targetPath)) return false;
    fileSystem.rmSync(targetPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    return true;
}

function cleanupLegacyMemory(baseDir, options = {}) {
    const fileSystem = options.fileSystem || fs;
    const paths = resolveMemoryPaths(baseDir);
    if (!fileSystem.existsSync(paths.healthPath)) return { attempted: false, removed: [], failed: [] };
    const removed = [];
    const failed = [];
    for (const legacyPath of paths.legacyPaths) {
        try {
            if (removePath(legacyPath, fileSystem)) removed.push(legacyPath);
        } catch (error) {
            failed.push({ path: legacyPath, message: String(error?.message || error) });
        }
    }
    return { attempted: true, removed, failed };
}

function quarantineSQLiteMemory(baseDir, options = {}) {
    const fileSystem = options.fileSystem || fs;
    const paths = resolveMemoryPaths(baseDir);
    fileSystem.mkdirSync(paths.quarantineDir, { recursive: true });
    const stamp = String(options.stamp || new Date().toISOString()).replace(/[^0-9]/g, '').slice(0, 14);
    const group = `${stamp}-${crypto.randomUUID().slice(0, 8)}`;
    const moved = [];
    for (const sourcePath of [...paths.databaseFamily, paths.healthPath]) {
        if (!fileSystem.existsSync(sourcePath)) continue;
        const destinationPath = path.join(paths.quarantineDir, `${group}-${path.basename(sourcePath)}`);
        fileSystem.renameSync(sourcePath, destinationPath);
        moved.push(destinationPath);
    }
    pruneQuarantine(paths.quarantineDir, { fileSystem, keepGroups: options.keepGroups });
    return moved;
}

function pruneQuarantine(quarantineDir, options = {}) {
    const fileSystem = options.fileSystem || fs;
    const keepGroups = Math.max(1, Math.min(5, Number.parseInt(options.keepGroups, 10) || 2));
    if (!fileSystem.existsSync(quarantineDir)) return [];
    const entries = fileSystem.readdirSync(quarantineDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
        .reverse();
    const groups = [];
    for (const entry of entries) {
        const group = entry.slice(0, 23);
        if (!groups.includes(group)) groups.push(group);
    }
    const expired = new Set(groups.slice(keepGroups));
    const removed = [];
    for (const entry of entries) {
        if (!expired.has(entry.slice(0, 23))) continue;
        const targetPath = path.join(quarantineDir, entry);
        removePath(targetPath, fileSystem);
        removed.push(targetPath);
    }
    return removed;
}

module.exports = {
    LEGACY_MEMORY_NAMES,
    MEMORY_SIZE_THRESHOLDS,
    SQLITE_HEALTH_FILENAME,
    SQLITE_QUARANTINE_DIRECTORY,
    cleanupLegacyMemory,
    pruneQuarantine,
    quarantineSQLiteMemory,
    resolveMemoryPaths,
    totalDatabaseBytes,
    verifySQLiteStore,
    writeHealthMarker
};
