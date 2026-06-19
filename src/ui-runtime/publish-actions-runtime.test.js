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
