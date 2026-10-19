const test = require('node:test');
const assert = require('node:assert/strict');
const { createSnsAutomationScheduler } = require('./automation-scheduler');

function createRuntime(CONFIG) {
    return createSnsAutomationScheduler({
        CONFIG,
        Logger: {
            info() { },
            error() { }
        }
    });
}

test('SNS runner schedules only when app activation is enabled and enforces ten minutes', () => {
    const CONFIG = {
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 3,
    };
    const runtime = createRuntime(CONFIG);

    runtime.syncSnsRunner();

    assert.equal(runtime.snsRuntimeState.enabled, true);
    assert.equal(runtime.snsRuntimeState.status, 'waiting');
    assert.equal(runtime.snsRuntimeState.lastInterval, 10);
    const waitMs = new Date(runtime.snsRuntimeState.nextRunAt).getTime() - Date.now();
    assert.ok(waitMs > 9 * 60 * 1000);
    runtime.clearSnsTimer();

    CONFIG.SNS_PUBLISH_ENABLED = false;
    runtime.syncSnsRunner();
    assert.equal(runtime.snsRuntimeState.enabled, false);
    assert.equal(runtime.snsRuntimeState.nextRunAt, null);
});

test('SNS configuration sync schedules its own automation independently', () => {
    const runtime = createRuntime({
        RUNTIME_ENVIRONMENT_PROFILE: {
            environment: 'production',
            configured: true,
            effects: { livePublish: true }
        },
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 10
    });

    runtime.syncSnsAutomationWithConfig();

    assert.equal(runtime.snsRuntimeState.enabled, true);
    assert.ok(runtime.snsRuntimeState.nextRunAt);
    runtime.clearSnsTimer();
});

test('manual SNS discovery updates the runtime result without changing the next schedule', async () => {
    const CONFIG = {
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 10,
    };
    const runtime = createRuntime(CONFIG);
    runtime.setHandlers({
        runSnsDiscoveryCycle: async (trigger) => ({
            success: true,
            code: 'SNS_DISCOVERY_COMPLETED',
            data: {
                trigger,
                discoveredCount: 2,
                newEntryCount: 1,
                addedDeliveryCount: 2,
                duplicateCount: 1
            }
        })
    });
    runtime.syncSnsRunner();
    const scheduledAt = runtime.snsRuntimeState.nextRunAt;

    const result = await runtime.triggerSnsDiscoveryCycle('ui-manual');

    assert.equal(result.success, true);
    assert.equal(result.data.trigger, 'ui-manual');
    assert.equal(runtime.snsRuntimeState.running, false);
    assert.equal(runtime.snsRuntimeState.status, 'waiting');
    assert.equal(runtime.snsRuntimeState.nextRunAt, scheduledAt);
    assert.equal(runtime.snsRuntimeState.lastResult.data.addedDeliveryCount, 2);
    assert.ok(runtime.snsRuntimeState.lastRunAt);
    runtime.clearSnsTimer();
});

test('manual SNS publishing uses the shared SNS runtime guard', async () => {
    const runtime = createRuntime({
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 10,
    });
    runtime.setHandlers({
        runSnsDistributionCycle: async (trigger) => ({
            success: true,
            code: 'SNS_DISTRIBUTION_COMPLETED',
            data: { trigger, completedCount: 2 }
        })
    });
    runtime.syncSnsRunner();

    const result = await runtime.triggerSnsDistributionCycle('ui-manual');

    assert.equal(result.success, true);
    assert.equal(result.data.completedCount, 2);
    assert.equal(runtime.snsRuntimeState.running, false);
    assert.equal(runtime.snsRuntimeState.lastResult.code, 'SNS_DISTRIBUTION_COMPLETED');
    runtime.clearSnsTimer();
});

test('SNS startup runs discovery once without advancing or publishing the scheduled cycle', async () => {
    const runtime = createRuntime({
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 10,
    });
    const triggers = [];
    let publishCount = 0;
    runtime.setHandlers({
        runSnsDiscoveryCycle: async (trigger) => {
            triggers.push(trigger);
            return {
                success: true,
                code: 'SNS_DISCOVERY_COMPLETED',
                data: { trigger, newEntryCount: 1 }
            };
        },
        runSnsAutomationCycle: async () => {
            publishCount += 1;
            return { success: true };
        }
    });
    runtime.syncSnsRunner();
    const scheduledAt = runtime.snsRuntimeState.nextRunAt;

    const first = await runtime.triggerSnsStartupDiscovery();
    const second = await runtime.triggerSnsStartupDiscovery();

    assert.equal(first.success, true);
    assert.deepEqual(triggers, ['startup']);
    assert.equal(second.code, 'SNS_STARTUP_DISCOVERY_ALREADY_REQUESTED');
    assert.equal(publishCount, 0);
    assert.equal(runtime.snsRuntimeState.nextRunAt, scheduledAt);
    assert.equal(runtime.snsRuntimeState.lastResult.code, 'SNS_DISCOVERY_COMPLETED');
    runtime.clearSnsTimer();
});

test('SNS startup does not request discovery when app activation is disabled', async () => {
    const runtime = createRuntime({
        SNS_PUBLISH_ENABLED: false,
        SNS_PUBLISH_INTERVAL_MIN: 10,
    });
    let discoveryCount = 0;
    runtime.setHandlers({
        runSnsDiscoveryCycle: async () => {
            discoveryCount += 1;
            return { success: true };
        }
    });
    runtime.syncSnsRunner();

    const result = await runtime.triggerSnsStartupDiscovery();

    assert.equal(result.code, 'SNS_STARTUP_DISCOVERY_DISABLED');
    assert.equal(discoveryCount, 0);
    assert.equal(runtime.snsRuntimeState.lastRunAt, null);
});

test('development environment schedules SNS RSS discovery while keeping publishing schedulers stopped', async () => {
    const calls = [];
    const CONFIG = {
        RUNTIME_ENVIRONMENT_PROFILE: {
            environment: 'development',
            configured: true,
            effects: { livePublish: false }
        },
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 10
    };
    const runtime = createSnsAutomationScheduler({
        CONFIG,
        Logger: { info() {}, error() {} }
    });

    runtime.setHandlers({
        runSnsDiscoveryCycle: async (trigger) => {
            calls.push(`discovery:${trigger}`);
            return { success: true, code: 'SNS_DISCOVERY_COMPLETED' };
        },
        runSnsAutomationCycle: async (trigger) => {
            calls.push(`automation:${trigger}`);
            return { success: true, code: 'SNS_AUTOMATION_COMPLETED' };
        }
    });

    runtime.syncSnsRunner();

    assert.equal(runtime.snsRuntimeState.enabled, true);
    assert.ok(runtime.snsRuntimeState.nextRunAt);

    const result = await runtime.triggerSnsScheduledCycle('test-auto');

    assert.equal(result.code, 'SNS_DISCOVERY_COMPLETED');
    assert.deepEqual(calls, ['discovery:test-auto']);
    runtime.clearSnsTimer();
});
