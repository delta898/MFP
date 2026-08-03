const PROVIDER_ALIASES = Object.freeze({
    gemini: 'google',
    openai_compatible: 'direct'
});

function normalizeProviderId(value, fallback = '') {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return String(fallback || '').trim().toLowerCase();
    return PROVIDER_ALIASES[raw] || raw;
}

module.exports = {
    normalizeProviderId
};
