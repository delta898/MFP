const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBlogManualPublishingApplication } = require('./manual-publishing-application');
const { getFeatureBool, isCommandEnabled, toFeatureMap } = require('../../../services/licensing/feature-access');

const createTestPublishActionsRuntime = (deps = {}) => {
    if (deps.blogPostingApplication || typeof deps.generationHarness?.generateContent !== 'function') {
        return createBlogManualPublishingApplication(deps);
    }
    return createBlogManualPublishingApplication({
        ...deps,
        blogPostingApplication: {
            async preparePost(topic, settings = {}) {
                const writing = deps.blogWritingApplication || {
                    async generateText() { return ''; },
                    async generateImage() { return { dataBase64: '', mimeType: 'image/png' }; }
                };
                const generated = await deps.generationHarness.generateContent(topic, settings.workspaceDir || null, {
                    ...settings,
                    generateText(prompt, modelOptions = {}) {
                        const selection = modelOptions.modelConfig;
                        return writing.generateText(prompt, {
                            ...(modelOptions.signal ? { signal: modelOptions.signal } : {}),
                            ...(selection ? { modelSelection: { provider: selection.provider, modelId: selection.code || selection.modelId } } : {})
                        });
                    }
                });
                if (typeof deps.generationHarness.prepareImages === 'function') {
                    settings.onStage?.('images');
                    await deps.generationHarness.prepareImages(generated.targetDir, topic, {
                        ...settings,
                        imageGenerationEnabled: settings.imageGenerationEnabled !== false,
                        generateImage(prompt, imageOptions = {}) {
                            const selection = imageOptions.modelConfig;
                            return writing.generateImage(prompt, { aspectRatio: '4:3', size: '1K', count: 1 }, {
                                ...(imageOptions.signal ? { signal: imageOptions.signal } : {}),
                                ...(selection ? { modelSelection: { provider: selection.provider, modelId: selection.code || selection.modelId } } : {})
                            });
                        }
                    });
                }
                return generated;
            }
        }
    });
};

test('local environment blocks direct manuscript publishing before license or file work', async () => {
    let licenseChecks = 0;
    const runtime = createTestPublishActionsRuntime({
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

test('local WordPress publish preserves image upload warnings while counting the draft save as successful', async () => {
    const warnings = ['이미지 1번 업로드 실패'];
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() {}, warn() {}, error() {} },
        Utils: {},
        blogPublishingApplication: {
            async publishWordPressManuscript() {
                return { success: true, postId: 456, postUrl: 'https://example.test/draft', status: 'draft', warnings };
            }
        },
        License: {
            async checkLicenseStatus() { return { success: true, features: {} }; },
            async reservePublishQuota() { return { success: true }; },
            async commitPublishQuota() { return { success: true }; }
        },
        toFeatureMap,
        getFeatureBool,
        buildLocalMarkdownPreview: () => ({
            title: '테스트 원고',
            rawMarkdown: '# 테스트 원고',
            validation: { ok: true, errors: [] },
            images: [],
            source: { fileName: 'contents.md', folderName: '붙여넣기' }
        }),
        materializeSelectedFilesToWorkspace: () => ({ tempDir: '' }),
    });

    const result = await runtime.executeLocalMarkdownPublish({
        markdownText: '# 테스트 원고',
        targets: ['wordpress'],
        postStatus: 'draft',
        imageMode: 'none'
    });

    assert.equal(result.success, true);
    assert.equal(result.data.results.wordpress.success, true);
    assert.equal(result.data.results.wordpress.postId, '456');
    assert.deepEqual(result.data.results.wordpress.warnings, warnings);
});

test('WordPress Plugin publisher owns WordPress manuscript creation when the application flag is set', async () => {
    const calls = [];
    const logs = [];
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info(message) { logs.push(message); }, warn() {}, error() {} },
        Utils: {},
        blogPublishingApplication: {
            async publishWordPressManuscript() { throw new Error('directory manuscript path must not run'); },
            async publishWordPressPlugin(request, context) {
                calls.push({ request, context });
                return { success: true, postId: 902, postUrl: 'https://example.test/draft/902', status: 'draft', warnings: null };
            }
        },
        License: {
            async checkLicenseStatus() { return { success: true, features: {} }; },
            async reservePublishQuota() { return { success: true }; },
            async commitPublishQuota() { return { success: true }; }
        },
        toFeatureMap,
        getFeatureBool,
        buildLocalMarkdownPreview: () => ({
            title: 'Plugin 원고',
            rawMarkdown: '# Plugin 원고\n\n본문입니다.',
            validation: { ok: true, errors: [] },
            images: [],
            source: { fileName: 'contents.md', folderName: '원고' }
        }),
        materializeSelectedFilesToWorkspace: () => ({ tempDir: '' }),
    });

    const result = await runtime.executeLocalMarkdownPublish({
        markdownText: '# Plugin 원고\n\n본문입니다.',
        targets: ['wordpress'],
        postStatus: 'draft',
        imageMode: 'none',
        wordpressCategory: '여행',
        usePluginPublisher: true
    });

    assert.equal(result.success, true);
    assert.equal(result.data.results.wordpress.postId, '902');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].request.title, 'Plugin 원고');
    assert.match(calls[0].request.content, /<p>본문입니다\.<\/p>/);
    assert.equal(calls[0].request.status, 'draft');
    assert.equal(calls[0].request.category, '여행');
    assert.ok(logs.some((message) => message.includes('WordPress 발행 시작 (assets=0)')));
    assert.ok(logs.some((message) => message.includes('WordPress 발행 완료 (success=true, requestedAssets=0, warnings=0)')));
    assert.equal(logs.some((message) => message.includes('본문입니다')), false);
});

