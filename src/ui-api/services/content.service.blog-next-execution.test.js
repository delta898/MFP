const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentService } = require('./content.service');
const { createBlogNextExecutionCoordinator } = require('../../blog-next/execution-coordinator');

function createService(coordinator, executeLocalMarkdownPublish, CONFIG = {}, extras = {}) {
    return createContentService({
        CONFIG,
        blogNextExecutionCoordinator: coordinator,
        executeLocalMarkdownPublish,
        ...extras
    });
}

test('local manuscript publishing owns the shared Blog Beta lock until it settles', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('direct publish rejects concurrent settings and image changes before touching the draft', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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
    const coordinator = createBlogNextExecutionCoordinator();
    let finish;
    const service = createService(coordinator, async (input) => {
        input.onNaverProgress({ stage: 'body', current: 2, total: 5, postStatus: 'draft' });
        return new Promise(resolve => { finish = resolve; });
    });
    const publishing = service.localMarkdownPublish({ markdownText: '# 원고', postStatus: 'draft' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getStatus().progressStage, 'body');
    assert.equal(coordinator.getStatus().message, '본문 2/5 구간을 입력하고 있습니다.');
    finish({ success: true, data: { postStatus: 'draft' } });
    await publishing;
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('direct Naver publish exposes a stop signal only after local preparation and settles as stopped', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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
        message: '네이버 포스팅을 중지했습니다. 이미 처리된 저장·발행은 되돌리지 않습니다.'
    });
    await assert.rejects(publishing, (error) => error.apiCode === 'BLOG_NEXT_EXECUTION_STOPPED');
    assert.equal(coordinator.getStatus().state, 'stopped');
});

test('manuscript draft publishing resolves one exact snapshot before using the existing publisher', async () => {
  const coordinator = createBlogNextExecutionCoordinator();
  const published = [];
  const publicationChecks = [];
  const publicationRecords = [];
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
        }
    };
    const service = createService(coordinator, async (input) => {
        published.push(input);
        return { success: true, data: { status: '임시 저장 완료', postStatus: 'draft' } };
    }, {}, { manuscriptDraftService });

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
});

test('duplicate manuscript-target pair is rejected before the publisher is called', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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
    const coordinator = createBlogNextExecutionCoordinator();
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
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('local manuscript publishing returns the successful channel completion destination', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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
    const coordinator = createBlogNextExecutionCoordinator();
    let calls = 0;
    const service = createService(coordinator, async () => {
        calls += 1;
        if (calls === 1) throw new Error('fixture failure');
        return { success: true, data: { status: '완료' } };
    });

    await assert.rejects(() => service.localMarkdownPublish({ folderName: '원고 폴더' }), /fixture failure/);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
    assert.deepEqual(await service.localMarkdownPublish({ folderName: '원고 폴더' }), { status: '완료', completionLinks: [] });
});

