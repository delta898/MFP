const test = require('node:test');
const assert = require('node:assert/strict');

const { createPublishActionsRuntime } = require('./publish-actions-runtime');
const { getFeatureBool, isCommandEnabled, toFeatureMap } = require('../runtime-feature-flags');

test('quick publish keeps the user image option independent from legacy license flags', async () => {
    let appendedTopics = [];
    const runtime = createPublishActionsRuntime({
        CONFIG: { GOOGLE_TOPICS_SHEET: 'topics' },
        Logger: { info() { }, warn() { }, error() { } },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
            async ensureAllSheetsExist() { },
            async appendGoogleSheetTopics(topics) {
                appendedTopics = topics;
                return { success: true, rowNumbers: [2], rowIndices: [0] };
            }
        },
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    features: {
                        cmd_batch: true,
                        cmd_trends: false,
                        cmd_shopping: false,
                        enable_related_posts_auto_link: false,
                        image_generation: false
                    }
                };
            }
        },
        normalizeKeywords: (value) => Array.isArray(value) ? value : [],
        normalizeBool: (value, fallback) => typeof value === 'boolean' ? value : fallback,
        normalizePublishMode: (value) => value,
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool,
        buildQuickPublishDedupeKey: () => 'dedupe-key',
        cleanupQuickPublishDedupeCache() { },
        getQuickPublishRecentEntry: () => null,
        setQuickPublishRecentEntry() { },
        recordUiActivity() { }
    });

    const result = await runtime.executeQuickPublish({
        subject: '테스트 글',
        imageGeneration: true,
        publishMode: 'append_only',
        targets: ['naver']
    });

    assert.equal(result.success, true);
    assert.equal(appendedTopics[0].image_options.generate, true);
});

function createPublishLifecycleRuntime({ naverSuccess, wordpressSuccess, reserveSuccess = true, reservationMetadata } = {}) {
    const calls = [];
    const runtime = createPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() { }, warn() { }, error() { } },
        Core: {
            async generateContent(_topic, _unused, options) {
                return { targetDir: `/tmp/${options.platform}`, finalSubject: 'quota test' };
            },
            async prepareImages() { },
            async publishToBlog() {
                calls.push('publish:naver');
                return { success: naverSuccess, message: naverSuccess ? 'ok' : 'failed' };
            },
            async publishToWordPress() {
                calls.push('publish:wordpress');
                return { success: wordpressSuccess, message: wordpressSuccess ? 'ok' : 'failed' };
            }
        },
        License: {
            async reservePublishQuota() {
                calls.push('quota:reserve');
                return { success: reserveSuccess, message: reserveSuccess ? 'ok' : 'exhausted', metadata: reservationMetadata };
            },
            async commitPublishQuota() { calls.push('quota:commit'); return { success: true }; },
            async releasePublishQuota() { calls.push('quota:release'); return { success: true }; }
        },
        TelegramBotService: { async sendNotification() { } },
        checkAuthSessionValid: async () => ({ ok: true }),
        formatActivityTargets: () => '',
        recordUiActivity() { }
    });
    return { runtime, calls };
}

function createPublishParams() {
    return {
        context: {
            subject: 'quota test',
            postStatus: 'draft',
            imageOptions: { generate: false, count: 0 }
        },
        targets: ['naver', 'wordpress'],
        features: {},
        enableRelatedPostsAutoLink: false
    };
}

test('multi-platform publish commits one quota unit after partial success', async () => {
    const { runtime, calls } = createPublishLifecycleRuntime({ naverSuccess: true, wordpressSuccess: false });
    const result = await runtime.processMultiPlatformPublish(createPublishParams(), { operationId: 'partial-success' });

    assert.equal(result.success, true);
    assert.deepEqual(calls, ['quota:reserve', 'publish:naver', 'publish:wordpress', 'quota:commit']);
});

test('multi-platform publish releases quota when every platform fails', async () => {
    const { runtime, calls } = createPublishLifecycleRuntime({ naverSuccess: false, wordpressSuccess: false });
    const result = await runtime.processMultiPlatformPublish(createPublishParams(), { operationId: 'total-failure' });

    assert.equal(result.success, false);
    assert.deepEqual(calls, ['quota:reserve', 'publish:naver', 'publish:wordpress', 'quota:release']);
});

test('multi-platform publish does not call platforms when quota reserve fails', async () => {
    const { runtime, calls } = createPublishLifecycleRuntime({ naverSuccess: true, wordpressSuccess: true, reserveSuccess: false });
    const result = await runtime.processMultiPlatformPublish(createPublishParams(), { operationId: 'quota-denied' });

    assert.equal(result.success, false);
    assert.deepEqual(calls, ['quota:reserve']);
});

test('multi-platform retry skips targets already committed in the operation ledger', async () => {
    const { runtime, calls } = createPublishLifecycleRuntime({
        naverSuccess: true,
        wordpressSuccess: true,
        reservationMetadata: { successful_targets: ['naver'] }
    });
    const result = await runtime.processMultiPlatformPublish(createPublishParams(), { operationId: 'partial-retry' });

    assert.equal(result.success, true);
    assert.equal(result.results.naver.reused, true);
    assert.deepEqual(calls, ['quota:reserve', 'publish:wordpress', 'quota:commit']);
});
