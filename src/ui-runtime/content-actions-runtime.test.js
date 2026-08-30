const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { createContentActionsRuntime } = require('./content-actions-runtime');
const { isCommandEnabled, toFeatureMap } = require('../runtime-feature-flags');

const DEVELOPMENT_CONFIG = Object.freeze({
    RUNTIME_ENVIRONMENT_PROFILE: Object.freeze({
        environment: 'development',
        configured: true,
        effects: Object.freeze({ manualPublish: true, automatedPublish: false, livePublish: false })
    })
});

test('development blocks shopping batch before sheet or license access', async () => {
    let externalAccess = 0;
    const runtime = createContentActionsRuntime({
        CONFIG: DEVELOPMENT_CONFIG,
        async ensureSheetsReadyForUi() { externalAccess += 1; },
        License: { async checkLicenseStatus() { externalAccess += 1; return { success: true }; } }
    });

    const result = await runtime.executeShoppingBatchRowsAction({ rowIndices: [0] });

    assert.equal(result.success, false);
    assert.equal(result.code, 'LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT');
    assert.equal(externalAccess, 0);
});

test('development blocks blog batch before sheet access', async () => {
    let sheetRead = 0;
    const runtime = createContentActionsRuntime({
        CONFIG: DEVELOPMENT_CONFIG,
        parseIntSafe: (value) => Number(value),
        Utils: { async readGoogleSheetTopicsAll() { sheetRead += 1; return { items: [] }; } }
    });

    const result = await runtime.executeBlogRowAction({ action: 'batch', rowIndex: 0 });

    assert.equal(result.success, false);
    assert.equal(result.code, 'LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT');
    assert.equal(sheetRead, 0);
});

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
                        enable_related_posts_auto_link: false,
                        enable_sns_distribution: false
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

