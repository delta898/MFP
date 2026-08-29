'use strict';

const LIVE_PUBLISH_BLOCKED_CODE = 'LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT';
const LIVE_PUBLISH_BLOCKED_MESSAGE = '현재 실행 환경에서는 실제 발행이 차단되어 있습니다.';
const MANUAL_PUBLISH_BLOCKED_CODE = 'MANUAL_PUBLISH_BLOCKED_BY_ENVIRONMENT';
const MANUAL_PUBLISH_BLOCKED_MESSAGE = '현재 실행 환경에서는 수동 발행이 차단되어 있습니다.';

function resolveRuntimeEffectPolicy(config = {}) {
    const profile = config.RUNTIME_ENVIRONMENT_PROFILE;

    // Real runtime CONFIG always carries a resolved profile. Missing profiles are
    // accepted only for dependency-injected legacy tests and isolated callers.
    if (!profile) {
        return Object.freeze({
            environment: 'legacy',
            configured: true,
            manualPublish: true,
            automatedPublish: true,
            livePublish: true,
            livePayment: true,
            liveNotifications: true
        });
    }

    const configured = profile.configured === true;
    const manualPublish = configured && profile.effects?.manualPublish === true;
    const automatedPublish = configured && (
        profile.effects?.automatedPublish === true
        || profile.effects?.livePublish === true
    );
    return Object.freeze({
        environment: String(profile.environment || 'unselected').trim() || 'unselected',
        configured,
        manualPublish,
        automatedPublish,
        // Compatibility alias: callers using livePublish are automation boundaries.
        livePublish: automatedPublish,
        livePayment: configured && profile.effects?.livePayment === true,
        liveNotifications: configured && profile.effects?.liveNotifications === true
    });
}

function isLivePublishAllowed(config = {}) {
    return resolveRuntimeEffectPolicy(config).automatedPublish;
}

function isManualPublishAllowed(config = {}) {
    return resolveRuntimeEffectPolicy(config).manualPublish;
}

function createLivePublishBlockedError(config = {}) {
    const policy = resolveRuntimeEffectPolicy(config);
    const error = new Error(LIVE_PUBLISH_BLOCKED_MESSAGE);
    error.code = LIVE_PUBLISH_BLOCKED_CODE;
    error.apiCode = LIVE_PUBLISH_BLOCKED_CODE;
    error.status = 403;
    error.environment = policy.environment;
    return error;
}

function assertLivePublishAllowed(config = {}) {
    if (!isLivePublishAllowed(config)) throw createLivePublishBlockedError(config);
}

function createManualPublishBlockedError(config = {}) {
    const policy = resolveRuntimeEffectPolicy(config);
    const error = new Error(MANUAL_PUBLISH_BLOCKED_MESSAGE);
    error.code = MANUAL_PUBLISH_BLOCKED_CODE;
    error.apiCode = MANUAL_PUBLISH_BLOCKED_CODE;
    error.status = 403;
    error.environment = policy.environment;
    return error;
}

function assertManualPublishAllowed(config = {}) {
    if (!isManualPublishAllowed(config)) throw createManualPublishBlockedError(config);
}

function assertDirectPublishAllowed(config = {}, options = {}) {
    const postStatus = String(options.postStatus || options.post_status || '').trim().toLowerCase();
    if (postStatus === 'schedule') return assertLivePublishAllowed(config);
    return assertManualPublishAllowed(config);
}

module.exports = {
    LIVE_PUBLISH_BLOCKED_CODE,
    LIVE_PUBLISH_BLOCKED_MESSAGE,
    MANUAL_PUBLISH_BLOCKED_CODE,
    MANUAL_PUBLISH_BLOCKED_MESSAGE,
    resolveRuntimeEffectPolicy,
    isLivePublishAllowed,
    isManualPublishAllowed,
    createLivePublishBlockedError,
    createManualPublishBlockedError,
    assertLivePublishAllowed,
    assertManualPublishAllowed,
    assertDirectPublishAllowed
};
