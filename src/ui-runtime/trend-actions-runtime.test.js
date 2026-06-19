const test = require('node:test');
const assert = require('node:assert/strict');

const { createTrendActionsRuntime } = require('./trend-actions-runtime');
const { isCommandEnabled, toFeatureMap } = require('../runtime-feature-flags');

function createRuntime(features, state = {}) {
    return createTrendActionsRuntime({
        Logger: { info() { }, warn() { }, error() { } },
        CONFIG: {},
        Utils: {},
        License: {
            async checkLicenseStatus() {
                return { success: true, features };
            },
            async verifyLicense() {
                state.verifyCalls = (state.verifyCalls || 0) + 1;
                return { success: true };
            }
        },
        TrendManager: {
            async fetchTrends(options) {
                state.fetchOptions = options;
                return { date: options.date, keywords: [] };
            }
        },
        async ensureSheetsReadyForUi() { },
        recordUiActivity() { },
        async checkAuthSessionValid() { return { ok: true }; },
        toFeatureMap,
        isCommandEnabled
    });
}

test('trend date selection follows cmd_trends and does not consume publish quota', async () => {
    const state = {};
    const runtime = createRuntime({
        cmd_batch: true,
        cmd_trends: true,
        cmd_shopping: false,
        enable_related_posts_auto_link: false
    }, state);

    const result = await runtime.executeTrendCollectAction({ date: '2026-06-19' });

    assert.equal(result.success, true);
    assert.equal(state.fetchOptions.date, '2026-06-19');
    assert.equal(state.verifyCalls || 0, 0);
});

test('trend collection is blocked when cmd_trends is false', async () => {
    const state = {};
    const runtime = createRuntime({
        cmd_batch: true,
        cmd_trends: false,
        cmd_shopping: false,
        enable_related_posts_auto_link: false
    }, state);

    const result = await runtime.executeTrendCollectAction({ date: '2026-06-19' });

    assert.equal(result.success, false);
    assert.equal(result.code, 'FEATURE_DISABLED');
    assert.equal(state.fetchOptions, undefined);
});
