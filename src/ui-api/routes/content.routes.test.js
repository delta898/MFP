const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentRouteHandler } = require('./content.routes');

test('routes manuscript draft lifecycle and slot actions with decoded identifiers', async () => {
    const calls = [];
    const controller = {
        manuscriptDraftCreateFolder: async (ctx) => calls.push(['create', ctx.pathname]),
        manuscriptDraftGet: async (ctx) => calls.push(['get', ctx.draftId]),
        manuscriptDraftImage: async (ctx) => calls.push(['image', ctx.draftId, ctx.slotId]),
        manuscriptDraftMutation: async (ctx) => calls.push(['mutation', ctx.action, ctx.draftId, ctx.slotId || ''])
    };
    const handler = createContentRouteHandler({ controller });

    await handler({ pathname: '/api/v1/blog/manuscript-drafts/folder', method: 'POST' });
    await handler({ pathname: '/api/v1/blog/manuscript-drafts/draft%201', method: 'GET' });
    await handler({ pathname: '/api/v1/blog/manuscript-drafts/draft%201/images/image-1', method: 'GET' });
    for (const action of ['import', 'generate', 'exclude', 'restore']) {
        await handler({ pathname: `/api/v1/blog/manuscript-drafts/draft%201/image-slots/image-1/${action}`, method: 'POST' });
    }
    await handler({ pathname: '/api/v1/blog/manuscript-drafts/draft%201/images/generate-missing', method: 'POST' });
    await handler({ pathname: '/api/v1/blog/manuscript-drafts/draft%201/settings', method: 'POST' });
    await handler({ pathname: '/api/v1/blog/manuscript-drafts/draft%201/publish', method: 'POST' });

    assert.deepEqual(calls, [
        ['create', '/api/v1/blog/manuscript-drafts/folder'],
        ['get', 'draft 1'],
        ['image', 'draft 1', 'image-1'],
        ['mutation', 'import', 'draft 1', 'image-1'],
        ['mutation', 'generate', 'draft 1', 'image-1'],
        ['mutation', 'exclude', 'draft 1', 'image-1'],
        ['mutation', 'restore', 'draft 1', 'image-1'],
        ['mutation', 'generate-missing', 'draft 1', ''],
        ['mutation', 'settings', 'draft 1', ''],
        ['mutation', 'publish', 'draft 1', '']
    ]);
});

test('does not claim unrelated routes', async () => {
    const handler = createContentRouteHandler({ controller: {} });
    assert.equal(await handler({ pathname: '/api/v1/not-content', method: 'GET' }), false);
});
