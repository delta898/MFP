function toFeatureMap(rawFeatures) {
    return (rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures))
        ? rawFeatures
        : {};
}

function getFeatureBool(features, key, fallback = true) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const value = map[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function getEnableRelatedPostsAutoLink(features) {
    return getFeatureBool(features, 'enable_related_posts_auto_link', false);
}

function getEnableSnsDistribution(features) {
    return getFeatureBool(features, 'enable_sns_distribution', false);
}

function isCommandEnabled(features, command) {
    const keyMap = {
        batch: 'cmd_batch',
        trends: 'cmd_trends',
        shopping: 'cmd_shopping'
    };
    const key = keyMap[command];
    if (!key) return true;
    return getFeatureBool(features, key, false);
}

function parseMaxPosts(value, fallback = 10) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return fallback;
    return parsed;
}

module.exports = {
    toFeatureMap,
    getFeatureBool,
    getEnableRelatedPostsAutoLink,
    getEnableSnsDistribution,
    isCommandEnabled,
    parseMaxPosts
};
