const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    createCardNewsGenerationService,
    safeAssetName,
    safeExportTitle,
    cardPlanMaxTokens,
    decodeLocalImage
} = require('./generation-service');
const { createStoredZip } = require('./zip-bundle');

test('generates a coherent set, persists assets, and exposes safe local URLs', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-generation-'));
    const imageCalls = [];
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            now: () => '2026-09-04T00:00:00.000Z',
            createId: (() => {
                const values = ['generation-123', 'variation-123'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => JSON.stringify({
                set_title: '제주 세트',
                art_direction: '맑은 여행 잡지',
                social_caption: '제주의 장면을 카드로 만나보세요.',
                hashtags: ['제주여행', '카드뉴스'],
                cards: Array.from({ length: 3 }, (_, index) => ({
                    headline: `카드 ${index + 1}`,
                    body: '내용',
                    image_prompt: `장면 ${index + 1}`
                }))
            }),
            callWritingImage: async (prompt, savePath, retries, options) => {
                imageCalls.push({ prompt, savePath, retries, options });
                const filePath = `${savePath}.png`;
                fs.writeFileSync(filePath, 'png');
                return filePath;
            }
        });
        const result = await service.generate({
            source_snapshot: { source: { kind: 'url' }, title: '제주', text: '제주 여행 본문' },
            settings: { slide_count: 3, aspect_ratio: '4:5', style: 'emotional' }
        });
        assert.equal(result.status, 'completed');
        assert.equal(result.cards.length, 3);
        assert.equal(result.image_mode, 'generate');
        assert.deepEqual(result.publishing_copy, {
            caption: '제주의 장면을 카드로 만나보세요.',
            hashtags: ['#제주여행', '#카드뉴스']
        });
        assert.match(result.cards[0].image_prompt, /장면 1/);
        assert.match(result.cards[0].image_prompt, /같은 세트의 다른 카드와/);
        assert.equal(imageCalls[0].prompt, result.cards[0].image_prompt);
        assert.equal(imageCalls.length, 3);
        assert.equal(imageCalls[0].options.aspectRatio, '4:5');
        assert.match(result.cards[0].image_url, /^\/api\/v1\/card-news\/assets\/generation-123\/card-01\.png$/);
        assert.equal(service.getGeneration('generation-123').title, '제주 세트');
        assert.deepEqual(service.listGenerations().map((generation) => generation.id), ['generation-123']);
        assert.equal(service.resolveAsset('generation-123', 'card-01.png').mime_type, 'image/png');
        assert.equal(JSON.parse(fs.readFileSync(path.join(workspaceDir, 'card-news', 'exports', 'generation-123', 'manifest.json'))).status, 'completed');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('creates a reusable prompt-only composition without calling an image model', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-prompt-only-'));
    let imageCalls = 0;
    let textCallOptions = null;
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-789', 'variation-789'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async (_prompt, _retries, options) => {
                textCallOptions = options;
                return JSON.stringify({
                    set_title: '구성 세트',
                    art_direction: '정보형',
                    cards: Array.from({ length: 3 }, (_, index) => ({
                        headline: `제목 ${index + 1}`,
                        body: '본문',
                        image_prompt: `프롬프트 ${index + 1}`
                    }))
                });
            },
            callWritingImage: async () => { imageCalls += 1; }
        });
        const result = await service.generate({
            source_snapshot: { title: '제목', text: '본문' },
            settings: { slide_count: 3 },
            image_mode: 'prompt_only'
        });
        assert.equal(result.status, 'prompt_ready');
        assert.equal(result.image_mode, 'prompt_only');
        assert.match(result.cards[0].image_prompt, /프롬프트 1/);
        assert.match(result.cards[0].image_prompt, /같은 세트의 다른 카드와/);
        assert.equal(result.cards[0].image_url, '');
        assert.equal(result.cards[0].download_url, '');
        assert.equal(imageCalls, 0);
        assert.equal(textCallOptions.maxTokens, 4096);
        assert.equal(textCallOptions.logTokenUsage, true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('previews and imports an ordered ZIP as a completed local generation', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-zip-import-'));
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(128, 1)]);
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: () => 'generation-zip-1',
            now: () => '2026-09-05T05:00:00.000Z',
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => '{}',
            callWritingImage: async () => ''
        });
        const base64Data = createStoredZip([
            { name: '10.png', data: png },
            { name: '2.png', data: png },
            { name: '1.png', data: png }
        ]).toString('base64');
        assert.deepEqual(service.previewZip({ base64_data: base64Data }).images.map((image) => image.file_name), ['1.png', '2.png', '10.png']);
        const result = service.importZip({
            base64_data: base64Data,
            title: '외부 카드뉴스',
            source_url: 'https://example.com/article',
            management_id: 'import-1'
        });
        assert.equal(result.id, 'generation-zip-1');
        assert.equal(result.image_mode, 'imported');
        assert.equal(result.status, 'completed');
        assert.equal(result.cards.length, 3);
        assert.equal(result.source_url, 'https://example.com/article');
        assert.ok(result.cards.every((card) => card.image_url));
        const manifest = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'card-news', 'exports', 'generation-zip-1', 'manifest.json')));
        assert.deepEqual(manifest.cards.map((card) => card.imported_file_name), ['1.png', '2.png', '10.png']);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('imports title, source, settings, and card copy from a BlogGenius ZIP manifest', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-import-manifest-'));
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(128, 1)]);
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: () => 'generation-import-manifest',
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => '{}'
        });
        const metadata = {
            title: '복원된 카드뉴스',
            source: { canonical_url: 'https://example.com/source' },
            settings: { aspect_ratio: '1:1', style: 'editorial', include_korean_text: false },
            cards: [{ image_file: '01.png', headline: '복원 제목', body: '복원 본문', image_prompt: '복원 프롬프트' }]
        };
        const base64Data = createStoredZip([
            { name: 'card-news.json', data: Buffer.from(JSON.stringify(metadata)) },
            { name: '01.png', data: png }
        ]).toString('base64');
        const result = service.importZip({ base64_data: base64Data });
        assert.equal(result.title, '복원된 카드뉴스');
        assert.equal(result.source_url, 'https://example.com/source');
        assert.deepEqual(result.settings, {
            aspect_ratio: '1:1',
            slide_count: 1,
            style: 'editorial',
            include_korean_text: false,
            additional_request: ''
        });
        assert.equal(result.cards[0].headline, '복원 제목');
        assert.equal(result.cards[0].body, '복원 본문');
        assert.equal(result.cards[0].image_prompt, '복원 프롬프트');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('returns the valid composition when later image generation fails', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-partial-'));
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-partial', 'variation-partial'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => JSON.stringify({
                set_title: '부분 세트',
                art_direction: '감성형',
                cards: Array.from({ length: 3 }, (_, index) => ({
                    headline: `제목 ${index + 1}`,
                    body: '본문',
                    image_prompt: `프롬프트 ${index + 1}`
                }))
            }),
            callWritingImage: async () => { throw new Error('image rate limited'); }
        });
        const result = await service.generate({
            source_snapshot: { title: '제목', text: '본문' },
            settings: { slide_count: 3 },
            image_mode: 'generate'
        });
        assert.equal(result.status, 'partial');
        assert.equal(result.cards.length, 3);
        assert.match(result.cards[0].image_prompt, /프롬프트 1/);
        assert.equal(result.cards[0].image_url, '');
        assert.match(result.message, /카드 구성은 보관했습니다/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('rejects unsafe asset names and keeps a failed manifest', async () => {
    assert.equal(safeAssetName('../secret'), '');
    assert.equal(safeAssetName('card-01.png'), 'card-01.png');
    assert.equal(safeExportTitle(' 제주: 여행 / 첫날? '), '제주 여행 첫날');
    assert.equal(Array.from(safeExportTitle('가'.repeat(100))).length, 80);
    assert.deepEqual([3, 5, 7].map(cardPlanMaxTokens), [4096, 6144, 8192]);
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-generation-failure-'));
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-456', 'variation-456'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => { throw new Error('rate limited'); },
            callWritingImage: async () => ''
        });
        await assert.rejects(() => service.generate({
            source_snapshot: { title: '제목', text: '본문' },
            settings: { slide_count: 3 }
        }), /rate limited/);
        const manifest = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'card-news', 'exports', 'generation-456', 'manifest.json')));
        assert.equal(manifest.status, 'failed');
        assert.equal(manifest.cards.length, 0);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('fills only missing image slots and preserves completed cards when a later image fails', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-image-fill-'));
    let imageCall = 0;
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-fill', 'variation-fill'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => JSON.stringify({
                set_title: '채우기 세트',
                art_direction: '정보형',
                cards: Array.from({ length: 3 }, (_, index) => ({
                    headline: `제목 ${index + 1}`,
                    body: '본문',
                    image_prompt: `프롬프트 ${index + 1}`
                }))
            }),
            callWritingImage: async (_prompt, savePath) => {
                imageCall += 1;
                if (imageCall === 2) throw new Error('temporary image failure');
                const filePath = `${savePath}.png`;
                fs.writeFileSync(filePath, 'generated image');
                return filePath;
            }
        });
        const composed = await service.generate({
            source_snapshot: { title: '제목', text: '본문' },
            settings: { slide_count: 3 },
            image_mode: 'prompt_only'
        });
        const imported = service.importLocalImage({
            generation_id: composed.id,
            card_index: 1,
            file_name: 'mine.png',
            mime_type: 'image/png',
            base64_data: Buffer.alloc(256, 1).toString('base64')
        });
        const firstUrl = imported.cards[0].image_url;
        const result = await service.generateImages({ generation_id: composed.id, mode: 'missing' });
        assert.equal(result.status, 'partial');
        assert.equal(result.cards[0].image_url, firstUrl);
        assert.match(result.cards[1].image_url, /card-02-/);
        assert.equal(result.cards[2].image_url, '');
        assert.match(result.message, /완성한 이미지는 유지했습니다/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('replaces one card with a copied local image and validates local image input', async () => {
    assert.throws(() => decodeLocalImage({ file_name: 'note.txt', base64_data: 'abc' }), {
        code: 'CARD_NEWS_IMAGE_FORMAT_INVALID'
    });
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-local-image-'));
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-local', 'variation-local'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => JSON.stringify({
                set_title: '로컬 세트',
                art_direction: '매거진',
                cards: Array.from({ length: 3 }, (_, index) => ({
                    headline: `제목 ${index + 1}`,
                    body: '본문',
                    image_prompt: `프롬프트 ${index + 1}`
                }))
            })
        });
        const composed = await service.generate({
            source_snapshot: { title: '제목', text: '본문' },
            settings: { slide_count: 3 },
            image_mode: 'prompt_only'
        });
        const result = service.importLocalImage({
            generation_id: composed.id,
            card_index: 2,
            file_name: 'selected.webp',
            mime_type: 'image/webp',
            base64_data: `data:image/webp;base64,${Buffer.alloc(256, 2).toString('base64')}`
        });
        assert.equal(result.status, 'partial');
        assert.match(result.cards[1].image_url, /card-02-local-.*\.webp$/);
        assert.equal(service.resolveAsset(composed.id, path.basename(decodeURIComponent(result.cards[1].image_url))).mime_type, 'image/webp');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('exports every completed card in manifest order with portable names and metadata', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-export-'));
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-export', 'variation-export'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => JSON.stringify({
                set_title: '내보내기 세트',
                art_direction: '정보형',
                cards: Array.from({ length: 3 }, (_, index) => ({
                    headline: `제목 ${index + 1}`,
                    body: '본문',
                    image_prompt: `프롬프트 ${index + 1}`
                }))
            }),
            callWritingImage: async (_prompt, savePath) => {
                const filePath = `${savePath}.png`;
                fs.writeFileSync(filePath, `image:${path.basename(savePath)}`);
                return filePath;
            }
        });
        const generated = await service.generate({
            source_snapshot: { source: { kind: 'url' }, title: '제목', text: '본문' },
            settings: { slide_count: 3 },
            image_mode: 'generate'
        });
        const bundle = service.createExportBundle(generated.id);
        assert.equal(bundle.mime_type, 'application/zip');
        assert.equal(bundle.card_count, 3);
        assert.equal(bundle.file_name, '카드뉴스-내보내기 세트.zip');
        assert.equal(bundle.fallback_file_name, 'card-news-generation-export.zip');
        assert.equal(bundle.buffer.readUInt32LE(0), 0x04034b50);
        const archiveText = bundle.buffer.toString('utf8');
        assert.ok(archiveText.indexOf('01.png') < archiveText.indexOf('02.png'));
        assert.ok(archiveText.indexOf('02.png') < archiveText.indexOf('03.png'));
        assert.match(archiveText, /card-news\.json/);
        assert.match(archiveText, /내보내기 세트/);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('blocks complete-set export while any card image is missing', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-export-incomplete-'));
    try {
        const service = createCardNewsGenerationService({
            workspaceDir,
            createId: (() => {
                const values = ['generation-incomplete', 'variation-incomplete'];
                return () => values.shift();
            })(),
            parseStructuredJsonResponse: JSON.parse,
            callWritingText: async () => JSON.stringify({
                cards: Array.from({ length: 3 }, (_, index) => ({
                    headline: `제목 ${index + 1}`,
                    body: '본문',
                    image_prompt: `프롬프트 ${index + 1}`
                }))
            })
        });
        const generated = await service.generate({
            source_snapshot: { title: '제목', text: '본문' },
            settings: { slide_count: 3 },
            image_mode: 'prompt_only'
        });
        assert.throws(() => service.createExportBundle(generated.id), {
            code: 'CARD_NEWS_EXPORT_INCOMPLETE',
            status: 409
        });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
