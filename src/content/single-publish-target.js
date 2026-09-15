const PUBLISH_TARGETS = Object.freeze(['naver', 'wordpress']);

function normalizePublishTargets(value) {
    const values = Array.isArray(value) ? value : [value];
    return Array.from(new Set(values
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => PUBLISH_TARGETS.includes(item))));
}

function requireSinglePublishTarget(value, options = {}) {
    const targets = normalizePublishTargets(value);
    const required = options.required !== false;
    if (targets.length > 1) {
        const error = new Error('하나의 원고에는 발행 대상을 하나만 선택할 수 있습니다.');
        error.code = options.multipleCode || 'MULTIPLE_PUBLISH_TARGETS';
        throw error;
    }
    if (required && targets.length !== 1) {
        const error = new Error('발행 대상을 하나 선택해 주세요.');
        error.code = options.requiredCode || 'PUBLISH_TARGET_REQUIRED';
        throw error;
    }
    return targets;
}

module.exports = { PUBLISH_TARGETS, normalizePublishTargets, requireSinglePublishTarget };
