'use strict';

const LIVE_PUBLISH_BLOCKED_CODE = 'LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT';
const LIVE_PUBLISH_BLOCKED_MESSAGE = '현재 실행 환경에서는 실제 발행이 차단되어 있습니다.';

function resolveRuntimeEffectPolicy(config = {}) {
    const profile = config.RUNTIME_ENVIRONMENT_PROFILE;

    // Real runtime CONFIG always carries a resolved profile. Missing profiles are
    // accepted only for dependency-injected legacy tests and isolated callers.
    if (!profile) {
        return Object.freeze({
            environment: 'legacy',
            configured: true,
            livePublish: true,
            livePayment: true,
            liveNotifications: true
        });
    }

    const configured = profile.configured === true;
    return Object.freeze({
        environment: String(profile.environment || 'unselected').trim() || 'unselected',
        configured,
        livePublish: configured && profile.effects?.livePublish === true,
        livePayment: configured && profile.effects?.livePayment === true,
        liveNotifications: configured && profile.effects?.liveNotifications === true
    });
}

function isLivePublishAllowed(config = {}) {
    return resolveRuntimeEffectPolicy(config).livePublish;
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

module.exports = {
    LIVE_PUBLISH_BLOCKED_CODE,
    LIVE_PUBLISH_BLOCKED_MESSAGE,
    resolveRuntimeEffectPolicy,
    isLivePublishAllowed,
    createLivePublishBlockedError,
    assertLivePublishAllowed
};
