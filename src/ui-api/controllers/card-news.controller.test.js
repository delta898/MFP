const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsController } = require('./card-news.controller');

function createHarness(overrides = {}) {
    const responses = [];
    const service = {
        async generate() { return { generation: { id: 'set-1' } }; },
        async generateImages() { return { generation: { id: 'set-1', status: 'completed' } }; },
        importLocalImage() { return { generation: { id: 'set-1', status: 'completed' } }; },
        resolveAsset() { return { path: '/safe/card-01.png', file_name: 'card-01.png', mime_type: 'image/png' }; },
        ...overrides.service
    };
    const fs = overrides.fs || {
        createReadStream(path) {
            return { pipe(res) { res.pipedPath = path; } };
        }
    };
    const controller = createCardNewsController({
        service,
        fs,
        sendSuccess(_res, _requestId, data, status) { responses.push({ kind: 'success', data, status }); },
        sendError(_res, _requestId, status, code, message) { responses.push({ kind: 'error', status, code, message }); }
    });
    return { controller, responses };
}

test('creates a generation through the controller', async () => {
    const { controller, responses } = createHarness();
    await controller.generate({ requestId: 'req-1', method: 'POST', requestBody: {}, res: {} });
    assert.deepEqual(responses[0], { kind: 'success', data: { generation: { id: 'set-1' } }, status: 201 });
});

test('updates generated and local card images through the controller', async () => {
    const { controller, responses } = createHarness();
    await controller.generateImages({ requestId: 'req-image-1', method: 'POST', requestBody: {}, res: {} });
    await controller.importImage({ requestId: 'req-image-2', method: 'POST', requestBody: {}, res: {} });
    assert.equal(responses[0].data.generation.status, 'completed');
    assert.equal(responses[1].data.generation.status, 'completed');
});

test('streams a resolved local card image with optional download headers', async () => {
    const { controller } = createHarness();
    const response = {
        headers: null,
        writeHead(status, headers) { this.status = status; this.headers = headers; }
    };
    await controller.asset({
        requestId: 'req-2',
        method: 'GET',
        pathname: '/api/v1/card-news/assets/set-1/card-01.png',
        searchParams: new URLSearchParams('download=1'),
        res: response
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'image/png');
    assert.match(response.headers['Content-Disposition'], /attachment/);
    assert.equal(response.pipedPath, '/safe/card-01.png');
});

test('returns not found without exposing arbitrary asset paths', async () => {
    const { controller, responses } = createHarness({ service: { resolveAsset() { return null; } } });
    await controller.asset({
        requestId: 'req-3',
        method: 'GET',
        pathname: '/api/v1/card-news/assets/set-1/%2E%2E%2Fsecret',
        searchParams: new URLSearchParams(),
        res: {}
    });
    assert.equal(responses[0].code, 'CARD_NEWS_ASSET_NOT_FOUND');
    assert.equal(responses[0].status, 404);
});