test('shopping row update rejects an overlong instruction before sheet mutation', async () => {
    let updated = false;
    const runtime = createContentActionsRuntime({
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        Utils: {
            async updateGoogleSheetShoppingEditableFields() { updated = true; }
        }
    });

    const result = await runtime.executeShoppingRowUpdate({
        rowIndex: 0,
        instruction: '가'.repeat(1001)
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_SHOPPING_INSTRUCTION');
    assert.equal(updated, false);
});

test('blog batch preflight executes only rows covered by remaining quota', async () => {
    const processedRows = [];
    const processedPostStatuses = [];
    const processedImageModes = [];
    const topics = [0, 1, 2].map((rowIndex) => ({
        rowIndex,
        subject: `topic ${rowIndex}`,
        status: '발행 준비 완료',
        image_mode: rowIndex === 0 ? 'none' : 'prompt_only',
        options: { platforms: ['naver'], post_status: 'publish', image_mode: rowIndex === 0 ? 'none' : 'prompt_only' }
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
                        enable_related_posts_auto_link: false,
                        enable_sns_distribution: false
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
        processMultiPlatformPublish: async (params, options) => {
            processedRows.push(options.operationId);
            processedPostStatuses.push(params.context.postStatus);
            processedImageModes.push(params.context.imageOptions.mode);
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

    const result = await runtime.executeBlogBatchRowsAction({
        rowIndices: [0, 1, 2],
        targets: ['naver'],
        postStatus: 'draft'
    });

    assert.equal(result.success, true);
    assert.equal(result.data.attemptedCount, 2);
    assert.equal(result.data.skippedCount, 1);
    assert.equal(result.data.quotaPreflight.message, '3건 선택 · 잔여 2회 · 최대 2건 실행');
    assert.equal(processedRows.length, 2);
    assert.notEqual(processedRows[0], processedRows[1]);
    assert.deepEqual(processedPostStatuses, ['draft', 'draft']);
    assert.deepEqual(processedImageModes, ['none', 'prompt_only']);
});

test('blog batch rejects an unsupported posting option before processing rows', async () => {
    const runtime = createContentActionsRuntime({
        async ensureSheetsReadyForUi() { },
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    remaining: -1,
                    features: { cmd_batch: true }
                };
            }
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        checkAuthSessionValid: async () => ({ ok: true }),
        toFeatureMap,
        isCommandEnabled,
        clearAllBlogRuntimeLogs() { },
        setBlogRuntimeLog() { }
    });

    const result = await runtime.executeBlogBatchRowsAction({ rowIndices: [0], postStatus: 'private' });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_POST_STATUS');
});

test('single row generation passes the stored image mode to generation and image preparation', async () => {
    const calls = [];
    const topicRow = {
        rowIndex: 0,
        subject: 'mode topic',
        status: '대기',
        image_mode: 'none',
        image_gen: false,
        image_options: { mode: 'none', generate: false },
        options: { image_mode: 'none', image_gen: false }
    };
    const runtime = createContentActionsRuntime({
        path,
        CONFIG: {},
        License: { async checkLicenseStatus() { return { success: true, features: {} }; } },
        Utils: {
            async readGoogleSheetTopicsAll() { return { items: [topicRow] }; },
            async updateGoogleSheetStatus() {}
        },
        Core: {
            async generateContent(topic) {
                calls.push(['generate', topic.image_options]);
                return { targetDir: '/tmp/mode-topic' };
            },
            async prepareImages(_dir, topic) {
                calls.push(['prepare', topic.image_options]);
            }
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        toFeatureMap,
        getFeatureBool: (_features, _key, fallback) => fallback,
        getBlogAutoSettingsSnapshot: () => ({ BLOG_AUTO_HEADLESS: true })
    });

    const result = await runtime.executeBlogRowAction({ action: 'gen', rowIndex: 0 });

    assert.equal(result.success, true);
    assert.deepEqual(calls, [
        ['generate', { mode: 'none', generate: false, count: undefined }],
        ['prepare', { mode: 'none', generate: false, count: undefined }]
    ]);
});

test('continuous runner refuses a topic whose ready state changed before execution', async () => {
    let licenseChecks = 0;
    const runtime = createContentActionsRuntime({
        CONFIG: {},
        License: {
            async checkLicenseStatus() {
                licenseChecks += 1;
                return { success: true, features: { cmd_batch: true } };
            }
        },
        Utils: {
            async readGoogleSheetTopicsAll() {
                return { items: [{ rowIndex: 3, status: '대기', subject: '다시 대기로 돌아간 글' }] };
            }
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        }
    });

    const result = await runtime.executeBlogRowAction({
        action: 'batch',
        rowIndex: 3,
        requireReadyStatus: true
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'TOPIC_NOT_READY');
    assert.equal(licenseChecks, 0);
});

test('WordPress-only continuous publishing does not require a Naver session', async () => {
    let naverSessionChecks = 0;
    let receivedTargets = [];
    const runtime = createContentActionsRuntime({
        path,
        CONFIG: DEVELOPMENT_CONFIG,
        License: {
            async checkLicenseStatus() {
                return { success: true, features: { cmd_batch: true } };
            }
        },
        Utils: {
            async readGoogleSheetTopicsAll() {
                return {
                    items: [{
                        rowIndex: 4,
                        status: '발행 준비 완료',
                        subject: '워드프레스 글감',
                        options: { platforms: ['wordpress'], post_status: 'draft' }
                    }]
                };
            },
            async updateGoogleSheetStatus() { }
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        checkAuthSessionValid: async () => {
            naverSessionChecks += 1;
            return { ok: false };
        },
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool: (_features, _key, fallback) => fallback,
        getBlogAutoSettingsSnapshot: () => ({ BLOG_AUTO_HEADLESS: true }),
        processMultiPlatformPublish: async (params) => {
            receivedTargets = params.targets;
            return {
                success: true,
                results: {
                    naver: { success: false, targetDir: null },
                    wordpress: { success: true, targetDir: '/tmp/wordpress' }
                }
            };
        }
    });

    const result = await runtime.executeBlogRowAction({
        action: 'batch',
        rowIndex: 4,
        requireReadyStatus: true
    }, { manualTrigger: true });

    assert.equal(result.success, true);
    assert.equal(result.data.status, '임시 저장 완료');
    assert.deepEqual(receivedTargets, ['wordpress']);
    assert.equal(naverSessionChecks, 0);
});