test('WordPress Plugin publisher uploads manuscript images and links them in post content', async (t) => {
    const calls = [];
    const logs = [];
    let tempDir = '';
    const rawMarkdown = '# 이미지 원고\n\n본문입니다.\n\n[[IMAGE_0\nid: hero\ntitle: 바다 풍경\nprompt: ocean\n]]';
    const runtime = createTestPublishActionsRuntime({
        fs,
        path,
        CONFIG: {},
        Logger: { info(message) { logs.push(message); }, warn() {}, error() {} },
        Utils: {
            parseMarkdown(markdown) {
                assert.equal(markdown, rawMarkdown.replace(/^#\s+.+\n?/, '').trim());
                return { contents: [{ type: 'image', index: 0, text: '바다 풍경', raw: '[[IMAGE_0\nid: hero\ntitle: 바다 풍경\nprompt: ocean\n]]' }] };
            },
            findImageByPrefix(directory, index) {
                return index === 0 ? path.join(directory, '00_generated.png') : null;
            }
        },
        blogPublishingApplication: {
            async publishWordPressManuscript() { throw new Error('directory manuscript path must not run'); },
            async publishWordPressPlugin(request, context) {
                calls.push({ request, context });
                return { success: true, postId: 903, postUrl: 'https://example.test/903', status: 'draft', warnings: null };
            }
        },
        License: {
            async checkLicenseStatus() { return { success: true, features: {} }; },
            async reservePublishQuota() { return { success: true }; },
            async commitPublishQuota() { return { success: true }; }
        },
        toFeatureMap,
        getFeatureBool,
        buildLocalMarkdownPreview: () => ({
            title: '이미지 원고',
            rawMarkdown,
            validation: { ok: true, errors: [] },
            images: [{ index: 0, title: '바다 풍경', exists: true }],
            source: { fileName: 'contents.md', folderName: '원고' }
        }),
        materializeSelectedFilesToWorkspace() {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-wp-plugin-test-'));
            fs.writeFileSync(path.join(tempDir, '00_generated.png'), Buffer.from('png-bytes'));
            return { tempDir };
        },
    });
    t.after(() => { if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true }); });

    const result = await runtime.executeLocalMarkdownPublish({
        markdownText: rawMarkdown,
        targets: ['wordpress'],
        postStatus: 'draft',
        imageMode: 'prompt_only',
        usePluginPublisher: true
    });

    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].request.assets.map(({ key, filename, mimeType, altText, bytes }) => ({
        key, filename, mimeType, altText, bytes: bytes.toString()
    })), [{ key: 'image-0', filename: '00_generated.png', mimeType: 'image/png', altText: '바다 풍경', bytes: 'png-bytes' }]);
    assert.equal(calls[0].request.featuredAsset, 'image-0');
    assert.match(calls[0].request.content, /\{\{asset:image-0}}/);
    assert.doesNotMatch(calls[0].request.content, /\[\[IMAGE_0/);
});

