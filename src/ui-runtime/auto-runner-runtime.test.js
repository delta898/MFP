const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutoRunnerRuntime } = require('./auto-runner-runtime');

function createRuntime(CONFIG) {
    return createAutoRunnerRuntime({
        CONFIG,
        Logger: {
            info() { },
            error() { }
        },
        parseConfigBool: (value) => value === true,
        normalizeNonNegativeInt: (value, fallback) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
        },
        normalizeTimeHHmm: (value, fallback) => String(value || fallback),
        computeNextWindowedRunAt: () => ({
            runAt: new Date(Date.now() + 60000),
            candidateAt: new Date(Date.now() + 60000),
            adjustedByWindow: false
        }),
        normalizeShoppingAutoSettings: () => ({
            SHOPPING_PUBLISH_AUTO_ENABLED: false
        }),
        getBlogAutoSettingsSnapshot: () => ({}),
        getShoppingAutoSettingsSnapshot: () => ({}),
        publishAutoDefaults: {
            intervalMin: 60,
            startTime: '00:00',
            endTime: '23:59'
        },
        shoppingAutoDefaults: {}
    });
}

test('auto status payload keeps blog, shopping, and SNS schedules independent', () => {
    const runtime = createRuntime({});
    const snsNextRunAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const shoppingNextRunAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const blogNextRunAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    runtime.snsRuntimeState.enabled = true;
    runtime.snsRuntimeState.status = 'waiting';
    runtime.snsRuntimeState.nextRunAt = snsNextRunAt;
    runtime.refreshLegacyAutoRuntimeState();

    let status = runtime.getAutoStatusPayload();
    assert.equal(status.blog.enabled, false);
    assert.equal(status.blog.status, 'stopped');
    assert.equal(status.blog.nextRunAt, null);
    assert.equal(status.shopping.enabled, false);
    assert.equal(status.shopping.nextRunAt, null);
    assert.equal(status.sns.enabled, true);
    assert.equal(status.sns.nextRunAt, snsNextRunAt);

    runtime.shoppingAutoRuntimeState.enabled = true;
    runtime.shoppingAutoRuntimeState.status = 'waiting';
    runtime.shoppingAutoRuntimeState.nextRunAt = shoppingNextRunAt;

    status = runtime.getAutoStatusPayload();
    assert.equal(status.blog.enabled, false);
    assert.equal(status.shopping.enabled, true);
    assert.equal(status.shopping.nextRunAt, shoppingNextRunAt);
    assert.equal(status.sns.nextRunAt, snsNextRunAt);

    runtime.publishRuntimeState.enabled = true;
    runtime.publishRuntimeState.status = 'waiting';
    runtime.publishRuntimeState.nextRunAt = blogNextRunAt;
    runtime.refreshLegacyAutoRuntimeState();

    status = runtime.getAutoStatusPayload();
    assert.equal(status.blog.enabled, true);
    assert.equal(status.blog.nextRunAt, blogNextRunAt);
    assert.equal(status.shopping.nextRunAt, shoppingNextRunAt);
    assert.equal(status.sns.nextRunAt, snsNextRunAt);
});

test('SNS runner schedules only when app activation is enabled and enforces ten minutes', () => {
    const CONFIG = {
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 3,
        COLLECT_RSS_CONFIGS: []
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

test('manual SNS discovery updates the runtime result without changing the next schedule', async () => {
    const CONFIG = {
        SNS_PUBLISH_ENABLED: true,
        SNS_PUBLISH_INTERVAL_MIN: 10,
        COLLECT_RSS_CONFIGS: []
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
        COLLECT_RSS_CONFIGS: []
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
        COLLECT_RSS_CONFIGS: []
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
        COLLECT_RSS_CONFIGS: []
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
