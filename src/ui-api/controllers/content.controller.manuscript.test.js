const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentController } = require('./content.controller');

function harness(overrides = {}) {
    const responses = [];
    const calls = [];
    const service = {
        createFolderManuscriptDraft: async (input) => (calls.push(['create', input]), { draftId: 'draft-1' }),
        createPasteManuscriptDraft: async (input) => (calls.push(['create-paste', input]), { draftId: 'draft-2' }),
        createAiManuscriptDraft: async (input) => (calls.push(['create-ai', input]), { draftId: 'draft-3' }),
        getManuscriptDraft: async (input) => (calls.push(['get', input]), { draftId: input.draftId }),
        updateManuscriptDraftSettings: async (input) => (calls.push(['settings', input]), input),
        updateManuscriptDraftMarkdown: async (input) => (calls.push(['markdown', input]), input),
        importManuscriptDraftImage: async (input) => (calls.push(['import', input]), input),
        generateManuscriptDraftImage: async (input) => (calls.push(['generate', input]), input),
        generateMissingManuscriptDraftImages: async (input) => (calls.push(['generate-missing', input]), input),
        excludeManuscriptDraftImage: async (input) => (calls.push(['exclude', input]), input),
        restoreManuscriptDraftImage: async (input) => (calls.push(['restore', input]), input),
        publishManuscriptDraft: async (input) => (calls.push(['publish', input]), input),
        getManuscriptDraftImage: async (input) => (calls.push(['image', input]), { body: Buffer.from('image'), contentType: 'image/png' }),
        ...overrides.service
    };
    const controller = createContentController({
        service,
        sendSuccess(_res, _id, data) { responses.push({ type: 'success', data }); },
        sendError(_res, _id, status, code, message) { responses.push({ type: 'error', status, code, message }); }
    });
    return { controller, responses, calls };
}

test('delegates manuscript draft mutations without losing route identifiers', async () => {
    const { controller, calls } = harness();
    const base = { requestId: 'req', method: 'POST', draftId: 'draft-1', slotId: 'image-2', requestBody: { revision: 3 }, res: {} };
    for (const action of ['settings', 'markdown', 'import', 'generate', 'generate-missing', 'exclude', 'restore', 'publish']) {
        await controller.manuscriptDraftMutation({ ...base, action });
    }
    assert.deepEqual(calls.map((entry) => entry[0]), ['settings', 'markdown', 'import', 'generate', 'generate-missing', 'exclude', 'restore', 'publish']);
    assert.ok(calls.every((entry) => entry[1].draftId === 'draft-1' && entry[1].slotId === 'image-2' && entry[1].revision === 3));
});

test('creates a pasted manuscript draft through its dedicated adapter', async () => {
    const { controller, calls } = harness();
    await controller.manuscriptDraftCreatePaste({ requestId: 'req', method: 'POST', requestBody: { markdownText: '# 원고' }, res: {} });
    assert.deepEqual(calls[0], ['create-paste', { markdownText: '# 원고' }]);
});

test('creates a direct AI manuscript draft through its dedicated adapter', async () => {
    const { controller, calls } = harness();
    await controller.manuscriptDraftCreateAi({ requestId: 'req', method: 'POST', requestBody: { subject: '주제' }, res: {} });
    assert.deepEqual(calls[0], ['create-ai', { subject: '주제' }]);
});

test('streams a manuscript image with no-store caching', async () => {
    const { controller, calls } = harness();
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    await controller.manuscriptDraftImage({ requestId: 'req', method: 'GET', draftId: 'draft-1', slotId: 'image-1', searchParams: new URLSearchParams('revision=3'), res });
    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body.toString(), 'image');
    assert.deepEqual(calls[0], ['image', { draftId: 'draft-1', slotId: 'image-1', revision: '3' }]);
});

test('preserves structured revision conflict errors', async () => {
    const conflict = Object.assign(new Error('최신 미리보기를 확인해 주세요.'), { status: 409, apiCode: 'MANUSCRIPT_DRAFT_REVISION_CONFLICT' });
    const { controller, responses } = harness({ service: { excludeManuscriptDraftImage: async () => { throw conflict; } } });
    await controller.manuscriptDraftMutation({ requestId: 'req', method: 'POST', draftId: 'draft-1', slotId: 'image-1', action: 'exclude', requestBody: { revision: 1 }, res: {} });
    assert.deepEqual(responses[0], {
        type: 'error', status: 409, code: 'MANUSCRIPT_DRAFT_REVISION_CONFLICT', message: '최신 미리보기를 확인해 주세요.'
    });
});
