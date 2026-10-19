const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createManuscriptDraftService, detectImageType, validateImageBuffer } = require('./application');
const { createManuscriptImageFileReader } = require('../../../adapters/storage/manuscript-drafts/image-file-reader');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64');

function folderInput() {
    return {
        folderName: 'fixture',
        targets: ['naver'],
        selectedFiles: [
            { relativePath: 'fixture/contents.md', name: 'contents.md', textContent: '# 제목\n\n[[IMAGE_1\ntitle: 첫 이미지\nprompt: 푸른 하늘\n]]\n\n본문\n\n[[IMAGE_2\ntitle: 둘째 이미지\nprompt: 초록 숲\n]]' },
            { relativePath: 'fixture/01_existing.png', name: '01_existing.png', base64Data: PNG.toString('base64') }
        ]
    };
}

function fixture() {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-'));
    const service = createService({ fs, path, workspaceDir });
    const input = folderInput();
    return { workspaceDir, service, input };
}

function createService(options = {}) {
    const fsImpl = options.fs || fs;
    const pathImpl = options.path || path;
    return createManuscriptDraftService({
        ...options,
        findImageByPrefix: options.findImageByPrefix || createManuscriptImageFileReader({ fs: fsImpl, path: pathImpl })
    });
}

test('detects image content by signature instead of filename', () => {
    assert.equal(detectImageType(PNG), 'png');
    assert.equal(detectImageType(Buffer.from('not an image')), '');
});

