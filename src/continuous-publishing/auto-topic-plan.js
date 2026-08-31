const { IMAGE_MODES, READY_PLATFORMS, WRITING_STRATEGIES } = require('./topic-capture');

const AUTO_TOPIC_POST_STATUSES = Object.freeze(['publish', 'draft']);
const AUTO_TOPIC_PLAN_DEFAULTS = Object.freeze({
    platforms: Object.freeze(['naver']),
    writing_strategy: 'search',
    image_mode: 'generate',
    external_reference: true,
    post_status: 'publish'
});

function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeList(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(',');
    return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function readField(input, ...keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(input, key)) return input[key];
    }
    return undefined;
}

function createPlanError(field, code, message) {
    const error = new Error(message);
    error.code = code;
    error.apiCode = code;
    error.status = 400;
    error.details = [{ field, code, message }];
    return error;
}

function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    const normalized = normalizeText(value);
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function normalizeAutoTopicPlan(input = {}, options = {}) {
    const strict = options.strict === true;
    const fallback = options.fallback || AUTO_TOPIC_PLAN_DEFAULTS;
    const rawPlatforms = readField(input, 'platforms', 'target_channels', 'targets');
    const requestedPlatforms = rawPlatforms === undefined
        ? [...fallback.platforms]
        : normalizeList(rawPlatforms);
    const invalidPlatform = requestedPlatforms.find((item) => !READY_PLATFORMS.includes(item));
    const platforms = requestedPlatforms.filter((item) => READY_PLATFORMS.includes(item));

    if (strict && invalidPlatform) {
        throw createPlanError('platforms', 'AUTO_TOPIC_PLATFORM_INVALID', '자동 글감의 발행 대상이 올바르지 않습니다.');
    }
    if (strict && platforms.length === 0) {
        throw createPlanError('platforms', 'AUTO_TOPIC_PLATFORM_REQUIRED', '자동 글감의 발행 대상을 하나 이상 선택해 주세요.');
    }

    const rawStrategy = readField(input, 'writing_strategy', 'writingStrategy');
    const writingStrategy = normalizeText(rawStrategy === undefined ? fallback.writing_strategy : rawStrategy);
    if (strict && !WRITING_STRATEGIES.includes(writingStrategy)) {
        throw createPlanError('writing_strategy', 'AUTO_TOPIC_WRITING_STRATEGY_INVALID', '자동 글감의 글쓰기 전략이 올바르지 않습니다.');
    }

    const rawImageMode = readField(input, 'image_mode', 'imageMode');
    const imageMode = normalizeText(rawImageMode === undefined ? fallback.image_mode : rawImageMode);
    if (strict && !IMAGE_MODES.includes(imageMode)) {
        throw createPlanError('image_mode', 'AUTO_TOPIC_IMAGE_MODE_INVALID', '자동 글감의 이미지 처리가 올바르지 않습니다.');
    }

    const rawPostStatus = readField(input, 'post_status', 'postStatus');
    const postStatus = normalizeText(rawPostStatus === undefined ? fallback.post_status : rawPostStatus);
    if (strict && !AUTO_TOPIC_POST_STATUSES.includes(postStatus)) {
        throw createPlanError('post_status', 'AUTO_TOPIC_POST_STATUS_INVALID', '자동 글감은 즉시 발행 또는 임시 저장만 사용할 수 있습니다.');
    }

    const rawExternalReference = readField(input, 'external_reference', 'externalReference');

    return {
        platforms: platforms.length > 0 ? platforms : [...AUTO_TOPIC_PLAN_DEFAULTS.platforms],
        writing_strategy: WRITING_STRATEGIES.includes(writingStrategy)
            ? writingStrategy
            : AUTO_TOPIC_PLAN_DEFAULTS.writing_strategy,
        image_mode: IMAGE_MODES.includes(imageMode)
            ? imageMode
            : AUTO_TOPIC_PLAN_DEFAULTS.image_mode,
        external_reference: normalizeBoolean(rawExternalReference, fallback.external_reference),
        post_status: AUTO_TOPIC_POST_STATUSES.includes(postStatus)
            ? postStatus
            : AUTO_TOPIC_PLAN_DEFAULTS.post_status
    };
}

function resolveAutoTopicPlan({ explicitPlan, legacyPublish } = {}) {
    if (explicitPlan && typeof explicitPlan === 'object' && !Array.isArray(explicitPlan)) {
        return {
            plan: normalizeAutoTopicPlan(explicitPlan, { strict: true }),
            source: 'explicit'
        };
    }

    if (legacyPublish && typeof legacyPublish === 'object') {
        return {
            plan: normalizeAutoTopicPlan({
                platforms: readField(legacyPublish, 'platforms', 'target_channels'),
                image_mode: readField(legacyPublish, 'image_mode', 'imageMode'),
                post_status: readField(legacyPublish, 'post_status', 'postStatus'),
                writing_strategy: readField(legacyPublish, 'writing_strategy', 'writingStrategy'),
                external_reference: readField(legacyPublish, 'external_reference', 'externalReference')
            }),
            source: 'legacy'
        };
    }

    return {
        plan: normalizeAutoTopicPlan(AUTO_TOPIC_PLAN_DEFAULTS),
        source: 'default'
    };
}

module.exports = {
    AUTO_TOPIC_PLAN_DEFAULTS,
    AUTO_TOPIC_POST_STATUSES,
    normalizeAutoTopicPlan,
    resolveAutoTopicPlan
};
