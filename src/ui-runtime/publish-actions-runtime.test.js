const test = require('node:test');
const assert = require('node:assert/strict');

const { createPublishActionsRuntime } = require('./publish-actions-runtime');
const { getFeatureBool, isCommandEnabled, toFeatureMap } = require('../runtime-feature-flags');

test('local environment blocks direct manuscript publishing before license or file work', async () => {
    let licenseChecks = 0;
    const runtime = createPublishActionsRuntime({
        CONFIG: {
            RUNTIME_ENVIRONMENT_PROFILE: {
                environment: 'local',
                configured: true,
                effects: { manualPublish: false, automatedPublish: false }
            }
        },
        License: {
            async checkLicenseStatus() {
                licenseChecks += 1;
                return { success: true, features: {} };
            }
        }
    });

    const result = await runtime.executeLocalMarkdownPublish({
        markdownText: '# local manuscript',
        targets: ['naver'],
        postStatus: 'draft'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'MANUAL_PUBLISH_BLOCKED_BY_ENVIRONMENT');
    assert.equal(licenseChecks, 0);
});

test('quick publish keeps the user image option independent from legacy license flags', async () => {
    let appendedTopics = [];
    let dedupeInput = null;
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
                        enable_sns_distribution: false,
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
        buildQuickPublishDedupeKey: (input) => {
            dedupeInput = input;
            return 'dedupe-key';
        },
        cleanupQuickPublishDedupeCache() { },
        getQuickPublishRecentEntry: () => null,
        setQuickPublishRecentEntry() { },
        recordUiActivity() { }
    });

    const result = await runtime.executeQuickPublish({
        subject: '테스트 글',
        title: '사용자가 정한 최종 제목',
        imageGeneration: true,
        imageCount: 6,
        writingStrategy: 'discovery',
        publishMode: 'append_only',
        targets: ['naver']
    });

    assert.equal(result.success, true);
    assert.equal(appendedTopics[0].image_options.generate, true);
    assert.equal(appendedTopics[0].image_options.count, 6);
    assert.equal(appendedTopics[0].writing_strategy, 'discovery');
    assert.equal(appendedTopics[0].title, '사용자가 정한 최종 제목');
    assert.equal(appendedTopics[0].content_guide.title, '사용자가 정한 최종 제목');
    assert.equal(appendedTopics[0].source, 'manual');
    assert.equal(appendedTopics[0].trendDate, '');
    assert.equal(dedupeInput.writingStrategy, 'discovery');
    assert.equal(dedupeInput.imageCount, 6);
    assert.equal(dedupeInput.title, '사용자가 정한 최종 제목');
});