test('direct AI manuscript generation stays local until the user publishes and imports one platform result', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const calls = [];
    const manuscriptDraftService = {
        createAiDraft(input) {
            calls.push(['draft', input]);
            return { draftId: 'draft-ai', revision: 1 };
        }
    };
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model',
        TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        manuscriptDraftService,
        executeQuickPublish: async (input, options) => {
            calls.push(['generate', input, options]);
            return {
                success: true,
                data: {
                    previewId: 'preview-1',
                    primaryTarget: 'wordpress',
                    targets: ['wordpress'],
                    previews: {
                        wordpress: {
                            title: 'AI 원고',
                            rawMarkdown: '# AI 원고\n\n[[IMAGE_0\ntitle: 이미지\nprompt: prompt\n]]',
                            images: [{ index: 0, exists: true }]
                        }
                    }
                }
            };
        },
        getQuickPreviewImagePayload: () => ({ binary: true, body: Buffer.from('image') }),
        deleteQuickPublishPreviewSession: (previewId) => calls.push(['dispose-preview', previewId])
    });

    const result = await service.createAiManuscriptDraft({ subject: '주제', platforms: ['wordpress'] });
    assert.deepEqual(result, { draftId: 'draft-ai', revision: 1 });
    assert.equal(calls[0][1].publishMode, 'append_and_generate');
    assert.deepEqual(calls[0][1].targets, ['wordpress']);
    assert.equal(calls[0][1].postStatus, 'draft');
    assert.deepEqual(calls[0][2], { workspaceDraft: true });
    assert.deepEqual(calls[1][1].targets, ['wordpress']);
    assert.deepEqual(calls[1][1].sourceMetadata, { generationProjection: 'wordpress' });
    assert.equal(calls[1][1].images.length, 1);
    assert.deepEqual(calls[2], ['dispose-preview', 'preview-1']);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('async AI generation cancellation blocks a late Draft and keeps the lease until generation settles', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const selectedTextModel = { provider: 'openai', code: 'gpt-6-sol', api_key: 'fixture-key' };
    const selectedImageModel = { provider: 'kie', code: 'nano-banana-2', api_key: 'fixture-image-key' };
    let finishGeneration;
    let draftCalls = 0;
    const disposed = [];
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model', TEXT_MODEL_API_KEY: 'fixture-key',
        TEXT_MODEL_CONFIG: selectedTextModel,
        IMAGE_MODEL_CONFIG: selectedImageModel
    }, {
        manuscriptDraftService: {
            createAiDraft() { draftCalls += 1; return { draftId: 'should-not-exist' }; }
        },
        executeQuickPublish: async (_input, options) => {
            assert.equal(options.workspaceDraft, true);
            assert.ok(options.signal);
            assert.equal(options.textModelConfig.code, 'gpt-6-sol');
            assert.equal(options.imageModelConfig.code, 'nano-banana-2');
            return new Promise((resolve) => { finishGeneration = resolve; });
        },
        deleteQuickPublishPreviewSession: (previewId) => disposed.push(previewId)
    });

    const started = service.startAiManuscriptDraftOperation({ subject: '주제', imageMode: 'none' });
    selectedTextModel.code = 'changed-after-start';
    selectedImageModel.code = 'changed-after-start';
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(coordinator.getStatus().source, 'manuscript_generation');
    assert.equal(service.cancelAiManuscriptDraftOperation({ operationId: started.operationId }).state, 'cancel_requested');
    assert.equal(coordinator.getStatus().busy, true);
    finishGeneration({ success: true, data: {
        previewId: 'preview-late', primaryTarget: 'wordpress',
        previews: { wordpress: { rawMarkdown: '# 늦은 원고', images: [] } }
    } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.getAiManuscriptDraftOperation({ operationId: started.operationId }).state, 'canceled');
    assert.equal(draftCalls, 0);
    assert.deepEqual(disposed, ['preview-late']);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('manuscript image operations use the shared cancellable AI lifecycle', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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

test('AI manuscript failure removes only its owned transient workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-ai-cancel-'));
    const platformDir = path.join(root, 'wp_fixture');
    fs.mkdirSync(platformDir);
    const priorDraft = path.join(platformDir, 'existing-draft');
    fs.mkdirSync(priorDraft);
    let ownedDir = '';
    const service = createService(createBlogNextExecutionCoordinator(), async () => ({}), {
        TEXT_MODEL: 'fixture-model', TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        fs, path, Utils: { resolvePlatformWorkspaceDir: () => platformDir },
        Logger: { warn() {} },
        executeQuickPublish: async (_input, options) => {
            ownedDir = options.transientWorkspaceDir;
            assert.ok(fs.existsSync(ownedDir));
            fs.writeFileSync(path.join(ownedDir, 'contents.md'), 'partial');
            throw new Error('generation failed');
        }
    });
    try {
        await assert.rejects(service.createAiManuscriptDraft({ subject: '주제', imageMode: 'none' }), /generation failed/);
        assert.equal(fs.existsSync(ownedDir), false);
        assert.equal(fs.existsSync(priorDraft), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('direct AI manuscript generation preserves none and excludes upstream image artifacts', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const calls = [];
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {
        TEXT_MODEL: 'fixture-model',
        TEXT_MODEL_API_KEY: 'fixture-key'
    }, {
        manuscriptDraftService: {
            createAiDraft(input) {
                calls.push(['draft', input]);
                return { draftId: 'draft-ai-none', revision: 1 };
            }
        },
        executeQuickPublish: async (input) => {
            calls.push(['generate', input]);
            return {
                success: true,
                data: {
                    previewId: 'preview-none',
                    primaryTarget: 'wordpress',
                    previews: {
                        wordpress: {
                            title: '이미지 없는 원고',
                            rawMarkdown: '# 이미지 없는 원고\n\n[[IMAGE_0\ntitle: 제외할 이미지\nprompt: 제외할 프롬프트\n]]\n\n본문',
                            images: [{ index: 0, exists: true }]
                        }
                    }
                }
            };
        },
        getQuickPreviewImagePayload: () => ({ binary: true, body: Buffer.from('image') }),
        deleteQuickPublishPreviewSession: () => {}
    });

    const result = await service.createAiManuscriptDraft({ subject: '주제', imageMode: 'none', platforms: ['naver'] });
    assert.deepEqual(result, { draftId: 'draft-ai-none', revision: 1 });
    assert.equal(calls[0][1].imageMode, 'none');
    assert.equal(calls[0][1].imageGeneration, false);
    assert.equal(calls[1][1].imageMode, 'none');
    assert.equal(calls[1][1].images.length, 0);
    assert.doesNotMatch(calls[1][1].markdownText, /\[\[IMAGE_0/);
    assert.match(calls[1][1].markdownText, /본문/);
});

test('direct AI manuscript generation rejects missing model setup before execution', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
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
    const coordinator = createBlogNextExecutionCoordinator();
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
    const coordinator = createBlogNextExecutionCoordinator();
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
