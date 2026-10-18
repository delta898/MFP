const { createWordPressSignature } = require('../../../services/connection-verification/policy');

const verificationState = new Map();

// Persistence (A): verification records survive restarts. The file holds only
// credential-signature hashes plus status snapshots — no secrets. Writes are
// best-effort and never throw; a lost record just means "unverified" again.
let verificationFs = null;
let verificationPath = null;
let verificationFilePath = '';
let verificationLoadedForPath = '';

function defaultFs() {
    if (!verificationFs) verificationFs = require('fs');
    return verificationFs;
}

function defaultPath() {
    if (!verificationPath) verificationPath = require('path');
    return verificationPath;
}

function defaultFilePath() {
    // Node's test runner sets this for test processes. Keep any test that
    // forgets to inject a store away from the user's project configuration.
    if (process.env.NODE_TEST_CONTEXT) {
        const os = require('os');
        return defaultPath().join(os.tmpdir(), `bloggenius-connection-verification-test-${process.pid}.json`);
    }
    return defaultPath().join(__dirname, '..', '..', '..', '..', 'config', 'connection_verification.json');
}

function configureConnectionVerificationState(options = {}) {
    if (options.fs) verificationFs = options.fs;
    if (options.path) verificationPath = options.path;
    if (typeof options.filePath === 'string' && options.filePath.trim()) {
        verificationFilePath = options.filePath.trim();
    }
    if (!verificationFilePath) verificationFilePath = defaultFilePath();
    loadVerificationFile();
}

function loadVerificationFile() {
    const target = verificationFilePath || defaultFilePath();
    if (verificationLoadedForPath === target) return;
    verificationLoadedForPath = target;
    let raw = null;
    try {
        raw = defaultFs().readFileSync(target, 'utf8');
    } catch (_) {
        return;
    }
    let parsed = null;
    try {
        parsed = JSON.parse(String(raw || ''));
    } catch (_) {
        return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    Object.entries(parsed).forEach(([key, value]) => {
        if (typeof key !== 'string' || !value || typeof value !== 'object' || Array.isArray(value)) return;
        if (typeof value.status !== 'string') return;
        const entry = {
            status: value.status,
            connected: value.connected === true,
            message: typeof value.message === 'string' ? value.message : '',
            checked_at: typeof value.checked_at === 'string' ? value.checked_at : ''
        };
        if (value.meta && typeof value.meta === 'object' && !Array.isArray(value.meta)) {
            const cleanMeta = {};
            ['scope', 'provider', 'code', 'base_url'].forEach((field) => {
                if (typeof value.meta[field] === 'string' && value.meta[field].trim()) {
                    cleanMeta[field] = value.meta[field].trim();
                }
            });
            if (Object.keys(cleanMeta).length > 0) entry.meta = cleanMeta;
        }
        verificationState.set(key, entry);
    });
}

function saveVerificationFile() {
    const target = verificationFilePath || defaultFilePath();
    try {
        defaultFs().writeFileSync(target, JSON.stringify(Object.fromEntries(verificationState), null, 2));
    } catch (_) {
        // Best-effort: caching verification must never break real flows.
    }
}

function normalize(value) {
    return String(value || '').trim();
}

function recordWordPressVerification(config = {}, result = {}) {
    const signature = createWordPressSignature(config);
    if (!signature) return null;
    return recordConnectionVerification('wordpress', signature, result);
}

function getWordPressVerification(config = {}) {
    const signature = createWordPressSignature(config);
    if (!signature) return null;
    return readConnectionVerification('wordpress', signature);
}

function resetConnectionVerificationState(options = {}) {
    verificationState.clear();
    // Clearing in-memory test state must never erase the active user's persisted
    // connection checks. Persist a reset only when a test explicitly names the
    // isolated file it owns.
    const requestedPath = String(options.filePath || '').trim();
    if (!requestedPath) return;
    const target = defaultPath().resolve(requestedPath);
    if (!verificationFilePath || defaultPath().resolve(verificationFilePath) !== target) return;
    try {
        defaultFs().writeFileSync(target, '{}');
    } catch (_) {
        // Best-effort.
    }
}

function recordConnectionVerification(kind, signature, result = {}, meta = {}) {
    const key = `${String(kind || '').trim()}:${String(signature || '').trim()}`;
    if (!String(kind || '').trim() || !String(signature || '').trim()) return null;
    const state = {
        status: result.success === true ? 'connected' : 'failed',
        connected: result.connected === true,
        message: normalize(result.message),
        checked_at: new Date().toISOString()
    };
    const cleanMeta = {};
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        ['scope', 'provider', 'code', 'base_url'].forEach((field) => {
            const value = String(meta[field] || '').trim();
            if (value) cleanMeta[field] = value;
        });
    }
    if (Object.keys(cleanMeta).length > 0) state.meta = cleanMeta;
    verificationState.set(key, state);
    saveVerificationFile();
    return { ...state };
}

function readConnectionVerification(kind, signature) {
    if (verificationLoadedForPath === '') loadVerificationFile();
    const key = `${String(kind || '').trim()}:${String(signature || '').trim()}`;
    if (!String(kind || '').trim() || !String(signature || '').trim()) return null;
    const state = verificationState.get(key);
    return state ? { ...state } : null;
}

function listConnectionVerifications(kind) {
    if (verificationLoadedForPath === '') loadVerificationFile();
    const prefix = `${String(kind || '').trim()}:`;
    if (!String(kind || '').trim()) return [];
    const entries = [];
    verificationState.forEach((state, key) => {
        if (String(key || '').startsWith(prefix)) entries.push({ ...state });
    });
    return entries;
}

module.exports = {
    recordConnectionVerification,
    readConnectionVerification,
    listConnectionVerifications,
    configureConnectionVerificationState,
    recordWordPressVerification,
    getWordPressVerification,
    resetConnectionVerificationState
};
