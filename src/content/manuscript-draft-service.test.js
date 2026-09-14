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
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: excluded.revision });
        assert.ok(payload.selectedFiles.some((entry) => entry.name === 'contents.md'));
        assert.ok(!payload.selectedFiles.some((entry) => /^01_/.test(entry.name)));
        assert.throws(
            () => service.buildPublishPayload({ draftId: created.draftId, revision: 1 }),
            (error) => error.code === 'MANUSCRIPT_DRAFT_REVISION_CONFLICT'
        );
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('updates settings as a revision and hides image blocks when images are disabled', () => {
    const { workspaceDir, service, input } = fixture();
    try {
        const created = service.createFolderDraft(input);
        const updated = service.updateSettings({
            draftId: created.draftId,
            revision: created.revision,
            targets: ['naver'],
            postStatus: 'draft',
            imageMode: 'none',
            headless: true
        });
        assert.equal(updated.revision, 2);
        assert.equal(updated.images.length, 0);
        assert.equal(updated.contentItems.some((item) => item.type === 'image'), false);
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: 2 });
        assert.equal(payload.settings.postStatus, 'draft');
        assert.equal(payload.settings.imageMode, 'none');
        assert.ok(payload.selectedFiles.every((entry) => entry.relativePath.startsWith(`draft-${created.draftId}/`)));
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
