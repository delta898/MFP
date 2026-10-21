const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentApiService } = require('./service');
const { createBlogExecutionCoordinator } = require('../../../../applications/blog/execution/execution-coordinator');

function createService(coordinator, executeLocalMarkdownPublish, CONFIG = {}, extras = {}) {
    return createContentApiService({
        CONFIG,
        blogNextExecutionCoordinator: coordinator,
        executeLocalMarkdownPublish,
        fetchReferenceContent: async () => '',
        ...extras
    });
}

function assertTerminalStatus(coordinator, expected = {}) {
    const status = coordinator.getStatus();
    assert.equal(status.busy, false);
    for (const [key, value] of Object.entries(expected)) assert.equal(status[key], value);
}

test('local manuscript publishing owns the shared Blog Beta lock until it settles', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let finish;
    let calls = 0;
    const service = createService(coordinator, async () => {
        calls += 1;
        return new Promise(resolve => { finish = resolve; });
    });

    const first = service.localMarkdownPublish({ markdownText: '# 원고' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getStatus().source, 'local_markdown');
    assert.equal(coordinator.getStatus().subject, '원고 붙여넣기');
    await assert.rejects(
        () => service.localMarkdownPublish({ folderName: '다른 원고' }),
        (error) => error.status === 409 && error.apiCode === 'BLOG_NEXT_EXECUTION_BUSY'
    );
    assert.equal(calls, 1);

    finish({ success: true, data: { status: '임시 저장 완료' } });
    assert.deepEqual(await first, { status: '임시 저장 완료', completionLinks: [] });
    assertTerminalStatus(coordinator, { state: 'completed', source: 'local_markdown', resultStatus: '작업 완료' });
});

test('direct publish rejects concurrent settings and image changes before touching the draft', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let finish;
    let mutations = 0;
    const manuscriptDraftService = {
        updateSettings() { mutations += 1; },
        updateMarkdown() { mutations += 1; },
        importLocalImage() { mutations += 1; },
        generateImage() { mutations += 1; },
        excludeImage() { mutations += 1; }
    };
    const service = createService(coordinator, async () => new Promise((resolve) => { finish = resolve; }), {}, { manuscriptDraftService });
    const publishing = service.localMarkdownPublish({ markdownText: '# 원고' });
    await new Promise(resolve => setImmediate(resolve));
    const blocked = (error) => error.status === 409 && error.apiCode === 'MANUSCRIPT_DRAFT_PUBLISHING';
    await assert.rejects(() => service.updateManuscriptDraftSettings({ draftId: 'draft-1' }), blocked);
    await assert.rejects(() => service.updateManuscriptDraftMarkdown({ draftId: 'draft-1' }), blocked);
    await assert.rejects(() => service.importManuscriptDraftImage({ draftId: 'draft-1' }), blocked);
    await assert.rejects(() => service.generateManuscriptDraftImage({ draftId: 'draft-1' }), blocked);
    await assert.rejects(() => service.excludeManuscriptDraftImage({ draftId: 'draft-1' }), blocked);
    assert.equal(mutations, 0);
    finish({ success: true, data: { postStatus: 'draft' } });
    await publishing;
});

test('Naver browser milestones reach the shared status while direct publish is running', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let finish;
    const service = createService(coordinator, async (input) => {
        input.onNaverProgress({ stage: 'body', current: 2, total: 5, postStatus: 'draft' });
        return new Promise(resolve => { finish = resolve; });
    });
    const publishing = service.localMarkdownPublish({ markdownText: '# 원고', postStatus: 'draft' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getStatus().progressStage, 'body');
    assert.equal(coordinator.getStatus().message, '본문을 입력하고 있습니다. (2/5)');
    finish({ success: true, data: { postStatus: 'draft' } });
    await publishing;
    assertTerminalStatus(coordinator, {
        state: 'completed', source: 'local_markdown', progressStage: 'body',
        resultStatus: '임시 저장 완료', postStatus: 'draft'
    });
});

