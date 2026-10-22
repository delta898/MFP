'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardNewsGenerationApplication } = require('./application');

function createPlan() {
    return JSON.stringify({
        set_title: '테스트 카드뉴스',
        art_direction: '따뜻한 편집 디자인',
        cards: Array.from({ length: 3 }, (_, index) => ({
            headline: `카드 ${index + 1}`,
            body: '핵심 내용',
            image_prompt: `장면 ${index + 1}`
        }))
    });
}

test('Card News uses the shared AI service with safe model identities and persists normalized image output', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-ai-application-'));
    const calls = [];
    const gatewaySupport = {
        text: [{ provider: 'google', modelId: 'text-model' }],
        image: [{ provider: 'google', modelId: 'image-model' }]
    };
    const app = createCardNewsGenerationApplication({
        workspaceDir,
        getTextModel: () => ({ provider: 'google', code: 'text-model', api_key: 'must-not-cross-ai-service-boundary' }),
        getImageModel: () => ({ provider: 'google', code: 'image-model', api_key: 'must-not-cross-ai-service-boundary' }),
        getModelCatalog: () => ({
            text: [{ provider: 'google', code: 'text-model', name: 'Text Model', transport: 'gemini_generate_content' }],
            image: [{ provider: 'google', code: 'image-model', name: 'Image Model', transport: 'gemini_generate_content' }]
        }),
        aiGeneration: {
            supportsFeature: () => true,
            supportsOption(_kind, _selection, _option, value) { return value === '3:4'; },
            async generateText(request, context) {
                calls.push({ kind: 'text', request, context });
                return { content: createPlan() };
            },
            async generateImage(request, context) {
                calls.push({ kind: 'image', request, context });
                return { images: [{ mimeType: 'image/jpeg', dataBase64: Buffer.from('jpeg-image').toString('base64') }] };
            }
        },
        parseStructuredJsonResponse: JSON.parse
    });
    try {
        const result = await app.generate({
            source_snapshot: { title: '원문 제목', text: '원문 내용' },
            settings: { slide_count: 3, aspect_ratio: '3:4' },
            image_mode: 'generate',
            imageModelConfig: { provider: 'google', code: 'image-model', api_key: 'must-not-cross-ai-service-boundary' }
        });

        assert.equal(result.status, 'completed');
        assert.equal(calls.filter((call) => call.kind === 'image').length, 3);
        assert.deepEqual(calls[0].request.modelSelection, { provider: 'google', modelId: 'text-model' });
        assert.equal(calls[0].request.options.responseFormat, 'json');
        assert.equal(calls[1].request.options.aspectRatio, '3:4');
        assert.deepEqual(calls[1].request.modelSelection, { provider: 'google', modelId: 'image-model' });
        assert.equal(JSON.stringify(calls).includes('must-not-cross-ai-service-boundary'), false);
        assert.match(result.cards[0].image_url, /card-01\.jpg$/);
        assert.equal(app.resolveAsset(result.id, 'card-01.jpg').mime_type, 'image/jpeg');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Card News sends an unlisted image ratio to the provider and returns its runtime rejection', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-ai-capability-'));
    let textCalls = 0;
    let imageCalls = 0;
    const app = createCardNewsGenerationApplication({
        workspaceDir,
        getTextModel: () => ({ provider: 'google', code: 'text-model' }),
        getImageModel: () => ({ provider: 'openai', code: 'image-model' }),
        aiGeneration: {
            supportsOption: () => false,
            async generateText() { textCalls += 1; return { content: createPlan() }; },
            async generateImage() {
                imageCalls += 1;
                throw Object.assign(new Error('provider rejected ratio'), { code: 'AI_GATEWAY_PROVIDER_REJECTED_REQUEST' });
            }
        },
        parseStructuredJsonResponse: JSON.parse
    });
    try {
        const result = await app.generate({
            source_snapshot: { title: '원문 제목', text: '원문 내용' },
            settings: { slide_count: 3, aspect_ratio: '4:5' },
            image_mode: 'generate',
            imageModelConfig: { provider: 'openai', code: 'image-model' }
        });
        assert.equal(textCalls, 1);
        assert.equal(imageCalls, 1);
        assert.equal(result.status, 'partial');
        assert.match(result.message, /다음 단계에서 다시 채울/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Card News image regeneration sends the saved composition ratio without local capability rejection', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-ai-saved-ratio-'));
    const checkedRatios = [];
    const app = createCardNewsGenerationApplication({
        workspaceDir,
        getTextModel: () => ({ provider: 'google', code: 'text-model' }),
        getImageModel: () => ({ provider: 'openai', code: 'image-model' }),
        aiGeneration: {
            supportsOption(_kind, _selection, _option, value) {
                checkedRatios.push(value);
                return value === '1:1';
            },
            async generateText() { return { content: createPlan() }; },
            async generateImage() {
                return { images: [{ mimeType: 'image/png', dataBase64: Buffer.from('image').toString('base64') }] };
            }
        },
        parseStructuredJsonResponse: JSON.parse
    });
    try {
        const composition = await app.generate({
            source_snapshot: { title: '원문 제목', text: '원문 내용' },
            settings: { slide_count: 3, aspect_ratio: '1:1' },
            image_mode: 'prompt_only'
        });
        const result = await app.generateImages({ generation_id: composition.id, mode: 'single', card_index: 1 });
        assert.equal(result.cards[0].image_url.endsWith('.png'), true);
        assert.deepEqual(checkedRatios, []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Card News propagates cancellation and preserves completed cards when image work stops', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-ai-cancel-'));
    const controller = new AbortController();
    let imageCalls = 0;
    const app = createCardNewsGenerationApplication({
        workspaceDir,
        getTextModel: () => ({ provider: 'google', code: 'text-model' }),
        getImageModel: () => ({ provider: 'google', code: 'image-model' }),
        aiGeneration: {
            supportsOption: () => true,
            async generateText() { return { content: createPlan() }; },
            async generateImage(request, context) {
                imageCalls += 1;
                if (imageCalls === 2) {
                    controller.abort();
                    const error = new Error('Canceled');
                    error.code = 'AI_GATEWAY_CANCELED';
                    throw error;
                }
                return { images: [{ mimeType: 'image/png', dataBase64: Buffer.from('first image').toString('base64') }] };
            }
        },
        parseStructuredJsonResponse: JSON.parse
    });
    try {
        await assert.rejects(app.generate({
            source_snapshot: { title: '원문 제목', text: '원문 내용' },
            settings: { slide_count: 3, aspect_ratio: '4:5' },
            image_mode: 'generate',
            imageModelConfig: { provider: 'google', code: 'image-model' },
            signal: controller.signal
        }), { code: 'AI_GENERATION_CANCELED' });
        const generations = app.listGenerations();
        assert.equal(generations.length, 1);
        assert.equal(generations[0].status, 'partial');
        assert.equal(generations[0].cards.filter((card) => card.image_url).length, 1);
        assert.equal(imageCalls, 2);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
