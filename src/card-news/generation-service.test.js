const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardNewsGenerationService, safeAssetName } = require('./generation-service');

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
        assert.equal(imageCalls.length, 3);
        assert.equal(imageCalls[0].options.aspectRatio, '4:5');
        assert.match(result.cards[0].image_url, /^\/api\/v1\/card-news\/assets\/generation-123\/card-01\.png$/);
        assert.equal(service.resolveAsset('generation-123', 'card-01.png').mime_type, 'image/png');
        assert.equal(JSON.parse(fs.readFileSync(path.join(workspaceDir, 'card-news', 'exports', 'generation-123', 'manifest.json'))).status, 'completed');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('rejects unsafe asset names and keeps a failed manifest', async () => {
    assert.equal(safeAssetName('../secret'), '');
    assert.equal(safeAssetName('card-01.png'), 'card-01.png');
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