test('direct Naver publish exposes a stop signal only after local preparation and settles as stopped', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let publishInput;
    let publishSignal;
    let finish;
    const service = createService(coordinator, async (input, options) => {
        publishInput = input;
        publishSignal = options.signal;
        input.onPreparationComplete();
        input.onNaverProgress({ stage: 'editor', postStatus: 'draft' });
        return new Promise(resolve => { finish = resolve; });
    });

    const publishing = service.localMarkdownPublish({ markdownText: '# 네이버 원고', targets: ['naver'], postStatus: 'draft' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof publishInput.onPreparationComplete, 'function');
    assert.equal(coordinator.getStatus().canStop, true);
    assert.equal(publishSignal.aborted, false);

    assert.equal(coordinator.requestStop().accepted, true);
    assert.equal(publishSignal.aborted, true);
    finish({
        success: false,
        code: 'BLOG_NEXT_EXECUTION_STOPPED',
        message: '블로그 포스팅을 중지했습니다. 이미 처리된 업로드·발행은 되돌리지 않습니다.'
    });
    await assert.rejects(publishing, (error) => error.apiCode === 'BLOG_NEXT_EXECUTION_STOPPED');
    assert.equal(coordinator.getStatus().state, 'stopped');
    assert.equal(coordinator.getStatus().resultStatus, 'BLOG_NEXT_EXECUTION_STOPPED');
});

test('manuscript draft publishing resolves one exact snapshot before using the existing publisher', async () => {
  const coordinator = createBlogExecutionCoordinator();
  const published = [];
  const publicationChecks = [];
  const publicationRecords = [];
  const archivedSnapshots = [];
  const manuscriptDraftService = {
        assertNotPublished(input) {
            publicationChecks.push(input);
        },
        async preparePublishPayload(input) {
            assert.equal(input.draftId, 'draft-1');
            assert.equal(input.revision, 4);
            assert.equal(typeof input.onProgress, 'function');
            return {
                folderName: '원고',
                selectedFiles: [{ name: 'contents.md', textContent: '# 원고' }],
                settings: { targets: ['naver'], postStatus: 'draft', imageMode: 'prompt_only', headless: true },
                publishPolicy: {
                    draftRevision: 6,
                    requestedPostStatus: 'publish',
                    effectivePostStatus: 'draft',
                    autoGeneratedCount: 1,
                    autoGenerationFailedCount: 1,
                    forcedDraft: true
                }
            };
        },
        markPublished(input) {
            publicationRecords.push(input);
            return { draftId: 'draft-1', revision: 6 };
        },
        persistPublicationSnapshot(input) {
            archivedSnapshots.push(input);
            return { publicationId: 'aZ3_xQ7m', platformFolder: 'naver_my-blog', files: ['contents.md'] };
        }
    };
    const service = createService(coordinator, async (input) => {
        published.push(input);
        return { success: true, data: {
            status: '임시 저장 완료',
            postStatus: 'draft',
            results: { naver: { success: true, status: 'draft', postUrl: 'https://blog.naver.com/my-blog/123' } }
        } };
    }, { NAVER_ID: 'my-blog' }, { manuscriptDraftService });

    const result = await service.publishManuscriptDraft({ draftId: 'draft-1', revision: 4 });
    assert.equal(result.status, '임시 저장 완료');
    assert.deepEqual(published[0].targets, ['naver']);
    assert.equal(published[0].selectedFiles[0].textContent, '# 원고');
    assert.equal(result.revision, 6);
    assert.equal(result.publishPolicy.forcedDraft, true);
    assert.deepEqual(result.manuscriptPreview, { draftId: 'draft-1', revision: 6 });
    assert.deepEqual(publicationChecks, [
        { draftId: 'draft-1', revision: 4 },
        { draftId: 'draft-1', revision: 6, target: 'naver' }
    ]);
    assert.deepEqual(publicationRecords, [{
        draftId: 'draft-1', revision: 6, target: 'naver', postStatus: 'draft'
    }]);
    assert.deepEqual(result.archiveSnapshot, {
        success: true, publicationId: 'aZ3_xQ7m', platformFolder: 'naver_my-blog', files: ['contents.md']
    });
    assert.equal(archivedSnapshots[0].platformIdentity, 'my-blog');
    assert.equal(archivedSnapshots[0].postUrl, 'https://blog.naver.com/my-blog/123');
    assert.equal(archivedSnapshots[0].files[0].name, 'contents.md');
});

