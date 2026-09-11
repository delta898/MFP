const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { createContentActionsRuntime } = require('./content-actions-runtime');
const { isCommandEnabled, toFeatureMap } = require('../runtime-feature-flags');

const DEVELOPMENT_CONFIG = Object.freeze({
    RUNTIME_ENVIRONMENT_PROFILE: Object.freeze({
        environment: 'development',
        configured: true,
        effects: Object.freeze({ manualPublish: true, automatedDraft: true, automatedPublish: false, livePublish: false })
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

test('development permits a manually started shopping queue item through the manual publishing policy', async () => {
    let sheetReadyCalls = 0;
    let licenseCalls = 0;
    const runtime = createContentActionsRuntime({
        CONFIG: DEVELOPMENT_CONFIG,
        async ensureSheetsReadyForUi() { sheetReadyCalls += 1; },
        License: {
            async checkLicenseStatus() {
                licenseCalls += 1;
                return { success: true, features: { cmd_batch: true, cmd_shopping: true } };
            }
        },
        checkAuthSessionValid: async () => ({ ok: false }),
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool: () => false,
        clearAllShoppingRuntimeLogs() { },
        setShoppingRuntimeLog() { }
    });

    const result = await runtime.executeShoppingBatchRowsAction({
        rowIndices: [0],
        targets: ['naver'],
        manualTrigger: true
    });

    assert.equal(result.code, 'NAVER_SESSION_INVALID');
    assert.equal(sheetReadyCalls, 1);
    assert.equal(licenseCalls, 1);
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

test('development continuous automation admits draft rows but still blocks public rows', async () => {
    let licenseCalls = 0;
    const createRuntime = (postStatus) => createContentActionsRuntime({
        CONFIG: DEVELOPMENT_CONFIG,
        parseIntSafe: (value) => Number(value),
        Utils: {
            async readGoogleSheetTopicsAll() {
                return { items: [{ rowIndex: 0, status: '발행 준비 완료', options: { post_status: postStatus } }] };
            }
        },
        License: {
            async checkLicenseStatus() {
                licenseCalls += 1;
                return { success: false, message: 'fixture stop' };
            }
        }
    });

    const draft = await createRuntime('draft').executeBlogRowAction(
        { action: 'batch', rowIndex: 0, requireReadyStatus: true },
        { continuousAutomation: true }
    );
    const publish = await createRuntime('publish').executeBlogRowAction(
        { action: 'batch', rowIndex: 0, requireReadyStatus: true },
        { continuousAutomation: true }
    );

    assert.equal(draft.code, 'LICENSE_STATUS_FAILED');
    assert.equal(publish.code, 'LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT');
    assert.equal(licenseCalls, 1);
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

test('WordPress-only shopping lifecycle execution does not require a Naver session', async () => {
    let naverSessionChecks = 0;
    const runtime = createContentActionsRuntime({
        CONFIG: {},
        async ensureSheetsReadyForUi() { },
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    remaining: 0,
                    features: { cmd_batch: true, cmd_shopping: true }
                };
            }
        },
        checkAuthSessionValid: async () => {
            naverSessionChecks += 1;
            return { ok: false };
        },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool: () => false,
        clearAllShoppingRuntimeLogs() { },
        setShoppingRuntimeLog() { }
    });

    const result = await runtime.executeShoppingBatchRowsAction({ rowIndices: [0], targets: ['wordpress'] });

    assert.equal(result.code, 'QUOTA_EXHAUSTED');
    assert.equal(naverSessionChecks, 0);
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

test('shopping row update forwards normalized posting targets to the sheet option updater', async () => {
    let received = null;
    const runtime = createContentActionsRuntime({
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        Utils: {
            async updateGoogleSheetShoppingEditableFields(_rowIndex, fields) { received = fields; }
        }
    });

    const result = await runtime.executeShoppingRowUpdate({
        rowIndex: 0,
        targets: [' wordpress ', 'naver', 'unsupported', 'naver']
    });

    assert.equal(result.success, true);
    assert.deepEqual(received.targets, ['wordpress', 'naver']);
});

test('shopping topic deletion invalidates every cached shopping list variant', async () => {
    const cleared = [];
    const runtime = createContentActionsRuntime({
        CONFIG: { GOOGLE_SHOPPING_SHEET: 'shopping', GOOGLE_SHEET_ID: 'sheet-id' },
        async ensureSheetsReadyForUi() { },
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        Utils: {
            async getSheetIdByName() { return 1; },
            async googleSheetPost() { return { spreadsheetId: 'sheet-id' }; },
            clearSheetCache(prefix) { cleared.push(prefix); }
        }
    });

    const result = await runtime.executeShoppingTopicsDelete({ rowIndices: [0] });

    assert.equal(result.success, true);
    assert.deepEqual(cleared, ['shopping']);
});

test('shopping row generation forwards the stored writing strategy to the content builder', async () => {
    const buildOptions = [];
    const runtime = createContentActionsRuntime({
        CONFIG: {},
        parseIntSafe: (value, fallback, min) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
        },
        Utils: {
            async readGoogleSheetShoppingAll() {
                return {
                    items: [{
                        rowIndex: 0,
                        shortUrl: 'https://naver.me/example',
                        product: '확인된 상품',
                        writingStrategy: 'discovery',
                        contentFocus: 'usage',
                        postStatus: 'publish'
                    }]
                };
            },
            async updateGoogleSheetShoppingStatus() { }
        },
        ShoppingManager: {
            async scrapeShoppingProduct() { return { productData: {}, finalUrl: 'https://example.com/product' }; },
            async buildPostFromShortUrl(_shortUrl, options) {
                buildOptions.push(options);
                return { targetDir: '/tmp/shopping-preview' };
            }
        },
        License: {
            async checkLicenseStatus() { return { success: true, features: { cmd_shopping: true } }; },
            async reservePublishQuota() { return { success: false, code: 'FIXTURE_STOP', message: 'fixture stop' }; }
        },
        toFeatureMap: (features) => features,
        isCommandEnabled: () => true,
        getFeatureBool: () => false,
        getBlogAutoSettingsSnapshot: () => ({ BLOG_AUTO_HEADLESS: true })
    });

    const result = await runtime.executeShoppingRowAction({ rowIndex: 0, targets: ['naver'] });

    assert.equal(result.success, false);
    assert.equal(result.code, 'FIXTURE_STOP');
    assert.equal(buildOptions.length, 1);
    assert.equal(buildOptions[0].writingStrategy, 'discovery');
    assert.equal(buildOptions[0].contentFocus, 'usage');
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
    let receivedTitle = '';
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
                        options: { title: '선택한 워드프레스 제목', platforms: ['wordpress'], post_status: 'draft' }
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
            receivedTitle = params.context.title;
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
    assert.equal(receivedTitle, '선택한 워드프레스 제목');
    assert.equal(naverSessionChecks, 0);
});
