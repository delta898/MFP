'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    LIVE_PUBLISH_BLOCKED_CODE,
    assertLivePublishAllowed,
    resolveRuntimeEffectPolicy
} = require('./runtime-effects');

function configFor(environment, configured, livePublish) {
    return {
        RUNTIME_ENVIRONMENT_PROFILE: {
            environment,
            configured,
            effects: { livePublish }
        }
    };
}

test('local and development profiles block live publishing', () => {
    assert.equal(resolveRuntimeEffectPolicy(configFor('local', true, false)).livePublish, false);
    assert.equal(resolveRuntimeEffectPolicy(configFor('development', true, false)).livePublish, false);
});

test('only a configured profile with explicit permission allows live publishing', () => {
    assert.equal(resolveRuntimeEffectPolicy(configFor('production', true, true)).livePublish, true);
    assert.equal(resolveRuntimeEffectPolicy(configFor('production', false, true)).livePublish, false);
});

test('an unresolved runtime profile fails closed with a stable error code', () => {
    assert.throws(
        () => assertLivePublishAllowed(configFor('', false, false)),
        (error) => error.code === LIVE_PUBLISH_BLOCKED_CODE && error.status === 403
    );
});

test('isolated legacy dependency injection remains compatible when no profile exists', () => {
    assert.equal(resolveRuntimeEffectPolicy({}).livePublish, true);
});