test('quick publish rejects an out-of-range per-post image count before external work', async () => {
    const runtime = createPublishActionsRuntime({
        CONFIG: {},
        normalizeKeywords: () => [],
        normalizeBool: (value, fallback) => typeof value === 'boolean' ? value : fallback,
        normalizePublishMode: (value) => value
    });

    const result = await runtime.executeQuickPublish({
        subject: '이미지 개수 검증',
        imageCount: 7,
        publishMode: 'append_only'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_BLOG_IMAGE_COUNT');
});

test('quick publish preserves trend provenance in the topics row and dedupe input', async () => {
    let appendedTopic;
    let dedupeInput;
    const runtime = createPublishActionsRuntime({
        CONFIG: { GOOGLE_TOPICS_SHEET: 'topics' },
        Logger: { info() {}, warn() {}, error() {} },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
            async ensureAllSheetsExist() {},
            async appendGoogleSheetTopics(topics) {
                [appendedTopic] = topics;
                return { success: true, rowNumbers: [2], rowIndices: [0] };
            }
        },
        License: {
            async checkLicenseStatus() { return { success: true, features: {} }; }
        },
        normalizeKeywords: (value) => Array.isArray(value) ? value : [value],
        normalizeBool: (value, fallback) => typeof value === 'boolean' ? value : fallback,
        normalizePublishMode: (value) => value,
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool,
        buildQuickPublishDedupeKey: (input) => { dedupeInput = input; return 'trend-key'; },
        cleanupQuickPublishDedupeCache() {},
        getQuickPublishRecentEntry: () => null,
        setQuickPublishRecentEntry() {},
        recordUiActivity() {}
    });

    const result = await runtime.executeQuickPublish({
        subject: '성수 맛집',
        keywords: ['성수 맛집'],
        source: 'naver_trend',
        trendDate: '2026-08-11',
        publishMode: 'append_only'
    });

    assert.equal(result.success, true);
    assert.equal(appendedTopic.source, 'naver_trend');
    assert.equal(appendedTopic.trendDate, '2026-08-11');
    assert.equal(appendedTopic.status, '대기');
    assert.equal(dedupeInput.source, 'naver_trend');
    assert.equal(dedupeInput.trendDate, '2026-08-11');
});

test('quick publish records a grounded recommendation as saved after topics append', async () => {
    const lifecycleCalls = [];
    let appendedTopic;
    const runtime = createPublishActionsRuntime({
        CONFIG: { GOOGLE_TOPICS_SHEET: 'topics' },
        Logger: { info() {}, warn() {}, error() {} },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
            async ensureAllSheetsExist() {},
            async appendGoogleSheetTopics(topics) {
                [appendedTopic] = topics;
                return { success: true, rowNumbers: [4], rowIndices: [2] };
            }
        },
        License: { async checkLicenseStatus() { return { success: true, features: {} }; } },
        normalizeKeywords: (value) => Array.isArray(value) ? value : [value],
        normalizeBool: (value, fallback) => typeof value === 'boolean' ? value : fallback,
        normalizePublishMode: (value) => value,
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool,
        buildQuickPublishDedupeKey: () => 'recommendation-key',
        cleanupQuickPublishDedupeCache() {},
        getQuickPublishRecentEntry: () => null,
        setQuickPublishRecentEntry() {},
        recordUiActivity() {},
        async recordActivityLifecycle(input) {
            lifecycleCalls.push(input);
            return input;
        }
    });

    const result = await runtime.executeQuickPublish({
        subject: '추천으로 고른 글감',
        keywords: ['추천'],
        source: 'topic_recommendation',
        recommendation: {
            run_id: 'run-1',
            candidate_id: 'candidate-1',
            topic_seed: '추천'
        },
        publishMode: 'append_only'
    });

    assert.equal(result.success, true);
    assert.equal(appendedTopic.source, 'topic_recommendation');
    assert.equal(lifecycleCalls.length, 1);
    assert.equal(lifecycleCalls[0].stage, 'saved');
    assert.equal(lifecycleCalls[0].metadata.recommendation.candidate_id, 'candidate-1');
});

test('shopping quick publish rejects an overlong instruction before external work', async () => {
    const runtime = createPublishActionsRuntime({
        CONFIG: {},
        normalizePublishMode: (value) => value
    });

    const result = await runtime.executeShoppingQuickPublish({
        shortUrl: 'https://naver.me/example',
        instruction: '가'.repeat(1001),
        publishMode: 'append_only'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'INVALID_SHOPPING_INSTRUCTION');
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
            imageOptions: { generate: false }
        },
        targets: ['naver', 'wordpress'],
        features: {},
        enableRelatedPostsAutoLink: false
    };
}

test('Naver and WordPress generation receive the same per-post profile overrides', async () => {
    const generated = [];
    const runtime = createPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() { }, warn() { }, error() { } },
        Core: {
            async generateContent(topic, _unused, options) {
                generated.push({ topic, options });
                return { targetDir: `/tmp/${options.platform}`, finalSubject: 'profile test' };
            },
            async prepareImages() { }
        },
        checkAuthSessionValid: async () => ({ ok: true })
    });
    const result = await runtime.buildMultiPlatformGeneratedContent({
        context: {
            subject: '같은 주제',
            instruction: '이번 글 지시',
            referenceUrls: ['https://example.com/reference'],
            writingStrategy: 'discovery',
            imageOptions: { generate: false, count: 5 },
            naverCategory: '네이버 분류',
            wordpressCategory: '워드프레스 분류'
        },
        targets: ['naver', 'wordpress'],
        features: {},
        enableRelatedPostsAutoLink: false
    });

    assert.equal(result.success, true);
    assert.deepEqual(generated.map((item) => item.options.platform), ['naver', 'wordpress']);
    for (const { topic } of generated) {
        assert.equal(topic.writingStrategy, 'discovery');
        assert.equal(topic.content_guide.additional_instructions, '이번 글 지시');
        assert.deepEqual(topic.content_guide.reference_urls, ['https://example.com/reference']);
        assert.deepEqual(topic.image_options, { mode: 'prompt_only', generate: false, count: 5 });
    }
    assert.deepEqual(generated.map((item) => item.topic.category), ['네이버 분류', '워드프레스 분류']);
});

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
