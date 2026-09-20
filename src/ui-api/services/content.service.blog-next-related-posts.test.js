const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');
const { createBlogNextExecutionCoordinator } = require('../../blog-next/execution-coordinator');

function createService(extras = {}) {
    return createContentService({
        CONFIG: {},
        blogNextExecutionCoordinator: createBlogNextExecutionCoordinator(),
        executeLocalMarkdownPublish: async () => ({ success: true, data: {} }),
        ...extras
    });
}

function licenseFeatures(enabled) {
    return { checkLicenseStatus: async () => ({ success: true, features: { enable_related_posts_auto_link: enabled } }) };
}

function draftService(calls) {
    return {
        createPasteDraft: (input) => {
            calls.push(['create', input]);
            return { draftId: 'draft-1', revision: 1 };
        },
        updateSettings: (input) => {
            calls.push(['settings', input]);
            return { draftId: 'draft-1', revision: 2 };
        },
        updateMarkdown: (input) => {
            calls.push(['markdown', input]);
            return { draftId: 'draft-1', revision: 2 };
        },
        async refreshDraftRelatedPosts(input) {
            calls.push(['refresh', input]);
            return { draftId: input.draftId, revision: input.revision + 1, relatedPosts: { status: 'included', count: 2 } };
        }
    };
}

test('paste draft creation finalizes related posts for enabled plans', async () => {
    const calls = [];
    const service = createService({ License: licenseFeatures(true), manuscriptDraftService: draftService(calls) });
    const result = await service.createPasteManuscriptDraft({ markdownText: '# 원고' });
    assert.equal(result.revision, 2);
    assert.equal(result.relatedPosts.status, 'included');
    assert.deepEqual(calls[1], ['refresh', { draftId: 'draft-1', revision: 1, enabled: true, force: true }]);
});

test('paste draft creation skips finalization for free plans', async () => {
    const calls = [];
    const service = createService({ License: licenseFeatures(false), manuscriptDraftService: draftService(calls) });
    const result = await service.createPasteManuscriptDraft({ markdownText: '# 원고' });
    assert.equal(result.revision, 1);
    assert.equal(calls.length, 1);
});

test('draft wrappers pass through untouched when license is unavailable', async () => {
    const calls = [];
    const service = createService({ manuscriptDraftService: draftService(calls) });
    const created = await service.createPasteManuscriptDraft({ markdownText: '# 원고' });
    assert.equal(created.revision, 1);
    const updated = await service.updateManuscriptDraftSettings({ draftId: 'draft-1', revision: 1, targets: ['naver'] });
    assert.equal(updated.revision, 2);
    assert.ok(calls.every(([kind]) => kind !== 'refresh'));
});

test('settings updates recompute without forcing when enabled', async () => {
    const calls = [];
    const service = createService({ License: licenseFeatures(true), manuscriptDraftService: draftService(calls) });
    await service.updateManuscriptDraftSettings({ draftId: 'draft-1', revision: 1, targets: ['wordpress'] });
    assert.deepEqual(calls[1], ['refresh', { draftId: 'draft-1', revision: 2, enabled: true, force: false }]);
});

test('markdown updates force recomputation when enabled', async () => {
    const calls = [];
    const service = createService({ License: licenseFeatures(true), manuscriptDraftService: draftService(calls) });
    await service.updateManuscriptDraftMarkdown({ draftId: 'draft-1', revision: 1, markdownText: '# 변경' });
    assert.deepEqual(calls[1], ['refresh', { draftId: 'draft-1', revision: 2, enabled: true, force: true }]);
});
