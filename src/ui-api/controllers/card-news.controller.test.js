const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsController } = require('./card-news.controller');

function createHarness(overrides = {}) {
    const responses = [];
    const service = {
        async listManagedItems() { return { items: [{ generation_id: 'set-1' }] }; },
        getGeneration(id) { return { generation: { id } }; },
        async generate() { return { generation: { id: 'set-1' } }; },
        startCompositionOperation() { return { operationId: 'op-composition-1', state: 'accepted' }; },
        getCompositionOperation(id) { return { operationId: id, state: 'running' }; },
        cancelCompositionOperation(id) { return { operationId: id, state: 'cancel_requested' }; },
        async generateImages() { return { generation: { id: 'set-1', status: 'completed' } }; },
        startImageOperation() { return { operationId: 'op-1', state: 'accepted' }; },
        getImageOperation(id) { return { operationId: id, state: 'running' }; },
        cancelImageOperation(id) { return { operationId: id, state: 'cancel_requested' }; },
        importLocalImage() { return { generation: { id: 'set-1', status: 'completed' } }; },
        previewZip() { return { card_count: 3 }; },
        async importZip() { return { generation: { id: 'zip-1', status: 'completed' } }; },
        resolveAsset() { return { path: '/safe/card-01.png', file_name: 'card-01.png', mime_type: 'image/png' }; },
        createExportBundle() {
            return {
                buffer: Buffer.from('zip'),
                file_name: '카드뉴스-제주 여행.zip',
                fallback_file_name: 'card-news-set-1.zip',
                mime_type: 'application/zip'
            };
        },
        getPublishingConfig() { return { channels: [{ id: 'channel-1' }] }; },
        async publish() { return { success: true, success_count: 1 }; },
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

test('lists managed card news and reloads one local result', async () => {
    const { controller, responses } = createHarness();
    await controller.managed({ requestId: 'req-managed', method: 'GET', res: {} });
    await controller.generation({
        requestId: 'req-generation',
        method: 'GET',
        pathname: '/api/v1/card-news/generations/set-1',
        res: {}
    });
    assert.equal(responses[0].data.items[0].generation_id, 'set-1');
    assert.equal(responses[1].data.generation.id, 'set-1');
});

test('updates generated and local card images through the controller', async () => {
    const { controller, responses } = createHarness();
    await controller.generateImages({ requestId: 'req-image-1', method: 'POST', requestBody: {}, res: {} });
    await controller.importImage({ requestId: 'req-image-2', method: 'POST', requestBody: {}, res: {} });
    assert.equal(responses[0].data.generation.status, 'completed');
    assert.equal(responses[1].data.generation.status, 'completed');
});

test('starts, reads, and cancels an image operation through the controller', async () => {
    const { controller, responses } = createHarness();
    await controller.startImageOperation({ requestId: 'req-op-start', method: 'POST', requestBody: {}, res: {} });
    await controller.imageOperation({ requestId: 'req-op-get', method: 'GET', pathname: '/api/v1/card-news/image-operations/op-1', res: {} });
    await controller.cancelImageOperation({ requestId: 'req-op-cancel', method: 'POST', pathname: '/api/v1/card-news/image-operations/op-1/cancel', res: {} });
    assert.equal(responses[0].status, 202);
    assert.equal(responses[0].data.operationId, 'op-1');
    assert.equal(responses[1].data.state, 'running');
    assert.equal(responses[2].data.state, 'cancel_requested');
});

test('starts, reads, and cancels a composition operation through the controller', async () => {
    const { controller, responses } = createHarness();
    await controller.startCompositionOperation({ requestId: 'req-compose-start', method: 'POST', requestBody: {}, res: {} });
    await controller.compositionOperation({ requestId: 'req-compose-get', method: 'GET', pathname: '/api/v1/card-news/composition-operations/op-composition-1', res: {} });
    await controller.cancelCompositionOperation({ requestId: 'req-compose-cancel', method: 'POST', pathname: '/api/v1/card-news/composition-operations/op-composition-1/cancel', res: {} });
    assert.equal(responses[0].status, 202);
    assert.equal(responses[0].data.operationId, 'op-composition-1');
    assert.equal(responses[1].data.state, 'running');
    assert.equal(responses[2].data.state, 'cancel_requested');
});

test('previews and imports a card-news ZIP through the controller', async () => {
    const { controller, responses } = createHarness();
    await controller.previewZip({ requestId: 'req-zip-preview', method: 'POST', requestBody: {}, res: {} });
    await controller.importZip({ requestId: 'req-zip-import', method: 'POST', requestBody: {}, res: {} });
    assert.equal(responses[0].data.card_count, 3);
    assert.equal(responses[1].data.generation.id, 'zip-1');
    assert.equal(responses[1].status, 201);
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

test('serves the prepared image bytes for preview and download', async () => {
    let receivedSignature = '';
    let receivedExpectedSignature = null;
    const { controller } = createHarness({
        service: {
            async prepareAsset(_generationId, _fileName, signature, expectedSignature) {
                receivedSignature = signature;
                receivedExpectedSignature = expectedSignature;
                return { buffer: Buffer.from('watermarked-image'), file_name: 'card-01.png', mime_type: 'image/png' };
            }
        }
    });
    const response = {
        headers: null,
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        end(buffer) { this.body = buffer; }
    };
    await controller.asset({
        requestId: 'req-prepared-asset',
        method: 'GET',
        pathname: '/api/v1/card-news/assets/set-1/card-01.png',
        searchParams: new URLSearchParams('signature=My%20Brand&expected_signature=My%20Brand'),
        res: response
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body.toString(), 'watermarked-image');
    assert.equal(receivedSignature, 'My Brand');
    assert.equal(receivedExpectedSignature, 'My Brand');
});

test('returns a stale preview conflict without streaming mismatched image bytes', async () => {
    const staleError = new Error('미리보기를 갱신해 주세요.');
    staleError.status = 409;
    staleError.apiCode = 'CARD_NEWS_SIGNATURE_PREVIEW_STALE';
    const { controller, responses } = createHarness({ service: {
        async prepareAsset() { throw staleError; }
    } });
    const response = { writeHead() { throw new Error('must not stream stale image'); } };
    await controller.asset({
        requestId: 'req-stale-asset',
        method: 'GET',
        pathname: '/api/v1/card-news/assets/set-1/card-01.png',
        searchParams: new URLSearchParams('signature=My%20Brand&expected_signature=My%20Brand'),
        res: response
    });
    assert.deepEqual(responses[0], {
        kind: 'error',
        status: 409,
        code: 'CARD_NEWS_SIGNATURE_PREVIEW_STALE',
        message: '미리보기를 갱신해 주세요.'
    });
});

test('returns the server-resolved card signature policy', async () => {
    const { controller, responses } = createHarness({ service: {
        async getSignaturePolicy(signature) {
            assert.equal(signature, 'My Brand');
            return { editable: false, plan_verified: false, default_signature: 'BlogGenius.kr', effective_signature: 'BlogGenius.kr' };
        }
    } });
    await controller.signaturePolicy({ requestId: 'req-signature-policy', method: 'GET', searchParams: new URLSearchParams('signature=My%20Brand'), res: {} });
    assert.deepEqual(responses[0].data, { editable: false, plan_verified: false, default_signature: 'BlogGenius.kr', effective_signature: 'BlogGenius.kr' });
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

test('downloads a completed card-news set as one ZIP bundle', async () => {
    let receivedSignature = '';
    const { controller } = createHarness({ service: {
        async createExportBundle(generationId, signature, expectedSignature) {
            receivedSignature = `${signature}|${expectedSignature}`;
            return {
                buffer: Buffer.from('zip'),
                file_name: '카드뉴스-제주 여행.zip',
                fallback_file_name: `card-news-${generationId}.zip`,
                mime_type: 'application/zip'
            };
        }
    } });
    const response = {
        headers: null,
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        end(body) { this.body = body; }
    };
    await controller.exportBundle({
        requestId: 'req-export',
        method: 'GET',
        pathname: '/api/v1/card-news/exports/set-1.zip',
        searchParams: new URLSearchParams('signature=My%20Brand&expected_signature=My%20Brand'),
        res: response
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'application/zip');
    assert.equal(response.headers['Content-Length'], 3);
    assert.match(response.headers['Content-Disposition'], /card-news-set-1\.zip/);
    assert.match(response.headers['Content-Disposition'], /filename\*=UTF-8''%EC%B9%B4%EB%93%9C%EB%89%B4%EC%8A%A4-/);
    assert.equal(response.body.toString(), 'zip');
    assert.equal(receivedSignature, 'My Brand|My Brand');
});

test('reads publishing config and publishes a completed card-news set', async () => {
    const calls = [];
    const { controller, responses } = createHarness({ service: {
        getPublishingConfig(generationId, organizationId) {
            calls.push(['config', generationId, organizationId]);
            return { channels: [{ id: 'channel-1' }] };
        }
    } });
    await controller.publishingConfig({
        requestId: 'req-config',
        method: 'GET',
        searchParams: new URLSearchParams('generation_id=set-1&organization_id=org-2'),
        res: {}
    });
    await controller.publish({
        requestId: 'req-publish',
        method: 'POST',
        requestBody: { generation_id: 'set-1', channel_ids: ['channel-1'] },
        res: {}
    });
    assert.equal(responses[0].data.channels[0].id, 'channel-1');
    assert.equal(responses[1].data.success, true);
    assert.deepEqual(calls, [['config', 'set-1', 'org-2']]);
});
