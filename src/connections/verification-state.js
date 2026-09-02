const crypto = require('crypto');

const verificationState = new Map();

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
    const state = {
        status: result.success === true ? 'connected' : 'failed',
        connected: result.connected === true,
        message: normalize(result.message),
        checked_at: new Date().toISOString()
    };
    verificationState.set(`wordpress:${signature}`, state);
    return { ...state };
}

function getWordPressVerification(config = {}) {
    const signature = createWordPressSignature(config);
    if (!signature) return null;
    const state = verificationState.get(`wordpress:${signature}`);
    return state ? { ...state } : null;
}

function resetConnectionVerificationState() {
    verificationState.clear();
}

module.exports = {
    createWordPressSignature,
    recordWordPressVerification,
    getWordPressVerification,
    resetConnectionVerificationState
};
