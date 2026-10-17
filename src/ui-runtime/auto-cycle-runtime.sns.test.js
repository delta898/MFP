const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutoCycleRuntime } = require('./auto-cycle-runtime');

test('SNS discovery cycle returns the discovery result', async () => {
    const runtime = createAutoCycleRuntime({
        snsRssDiscovery: {
            async run(trigger) {
                return {
                    success: true,
                    code: 'SNS_DISCOVERY_COMPLETED',
                    data: {
                        trigger,
                        newEntryCount: 2,
                        addedDeliveryCount: 4
                    }
                };
            }
        }
    });

    const result = await runtime.runSnsDiscoveryCycle('test-manual');

    assert.equal(result.success, true);
    assert.equal(result.data.trigger, 'test-manual');
});

test('SNS automation cycle discovers entries before publishing one entry group', async () => {
    const calls = [];
    const runtime = createAutoCycleRuntime({
        snsRssDiscovery: {
            async run(trigger) {
                calls.push(`discover:${trigger}`);
                return {
                    success: true,
                    code: 'SNS_DISCOVERY_COMPLETED',
                    data: { newEntryCount: 1, addedDeliveryCount: 2 }
                };
            }
        },
        snsDistributionRunner: {
            async run(trigger) {
                calls.push(`publish:${trigger}`);
                return {
                    success: true,
                    code: 'SNS_DISTRIBUTION_COMPLETED',
                    data: {
                        entryKey: 'entry-1',
                        completedCount: 2,
                        failedCount: 0,
                        skippedCount: 0
                    }
                };
            }
        }
    });

    const result = await runtime.runSnsAutomationCycle('auto');

    assert.equal(result.success, true);
    assert.equal(result.code, 'SNS_AUTOMATION_COMPLETED');
    assert.deepEqual(calls, ['discover:auto', 'publish:auto']);
    assert.equal(result.data.distribution.data.completedCount, 2);
});
