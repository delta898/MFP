const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Utils = require('../utils');
const Core = require('../core');
const { createManuscriptDraftService } = require('./manuscript-draft-service');

function fixture(gateway) {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manuscript-related-'));
    const service = createManuscriptDraftService({ fs, path, Utils, workspaceDir, relatedPosts: gateway });
    return { workspaceDir, service };
}

function stubGateway(overrides = {}) {
    const calls = [];
    return {
        calls,
        fetchPosts: async (context) => {
            calls.push(context);
            return [
                { title: '첫 글', url: 'https://blog.naver.com/fixture/1' },
                { title: '둘째 글', url: 'https://blog.naver.com/fixture/2' }
            ];
        },
        pickHeading: () => '함께 보면 좋은 글',
        stripSection: (text) => String(text || ''),
        buildSection: (posts, heading) => Core.buildRelatedPostsSectionMarkdown(posts, heading, true),
        toMobileUrl: (url) => Utils.toMobileNaverBlogPostUrl(url),
        ...overrides
    };
}

test('new drafts expose a disabled related-posts state until finalized', () => {
    const { workspaceDir, service } = fixture(stubGateway());
    try {
        const created = service.createPasteDraft({ markdownText: '# 제목\n\n본문', targets: ['naver'] });
        assert.equal(created.relatedPosts.status, 'disabled');
        assert.equal(created.relatedPosts.enabled, false);
        assert.doesNotMatch(created.rawMarkdown, /함께 보면 좋은 글/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('refresh finalizes the section and keeps preview and publish payload identical', async () => {
    const relatedPosts = stubGateway();
    const { workspaceDir, service } = fixture(relatedPosts);
    try {
        const created = service.createPasteDraft({ markdownText: '# 제목\n\n본문', targets: ['naver'] });
        const refreshed = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: created.revision,
            enabled: true,
            force: true
        });
        assert.equal(refreshed.revision, created.revision + 1);
        assert.equal(refreshed.relatedPosts.status, 'included');
        assert.equal(refreshed.relatedPosts.count, 2);
        assert.match(refreshed.rawMarkdown, /## 함께 보면 좋은 글/);
        assert.match(refreshed.rawMarkdown, /\[첫 글\]\(https:\/\/blog\.naver\.com\/fixture\/1\)/);
        const payload = service.buildPublishPayload({ draftId: created.draftId, revision: refreshed.revision });
        const published = payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent;
        assert.match(published, /## 함께 보면 좋은 글/);
        assert.match(published, /blog\.naver\.com\/fixture\/1/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('refresh leaves the draft untouched when disabled', async () => {
    const { workspaceDir, service } = fixture(stubGateway());
    try {
        const created = service.createFolderDraft({
            folderName: 'fixture',
            targets: ['naver'],
            selectedFiles: [{ relativePath: 'fixture/contents.md', name: 'contents.md', textContent: '# 제목\n\n본문' }]
        });
        const result = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: created.revision,
            enabled: false,
            force: true
        });
        assert.equal(result.revision, created.revision);
        assert.equal(result.relatedPosts.status, 'disabled');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('refresh records failure without losing the draft body', async () => {
    const failing = stubGateway({
        fetchPosts: async () => { throw new Error('network down'); }
    });
    const { workspaceDir, service } = fixture(failing);
    try {
        const created = service.createAiDraft({ markdownText: '# 제목\n\n본문', targets: ['naver'] });
        const refreshed = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: created.revision,
            enabled: true,
            force: true
        });
        assert.equal(refreshed.relatedPosts.status, 'failed');
        assert.match(refreshed.rawMarkdown, /# 제목/);
        assert.match(refreshed.rawMarkdown, /본문/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('related links stay unchanged when the publishing target switches', async () => {
    const gateway = stubGateway();
    const { workspaceDir, service } = fixture(gateway);
    try {
        const created = service.createPasteDraft({ markdownText: '# 제목\n\n본문', targets: ['naver'] });
        const first = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: created.revision,
            enabled: true,
            force: true
        });
        assert.equal(gateway.calls.length, 1);
        const skipped = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: first.revision,
            enabled: true
        });
        assert.equal(skipped.revision, first.revision);
        assert.equal(gateway.calls.length, 1);
        const retargeted = service.updateSettings({ draftId: created.draftId, revision: first.revision, targets: ['wordpress'] });
        const recomputed = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: retargeted.revision,
            enabled: true
        });
        assert.equal(gateway.calls.length, 1);
        assert.equal(recomputed.relatedPosts.status, 'included');
        assert.deepEqual(recomputed.relatedPosts.targets, ['wordpress']);
        assert.match(recomputed.rawMarkdown, /## 함께 보면 좋은 글/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('editing the finalized related-post section preserves the user version', async () => {
    const gateway = stubGateway();
    const { workspaceDir, service } = fixture(gateway);
    try {
        const created = service.createPasteDraft({ markdownText: '# 제목\n\n본문', targets: ['naver'] });
        const finalized = await service.refreshDraftRelatedPosts({
            draftId: created.draftId,
            revision: created.revision,
            enabled: true,
            force: true
        });
        const editedMarkdown = finalized.rawMarkdown.replace('https://blog.naver.com/fixture/1', 'https://example.com/edited');
        const edited = service.updateMarkdown({
            draftId: finalized.draftId,
            revision: finalized.revision,
            markdownText: editedMarkdown
        });
        const afterRefresh = await service.refreshDraftRelatedPosts({
            draftId: edited.draftId,
            revision: edited.revision,
            enabled: true
        });
        assert.equal(gateway.calls.length, 1);
        assert.match(afterRefresh.rawMarkdown, /https:\/\/example\.com\/edited/);
        assert.doesNotMatch(afterRefresh.rawMarkdown, /https:\/\/blog\.naver\.com\/fixture\/1/);
        const payload = service.buildPublishPayload({ draftId: afterRefresh.draftId, revision: afterRefresh.revision });
        const published = payload.selectedFiles.find((entry) => entry.name === 'contents.md').textContent;
        assert.match(published, /https:\/\/example\.com\/edited/);
        assert.doesNotMatch(published, /https:\/\/blog\.naver\.com\/fixture\/1/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
