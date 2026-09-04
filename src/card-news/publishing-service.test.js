const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardNewsPublishingService, normalizeChannel, buildDefaultPublishText } = require('./publishing-service');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-publishing-'));
    const assets = [1, 2, 3].map((index) => {
        const filePath = path.join(root, `card-${index}.png`);
        fs.writeFileSync(filePath, Buffer.alloc(256, index));
        return { index, path: filePath, file_name: `card-${index}.png`, mime_type: 'image/png' };
    });
    const generation = {
        id: 'generation-123',
        title: '제주 카드뉴스',
        publishing_copy: {
            caption: '제주의 새로운 모습을 카드로 만나보세요.',
            hashtags: ['#제주여행', '#카드뉴스']
        },
        source: { canonical_url: 'https://blog.example/jeju' }
    };
    return { root, assets, generation };
}

function config() {
    return {
        BUFFER_API_KEY: 'buffer-key',
        BUFFER_CHANNELS: [
            { id: 'instagram-1', name: 'Instagram', service: 'instagram' },
            { id: 'bluesky-1', name: 'Bluesky', service: 'bluesky' },
            { id: 'pinterest-1', name: 'Pinterest', service: 'pinterest' }
        ],
        WORDPRESS_URL: 'https://blog.example',
        WORDPRESS_USER_ID: 'writer',
        WORDPRESS_APP_PASSWORD: 'app-password'
    };
}

test('publishing config reports channel-specific carousel compatibility', () => {
    const data = fixture();
    try {
        const service = createCardNewsPublishingService({
            CONFIG: config(),
            generationService: { resolveCompleteAssets: () => data },
            bufferClient: { shareNowMany: async () => [] },
            createWordPressClient: () => ({})
        });
        const result = service.getConfig('generation-123');
        assert.equal(result.card_count, 3);
        assert.equal(result.media_transport, 'wordpress');
        assert.equal(result.default_text, '제주의 새로운 모습을 카드로 만나보세요.\n\nhttps://blog.example/jeju\n\n#제주여행 #카드뉴스');
        assert.equal(result.channels.find((item) => item.service === 'instagram').compatible, true);
        assert.equal(result.channels.find((item) => item.service === 'bluesky').compatible, true);
        assert.equal(result.channels.find((item) => item.service === 'pinterest').compatible, false);
    } finally {
        fs.rmSync(data.root, { recursive: true, force: true });
    }
});

test('default publishing copy keeps the verified source URL deterministic and supports manuscripts', () => {
    const data = fixture();
    assert.equal(
        buildDefaultPublishText(data.generation),
        '제주의 새로운 모습을 카드로 만나보세요.\n\nhttps://blog.example/jeju\n\n#제주여행 #카드뉴스'
    );
    data.generation.source.canonical_url = '';
    assert.equal(
        buildDefaultPublishText(data.generation),
        '제주의 새로운 모습을 카드로 만나보세요.\n\n#제주여행 #카드뉴스'
    );
    fs.rmSync(data.root, { recursive: true, force: true });
});

test('publish uploads images in order, sends an ordered Buffer asset list, and cleans up after terminal success', async () => {
    const data = fixture();
    const uploaded = [];
    const deleted = [];
    const deliveries = [];
    try {
        const service = createCardNewsPublishingService({
            CONFIG: config(),
            generationService: { resolveCompleteAssets: () => data },
            bufferClient: {
                async shareNowMany(_key, input) {
                    deliveries.push(...input);
                    return input.map((item, index) => ({ success: true, channelId: item.channelId, bufferPostId: `post-${index + 1}` }));
                },
                async getPostsByIds(_key, ids) {
                    return ids.map((id, index) => ({ id, status: 'sent', externalLink: `https://social.example/${index + 1}` }));
                }
            },
            createWordPressClient: () => ({
                isConfigured: () => true,
                async uploadMedia(buffer, fileName) {
                    uploaded.push({ buffer, fileName });
                    return { id: uploaded.length, url: `https://blog.example/media/${uploaded.length}.png` };
                },
                async deleteMedia(id) { deleted.push(id); return true; }
            }),
            pollIntervalMs: 0,
            pollTimeoutMs: 10
        });

        const result = await service.publish({
            generation_id: 'generation-123',
            channel_ids: ['instagram-1', 'bluesky-1'],
            text: '제주 카드뉴스'
        });

        assert.equal(result.success, true);
        assert.equal(uploaded.length, 3);
        assert.deepEqual(deliveries[0].imageUrls, [
            'https://blog.example/media/1.png',
            'https://blog.example/media/2.png',
            'https://blog.example/media/3.png'
        ]);
        assert.deepEqual(deleted, [1, 2, 3]);
        assert.equal(result.results[0].external_link, 'https://social.example/1');
    } finally {
        fs.rmSync(data.root, { recursive: true, force: true });
    }
});

