const SNS_AI_MODES = Object.freeze([
    'none',
    'blog_text',
    'chat'
]);

function isSnsAiMode(value) {
    return SNS_AI_MODES.includes(String(value || '').trim().toLowerCase());
}

function normalizeSnsAiMode(value, fallback = 'none') {
    const normalized = String(value || '').trim().toLowerCase();
    return isSnsAiMode(normalized) ? normalized : fallback;
}

module.exports = {
    SNS_AI_MODES,
    isSnsAiMode,
    normalizeSnsAiMode
};
