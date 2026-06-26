const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

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

test('blog batch preflight executes only rows covered by remaining quota', async () => {
    const processedRows = [];
    const topics = [0, 1, 2].map((rowIndex) => ({
        rowIndex,
        subject: `topic ${rowIndex}`,
        status: '발행 준비 완료',
        options: { platforms: ['naver'], post_status: 'publish' }
    }));
    const runtime = createContentActionsRuntime({
        path,
        CONFIG: {},
        async ensureSheetsReadyForUi() { },
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    remaining: 2,
                    features: {
                        cmd_batch: true,
                        cmd_trends: false,
                        cmd_shopping: false,
                        enable_related_posts_auto_link: false
                    }
                };
            }
        },
        Utils: {
            async readGoogleSheetTopicsAll() { return { items: topics }; },
            async updateGoogleSheetStatus() { }
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        checkAuthSessionValid: async () => ({ ok: true }),
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool: (features, key, fallback) => typeof features?.[key] === 'boolean' ? features[key] : fallback,
        getBlogAutoSettingsSnapshot: () => ({ BLOG_AUTO_HEADLESS: true }),
        processMultiPlatformPublish: async (_params, options) => {
            processedRows.push(options.operationId);
            return {
                success: true,
                results: {
                    finalSubject: 'topic',
                    naver: { success: true, targetDir: '/tmp/naver' },
                    wordpress: { success: false, targetDir: null }
                }
            };
        },
        clearAllBlogRuntimeLogs() { },
        setBlogRuntimeLog() { }
    });

    const result = await runtime.executeBlogBatchRowsAction({ rowIndices: [0, 1, 2], targets: ['naver'] });

    assert.equal(result.success, true);
    assert.equal(result.data.attemptedCount, 2);
    assert.equal(result.data.skippedCount, 1);
    assert.equal(result.data.quotaPreflight.message, '3건 선택 · 잔여 2회 · 최대 2건 실행');
    assert.equal(processedRows.length, 2);
    assert.notEqual(processedRows[0], processedRows[1]);
});
