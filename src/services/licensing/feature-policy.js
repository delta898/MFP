const REQUIRED_LICENSE_FEATURE_KEYS = Object.freeze([
    'cmd_batch',
    'cmd_trends',
    'cmd_shopping',
    'enable_related_posts_auto_link',
    'enable_sns_distribution'
]);

function validateLicenseFeaturePolicy(rawFeatures) {
    const source = rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures)
        ? rawFeatures
        : null;
    const errors = [];
    const features = {};

    if (!source) {
        return {
            success: false,
            code: 'LICENSE_FEATURE_POLICY_INVALID',
            message: '라이선스 기능 정책이 객체가 아닙니다.',
            errors: ['features must be an object'],
            features
        };
    }

    for (const key of REQUIRED_LICENSE_FEATURE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) {
            errors.push(`${key} is required`);
            continue;
        }
        if (typeof source[key] !== 'boolean') {
            errors.push(`${key} must be boolean`);
            continue;
        }
        features[key] = source[key];
    }

    return {
        success: errors.length === 0,
        code: errors.length === 0 ? '' : 'LICENSE_FEATURE_POLICY_INVALID',
        message: errors.length === 0
            ? ''
            : `라이선스 기능 정책이 올바르지 않습니다: ${errors.join(', ')}`,
        errors,
        features
    };
}

module.exports = {
    REQUIRED_LICENSE_FEATURE_KEYS,
    validateLicenseFeaturePolicy
};