test('quick publish keeps the user image option independent from legacy license flags', async () => {
    let appendedTopics = [];
    let dedupeInput = null;
    const runtime = createTestPublishActionsRuntime({
        CONFIG: { GOOGLE_TOPICS_SHEET: 'topics' },
        Logger: { info() { }, warn() { }, error() { } },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
        },
        GoogleSheets: {
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
    const runtime = createTestPublishActionsRuntime({
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
    const runtime = createTestPublishActionsRuntime({
        CONFIG: { GOOGLE_TOPICS_SHEET: 'topics' },
        Logger: { info() {}, warn() {}, error() {} },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
        },
        GoogleSheets: {
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
    const runtime = createTestPublishActionsRuntime({
        CONFIG: { GOOGLE_TOPICS_SHEET: 'topics' },
        Logger: { info() {}, warn() {}, error() {} },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
        },
        GoogleSheets: {
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

test('quick preview generation failure does not leak credentials', async () => {
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {
            GOOGLE_TOPICS_SHEET: 'topics',
            TEXT_MODEL_CONFIG: {
                provider: 'google',
                name: 'Gemini 3 Flash',
                code: 'gemini-3-flash',
                transport: 'gemini_generate_content',
                api_key: 'must-not-escape'
            }
        },
        Logger: { info() {}, warn() {}, error() {} },
        generationHarness: {
            async generateContent() {
                throw new Error('글쓰기 텍스트 모델 호출에 실패했습니다: Invalid URL (요청 주소: https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent)');
            }
        },
        Utils: {
            convertToMobileNaverBlogUrl: (value) => value,
        },
        GoogleSheets: {
            async ensureAllSheetsExist() {},
            async appendGoogleSheetTopics() {
                return { success: true, rowNumbers: [2], rowIndices: [0] };
            },
            async updateGoogleSheetStatus() {}
        },
        License: { async checkLicenseStatus() { return { success: true, features: {} }; } },
        normalizeKeywords: (value) => Array.isArray(value) ? value : [],
        normalizeBool: (value, fallback) => typeof value === 'boolean' ? value : fallback,
        normalizePublishMode: (value) => value,
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool,
        buildQuickPublishDedupeKey: () => 'failure-key',
        cleanupQuickPublishDedupeCache() {},
        getQuickPublishRecentEntry: () => null,
        setQuickPublishRecentEntry() {},
    });

    const result = await runtime.executeQuickPublish({
        subject: '실패 로그 확인',
        publishMode: 'append_and_generate',
        targets: ['wordpress']
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'GENERATE_FAILED');
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape/);
});


function createPublishLifecycleRuntime({ naverSuccess, wordpressSuccess, reserveSuccess = true, reservationMetadata } = {}) {
    const calls = [];
    const lifecycleCalls = [];
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() { }, warn() { }, error() { } },
        generationHarness: {
            async generateContent(_topic, _unused, options) {
                return { targetDir: `/tmp/${options.platform}`, finalSubject: 'quota test' };
            },
            async prepareImages() { },
            async publishToBlog() {
                calls.push('publish:naver');
                return { success: naverSuccess, message: naverSuccess ? 'ok' : 'failed' };
            },
        },
        blogPublishingApplication: {
            async publishWordPressManuscript() {
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
        async recordActivityLifecycle(input) {
            lifecycleCalls.push(input);
            return input;
        }
    });
    return { runtime, calls, lifecycleCalls };
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
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() { }, warn() { }, error() { } },
        generationHarness: {
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

test('legacy Blog generation test harness routes text and image callbacks through the Blog Posting Application', async () => {
    const calls = [];
    const blogWritingApplication = {
        async generateText(prompt, context) {
            calls.push({ kind: 'text', prompt, context });
            return '{"title":"제목","content":"본문"}';
        },
        async generateImage(prompt, options, context) {
            calls.push({ kind: 'image', prompt, options, context });
            return { dataBase64: Buffer.from('image bytes').toString('base64'), mimeType: 'image/png' };
        }
    };
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() {}, warn() {}, error() {} },
        blogWritingApplication,
        generationHarness: {
            async generateContent(_topic, _unused, options) {
                await options.generateText('test text prompt', {
                    signal: options.signal,
                    modelConfig: { provider: 'google', code: 'text-model' }
                });
                return { targetDir: '/tmp/blog-plugin-generation', finalSubject: '블로그' };
            },
            async prepareImages(_dir, _topic, options) {
                await options.generateImage('test image prompt', {
                    signal: options.signal,
                    modelConfig: { provider: 'openai', code: 'image-model' }
                });
            }
        },
        checkAuthSessionValid: async () => ({ ok: true })
    });

    const result = await runtime.buildMultiPlatformGeneratedContent({
        context: { subject: '블로그', imageOptions: { mode: 'generate', generate: true, count: 1 } },
        targets: ['wordpress'],
        features: {},
        enableRelatedPostsAutoLink: false
    });

    assert.equal(result.success, true);
    assert.deepEqual(calls.map(({ kind }) => kind), ['text', 'image']);
    assert.deepEqual(calls[0].context.modelSelection, { provider: 'google', modelId: 'text-model' });
    assert.deepEqual(calls[1].context.modelSelection, { provider: 'openai', modelId: 'image-model' });
    assert.equal(calls[1].options.aspectRatio, '4:3');
});

test('generation passes the operation signal and model snapshot through the test harness to the Blog Posting Application and does not convert cancellation to ordinary failure', async () => {
    const controller = new AbortController();
    const textModelConfig = { provider: 'openai', code: 'gpt-6-sol' };
    const calls = [];
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info() {}, warn() {}, error() {} },
        generationHarness: {
            async generateContent(_topic, _unused, options) {
                calls.push(options);
                controller.abort();
                throw Object.assign(new Error('canceled'), { code: 'AI_GENERATION_CANCELED' });
            },
            async prepareImages() { throw new Error('must not prepare images'); }
        }
    });
    await assert.rejects(runtime.buildMultiPlatformGeneratedContent({
        context: { subject: '주제', imageOptions: { mode: 'none', generate: false } },
        targets: ['wordpress'], features: {}, enableRelatedPostsAutoLink: false
    }, { signal: controller.signal, textModelConfig }), (error) => error.code === 'AI_GENERATION_CANCELED');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].signal, controller.signal);
    assert.equal(calls[0].textModelConfig, textModelConfig);
});

