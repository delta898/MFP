'use strict';

function hasUsableConfigValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return Boolean(normalized)
        && !normalized.includes('본인의_')
        && !normalized.includes('your_')
        && !normalized.startsWith('xxxxxxx');
}

function buildSetupReadiness({ CONFIG = {}, googleOauth = {}, naverConnected = false } = {}) {
    const googleConfigured = hasUsableConfigValue(CONFIG.GOOGLE_SHEET_URL || CONFIG.GOOGLE_SHEET_ID);
    const googleAccountConnected = googleOauth?.connected === true
        || ['connected', 'connected_cached'].includes(String(googleOauth?.state || '').trim());
    const textModelProvider = String(CONFIG.TEXT_MODEL_PROVIDER || CONFIG.TEXT_MODEL_CONFIG?.provider || '')
        .trim()
        .toLowerCase();
    const textModelIdentity = CONFIG.TEXT_MODEL || CONFIG.TEXT_MODEL_NAME || CONFIG.TEXT_MODEL_CONFIG?.code;
    const textModelConfigured = textModelProvider === 'direct'
        ? hasUsableConfigValue(textModelIdentity)
            && hasUsableConfigValue(CONFIG.TEXT_MODEL_BASE_URL || CONFIG.TEXT_MODEL_CONFIG?.base_url)
        : hasUsableConfigValue(textModelIdentity) && hasUsableConfigValue(CONFIG.TEXT_MODEL_API_KEY);
    const imageModel = CONFIG.IMAGE_MODEL_CONFIG || {};
    const imageModelProvider = String(CONFIG.IMAGE_MODEL_PROVIDER || imageModel.provider || '').trim().toLowerCase();
    const imageModelIdentity = CONFIG.IMAGE_MODEL || CONFIG.IMAGE_MODEL_NAME || imageModel.code;
    const imageModelConfigured = imageModelProvider === 'direct'
        ? hasUsableConfigValue(imageModelIdentity)
            && hasUsableConfigValue(CONFIG.IMAGE_MODEL_BASE_URL || imageModel.base_url)
        : hasUsableConfigValue(imageModelIdentity)
            && hasUsableConfigValue(CONFIG.IMAGE_MODEL_API_KEY || imageModel.api_key);
    const wordpressFieldsConfigured = hasUsableConfigValue(CONFIG.WORDPRESS_URL)
        && hasUsableConfigValue(CONFIG.WORDPRESS_USER_ID)
        && hasUsableConfigValue(CONFIG.WORDPRESS_APP_PASSWORD);
    const wordpressConfigured = typeof CONFIG.CONFIG_IS_WP_SET === 'boolean'
        ? CONFIG.CONFIG_IS_WP_SET
        : wordpressFieldsConfigured;
    const naverConfigured = naverConnected === true || CONFIG.CONFIG_IS_NAVER_SET === true;
    const publishingChannelConfigured = naverConfigured || wordpressConfigured;

    return {
        ready: textModelConfigured
            && googleAccountConnected
            && googleConfigured
            && publishingChannelConfigured,
        ai: {
            configured: textModelConfigured,
            text_configured: textModelConfigured,
            image_configured: imageModelConfigured
        },
        google: {
            configured: googleAccountConnected && googleConfigured,
            account_connected: googleAccountConnected,
            spreadsheet_configured: googleConfigured
        },
        publishing_channel: {
            configured: publishingChannelConfigured,
            naver_configured: naverConfigured,
            wordpress_configured: wordpressConfigured
        }
    };
}

module.exports = {
    hasUsableConfigValue,
    buildSetupReadiness
};