test('WordPress manuscript publication selects Plugin publisher and preserves the user draft snapshot', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const published = [];
    const marked = [];
    let stopEnabledAfterPreparation = false;
    const service = createService(coordinator, async (input) => {
        published.push(input);
        input.onPreparationComplete();
        stopEnabledAfterPreparation = coordinator.getStatus().canStop === true;
        return {
            success: true,
            data: {
                status: '발행 완료', postStatus: 'publish',
                results: { wordpress: { success: true, status: 'publish', postId: 'wp-902', postUrl: 'https://example.test/902' } }
            }
        };
    }, { WORDPRESS_URL: 'https://example.test' }, {
        manuscriptDraftService: {
            assertNotPublished() {},
            async preparePublishPayload() {
                return {
                    folderName: '원고',
                    selectedFiles: [
                        { name: 'contents.md', textContent: '# WordPress 원고\n\n본문\n\n[[IMAGE_0\ntitle: 바다\nprompt: ocean\n]]' },
                        { name: '00_generated.png', contentType: 'image/png', base64Data: Buffer.from('image').toString('base64') }
                    ],
                    settings: { targets: ['wordpress'], postStatus: 'publish', imageMode: 'prompt_only' },
                    publishPolicy: { draftRevision: 3, unresolvedImageCount: 0 }
                };
            },
            markPublished(input) { marked.push(input); return { draftId: 'draft-1', revision: 3 }; },
            persistPublicationSnapshot() { return { success: true, publicationId: 'pub-1' }; }
        }
    });

    const result = await service.publishManuscriptDraft({ draftId: 'draft-1', revision: 2 });

    assert.equal(published.length, 1);
    assert.equal(published[0].usePluginPublisher, true);
    assert.equal(published[0].imageMode, 'prompt_only');
    assert.equal(published[0].selectedFiles.some((file) => file.contentType === 'image/png'), true);
    assert.equal(stopEnabledAfterPreparation, true);
    assert.deepEqual(published[0].targets, ['wordpress']);
    assert.deepEqual(marked, [{ draftId: 'draft-1', revision: 3, target: 'wordpress', postStatus: 'publish' }]);
    assert.equal(result.status, '발행 완료');
    assert.deepEqual(result.manuscriptPreview, { draftId: 'draft-1', revision: 3 });
    assert.equal(result.archiveSnapshot.success, true);
});

test('WordPress manuscript draft allows unresolved image prompts and reaches the publisher', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const published = [];
    const service = createService(coordinator, async (input) => {
        published.push(input);
        input.onPreparationComplete();
        return {
            success: true,
            data: {
                status: '임시저장 완료', postStatus: 'draft',
                results: { wordpress: { success: true, status: 'draft', postId: 'wp-draft-1' } }
            }
        };
    }, { WORDPRESS_URL: 'https://example.test' }, {
        manuscriptDraftService: {
            assertNotPublished() {},
            async preparePublishPayload() {
                return {
                    folderName: '원고',
                    selectedFiles: [{ name: 'contents.md', textContent: '# 원고\\n\\n본문\\n\\n[[IMAGE_0\\ntitle: 바다\\nprompt: ocean\\n]]' }],
                    settings: { targets: ['wordpress'], postStatus: 'draft', imageMode: 'prompt_only' },
                    publishPolicy: { draftRevision: 3, unresolvedImageCount: 1 }
                };
            },
            markPublished() { return { draftId: 'draft-1', revision: 3 }; },
            persistPublicationSnapshot() { return { success: true, publicationId: 'pub-draft-1' }; }
        }
    });

    const result = await service.publishManuscriptDraft({ draftId: 'draft-1', revision: 2 });

    assert.equal(published.length, 1);
    assert.equal(published[0].usePluginPublisher, true);
    assert.equal(published[0].postStatus, 'draft');
    assert.equal(result.status, '임시저장 완료');
});

test('failed WordPress Plugin publication keeps the editable draft unmarked', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let marked = 0;
    let archived = 0;
    const preservedDraft = { draftId: 'draft-1', revision: 3, lifecycleStatus: 'active' };
    const service = createService(coordinator, async () => ({
        success: true,
        data: {
            status: '발행 실패', postStatus: 'publish',
            results: { wordpress: { success: false, status: 'publish', message: '요청 실패' } }
        }
    }), {}, {
        manuscriptDraftService: {
            assertNotPublished() {},
            async preparePublishPayload() {
                return {
                    selectedFiles: [{ name: 'contents.md', textContent: '# WordPress 원고\n\n본문' }],
                    settings: { targets: ['wordpress'], postStatus: 'publish', imageMode: 'none' },
                    publishPolicy: { draftRevision: 3, unresolvedImageCount: 0 }
                };
            },
            markPublished() { marked += 1; throw new Error('failed publication must not be recorded'); },
            getDraft() { return preservedDraft; },
            persistPublicationSnapshot() { archived += 1; return { success: true }; }
        }
    });

    const result = await service.publishManuscriptDraft({ draftId: 'draft-1', revision: 2 });

    assert.equal(marked, 0);
    assert.equal(archived, 0);
    assert.deepEqual(result.manuscriptPreview, preservedDraft);
    assert.equal(result.archiveSnapshot.success, false);
});