test('generation passes image model snapshot and owned workspace to image preparation', async () => {
    const imageModelConfig = { provider: 'kie', code: 'nano-banana-2' };
    const calls = [];
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {}, Logger: { info() {}, warn() {}, error() {} },
        generationHarness: {
            async generateContent(_topic, customDir) {
                calls.push(['generate', customDir]);
                return { targetDir: customDir, finalSubject: 'subject' };
            },
            async prepareImages(_dir, _topic, options) {
                calls.push(['images', options]);
                options.onImageProgress?.({ current: 1, total: 3, state: 'started' });
            }
        }
    });
    const progress = [];
    const result = await runtime.buildMultiPlatformGeneratedContent({
        context: { subject: 'subject', imageOptions: { mode: 'generate', generate: true } },
        targets: ['wordpress'], features: {}, enableRelatedPostsAutoLink: false
    }, {
        imageModelConfig,
        transientWorkspaceDir: '/fixture/owned',
        onStage: (stage) => calls.push(['stage', stage]),
        onProgress: (message) => progress.push(message)
    });
    assert.equal(result.success, true);
    assert.deepEqual(calls[0], ['generate', '/fixture/owned']);
    assert.deepEqual(calls[1], ['stage', 'images']);
    assert.equal(calls[2][1].imageModelConfig, imageModelConfig);
    assert.equal(progress.at(-1), '워드프레스용 이미지 생성 중 (1/3)');
});

test('multi-platform publish commits one quota unit after partial success', async () => {
    const { runtime, calls } = createPublishLifecycleRuntime({ naverSuccess: true, wordpressSuccess: false });
    const result = await runtime.processMultiPlatformPublish(createPublishParams(), { operationId: 'partial-success' });

    assert.equal(result.success, true);
    assert.deepEqual(calls, ['quota:reserve', 'publish:naver', 'publish:wordpress', 'quota:commit']);
});

