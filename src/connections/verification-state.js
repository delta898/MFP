const crypto = require('crypto');

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
    return defaultPath().join(__dirname, '..', '..', 'config', 'connection_verification.json');
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

function createWordPressSignature(config = {}) {
    const values = [
        normalize(config.url || config.wordpressUrl || config.WORDPRESS_URL).replace(/\/+$/, '').toLowerCase(),
        normalize(config.userId || config.wordpressUserId || config.WORDPRESS_USER_ID).toLowerCase(),
        normalize(config.appPassword || config.wordpressAppPassword || config.WORDPRESS_APP_PASSWORD)
    ];
    if (values.some((value) => !value)) return '';
    return crypto.createHash('sha256').update(values.join('\u0000')).digest('hex');
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

function resetConnectionVerificationState() {
    verificationState.clear();
    const target = verificationFilePath || defaultFilePath();
    try {
        defaultFs().writeFileSync(target, '{}');
    } catch (_) {
        // Best-effort.
    }
}

// UI trust windows per connection kind: how long a persisted "verified" result
// counts as connected for display. Live operations still verify at use time.
const CONNECTION_TRUST_TTL_MS = Object.freeze({
    sheets: 24 * 60 * 60 * 1000,
    'ai-role': 7 * 24 * 60 * 60 * 1000
});

function createConnectionSignature(parts = []) {
    const values = (Array.isArray(parts) ? parts : [parts]).map((part) => normalize(part));
    if (values.some((value) => !value)) return '';
    return crypto.createHash('sha256').update(values.join('\u0000')).digest('hex');
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

function isVerificationTrusted(kind, state, nowMs = Date.now()) {
    if (!state || state.status !== 'connected') return false;
    const ttl = CONNECTION_TRUST_TTL_MS[String(kind || '').trim()];
    if (!Number.isFinite(ttl)) return false;
    const checkedAtMs = new Date(state.checked_at || '').getTime();
    if (!Number.isFinite(checkedAtMs)) return false;
    return (nowMs - checkedAtMs) < ttl;
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
    createWordPressSignature,
    createConnectionSignature,
    CONNECTION_TRUST_TTL_MS,
    isVerificationTrusted,
    recordConnectionVerification,
    readConnectionVerification,
    listConnectionVerifications,
    configureConnectionVerificationState,
    recordWordPressVerification,
    getWordPressVerification,
    resetConnectionVerificationState
};