test('creates a folder draft with stable slots and private image URLs', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const draft = service.createFolderDraft(input);
        assert.equal(draft.revision, 1);
        assert.equal(draft.sourceKind, 'folder');
        assert.equal(draft.images.length, 2);
        assert.equal(draft.images[0].slotId, 'image-1');
        assert.equal(draft.images[0].assetOrigin, 'folder');
        assert.match(draft.images[0].imageUrl, new RegExp(draft.draftId));
        assert.equal(draft.images[1].exists, false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('creates and publishes pasted Markdown through the canonical draft', () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createPasteDraft({
            markdownText: '# 붙여넣은 원고\n\n[[IMAGE_0\ntitle: 첫 이미지\nprompt: 푸른 하늘\n]]\n\n본문',
            targets: ['naver'],
            postStatus: 'publish'
        });
        assert.equal(created.sourceKind, 'paste');
        assert.equal(created.source.type, 'pasted_markdown');
        assert.equal(created.revision, 1);
        assert.equal(created.images[0].slotId, 'image-0');
        assert.equal(created.images[0].exists, false);
        assert.equal(created.stats.imageMissingCount, 1);
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: 1 });
        assert.equal(payload.settings.postStatus, 'draft');
        assert.equal(payload.publishPolicy.forcedDraft, true);
        assert.match(payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent, /붙여넣은 원고/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('uses the current publish request status without mutating the manuscript defaults', async () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createPasteDraft({
            markdownText: '# 임시 저장 원고\n\n본문',
            targets: ['naver'],
            postStatus: 'publish'
        });

        const publishPayload = await service.preparePublishPayload({
            draftId: created.draftId,
            revision: created.revision,
            postStatus: 'draft',
            scheduleDate: ''
        });
        const defaultPayload = service.buildPublishPayload({
            draftId: created.draftId,
            revision: created.revision
        });

        assert.equal(publishPayload.settings.postStatus, 'draft');
        assert.equal(publishPayload.publishPolicy.requestedPostStatus, 'draft');
        assert.equal(publishPayload.settings.scheduleDate, '');
        assert.equal(defaultPayload.settings.postStatus, 'publish');
        assert.throws(() => service.buildPublishPayload({
            draftId: created.draftId,
            revision: created.revision,
            postStatus: 'public'
        }), (error) => error.code === 'MANUSCRIPT_POST_STATUS_INVALID');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('keeps image asset identity attached to its stable block id after Markdown reorder', () => {
    const { workspaceDir, service } = fixture();
    const firstId = 'mb-11111111-1111-4111-8111-111111111111';
    const secondId = 'mb-22222222-2222-4222-8222-222222222222';
    const firstBlock = `[[IMAGE_0\nid: ${firstId}\ntitle: 첫 이미지\nprompt: 푸른 하늘\n]]`;
    const secondBlock = `[[IMAGE_1\nid: ${secondId}\ntitle: 둘째 이미지\nprompt: 초록 숲\n]]`;
    try {
        const created = service.createPasteDraft({
            markdownText: `# 초안\n\n${firstBlock}\n\n${secondBlock}`,
            targets: ['naver']
        });
        const imported = service.importLocalImage({
            draftId: created.draftId,
            revision: created.revision,
            slotId: `image-${firstId}`,
            base64Data: PNG.toString('base64')
        });
        const updated = service.updateMarkdown({
            draftId: created.draftId,
            revision: imported.revision,
            markdownText: `# 초안\n\n${secondBlock}\n\n${firstBlock}`
        });
        const first = updated.images.find((image) => image.blockId === firstId);
        const second = updated.images.find((image) => image.blockId === secondId);
        assert.equal(first.slotId, `image-${firstId}`);
        assert.equal(first.exists, true);
        assert.equal(first.fileName, imported.images.find((image) => image.blockId === firstId).fileName);
        assert.equal(second.slotId, `image-${secondId}`);
        assert.equal(second.exists, false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('removes only the attached generated or user asset while preserving the image block', () => {
    const { workspaceDir, service } = fixture();
    const blockId = 'mb-33333333-3333-4333-8333-333333333333';
    try {
        const created = service.createPasteDraft({
            markdownText: `# 초안\n\n[[IMAGE_0\nid: ${blockId}\ntitle: 이미지 제목\nprompt: 푸른 하늘\n]]`,
            targets: ['naver']
        });
        const imported = service.importLocalImage({
            draftId: created.draftId,
            revision: created.revision,
            slotId: `image-${blockId}`,
            base64Data: PNG.toString('base64')
        });
        const attachedFile = imported.images[0].fileName;
        assert.ok(fs.existsSync(path.join(workspaceDir, 'manuscript-drafts', created.draftId, 'source', attachedFile)));
        const removed = service.removeImage({
            draftId: created.draftId,
            revision: imported.revision,
            slotId: `image-${blockId}`
        });
        assert.equal(removed.images[0].exists, false);
        assert.equal(removed.images[0].title, '이미지 제목');
        assert.equal(removed.images[0].prompt, '푸른 하늘');
        assert.equal(fs.existsSync(path.join(workspaceDir, 'manuscript-drafts', created.draftId, 'source', attachedFile)), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('deleting an image block cleans its unreferenced app-owned image after the draft update', () => {
    const { workspaceDir, service } = fixture();
    const blockId = 'mb-44444444-4444-4444-8444-444444444444';
    try {
        const created = service.createPasteDraft({
            markdownText: `# 초안\n\n[[IMAGE_0\nid: ${blockId}\ntitle: 이미지 제목\nprompt: 푸른 하늘\n]]`,
            targets: ['naver']
        });
        const imported = service.importLocalImage({
            draftId: created.draftId,
            revision: created.revision,
            slotId: `image-${blockId}`,
            base64Data: PNG.toString('base64')
        });
        const attachedFile = imported.images[0].fileName;
        const updated = service.updateMarkdown({
            draftId: created.draftId,
            revision: imported.revision,
            markdownText: '# 초안\n\n본문만 남깁니다.'
        });
        assert.equal(updated.images.length, 0);
        assert.equal(fs.existsSync(path.join(workspaceDir, 'manuscript-drafts', created.draftId, 'source', attachedFile)), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('creates one AI draft from generated Markdown and preserves generated originals', () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createAiDraft({
            markdownText: '# AI 원고\n\n[[IMAGE_0\ntitle: 생성 이미지\nprompt: 햇살 드는 작업실\n]]\n\n본문',
            images: [{ index: 0, buffer: PNG }],
            targets: ['wordpress'],
            sourceLabel: 'AI 원고'
        });
        assert.equal(created.sourceKind, 'ai');
        assert.equal(created.source.type, 'generated_quick_post');
        assert.equal(created.images[0].assetOrigin, 'generated');
        const replaced = service.importLocalImage({
            draftId: created.draftId,
            revision: created.revision,
            slotId: 'image-0',
            base64Data: PNG.toString('base64')
        });
        const restored = service.restoreImage({ draftId: created.draftId, revision: replaced.revision, slotId: 'image-0' });
        assert.equal(restored.images[0].assetOrigin, 'generated');
        const edited = service.updateMarkdown({
            draftId: created.draftId,
            revision: restored.revision,
            markdownText: restored.rawMarkdown.replace('# AI 원고', '# 수정한 AI 원고').replace('본문', '수정한 본문')
        });
        assert.equal(edited.title, '수정한 AI 원고');
        assert.equal(edited.images[0].assetOrigin, 'generated');
        assert.equal(service.buildPublishPayload({ draftId: created.draftId, revision: edited.revision }).sourceKind, 'ai');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('rejects multiple publish targets for every canonical manuscript source', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        assert.throws(
            () => service.createFolderDraft({ ...input, targets: ['naver', 'wordpress'] }),
            (error) => error.code === 'MULTIPLE_PUBLISH_TARGETS'
        );
        assert.throws(
            () => service.createPasteDraft({ markdownText: '# 원고', targets: ['naver', 'wordpress'] }),
            (error) => error.code === 'MULTIPLE_PUBLISH_TARGETS'
        );
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('updates pasted Markdown while preserving matching image slot state', () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createPasteDraft({
            markdownText: '# 초안\n\n[[IMAGE_0\ntitle: 이미지\nprompt: 첫 프롬프트\n]]\n\n본문',
            targets: ['naver']
        });
        const imported = service.importLocalImage({
            draftId: created.draftId,
            revision: created.revision,
            slotId: 'image-0',
            base64Data: PNG.toString('base64')
        });
        const updated = service.updateMarkdown({
            draftId: created.draftId,
            revision: imported.revision,
            markdownText: '# 수정된 원고\n\n본문 변경\n\n[[IMAGE_0\ntitle: 이미지 변경\nprompt: 새 프롬프트\n]]',
            targets: ['naver'],
            postStatus: 'publish'
        });
        assert.equal(updated.title, '수정된 원고');
        assert.equal(updated.images[0].exists, true);
        assert.equal(updated.images[0].assetOrigin, 'user');
        assert.equal(updated.images[0].prompt, '새 프롬프트');
        assert.equal(updated.stats.imageMissingCount, 0);
        assert.equal(service.getImage({ draftId: created.draftId, slotId: 'image-0', revision: updated.revision }).contentType, 'image/png');

        const excluded = service.excludeImage({ draftId: created.draftId, revision: updated.revision, slotId: 'image-0' });
        const retained = service.updateMarkdown({
            draftId: created.draftId,
            revision: excluded.revision,
            markdownText: '# 다시 수정\n\n[[IMAGE_0\ntitle: 이미지\nprompt: 또 다른 프롬프트\n]]'
        });
        assert.equal(retained.images[0].excluded, true);
        assert.equal(retained.stats.imageMissingCount, 0);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('edits a folder draft copy and keeps folder images attached to stable block ids after reorder', () => {
    const { workspaceDir, service, input } = fixture();
    const firstId = 'mb-33333333-3333-4333-8333-333333333333';
    const secondId = 'mb-44444444-4444-4444-8444-444444444444';
    try {
        const created = service.createFolderDraft(input);
        const hydrated = service.updateMarkdown({
            draftId: created.draftId,
            revision: created.revision,
            markdownText: `# 제목\n\n[[IMAGE_1\nid: ${firstId}\ntitle: 첫 이미지\nprompt: 수정된 프롬프트\n]]\n\n[[IMAGE_2\nid: ${secondId}\ntitle: 둘째 이미지\nprompt: 초록 숲\n]]\n\n본문`
        });
        assert.equal(hydrated.revision, 2);
        assert.equal(hydrated.images[0].assetOrigin, 'folder');
        assert.equal(hydrated.images[0].blockId, firstId);
        const reordered = service.updateMarkdown({
            draftId: created.draftId,
            revision: hydrated.revision,
            markdownText: `# 제목 변경\n\n[[IMAGE_2\nid: ${secondId}\ntitle: 둘째 이미지\nprompt: 새 prompt\n]]\n\n[[IMAGE_1\nid: ${firstId}\ntitle: 첫 이미지\nprompt: 푸른 하늘\n]]`
        });
        assert.deepEqual(reordered.images.map((image) => image.blockId), [secondId, firstId]);
        assert.deepEqual(reordered.images.map((image) => image.fileName), ['', '01_existing.png']);
        assert.deepEqual(reordered.images.map((image) => image.assetOrigin), ['', 'folder']);
        assert.match(reordered.rawMarkdown, /# 제목 변경/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('supports IMAGE_0 for preview and replacement', () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createFolderDraft({
            folderName: 'zero-index',
            targets: ['naver'],
            selectedFiles: [
                { relativePath: 'zero-index/contents.md', name: 'contents.md', textContent: '# 제목\n\n[[IMAGE_0\ntitle: 첫 이미지\nprompt: 첫 프롬프트\n]]' },
                { relativePath: 'zero-index/00_existing.png', name: '00_existing.png', base64Data: PNG.toString('base64') }
            ]
        });
        assert.equal(created.images[0].slotId, 'image-0');
        assert.equal(service.getImage({ draftId: created.draftId, slotId: 'image-0', revision: 1 }).contentType, 'image/png');
        const replaced = service.importLocalImage({
            draftId: created.draftId,
            revision: 1,
            slotId: 'image-0',
            base64Data: PNG.toString('base64')
        });
        assert.equal(replaced.revision, 2);
        assert.equal(replaced.images[0].assetOrigin, 'user');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('imports, excludes, and restores an image with revision checks', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const imported = service.importLocalImage({ draftId: created.draftId, revision: 1, slotId: 'image-2', base64Data: PNG.toString('base64') });
        assert.equal(imported.revision, 2);
        assert.equal(imported.images[1].assetOrigin, 'user');
        assert.throws(
            () => service.excludeImage({ draftId: created.draftId, revision: 1, slotId: 'image-2' }),
            (error) => error.code === 'MANUSCRIPT_DRAFT_REVISION_CONFLICT'
        );
        const excluded = service.excludeImage({ draftId: created.draftId, revision: 2, slotId: 'image-1' });
        assert.equal(excluded.images[0].exists, false);
        assert.equal(excluded.images[0].canRestore, true);
        const restored = service.restoreImage({ draftId: created.draftId, revision: 3, slotId: 'image-1' });
        assert.equal(restored.images[0].assetOrigin, 'folder');
        assert.equal(restored.revision, 4);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('rejects disguised local image input without changing the draft', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        assert.throws(
            () => service.importLocalImage({ draftId: created.draftId, revision: 1, slotId: 'image-2', base64Data: Buffer.from('hello').toString('base64') }),
            (error) => error.code === 'MANUSCRIPT_IMAGE_TYPE_UNSUPPORTED'
        );
        assert.equal(service.getDraft(created.draftId).revision, 1);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('accepts manuscript images up to 20MB and rejects larger files', () => {
    const maxBytes = 20 * 1024 * 1024;
    const atLimit = Buffer.alloc(maxBytes);
    PNG.copy(atLimit);
    assert.deepEqual(validateImageBuffer(atLimit), { extension: '.png', mimeType: 'image/png' });

    const overLimit = Buffer.alloc(maxBytes + 1);
    PNG.copy(overLimit);
    assert.throws(() => validateImageBuffer(overLimit), (error) => error.code === 'MANUSCRIPT_IMAGE_TOO_LARGE');
});

test('publishes an exact revision snapshot and omits excluded images', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const excluded = service.excludeImage({ draftId: created.draftId, revision: 1, slotId: 'image-1' });
        assert.equal(excluded.images[0].excluded, true);
        assert.equal(excluded.stats.imageExcludedCount, 1);
        assert.equal(excluded.stats.imageMissingCount, 1);
        assert.equal(excluded.contentItems.some((item) => item.type === 'image' && item.index === 1), false);
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: excluded.revision });
        assert.ok(payload.selectedFiles.some((entry) => entry.name === 'contents.md'));
        assert.ok(!payload.selectedFiles.some((entry) => /^01_/.test(entry.name)));
        assert.ok(!payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent.includes('IMAGE_1'));
        assert.equal(payload.publishPolicy.forcedDraft, true);
        assert.equal(payload.publishPolicy.unresolvedImageCount, 1);
        assert.throws(
            () => service.buildPublishPayload({ draftId: created.draftId, revision: 1 }),
            (error) => error.code === 'MANUSCRIPT_DRAFT_REVISION_CONFLICT'
        );
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('keeps image handling WYSIWYG-owned and excludes intentional omissions from the draft safety rule', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const updated = service.updateSettings({
            draftId: created.draftId,
            revision: created.revision,
            targets: ['naver'],
            postStatus: 'publish',
            imageMode: 'generate',
            headless: true
        });
        assert.equal(updated.revision, 2);
        assert.equal(updated.images.length, 2);
        assert.equal(updated.contentItems.some((item) => item.type === 'image'), true);
        const safetyPayload = service.buildPublishPayload({ draftId: created.draftId, revision: 2 });
        assert.equal(safetyPayload.settings.postStatus, 'draft');
        assert.equal(safetyPayload.settings.imageMode, 'prompt_only');
        assert.equal(safetyPayload.publishPolicy.forcedDraft, true);
        const excluded = service.excludeImage({ draftId: created.draftId, revision: 2, slotId: 'image-2' });
        assert.equal(excluded.images[1].excluded, true);
        assert.equal(excluded.stats.imageMissingCount, 0);
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: 3 });
        assert.equal(payload.settings.postStatus, 'publish');
        assert.equal(payload.publishPolicy.forcedDraft, false);
        assert.ok(payload.selectedFiles.every((entry) => entry.relativePath.startsWith(`draft-${created.draftId}/`)));
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('does not generate prompt-backed folder images during posting and keeps the prompt for temporary save', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-publish-images-'));
    const generatedPrompts = [];
    const progress = [];
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async (prompt) => {
            generatedPrompts.push(prompt);
            return { dataBase64: PNG.toString('base64'), mimeType: 'image/png' };
        }
    });
    try {
        const created = service.createFolderDraft({ ...folderInput(), postStatus: 'publish' });
        const payload = await service.preparePublishPayload({
            draftId: created.draftId, revision: created.revision,
            onProgress: (update) => progress.push(update)
        });
        assert.deepEqual(progress, []);
        assert.deepEqual(generatedPrompts, []);
        assert.equal(payload.settings.postStatus, 'draft');
        assert.equal(payload.publishPolicy.forcedDraft, true);
        assert.equal(payload.publishPolicy.requestedPostStatus, 'publish');
        assert.equal(payload.publishPolicy.unresolvedImageCount, 1);
        assert.equal(payload.publishPolicy.autoGenerationTargetCount, 0);
        assert.equal(payload.publishPolicy.autoGeneratedCount, 0);
        assert.equal(payload.publishPolicy.autoGenerationFailedCount, 0);
        assert.equal(payload.publishPolicy.draftRevision, 1);
        assert.equal(payload.selectedFiles.some((entry) => /^02_draft-/.test(entry.name)), false);
        assert.match(payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent, /초록 숲/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('does not generate unresolved AI draft images during posting and keeps the prompt for temporary save', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-ai-prepublish-images-'));
    let generationCalls = 0;
    const progress = [];
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async () => { generationCalls += 1; return { dataBase64: PNG.toString('base64') }; }
    });
    try {
        const created = service.createAiDraft({
            markdownText: '# AI 원고\n\n[[IMAGE_0\ntitle: 작업실\nprompt: 햇살 드는 작업실\n]]\n\n본문',
            images: [],
            targets: ['naver'],
            postStatus: 'publish',
            imageMode: 'generate'
        });
        const payload = await service.preparePublishPayload({
            draftId: created.draftId,
            revision: created.revision,
            onProgress: (update) => progress.push(update)
        });
        const markdown = payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent;
        assert.equal(generationCalls, 0);
        assert.deepEqual(progress, []);
        assert.equal(payload.settings.postStatus, 'draft');
        assert.equal(payload.publishPolicy.requestedPostStatus, 'publish');
        assert.equal(payload.publishPolicy.effectivePostStatus, 'draft');
        assert.equal(payload.publishPolicy.unresolvedImageCount, 1);
        assert.equal(payload.publishPolicy.forcedDraft, true);
        assert.equal(payload.publishPolicy.autoGenerationTargetCount, 0);
        assert.equal(payload.publishPolicy.autoGeneratedCount, 0);
        assert.match(markdown, /햇살 드는 작업실/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('does not generate unresolved pasted images during posting and preserves them for temporary save', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-partial-images-'));
    const attempts = [];
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async (prompt) => { attempts.push(prompt); return { dataBase64: PNG.toString('base64') }; }
    });
    try {
        const created = service.createPasteDraft({
            markdownText: '# 원고\n\n[[IMAGE_0\ntitle: 성공\nprompt: 성공 이미지\n]]\n\n[[IMAGE_1\ntitle: 실패\nprompt: 실패 이미지\n]]',
            targets: ['naver'],
            postStatus: 'schedule',
            scheduleDate: '2026-09-20T11:30'
        });
        const payload = await service.preparePublishPayload({ draftId: created.draftId, revision: created.revision });
        assert.deepEqual(attempts, []);
        assert.equal(payload.settings.postStatus, 'draft');
        assert.equal(payload.publishPolicy.requestedPostStatus, 'schedule');
        assert.equal(payload.publishPolicy.forcedDraft, true);
        assert.equal(payload.publishPolicy.unresolvedImageCount, 2);
        assert.equal(payload.publishPolicy.autoGenerationTargetCount, 0);
        assert.equal(payload.publishPolicy.autoGeneratedCount, 0);
        assert.equal(payload.publishPolicy.autoGenerationFailedCount, 0);
        assert.equal(service.getDraft(created.draftId).images[0].exists, false);
        assert.equal(service.getDraft(created.draftId).images[1].exists, false);
        const markdown = payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent;
        assert.match(markdown, /성공 이미지/);
        assert.match(markdown, /실패 이미지/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('publishes without an image when a missing slot has no prompt intent', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-no-image-intent-'));
    let generationCalls = 0;
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async () => { generationCalls += 1; return { dataBase64: PNG.toString('base64') }; }
    });
    try {
        const created = service.createPasteDraft({
            markdownText: '# 이미지 없는 원고\n\n[[IMAGE_0\ntitle:\nprompt:\n]]\n\n본문',
            targets: ['wordpress'],
            postStatus: 'publish'
        });
        const payload = await service.preparePublishPayload({ draftId: created.draftId, revision: created.revision });
        assert.equal(generationCalls, 0);
        assert.equal(payload.settings.postStatus, 'publish');
        assert.equal(payload.publishPolicy.unresolvedImageCount, 0);
        assert.equal(payload.publishPolicy.forcedDraft, false);
        assert.doesNotMatch(payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent, /IMAGE_0/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('publishes an image-free AI draft without invoking image generation', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-ai-no-images-'));
    let generationCalls = 0;
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async () => { generationCalls += 1; return { dataBase64: PNG.toString('base64') }; }
    });
    try {
        const created = service.createAiDraft({
            markdownText: '# 이미지 없는 AI 원고\n\n본문',
            images: [],
            targets: ['naver'],
            postStatus: 'publish',
            imageMode: 'none'
        });
        assert.equal(created.images.length, 0);
        const payload = await service.preparePublishPayload({ draftId: created.draftId, revision: created.revision });
        assert.equal(generationCalls, 0);
        assert.equal(payload.publishPolicy.autoGenerationTargetCount, 0);
        assert.equal(payload.publishPolicy.autoGeneratedCount, 0);
        assert.equal(payload.settings.postStatus, 'publish');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('generates one image from the stored prompt and keeps the prior asset on failure', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-ai-'));
    let fail = false;
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async () => {
            if (fail) throw new Error('provider unavailable');
            return { dataBase64: PNG.toString('base64'), mimeType: 'image/png' };
        }
    });
    const input = folderInput();
    try {
        const created = service.createFolderDraft(input);
        const generated = await service.generateImage({ draftId: created.draftId, revision: 1, slotId: 'image-2' });
        assert.equal(generated.images[1].assetOrigin, 'generated');
        fail = true;
        await assert.rejects(
            service.generateImage({ draftId: created.draftId, revision: 2, slotId: 'image-2' }),
            /provider unavailable/
        );
        const preserved = service.getDraft(created.draftId);
        assert.equal(preserved.revision, 2);
        assert.equal(preserved.images[1].assetOrigin, 'generated');
        assert.equal(preserved.images[1].exists, true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('manuscript image generation stores AI Gateway base64 output as a validated generated asset', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-gateway-image-'));
    const calls = [];
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async (prompt, context) => {
            calls.push({ prompt, context });
            return { mimeType: 'image/png', dataBase64: PNG.toString('base64') };
        }
    });
    try {
        const created = service.createFolderDraft(folderInput());
        const generated = await service.generateImage({
            draftId: created.draftId, revision: created.revision, slotId: 'image-2'
        });
        assert.equal(calls[0].prompt, '초록 숲');
        assert.equal(generated.images[1].assetOrigin, 'generated');
        assert.equal(generated.images[1].exists, true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('stopped image generation does not commit a late provider result to the manuscript', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-image-stop-'));
    let finishGeneration;
    let receivedSignal;
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async (_prompt, options) => {
            receivedSignal = options.signal;
            return new Promise((resolve) => { finishGeneration = () => {
                resolve({ dataBase64: PNG.toString('base64'), mimeType: 'image/png' });
            }; });
        }
    });
    try {
        const created = service.createFolderDraft(folderInput());
        const controller = new AbortController();
        const generating = service.generateImage({
            draftId: created.draftId, revision: created.revision, slotId: 'image-2', signal: controller.signal
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(receivedSignal, controller.signal);
        controller.abort();
        finishGeneration();
        await assert.rejects(generating, (error) => error.code === 'AI_GENERATION_CANCELED');
        const current = service.getDraft(created.draftId);
        assert.equal(current.revision, created.revision);
        assert.equal(current.images[1].exists, false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('bulk image generation returns the successful partial revision after a later failure', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-bulk-'));
    let calls = 0;
    const service = createService({
        fs,
        path,
        workspaceDir,
        generateAiImage: async () => {
            calls += 1;
            if (calls === 2) throw new Error('rate limited');
            return { dataBase64: PNG.toString('base64'), mimeType: 'image/png' };
        }
    });
    const input = folderInput();
    input.selectedFiles = input.selectedFiles.slice(0, 1);
    try {
        const created = service.createFolderDraft(input);
        const progress = [];
        const result = await service.generateMissingImages({
            draftId: created.draftId,
            revision: 1,
            onProgress: (value) => progress.push(value)
        });
        assert.equal(result.revision, 2);
        assert.equal(result.images[0].exists, true);
        assert.equal(result.images[1].exists, false);
        assert.match(result.imageOperationWarning, /완성한 이미지는 유지/);
        assert.deepEqual(progress.map(({ phase, completed }) => ({ phase, completed })), [
            { phase: 'generating', completed: 0 },
            { phase: 'completed', completed: 1 },
            { phase: 'generating', completed: 1 }
        ]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('records a target publication without changing the manuscript revision', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const published = service.markPublished({ draftId: created.draftId, revision: created.revision, target: 'naver' });
        assert.equal(published.revision, created.revision);
        assert.deepEqual(published.publishedTargets, ['naver']);
        const manifestPath = path.join(workspaceDir, 'manuscript-drafts', created.draftId, 'draft.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.equal(manifest.lifecycle_status, 'active');
        assert.equal(manifest.publication_history.length, 1);
        assert.equal(manifest.publication_history[0].target, 'naver');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('persists a successful publication snapshot under the platform folder with an eight-character id', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: created.revision });
        service.markPublished({ draftId: created.draftId, revision: created.revision, target: 'naver', postStatus: 'draft' });
        const saved = service.persistPublicationSnapshot({
            draftId: created.draftId,
            revision: created.revision,
            target: 'naver',
            platformIdentity: 'my-blog',
            postStatus: 'draft',
            postUrl: 'https://blog.naver.com/my-blog/123',
            remotePostId: '123',
            files: payload.selectedFiles
        });

        assert.match(saved.publicationId, /^[A-Za-z0-9_-]{8}$/);
        const snapshotRoot = path.join(workspaceDir, 'naver_my-blog', saved.publicationId);
        assert.equal(fs.existsSync(path.join(snapshotRoot, 'contents.md')), true);
        assert.equal(fs.existsSync(path.join(snapshotRoot, '01_existing.png')), true);
        const metadata = JSON.parse(fs.readFileSync(path.join(snapshotRoot, 'publication.json'), 'utf8'));
        assert.equal(metadata.platform, 'naver');
        assert.equal(metadata.post_status, 'draft');
        assert.equal(metadata.post_url, 'https://blog.naver.com/my-blog/123');
        assert.equal(metadata.remote_post_id, '123');
        assert.equal(metadata.publication_id, saved.publicationId);
        assert.equal(fs.existsSync(path.join(workspaceDir, '.publication-staging')), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('persists WordPress publication snapshots under the site host with remote post metadata', () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createPasteDraft({ markdownText: '# 워드프레스 원고\n\n본문', targets: ['wordpress'] });
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: created.revision });
        service.markPublished({ draftId: created.draftId, revision: created.revision, target: 'wordpress' });
        const saved = service.persistPublicationSnapshot({
            draftId: created.draftId,
            revision: created.revision,
            target: 'wordpress',
            platformIdentity: 'https://blog.example.com/wp-json',
            postStatus: 'publish',
            postUrl: 'https://blog.example.com/2026/post/',
            remotePostId: '456',
            files: payload.selectedFiles
        });

        const snapshotRoot = path.join(workspaceDir, 'wp_blog.example.com', saved.publicationId);
        assert.equal(fs.existsSync(path.join(snapshotRoot, 'contents.md')), true);
        const metadata = JSON.parse(fs.readFileSync(path.join(snapshotRoot, 'publication.json'), 'utf8'));
        assert.equal(metadata.platform_identity, 'https://blog.example.com/wp-json');
        assert.equal(metadata.post_url, 'https://blog.example.com/2026/post/');
        assert.equal(metadata.remote_post_id, '456');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('does not persist a publication snapshot before the draft records a successful post', () => {
    const { workspaceDir, service } = fixture();
    try {
        const created = service.createPasteDraft({ markdownText: '# 보관 전 원고', targets: ['wordpress'] });
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: created.revision });
        assert.throws(() => service.persistPublicationSnapshot({
            draftId: created.draftId,
            revision: created.revision,
            target: 'wordpress',
            platformIdentity: 'https://blog.example',
            files: payload.selectedFiles
        }), (error) => error.code === 'MANUSCRIPT_PUBLICATION_NOT_RECORDED');
        assert.equal(fs.existsSync(path.join(workspaceDir, 'wp_blog.example')), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('duplicate publication is scoped to manuscript version and target platform', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const contentVersion = created.contentVersion;
        service.markPublished({ draftId: created.draftId, revision: created.revision, target: 'naver', postStatus: 'draft' });
        const duplicate = (error) => error.code === 'MANUSCRIPT_ALREADY_PUBLISHED_TO_TARGET';
        assert.throws(() => service.assertNotPublished({ draftId: created.draftId, revision: created.revision, target: 'naver' }), duplicate);

        const changedSettings = service.updateSettings({
            draftId: created.draftId,
            revision: created.revision,
            targets: ['wordpress'],
            postStatus: 'publish',
            wordpressCategory: 'News'
        });
        assert.equal(changedSettings.contentVersion, contentVersion);
        assert.deepEqual(changedSettings.publishedTargets, ['naver']);
        assert.throws(() => service.assertNotPublished({ draftId: created.draftId, revision: changedSettings.revision, target: 'naver' }), duplicate);
        assert.doesNotThrow(() => service.assertNotPublished({ draftId: created.draftId, revision: changedSettings.revision, target: 'wordpress' }));
        const wordpressPublished = service.markPublished({
            draftId: created.draftId,
            revision: changedSettings.revision,
            target: 'wordpress',
            postStatus: 'publish'
        });
        assert.deepEqual(wordpressPublished.publishedTargets, ['naver', 'wordpress']);

        const changedImage = service.excludeImage({
            draftId: created.draftId,
            revision: changedSettings.revision,
            slotId: 'image-1'
        });
        assert.notEqual(changedImage.contentVersion, contentVersion);
        assert.deepEqual(changedImage.publishedTargets, []);
        assert.doesNotThrow(() => service.assertNotPublished({ draftId: created.draftId, revision: changedImage.revision, target: 'naver' }));
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('startup cleanup removes expired drafts while preserving recent work', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-lifecycle-'));
    const clock = { value: Date.parse('2026-09-15T12:00:00.000Z') };
    const options = {
        fs,
        path,
        workspaceDir,
        now: () => clock.value,
        activeRetentionMs: 60 * 60 * 1000,
        completedRetentionMs: 60 * 60 * 1000
    };
    try {
        const first = createService(options);
        const expiredActive = first.createPasteDraft({ markdownText: '# 오래된 원고', targets: ['naver'] });
        const expiredPublished = first.createPasteDraft({ markdownText: '# 발행한 원고', targets: ['naver'] });
        first.markPublished({ draftId: expiredPublished.draftId, revision: expiredPublished.revision, target: 'naver' });
        clock.value += 2 * 60 * 60 * 1000;
        const recent = first.createPasteDraft({ markdownText: '# 최근 원고', targets: ['naver'] });
        const recentRoot = path.join(workspaceDir, 'manuscript-drafts', recent.draftId);
        fs.writeFileSync(path.join(recentRoot, 'assets', 'abandoned-staging.png'), PNG);
        fs.writeFileSync(path.join(recentRoot, 'source', '00_draft-deadbeef.png'), PNG);

        const restarted = createService(options);
        assert.throws(() => restarted.getDraft(expiredActive.draftId), (error) => error.code === 'MANUSCRIPT_DRAFT_NOT_FOUND');
        assert.throws(() => restarted.getDraft(expiredPublished.draftId), (error) => error.code === 'MANUSCRIPT_DRAFT_NOT_FOUND');
        assert.equal(restarted.getDraft(recent.draftId).title, '최근 원고');
        assert.equal(fs.existsSync(path.join(recentRoot, 'assets', 'abandoned-staging.png')), false);
        assert.equal(fs.existsSync(path.join(recentRoot, 'source', '00_draft-deadbeef.png')), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