test('Naver publishing progress is forwarded and logged through the shared progress contract', async () => {
    const progressMessages = [];
    const logs = [];
    const runtime = createTestPublishActionsRuntime({
        CONFIG: {},
        Logger: { info(message) { logs.push(message); }, warn() {}, error() {} },
        generationHarness: {
            async generateContent(_topic, _dir, options) { return { targetDir: `/tmp/${options.platform}`, finalSubject: '진행 확인' }; },
            async prepareImages() {}
        },
        blogPublishingApplication: {
            async publishNaver(_directory, request) {
                request.onProgress?.({ stage: 'body', current: 2, total: 14 });
                return { success: true, postUrl: 'https://blog.naver.com/example/1' };
            }
        },
        License: {
            async reservePublishQuota() { return { success: true }; },
            async commitPublishQuota() { return { success: true }; },
            async releasePublishQuota() { return { success: true }; }
        },
        TelegramBotService: { async sendNotification() {} },
        checkAuthSessionValid: async () => ({ ok: true }),
        async recordActivityLifecycle(input) { return input; }
    });

    const result = await runtime.processMultiPlatformPublish({
        context: { subject: '진행 확인', postStatus: 'draft', imageOptions: { generate: false } },
        targets: ['naver'], features: {}, enableRelatedPostsAutoLink: false
    }, { onProgress: (message) => progressMessages.push(message) });

    assert.equal(result.success, true);
    assert.ok(progressMessages.includes('본문을 입력하고 있습니다. (2/14)'));
    assert.ok(logs.includes('[Blog Beta][Progress] 본문을 입력하고 있습니다. (2/14)'));
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

test('scheduled publish rechecks its deadline after generation and releases quota when it expires', async () => {
    const { runtime, calls } = createPublishLifecycleRuntime({ naverSuccess: true, wordpressSuccess: true });
    let checks = 0;
    const params = createPublishParams();
    params.context.postStatus = 'schedule';
    params.context.scheduleDate = '2099-01-01T00:00:00.000Z';
    const result = await runtime.processMultiPlatformPublish(params, {
        operationId: 'schedule-expired-during-generation',
        beforePlatformPost: async ({ target }) => {
            checks += 1;
            return target === 'preflight'
                ? { success: true }
                : { success: false, code: 'SCHEDULE_DATE_PAST', message: '예약 시각이 지났습니다.' };
        }
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'SCHEDULE_DATE_PAST');
    assert.deepEqual(calls, ['quota:reserve', 'quota:release']);
});

test('multi-platform retry skips targets already committed in the operation ledger', async () => {
    const { runtime, calls, lifecycleCalls } = createPublishLifecycleRuntime({
        naverSuccess: true,
        wordpressSuccess: true,
        reservationMetadata: { successful_targets: ['naver'] }
    });
    const result = await runtime.processMultiPlatformPublish(createPublishParams(), { operationId: 'partial-retry' });

    assert.equal(result.success, true);
    assert.equal(result.results.naver.reused, true);
    assert.deepEqual(calls, ['quota:reserve', 'publish:wordpress', 'quota:commit']);
    const resultCalls = lifecycleCalls.filter((item) => item.stage !== 'selected');
    assert.deepEqual(resultCalls.map((item) => item.evidence_id), [
        'partial-retry:blog:naver:drafted',
        'partial-retry:blog:wordpress:drafted'
    ]);
    assert.equal(resultCalls[0].metadata.reused, true);
});

test('scheduled publish records only successful platform results as processed facts', async () => {
    const { runtime, lifecycleCalls } = createPublishLifecycleRuntime({
        naverSuccess: true,
        wordpressSuccess: false
    });
    const params = createPublishParams();
    params.context.postStatus = 'schedule';

    const result = await runtime.processMultiPlatformPublish(params, { operationId: 'scheduled-partial' });

    assert.equal(result.success, true);
    const resultCalls = lifecycleCalls.filter((item) => item.stage !== 'selected');
    assert.equal(resultCalls.length, 1);
    assert.equal(resultCalls[0].platform, 'naver');
    assert.equal(resultCalls[0].stage, 'scheduled');
    assert.equal(resultCalls[0].metadata.processed, true);
    assert.equal(resultCalls[0].metadata.publicly_published, false);
});
