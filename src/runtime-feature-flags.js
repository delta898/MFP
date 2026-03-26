const CONFIG = require('./config-loader');

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

function getFeatureInt(features, key, fallback = null) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const num = parseInt(map[key], 10);
    if (Number.isNaN(num) || num < 0) return fallback;
    return num;
}

function getEnableRelatedPostsAutoLink(features) {
    return getFeatureBool(features, 'enable_related_posts_auto_link', true);
}

function getEnableTrendsDateOverride(features, planCode = '') {
    const map = toFeatureMap(features);
    if (Object.prototype.hasOwnProperty.call(map, 'enable_trends_date_override')) {
        return getFeatureBool(map, 'enable_trends_date_override', false);
    }
    return String(planCode || '').toLowerCase() !== 'free';
}

function isCommandEnabled(features, command) {
    const keyMap = {
        pub: 'cmd_pub',
        batch: 'cmd_batch',
        trends: 'cmd_trends',
        shopping: 'cmd_shopping'
    };
    const key = keyMap[command];
    if (!key) return true;
    return getFeatureBool(features, key, true);
}

function parseMaxPosts(value, fallback = 10) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return fallback;
    return parsed;
}

function resolveMaxBlogPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_BLOG_POSTS_PER_RUN, 10);
}

function resolveMaxShoppingPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_SHOPPING_POSTS_PER_RUN, 10);
}

module.exports = {
    toFeatureMap,
    getFeatureBool,
    getFeatureInt,
    getEnableRelatedPostsAutoLink,
    getEnableTrendsDateOverride,
    isCommandEnabled,
    parseMaxPosts,
    resolveMaxBlogPostsPerRun,
    resolveMaxShoppingPostsPerRun
};
