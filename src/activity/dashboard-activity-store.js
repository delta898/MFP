const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('../config-loader');

const DEFAULT_MAX_RECENT = 200;
const DEFAULT_PERSIST_LIMIT = 500;
const DEFAULT_FILE_NAME = 'dashboard-activities.json';

class DashboardActivityStore {
    constructor(options = {}) {
        this.fs = options.fs || fs;
        this.path = options.path || path;
        this.crypto = options.crypto || crypto;
        this.rootDir = options.rootDir || CONFIG.ROOT_DIR || process.cwd();
        this.maxRecent = Number(options.maxRecent) || DEFAULT_MAX_RECENT;
        this.persistLimit = Number(options.persistLimit) || DEFAULT_PERSIST_LIMIT;
        this.filePath = options.filePath || this.path.join(this.rootDir, 'logs', DEFAULT_FILE_NAME);
        this.loaded = false;
        this.items = [];
    }

    _ensureLoaded() {
        if (this.loaded) return;
        this.loaded = true;
        try {
            if (!this.fs.existsSync(this.filePath)) {
                this.items = [];
                return;
            }
            const raw = String(this.fs.readFileSync(this.filePath, 'utf8') || '').trim();
            if (!raw) {
                this.items = [];
                return;
            }
            const parsed = JSON.parse(raw);
            this.items = Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, this.persistLimit) : [];
        } catch (error) {
            this.items = [];
            console.error(`⚠️ Dashboard activity load failed: ${error.message}`);
        }
    }

    _flush() {
        try {
            this.fs.mkdirSync(this.path.dirname(this.filePath), { recursive: true });
            this.fs.writeFileSync(
                this.filePath,
                JSON.stringify(this.items.slice(0, this.persistLimit), null, 2),
                'utf8'
            );
        } catch (error) {
            console.error(`⚠️ Dashboard activity flush failed: ${error.message}`);
        }
    }

    record(input = {}) {
        this._ensureLoaded();
        const timestamp = String(input.timestamp || '').trim() || new Date().toISOString();
        const level = ['debug', 'info', 'warn', 'error'].includes(String(input.level || '').trim())
            ? String(input.level || '').trim()
            : 'info';
        const title = String(input.title || '').trim();
        if (!title) return null;

        const entry = {
            id: String(input.id || '').trim() || this.crypto.randomUUID(),
            timestamp,
            level,
            type: String(input.type || '').trim() || 'generic',
            category: String(input.category || '').trim() || 'general',
            title,
            detail: String(input.detail || '').trim(),
            meta: input.meta && typeof input.meta === 'object' ? { ...input.meta } : {}
        };

        this.items.unshift(entry);
        if (this.items.length > this.maxRecent) {
            this.items.length = this.maxRecent;
        }
        this._flush();
        return entry;
    }

    listRecent(limit = 40) {
        this._ensureLoaded();
        const normalizedLimit = Math.max(1, Math.min(this.maxRecent, Number(limit) || 40));
        return this.items.slice(0, normalizedLimit).map((item) => ({
            ...item,
            meta: item.meta && typeof item.meta === 'object' ? { ...item.meta } : {}
        }));
    }
}

let singleton = null;

function getDashboardActivityStore() {
    if (!singleton) {
        singleton = new DashboardActivityStore();
    }
    return singleton;
}

function recordDashboardActivity(input = {}) {
    return getDashboardActivityStore().record(input);
}

function listRecentDashboardActivities(limit = 40) {
    return getDashboardActivityStore().listRecent(limit);
}

module.exports = {
    DashboardActivityStore,
    getDashboardActivityStore,
    recordDashboardActivity,
    listRecentDashboardActivities
};
