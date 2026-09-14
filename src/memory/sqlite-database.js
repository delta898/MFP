const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

function loadNodeSqlite() {
    return require('node:sqlite');
}

class SQLiteDatabase {
    constructor(options = {}) {
        this.filePath = String(options.filePath || '').trim();
        if (!this.filePath) throw new Error('SQLite filePath가 필요합니다.');
        this.sqlite = options.sqlite || loadNodeSqlite();
        this.DatabaseSync = options.DatabaseSync || this.sqlite.DatabaseSync;
        this.db = null;
    }

    open() {
        if (this.db) return this;
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.db = new this.DatabaseSync(this.filePath, {
            timeout: DEFAULT_BUSY_TIMEOUT_MS,
            enableForeignKeyConstraints: true,
            defensive: true
        });
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec(`PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`);
        this.db.exec('PRAGMA synchronous = NORMAL');
        this.db.exec('PRAGMA auto_vacuum = INCREMENTAL');
        return this;
    }

    exec(sql) {
        this._assertOpen();
        return this.db.exec(sql);
    }

    run(sql, params = {}) {
        this._assertOpen();
        return this.db.prepare(sql).run(params);
    }

    get(sql, params = {}) {
        this._assertOpen();
        return this.db.prepare(sql).get(params);
    }

    all(sql, params = {}) {
        this._assertOpen();
        return this.db.prepare(sql).all(params);
    }

    transaction(callback) {
        this._assertOpen();
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = callback();
            if (result && typeof result.then === 'function') {
                throw new Error('SQLite transaction callback은 동기 작업이어야 합니다.');
            }
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_rollbackError) { }
            throw error;
        }
    }

    quickCheck() {
        const row = this.get('PRAGMA quick_check');
        const value = row ? String(Object.values(row)[0] || '') : '';
        return { ok: value.toLowerCase() === 'ok', result: value };
    }

    checkpoint(mode = 'PASSIVE') {
        const normalized = ['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE'].includes(String(mode).toUpperCase())
            ? String(mode).toUpperCase()
            : 'PASSIVE';
        return this.get(`PRAGMA wal_checkpoint(${normalized})`);
    }

    incrementalVacuum(pages = 256) {
        const bounded = Math.max(1, Math.min(4096, Number.parseInt(pages, 10) || 256));
        this.exec(`PRAGMA incremental_vacuum(${bounded})`);
    }

    diagnostics() {
        const pageCount = Number(Object.values(this.get('PRAGMA page_count') || { value: 0 })[0] || 0);
        const freePages = Number(Object.values(this.get('PRAGMA freelist_count') || { value: 0 })[0] || 0);
        const pageSize = Number(Object.values(this.get('PRAGMA page_size') || { value: 4096 })[0] || 4096);
        let fileBytes = 0;
        let walBytes = 0;
        try { fileBytes = Number(fs.statSync(this.filePath).size || 0); } catch (_ignore) { }
        try { walBytes = Number(fs.statSync(`${this.filePath}-wal`).size || 0); } catch (_ignore) { }
        return {
            file_bytes: fileBytes,
            wal_bytes: walBytes,
            page_count: pageCount,
            free_pages: freePages,
            page_size: pageSize,
            free_ratio: pageCount > 0 ? freePages / pageCount : 0
        };
    }

    close() {
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        db.close();
    }

    _assertOpen() {
        if (!this.db) throw new Error('SQLite database가 열려 있지 않습니다.');
    }
}

module.exports = {
    DEFAULT_BUSY_TIMEOUT_MS,
    SQLiteDatabase,
    loadNodeSqlite
};
