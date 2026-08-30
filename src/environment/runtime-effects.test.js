'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    LIVE_PUBLISH_BLOCKED_CODE,
    MANUAL_PUBLISH_BLOCKED_CODE,
    assertDirectPublishAllowed,
    isContinuousAutomationAllowed,
    assertLivePublishAllowed,
    assertManualPublishAllowed,
    resolveRuntimeEffectPolicy
} = require('./runtime-effects');

function configFor(environment, configured, { manualPublish = false, automatedDraft = false, automatedPublish = false } = {}) {
    return {
        RUNTIME_ENVIRONMENT_PROFILE: {
            environment,
            configured,
            effects: { manualPublish, automatedDraft, automatedPublish, livePublish: automatedPublish }
        }
    };
}

test('development allows manual publishing but keeps automated publishing blocked', () => {
    const local = resolveRuntimeEffectPolicy(configFor('local', true));
    const development = resolveRuntimeEffectPolicy(configFor('development', true, { manualPublish: true, automatedDraft: true }));

    assert.equal(local.manualPublish, false);
    assert.equal(local.automatedPublish, false);
    assert.equal(development.manualPublish, true);
    assert.equal(development.automatedPublish, false);
    assert.equal(development.automatedDraft, true);
    assert.equal(development.livePublish, false);
});

test('development continuous automation allows drafts but blocks publish and schedule', () => {
    const development = configFor('development', true, { manualPublish: true, automatedDraft: true });
    assert.equal(isContinuousAutomationAllowed(development, { postStatus: 'draft' }), true);
    assert.equal(isContinuousAutomationAllowed(development, { postStatus: 'publish' }), false);
    assert.equal(isContinuousAutomationAllowed(development, { postStatus: 'schedule' }), false);
});

test('production allows manual and automated publishing only when configured', () => {
    const production = resolveRuntimeEffectPolicy(configFor('production', true, {
        manualPublish: true,
        automatedPublish: true
    }));
    assert.equal(production.manualPublish, true);
    assert.equal(production.automatedPublish, true);
    assert.equal(resolveRuntimeEffectPolicy(configFor('production', false, {
        manualPublish: true,
        automatedPublish: true
    })).livePublish, false);
});

test('an unresolved runtime profile fails closed with a stable error code', () => {
    assert.throws(
        () => assertLivePublishAllowed(configFor('', false)),
        (error) => error.code === LIVE_PUBLISH_BLOCKED_CODE && error.status === 403
    );
    assert.throws(
        () => assertManualPublishAllowed(configFor('', false)),
        (error) => error.code === MANUAL_PUBLISH_BLOCKED_CODE && error.status === 403
    );
});

test('direct development publishing allows immediate posts but rejects schedules', () => {
    const development = configFor('development', true, { manualPublish: true });
    assert.doesNotThrow(() => assertDirectPublishAllowed(development, { postStatus: 'publish' }));
    assert.doesNotThrow(() => assertDirectPublishAllowed(development, { postStatus: 'draft' }));
    assert.throws(
        () => assertDirectPublishAllowed(development, { postStatus: 'schedule' }),
        (error) => error.code === LIVE_PUBLISH_BLOCKED_CODE
    );
});

test('isolated legacy dependency injection remains compatible when no profile exists', () => {
    assert.equal(resolveRuntimeEffectPolicy({}).livePublish, true);
    assert.equal(resolveRuntimeEffectPolicy({}).manualPublish, true);
});