test('duplicate manuscript-target pair is rejected before the publisher is called', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let prepareCount = 0;
    let publishCount = 0;
    const manuscriptDraftService = {
        assertNotPublished() {
            const error = new Error('이 원고는 이미 네이버 블로그에 처리했습니다.');
            error.status = 409;
            error.apiCode = 'MANUSCRIPT_ALREADY_PUBLISHED_TO_TARGET';
            throw error;
        },
        async preparePublishPayload() {
            prepareCount += 1;
            return {};
        }
    };
    const service = createService(coordinator, async () => {
        publishCount += 1;
        return { success: true };
    }, {}, { manuscriptDraftService });

    await assert.rejects(
        () => service.publishManuscriptDraft({ draftId: 'draft-1', revision: 4 }),
        (error) => error.apiCode === 'MANUSCRIPT_ALREADY_PUBLISHED_TO_TARGET'
    );
    assert.equal(prepareCount, 0);
    assert.equal(publishCount, 0);
});

test('manuscript image auto-resolution stays inside the shared Blog Beta execution lock', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let finishPreparation;
    const manuscriptDraftService = {
        preparePublishPayload: async (input) => {
            input.onProgress({ current: 1, total: 2 });
            return new Promise(resolve => { finishPreparation = resolve; });
        },
        getDraft: () => ({ draftId: 'draft-1', revision: 2 })
    };
    const service = createService(coordinator, async () => ({ success: true, data: { postStatus: 'publish' } }), {}, { manuscriptDraftService });

    const publishing = service.publishManuscriptDraft({ draftId: 'draft-1', revision: 1 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getStatus().source, 'local_markdown');
    assert.equal(coordinator.getStatus().progressStage, 'image_generation');
    assert.equal(coordinator.getStatus().message, 'AI 이미지 1/2개를 생성하고 있습니다.');
    await assert.rejects(
        () => service.localMarkdownPublish({ markdownText: '# 다른 원고' }),
        (error) => error.status === 409 && error.apiCode === 'BLOG_NEXT_EXECUTION_BUSY'
    );

    finishPreparation({
        selectedFiles: [{ name: 'contents.md', textContent: '# 원고' }],
        settings: { targets: ['naver'], postStatus: 'publish' },
        publishPolicy: { draftRevision: 2, forcedDraft: false }
    });
    const result = await publishing;
    assert.equal(result.postStatus, 'publish');
    assert.equal(result.revision, 2);
    assertTerminalStatus(coordinator, {
        state: 'completed', source: 'local_markdown', progressStage: 'finalizing',
        resultStatus: '발행 완료', postStatus: 'publish'
    });
});

test('keeps successful remote publication when local snapshot persistence fails', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let recorded = 0;
    const manuscriptDraftService = {
        assertNotPublished() {},
        async preparePublishPayload() {
            return {
                selectedFiles: [{ name: 'contents.md', textContent: '# 원고' }],
                settings: { targets: ['naver'], postStatus: 'publish' },
                publishPolicy: { draftRevision: 2 }
            };
        },
        markPublished() { recorded += 1; return { draftId: 'draft-1', revision: 2 }; },
        persistPublicationSnapshot() { throw new Error('디스크 쓰기 실패'); }
    };
    const service = createService(coordinator, async () => ({
        success: true,
        data: {
            postStatus: 'publish',
            results: { naver: { success: true, status: 'publish', postUrl: 'https://blog.naver.com/my-blog/123' } }
        }
    }), { NAVER_ID: 'my-blog' }, { manuscriptDraftService });

    const result = await service.publishManuscriptDraft({ draftId: 'draft-1', revision: 2 });
    assert.equal(result.postStatus, 'publish');
    assert.equal(result.archiveSnapshot.success, false);
    assert.equal(recorded, 1);
});

test('local manuscript publishing returns the successful channel completion destination', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const service = createService(coordinator, async () => ({
        success: true,
        data: {
            status: '임시 저장 완료',
            postStatus: 'draft',
            results: { wordpress: { success: true } }
        }
    }), { WORDPRESS_URL: 'https://blog.example' });

    const result = await service.localMarkdownPublish({ markdownText: '# 원고', postStatus: 'draft' });

    assert.deepEqual(result.completionLinks, [{
        platform: 'wordpress',
        kind: 'home',
        label: '워드프레스 열기',
        url: 'https://blog.example/'
    }]);
});

test('local manuscript publishing releases the shared lock after failure', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let calls = 0;
    const service = createService(coordinator, async () => {
        calls += 1;
        if (calls === 1) throw new Error('fixture failure');
        return { success: true, data: { status: '완료' } };
    });

    await assert.rejects(() => service.localMarkdownPublish({ folderName: '원고 폴더' }), /fixture failure/);
    assertTerminalStatus(coordinator, {
        state: 'failed', source: 'local_markdown', message: 'fixture failure',
        resultStatus: 'BLOG_EXECUTION_FAILED'
    });
    assert.deepEqual(await service.localMarkdownPublish({ folderName: '원고 폴더' }), { status: '완료', completionLinks: [] });
});

