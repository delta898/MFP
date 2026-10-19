const test = require('node:test');
const assert = require('node:assert/strict');
const { createManualSnsRouteHandler } = require('./routes');

test('routes SNS image operation start, status, and stop separately', async () => {
    const calls = [];
    const controller = {
        handleConfig: async () => calls.push('config'),
        handleWorkspaces: async () => calls.push('workspaces'),
        handleOptimize: async () => calls.push('optimize'),
        handleGenerateImage: async () => calls.push('start-image'),
        handleGetImageOperation: async () => calls.push('get-image'),
        handleCancelImageOperation: async () => calls.push('stop-image'),
        handlePublish: async () => calls.push('publish')
    };
    const handle = createManualSnsRouteHandler({ controller });

    assert.equal(await handle({ pathname: '/api/v1/social/manual/image', method: 'POST' }), true);
    assert.equal(await handle({ pathname: '/api/v1/social/manual/image-operations/op-1', method: 'GET' }), true);
    assert.equal(await handle({ pathname: '/api/v1/social/manual/image-operations/op-1/cancel', method: 'POST' }), true);
    assert.equal(await handle({ pathname: '/api/v1/elsewhere', method: 'GET' }), false);
    assert.deepEqual(calls, ['start-image', 'get-image', 'stop-image']);
});