test('publish rejects channels whose image limit is below the card count before uploading', async () => {
    const data = fixture();
    let uploadCalled = false;
    try {
        const service = createCardNewsPublishingService({
            CONFIG: config(),
            generationService: { resolveCompleteAssets: () => data },
            bufferClient: { shareNowMany: async () => [] },
            createWordPressClient: () => ({
                isConfigured: () => true,
                async uploadMedia() { uploadCalled = true; },
                async deleteMedia() { return true; }
            })
        });
        await assert.rejects(
            () => service.publish({ generation_id: 'generation-123', channel_ids: ['pinterest-1'], text: '카드뉴스' }),
            (error) => error.code === 'CARD_NEWS_CHANNEL_ASSET_LIMIT'
        );
        assert.equal(uploadCalled, false);
    } finally {
        fs.rmSync(data.root, { recursive: true, force: true });
    }
});

test('partial WordPress upload failure removes images already uploaded', async () => {
    const data = fixture();
    const deleted = [];
    let uploadCount = 0;
    try {
        const service = createCardNewsPublishingService({
            CONFIG: config(),
            generationService: { resolveCompleteAssets: () => data },
            bufferClient: { shareNowMany: async () => [] },
            createWordPressClient: () => ({
                isConfigured: () => true,
                async uploadMedia() {
                    uploadCount += 1;
                    return uploadCount === 1 ? { id: 91, url: 'https://blog.example/media/91.png' } : null;
                },
                async deleteMedia(id) { deleted.push(id); return true; }
            })
        });
        await assert.rejects(
            () => service.publish({ generation_id: 'generation-123', channel_ids: ['instagram-1'], text: '카드뉴스' }),
            (error) => error.code === 'CARD_NEWS_MEDIA_UPLOAD_FAILED'
        );
        assert.deepEqual(deleted, [91]);
    } finally {
        fs.rmSync(data.root, { recursive: true, force: true });
    }
});

test('ambiguous Buffer timeout retains temporary media to avoid breaking a delivered post', async () => {
    const data = fixture();
    const deleted = [];
    let nextMediaId = 100;
    try {
        const service = createCardNewsPublishingService({
            CONFIG: config(),
            generationService: { resolveCompleteAssets: () => data },
            bufferClient: {
                async shareNowMany() {
                    const error = new Error('timeout');
                    error.code = 'BUFFER_REQUEST_TIMEOUT';
                    throw error;
                }
            },
            createWordPressClient: () => ({
                isConfigured: () => true,
                async uploadMedia(_buffer, _fileName) {
                    const id = nextMediaId++;
                    return { id, url: `https://blog.example/media/${id}.png` };
                },
                async deleteMedia(id) { deleted.push(id); return true; }
            })
        });
        await assert.rejects(
            () => service.publish({ generation_id: 'generation-123', channel_ids: ['instagram-1'], text: '카드뉴스' }),
            (error) => error.code === 'BUFFER_REQUEST_TIMEOUT' && error.status === 504
        );
        assert.deepEqual(deleted, []);
    } finally {
        fs.rmSync(data.root, { recursive: true, force: true });
    }
});

test('channel normalization keeps provider limits outside the UI', () => {
    assert.equal(normalizeChannel({ service: 'X/Twitter' }).max_assets, 4);
    assert.equal(normalizeChannel({ service: 'YouTube' }).supported, false);
});

test('publishing config rejects unsupported remote formats and Instagram story ratios before upload', () => {
    const data = fixture();
    data.assets[0].mime_type = 'image/avif';
    data.generation.settings = { aspect_ratio: '9:16' };
    try {
        const service = createCardNewsPublishingService({
            CONFIG: config(),
            generationService: { resolveCompleteAssets: () => data },
            bufferClient: { shareNowMany: async () => [] },
            createWordPressClient: () => ({})
        });
        const result = service.getConfig('generation-123');
        assert.equal(result.channels.find((item) => item.service === 'instagram').compatible, false);
        assert.match(result.channels.find((item) => item.service === 'instagram').reason, /PNG, JPG 또는 WebP/);
    } finally {
        fs.rmSync(data.root, { recursive: true, force: true });
    }
});