test('direct AI manuscript generation stays local until the user publishes and imports one platform result', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const calls = [];
    const imageBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const manuscriptDraftService = {
        createAiDraft(input) {
            calls.push(['draft', input]);
            return { draftId: 'draft-ai', revision: 1 };
        }
    };
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model',
        TEXT_MODEL_API_KEY: 'fixture-key',
        IMAGE_MODEL: 'fixture-image-model',
        IMAGE_MODEL_API_KEY: 'fixture-image-key'
    }, {
        License: { async checkLicenseStatus() { return { success: true, features: { enable_related_posts_auto_link: false } }; } },
        Utils: {
            parseStructuredJsonResponse(value) { return JSON.parse(value); },
            parseMarkdown() { return { contents: [{ type: 'image', index: 0, prompt: 'prompt' }] }; },
            async fetchReferenceContent() { return ''; }
        },
        manuscriptDraftService,
        executeQuickPublish: async () => { throw new Error('AI manuscript generation must not use Core'); },
        blogWritingApplication: {
            async generateText(_prompt, context) {
                calls.push(['text', context]);
                return JSON.stringify({ title: 'AI 원고', content: '본문\n\n[[IMAGE_0\nTITLE: 이미지\nPROMPT: prompt\n]]' });
            },
            async generateImage(prompt, options) {
                calls.push(['image', prompt, options]);
                return { mimeType: 'image/png', dataBase64: imageBuffer.toString('base64') };
            }
        }
    });

    const result = await service.createAiManuscriptDraft({ subject: '주제', imageMode: 'generate', imageCount: 1, platforms: ['wordpress'] });
    assert.deepEqual(result, { draftId: 'draft-ai', revision: 1 });
    assert.equal(calls.filter(([kind]) => kind === 'text').length, 1);
    assert.equal(calls.filter(([kind]) => kind === 'image').length, 1);
    const draft = calls.find(([kind]) => kind === 'draft')[1];
    assert.deepEqual(draft.targets, ['wordpress']);
    assert.deepEqual(draft.sourceMetadata, { generationSource: 'configured-ai' });
    assert.equal(draft.images.length, 1);
    assertTerminalStatus(coordinator, {
        state: 'completed', source: 'manuscript_generation', subject: '주제', resultStatus: '작업 완료'
    });
});

test('text-only manuscript generation uses AI Gateway Plugin independently of the publish target', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const calls = [];
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model', TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        License: {
            async checkLicenseStatus() { return { success: true, features: { enable_related_posts_auto_link: false } }; }
        },
        Logger: { info(message) { calls.push(['log', message]); } },
        Utils: {
            parseStructuredJsonResponse(value) { return JSON.parse(value); },
            async fetchReferenceContent() { return ''; },
            async sleep() {}
        },
        blogWritingApplication: {
            async generateText(prompt, context) {
                calls.push(['generate', prompt, context]);
                return JSON.stringify({ title: '제주 산책', content: '제주를 천천히 걷는 이야기입니다.', hashtags: ['제주'] });
            }
        },
        manuscriptDraftService: {
            createAiDraft(input) {
                calls.push(['draft', input]);
                return { draftId: 'draft-wp-plugin', revision: 1 };
            }
        },
        executeQuickPublish: async () => { throw new Error('legacy generation path must not run'); }
    });

    const result = await service.createAiManuscriptDraft({
        subject: '제주 산책', keywords: ['제주'], imageMode: 'none', targets: ['naver']
    });

    assert.deepEqual(result, { draftId: 'draft-wp-plugin', revision: 1 });
    const generation = calls.find(([type]) => type === 'generate');
    const draft = calls.find(([type]) => type === 'draft')[1];
    assert.match(generation[1], /제주 산책/);
    assert.equal(generation[2].signal, undefined);
    assert.equal(draft.imageMode, 'none');
    assert.deepEqual(draft.targets, ['naver']);
    assert.deepEqual(draft.images, []);
    assert.equal(draft.sourceMetadata.generationSource, 'configured-ai');
    assert.match(draft.markdownText, /^# 제주 산책/);
    assert.match(draft.markdownText, /#제주/);
    assert.ok(calls.some(([type, message]) => type === 'log' && /\[AI\] text\.generate 시작 .*provider=/.test(message)));
    assert.ok(calls.some(([type, message]) => type === 'log' && /\[AI\] text\.generate 완료 .*elapsed=/.test(message)));
    assertTerminalStatus(coordinator, {
        state: 'completed', source: 'manuscript_generation', subject: '제주 산책', resultStatus: '작업 완료'
    });
});

