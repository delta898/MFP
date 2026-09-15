const test = require('node:test');
const assert = require('node:assert/strict');

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

test('manuscript draft publishing resolves one exact snapshot before using the existing publisher', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    const published = [];
    const manuscriptDraftService = {
        buildPublishPayload(input) {
            assert.deepEqual(input, { draftId: 'draft-1', revision: 4 });
            return {
                folderName: '원고',
                selectedFiles: [{ name: 'contents.md', textContent: '# 원고' }],
                settings: { targets: ['naver'], postStatus: 'draft', imageMode: 'prompt_only', headless: true }
            };
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
    const service = createService(coordinator, async () => ({ success: true, data: {} }), {}, {
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
        getQuickPreviewImagePayload: () => ({ binary: true, body: Buffer.from('image') })
    });

    const result = await service.createAiManuscriptDraft({ subject: '주제', platforms: ['wordpress'] });
    assert.deepEqual(result, { draftId: 'draft-ai', revision: 1 });
    assert.equal(calls[0][1].publishMode, 'append_and_generate');
    assert.deepEqual(calls[0][2], { workspaceDraft: true });
    assert.deepEqual(calls[1][1].targets, ['wordpress']);
    assert.equal(calls[1][1].images.length, 1);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});
