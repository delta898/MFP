'use strict';

const crypto = require('crypto');

function normalize(value) {
    return String(value || '').trim();
}

function createConnectionSignature(parts = []) {
    const values = (Array.isArray(parts) ? parts : [parts]).map((part) => normalize(part));
    if (values.some((value) => !value)) return '';
    return crypto.createHash('sha256').update(values.join('\u0000')).digest('hex');
}

function createWordPressSignature(config = {}) {
    const values = [
        normalize(config.url || config.wordpressUrl || config.WORDPRESS_URL).replace(/\/+$/, '').toLowerCase(),
        normalize(config.userId || config.wordpressUserId || config.WORDPRESS_USER_ID).toLowerCase(),
        normalize(config.appPassword || config.wordpressAppPassword || config.WORDPRESS_APP_PASSWORD)
    ];
    if (values.some((value) => !value)) return '';
    return createConnectionSignature(values);
}

// UI trust windows only affect the displayed verification snapshot. Operations
// still verify credentials when they execute.
const CONNECTION_TRUST_TTL_MS = Object.freeze({
    sheets: 24 * 60 * 60 * 1000,
    'ai-role': 7 * 24 * 60 * 60 * 1000,
    buffer: 24 * 60 * 60 * 1000
});

function isVerificationTrusted(kind, state, nowMs = Date.now()) {
    if (!state || state.status !== 'connected') return false;
    const ttl = CONNECTION_TRUST_TTL_MS[String(kind || '').trim()];
    if (!Number.isFinite(ttl)) return false;
    const checkedAtMs = new Date(state.checked_at || '').getTime();
    if (!Number.isFinite(checkedAtMs)) return false;
    return (nowMs - checkedAtMs) < ttl;
}

module.exports = {
    CONNECTION_TRUST_TTL_MS,
    createConnectionSignature,
    createWordPressSignature,
    isVerificationTrusted
};