test('AI manuscript generation uses AI Gateway for text and every requested image', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const calls = [];
    const imageBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2]);
    const service = createService(coordinator, async () => { throw new Error('Core generation must not run'); }, {
        TEXT_MODEL: 'claude-haiku', TEXT_MODEL_API_KEY: 'text-fixture-key',
        IMAGE_MODEL: 'gemini-nano-banana-2.1', IMAGE_MODEL_API_KEY: 'image-fixture-key',
        TEXT_MODEL_CONFIG: { provider: 'anthropic', name: 'Claude Haiku', code: 'claude-haiku', transport: 'anthropic_openai_compat' },
        IMAGE_MODEL_CONFIG: { provider: 'google', name: 'Nano Banana', code: 'gemini-nano-banana-2.1', transport: 'gemini_generate_content' },
        CONTENT_WRITING_PROFILE: { channel: { length: { preset: 'short' }, image_plan: { count_mode: 'fixed', fixed_count: 2 } } }
    }, {
        License: { async checkLicenseStatus() { return { success: true, features: { enable_related_posts_auto_link: false } }; } },
        Logger: { info(message) { calls.push(['log', message]); }, warn(message) { calls.push(['warn', message]); }, error(message) { calls.push(['error', message]); } },
        Utils: {
            parseStructuredJsonResponse(value) { return JSON.parse(value); },
            parseMarkdown() { return { contents: [
                { type: 'image', index: 0, prompt: 'a mountain' },
                { type: 'image', index: 1, prompt: 'a river' }
            ] }; },
            async fetchReferenceContent() { return ''; },
            async sleep() {}
        },
        executeQuickPublish: async () => { throw new Error('Combined manuscript generation must not use Core fallback'); },
        blogWritingApplication: {
            async generateText(prompt, context) {
                calls.push(['text', prompt, context]);
                return JSON.stringify({
                    title: '산과 강',
                    content: '본문입니다.\n\n[[IMAGE_0\nTITLE: 산\nPROMPT: a mountain\n]]\n\n[[IMAGE_1\nTITLE: 강\nPROMPT: a river\n]]'
                });
            },
            async generateImage(prompt, imageOptions, context) {
                calls.push(['image', prompt, imageOptions, context]);
                return { mimeType: 'image/png', dataBase64: imageBuffer.toString('base64') };
            }
        },
        manuscriptDraftService: { createAiDraft(input) { calls.push(['draft', input]); return { draftId: 'gateway-images', revision: 1 }; } }
    });

    const result = await service.createAiManuscriptDraft({ subject: '산과 강', imageMode: 'generate', imageCount: 2, targets: ['wordpress'] });

    assert.deepEqual(result, { draftId: 'gateway-images', revision: 1 });
    assert.equal(calls.filter(([type]) => type === 'text').length, 1);
    assert.equal(calls.filter(([type]) => type === 'image').length, 2);
    assert.deepEqual(calls.filter(([type]) => type === 'image').map(([, prompt, options]) => [prompt, options]), [
        ['a mountain, photorealistic, high quality, no text', { aspectRatio: '4:3', size: '1K', count: 1 }],
        ['a river, photorealistic, high quality, no text', { aspectRatio: '4:3', size: '1K', count: 1 }]
    ]);
    const draft = calls.find(([type]) => type === 'draft')[1];
    assert.equal(draft.imageMode, 'generate');
    assert.equal(draft.sourceMetadata.generationSource, 'configured-ai');
    assert.deepEqual(draft.images.map(({ index, buffer }) => [index, buffer[8]]), [[0, 2], [1, 2]]);
    assert.ok(calls.some(([type, message]) => type === 'log' && /\[AI\] image.generate 시작 \(1\/2, IMAGE_0, model=gemini-nano-banana-2\.1\)/.test(message)));
    assert.ok(calls.some(([type, message]) => type === 'log' && /\[AI\] 생성 경로 준비 .*text\+image/.test(message)));
    assert.ok(calls.some(([type, message]) => type === 'log' && /\[AI\] image.generate 완료 .*elapsed=/.test(message)));
    assert.ok(!calls.some(([type]) => type === 'error'));
});

