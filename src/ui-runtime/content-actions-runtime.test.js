const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentActionsRuntime } = require('./content-actions-runtime');
const { isCommandEnabled, toFeatureMap } = require('../runtime-feature-flags');

test('shopping batch requires both shopping and batch capabilities', async () => {
    const runtime = createContentActionsRuntime({
        async ensureSheetsReadyForUi() { },
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    features: {
                        cmd_batch: false,
                        cmd_trends: false,
                        cmd_shopping: true,
                        enable_related_posts_auto_link: false
                    }
                };
            }
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        toFeatureMap,
        isCommandEnabled,
        clearAllShoppingRuntimeLogs() { },
        setShoppingRuntimeLog() { }
    });

    const result = await runtime.executeShoppingBatchRowsAction({ rowIndices: [0] });

    assert.equal(result.success, false);
    assert.equal(result.code, 'FEATURE_DISABLED');
    assert.match(result.message, /일괄·자동 발행/);
});
