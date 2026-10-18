const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutoCycleRuntime } = require('./auto-cycle-runtime');

test('explicit batch publishing applies the configured posting option to every selected row', async () => {
    const batchRequests = [];
    const runtime = createAutoCycleRuntime({
        CONFIG: {
            PUBLISH_AUTO_BATCH_SIZE: 2,
            PUBLISH_AUTO_POST_STATUS: 'draft',
            PUBLISH_AUTO_TARGET_CHANNELS: 'naver',
            PUBLISH_AUTO_HEADLESS: true,
            PUBLISH_AUTO_NOTIFY_ENABLED: false
        },
        Logger: { info() { }, error() { } },
        License: {
            async checkLicenseStatus() {
                return { success: true, remaining: -1, features: { cmd_batch: true } };
            }
        },
        GoogleSheets: {
            async readGoogleSheetTopicsAll() {
                return {
                    items: [
                        { rowIndex: 0, rowNumber: 2, status: '발행 준비 완료', options: {} },
                        { rowIndex: 1, rowNumber: 3, status: '발행 준비 완료', options: {} }
                    ]
                };
            }
        },
        normalizeNonNegativeInt: (value, fallback) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
        },
        toFeatureMap: (features) => features || {},
        isCommandEnabled: (features, command) => command === 'batch' && features.cmd_batch === true,
        async executeBlogBatchRowsAction(request) {
            batchRequests.push(request);
            return { data: { successCount: 1, failCount: 0, results: [] } };
        }
    });

    const result = await runtime.runAutoPublishCycle('ui-manual');

    assert.equal(result.success, true);
    assert.equal(batchRequests.length, 2);
    assert.deepEqual(batchRequests.map((request) => request.postStatus), ['draft', 'draft']);
});