test('async AI generation cancellation blocks a late Draft and keeps the lease until generation settles', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const selectedTextModel = { provider: 'openai', code: 'gpt-6-sol', api_key: 'fixture-key' };
    const selectedImageModel = { provider: 'google', code: 'gemini-nano-banana-2.1', api_key: 'fixture-image-key' };
    let finishGeneration;
    let generationContext;
    let draftCalls = 0;
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model', TEXT_MODEL_API_KEY: 'fixture-key',
        TEXT_MODEL_CONFIG: selectedTextModel,
        IMAGE_MODEL_CONFIG: selectedImageModel
    }, {
        License: { async checkLicenseStatus() { return { success: true, features: { enable_related_posts_auto_link: false } }; } },
        Utils: { async fetchReferenceContent() { return ''; }, async sleep() {} },
        manuscriptDraftService: {
            createAiDraft() { draftCalls += 1; return { draftId: 'should-not-exist' }; }
        },
        blogWritingApplication: {
            generateText(_prompt, context) {
                generationContext = context;
                return new Promise((resolve) => { finishGeneration = resolve; });
            },
            async generateImage() { throw new Error('Canceled text generation must not start image generation'); }
        }
    });

    const started = service.startAiManuscriptDraftOperation({ subject: '주제', imageMode: 'none' });
    selectedTextModel.code = 'changed-after-start';
    selectedImageModel.code = 'changed-after-start';
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(coordinator.getStatus().source, 'manuscript_generation');
    assert.equal(generationContext.modelSelection.modelId, 'gpt-6-sol');
    assert.equal(service.cancelAiManuscriptDraftOperation({ operationId: started.operationId }).state, 'cancel_requested');
    assert.equal(generationContext.signal.aborted, true);
    assert.equal(coordinator.getStatus().busy, true);
    finishGeneration(JSON.stringify({ title: '늦은 원고', content: '늦은 본문' }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.getAiManuscriptDraftOperation({ operationId: started.operationId }).state, 'canceled');
    assert.equal(draftCalls, 0);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('manuscript image operations use the shared cancellable AI lifecycle', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let finishGeneration;
    let generationInput;
    const logMessages = [];
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        IMAGE_MODEL: 'nano-banana-2',
        IMAGE_MODEL_API_KEY: 'fixture-key',
        IMAGE_MODEL_CONFIG: { provider: 'kie', code: 'nano-banana-2', transport: 'kie_market_image_jobs', api_key: 'fixture-key' }
    }, {
        Logger: { info: (message) => logMessages.push(message) },
        manuscriptDraftService: {
            generateImage(input) {
                generationInput = input;
                return new Promise((resolve) => { finishGeneration = resolve; });
            }
        }
    });

    const started = service.startManuscriptDraftImageOperation({
        action: 'generate', draftId: 'draft-1', revision: 1, slotId: 'image-2'
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(started.source, 'manuscript_image_generation');
    assert.equal(started.remoteJobPossible, true);
    assert.equal(service.getCurrentAiManuscriptDraftOperation(), null);
    assert.ok(generationInput.signal instanceof AbortSignal);
    assert.equal(service.getManuscriptDraftImageOperation({ operationId: started.operationId }).state, 'running');
    const canceled = service.cancelManuscriptDraftImageOperation({ operationId: started.operationId });
    assert.equal(canceled.state, 'cancel_requested');
    assert.equal(generationInput.signal.aborted, true);
    assert.match(logMessages.at(-1), /이미지 생성 중지 요청/);
    assert.equal(coordinator.getStatus().busy, true);
    finishGeneration({ revision: 2 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.getManuscriptDraftImageOperation({ operationId: started.operationId }).state, 'canceled');
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('AI Gateway failure never falls back to the legacy Core generation path', async () => {
    let legacyCalls = 0;
    const service = createService(createBlogExecutionCoordinator(), async () => ({}), {
        TEXT_MODEL: 'fixture-model', TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        executeQuickPublish: async () => { legacyCalls += 1; },
        Logger: { info() {}, error() {} }
    });
    await assert.rejects(
        service.createAiManuscriptDraft({ subject: '주제', imageMode: 'none' }),
        (error) => error.status === 503 && error.apiCode === 'AI_GATEWAY_UNAVAILABLE'
    );
    assert.equal(legacyCalls, 0);
});

test('direct AI manuscript generation preserves none and excludes upstream image artifacts', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const calls = [];
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model',
        TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        License: { async checkLicenseStatus() { return { success: true, features: { enable_related_posts_auto_link: false } }; } },
        Utils: { parseStructuredJsonResponse(value) { return JSON.parse(value); }, async fetchReferenceContent() { return ''; } },
        manuscriptDraftService: {
            createAiDraft(input) {
                calls.push(['draft', input]);
                return { draftId: 'draft-ai-none', revision: 1 };
            }
        },
        executeQuickPublish: async () => { throw new Error('AI manuscript generation must not use Core'); },
        blogWritingApplication: {
            async generateText(_prompt, context) {
                calls.push(['generate', context]);
                return JSON.stringify({ title: '이미지 없는 원고', content: '본문' });
            }
        }
    });

    const result = await service.createAiManuscriptDraft({ subject: '주제', imageMode: 'none', platforms: ['naver'] });
    assert.deepEqual(result, { draftId: 'draft-ai-none', revision: 1 });
    const draft = calls.find(([kind]) => kind === 'draft')[1];
    assert.equal(draft.imageMode, 'none');
    assert.equal(draft.images.length, 0);
    assert.doesNotMatch(draft.markdownText, /\[\[IMAGE_0/);
    assert.match(draft.markdownText, /본문/);
    assert.equal(draft.sourceMetadata.generationSource, 'configured-ai');
});

test('queue AI manuscript generation reuses the held runner lease instead of acquiring a second lock', async () => {
    const coordinator = createBlogExecutionCoordinator();
    const lease = coordinator.acquire({ source: 'continuous_runner', subject: '대기열 실행' });
    const relatedCalls = [];
    const service = createService(coordinator, async () => ({ success: true }), {
        TEXT_MODEL: 'fixture-model', TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        License: { checkLicenseStatus: async () => ({ success: true, features: { enable_related_posts_auto_link: true } }) },
        Utils: { parseStructuredJsonResponse(value) { return JSON.parse(value); }, async fetchReferenceContent() { return ''; } },
        manuscriptDraftService: {
            createAiDraft(input) {
                return { draftId: 'queue-draft', revision: 1, markdownText: input.markdownText };
            },
            async refreshDraftRelatedPosts(input) {
                relatedCalls.push(input);
                return { draftId: input.draftId, revision: input.revision + 1, relatedPosts: { status: 'included' } };
            }
        },
        executeQuickPublish: async () => { throw new Error('Queue AI manuscript generation must not use Core'); },
        blogWritingApplication: {
            async generateText() { return JSON.stringify({ title: '대기열 원고', content: '본문' }); }
        }
    });
    try {
        const draft = await service.createAiManuscriptDraftForQueue({
            subject: '대기열 주제', imageMode: 'none', targets: ['site-hosting']
        });
        assert.equal(draft.draftId, 'queue-draft');
        assert.equal(draft.revision, 2);
        assert.deepEqual(relatedCalls, [{ draftId: 'queue-draft', revision: 1, enabled: true, force: true }]);
        assert.equal(coordinator.getStatus().source, 'continuous_runner');
    } finally {
        lease.release();
    }
});

test('direct AI manuscript generation rejects missing model setup before execution', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let executed = false;
    const service = createService(coordinator, async () => ({ success: true }), {}, {
        executeQuickPublish: async () => { executed = true; }
    });

    await assert.rejects(
        () => service.createAiManuscriptDraft({ subject: '주제', platforms: ['wordpress'] }),
        (error) => error.status === 400 && error.apiCode === 'AI_TEXT_MODEL_REQUIRED'
    );
    assert.equal(executed, false);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('manual AI image actions reject missing image model before draft mutation', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let generated = false;
    const service = createService(coordinator, async () => ({ success: true }), {}, {
        manuscriptDraftService: {
            generateImage: async () => { generated = true; },
            generateMissingImages: async () => { generated = true; }
        }
    });

    await assert.rejects(
        () => service.generateManuscriptDraftImage({ draftId: 'draft-1', revision: 1, slotId: 'image-0' }),
        (error) => error.status === 400 && error.apiCode === 'AI_IMAGE_MODEL_REQUIRED'
    );
    await assert.rejects(
        () => service.generateMissingManuscriptDraftImages({ draftId: 'draft-1', revision: 1 }),
        (error) => error.status === 400 && error.apiCode === 'AI_IMAGE_MODEL_REQUIRED'
    );
    assert.equal(generated, false);
});

test('direct AI manuscript generation requires an image model only for image generation mode', async () => {
    const coordinator = createBlogExecutionCoordinator();
    let executed = false;
    const service = createService(coordinator, async () => ({ success: true }), {
        TEXT_MODEL: 'fixture-model',
        TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        executeQuickPublish: async () => { executed = true; }
    });

    await assert.rejects(
        () => service.createAiManuscriptDraft({ subject: '주제', imageMode: 'generate', platforms: ['wordpress'] }),
        (error) => error.status === 400 && error.apiCode === 'AI_IMAGE_MODEL_REQUIRED'
    );
    assert.equal(executed, false);
});
