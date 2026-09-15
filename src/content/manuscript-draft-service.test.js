const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Utils = require('../utils');
const { createManuscriptDraftService, detectImageType } = require('./manuscript-draft-service');

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
    const service = createManuscriptDraftService({ fs, path, Utils, workspaceDir });
    const input = folderInput();
    return { workspaceDir, service, input };
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
        assert.equal(service.buildPublishPayload({ draftId: created.draftId, revision: restored.revision }).sourceKind, 'ai');
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

test('rejects Markdown mutation for a folder source without changing its revision', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        assert.throws(
            () => service.updateMarkdown({ draftId: created.draftId, revision: 1, markdownText: '# 변경' }),
            (error) => error.code === 'MANUSCRIPT_DRAFT_SOURCE_READ_ONLY'
        );
        assert.equal(service.getDraft(created.draftId).revision, 1);
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

test('auto-generates prompt-backed folder images before publishing with the requested status', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-publish-images-'));
    const generatedPrompts = [];
    const service = createManuscriptDraftService({
        fs,
        path,
        Utils,
        workspaceDir,
        callWritingImage: async (prompt, savePath) => {
            generatedPrompts.push(prompt);
            const output = `${savePath}.png`;
            fs.writeFileSync(output, PNG);
            return output;
        }
    });
    try {
        const created = service.createFolderDraft({ ...folderInput(), postStatus: 'publish' });
        const payload = await service.preparePublishPayload({ draftId: created.draftId, revision: created.revision });
        assert.deepEqual(generatedPrompts, ['초록 숲']);
        assert.equal(payload.settings.postStatus, 'publish');
        assert.equal(payload.publishPolicy.forcedDraft, false);
        assert.equal(payload.publishPolicy.autoGenerationTargetCount, 1);
        assert.equal(payload.publishPolicy.autoGeneratedCount, 1);
        assert.equal(payload.publishPolicy.autoGenerationFailedCount, 0);
        assert.equal(payload.publishPolicy.draftRevision, 2);
        assert.ok(payload.selectedFiles.some((entry) => /^02_draft-/.test(entry.name)));
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('keeps successful automatic images and falls back to draft when a prompt image still fails', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-partial-images-'));
    const attempts = [];
    const service = createManuscriptDraftService({
        fs,
        path,
        Utils,
        workspaceDir,
        callWritingImage: async (prompt, savePath) => {
            attempts.push(prompt);
            if (prompt === '실패 이미지') throw new Error('provider unavailable');
            const output = `${savePath}.png`;
            fs.writeFileSync(output, PNG);
            return output;
        }
    });
    try {
        const created = service.createPasteDraft({
            markdownText: '# 원고\n\n[[IMAGE_0\ntitle: 성공\nprompt: 성공 이미지\n]]\n\n[[IMAGE_1\ntitle: 실패\nprompt: 실패 이미지\n]]',
            targets: ['naver'],
            postStatus: 'schedule',
            scheduleDate: '2026-09-20T11:30'
        });
        const payload = await service.preparePublishPayload({ draftId: created.draftId, revision: created.revision });
        assert.deepEqual(attempts, ['성공 이미지', '실패 이미지']);
        assert.equal(payload.settings.postStatus, 'draft');
        assert.equal(payload.publishPolicy.requestedPostStatus, 'schedule');
        assert.equal(payload.publishPolicy.forcedDraft, true);
        assert.equal(payload.publishPolicy.autoGeneratedCount, 1);
        assert.equal(payload.publishPolicy.autoGenerationFailedCount, 1);
        assert.equal(service.getDraft(created.draftId).images[0].exists, true);
        assert.equal(service.getDraft(created.draftId).images[1].exists, false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('publishes without an image when a missing slot has no prompt intent', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-no-image-intent-'));
    let generationCalls = 0;
    const service = createManuscriptDraftService({
        fs,
        path,
        Utils,
        workspaceDir,
        callWritingImage: async () => { generationCalls += 1; }
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

test('generates one image from the stored prompt and keeps the prior asset on failure', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-ai-'));
    let fail = false;
    const service = createManuscriptDraftService({
        fs,
        path,
        Utils,
        workspaceDir,
        callWritingImage: async (_prompt, savePath) => {
            if (fail) throw new Error('provider unavailable');
            const output = `${savePath}.png`;
            fs.writeFileSync(output, PNG);
            return output;
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

test('bulk image generation returns the successful partial revision after a later failure', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-draft-bulk-'));
    let calls = 0;
    const service = createManuscriptDraftService({
        fs,
        path,
        Utils,
        workspaceDir,
        callWritingImage: async (_prompt, savePath) => {
            calls += 1;
            if (calls === 2) throw new Error('rate limited');
            const output = `${savePath}.png`;
            fs.writeFileSync(output, PNG);
            return output;
        }
    });
    const input = folderInput();
    input.selectedFiles = input.selectedFiles.slice(0, 1);
    try {
        const created = service.createFolderDraft(input);
        const result = await service.generateMissingImages({ draftId: created.draftId, revision: 1 });
        assert.equal(result.revision, 2);
        assert.equal(result.images[0].exists, true);
        assert.equal(result.images[1].exists, false);
        assert.match(result.imageOperationWarning, /완성한 이미지는 유지/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('marks a handled draft complete without changing its publish revision', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const completed = service.markPublished({ draftId: created.draftId, revision: created.revision });
        assert.equal(completed.revision, created.revision);
        const manifestPath = path.join(workspaceDir, 'manuscript-drafts', created.draftId, 'draft.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.equal(manifest.lifecycle_status, 'completed');
        assert.ok(Date.parse(manifest.completed_at) > 0);
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
        Utils,
        workspaceDir,
        now: () => clock.value,
        activeRetentionMs: 60 * 60 * 1000,
        completedRetentionMs: 60 * 60 * 1000
    };
    try {
        const first = createManuscriptDraftService(options);
        const expiredActive = first.createPasteDraft({ markdownText: '# 오래된 원고', targets: ['naver'] });
        const expiredCompleted = first.createPasteDraft({ markdownText: '# 완료 원고', targets: ['naver'] });
        first.markPublished({ draftId: expiredCompleted.draftId, revision: expiredCompleted.revision });
        clock.value += 2 * 60 * 60 * 1000;
        const recent = first.createPasteDraft({ markdownText: '# 최근 원고', targets: ['naver'] });
        const recentRoot = path.join(workspaceDir, 'manuscript-drafts', recent.draftId);
        fs.writeFileSync(path.join(recentRoot, 'assets', 'abandoned-staging.png'), PNG);
        fs.writeFileSync(path.join(recentRoot, 'source', '00_draft-deadbeef.png'), PNG);

        const restarted = createManuscriptDraftService(options);
        assert.throws(() => restarted.getDraft(expiredActive.draftId), (error) => error.code === 'MANUSCRIPT_DRAFT_NOT_FOUND');
        assert.throws(() => restarted.getDraft(expiredCompleted.draftId), (error) => error.code === 'MANUSCRIPT_DRAFT_NOT_FOUND');
        assert.equal(restarted.getDraft(recent.draftId).title, '최근 원고');
        assert.equal(fs.existsSync(path.join(recentRoot, 'assets', 'abandoned-staging.png')), false);
        assert.equal(fs.existsSync(path.join(recentRoot, 'source', '00_draft-deadbeef.png')), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
