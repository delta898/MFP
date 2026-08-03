const test = require('node:test');
const assert = require('node:assert/strict');
const { createManualSnsService, normalizeImageUrl } = require('./manual-sns-service');

function createConfig(overrides = {}) {
    return {
        BUFFER_API_KEY: 'buffer-secret',
        BUFFER_CHANNELS: [
            { id: 'threads-1', service: 'threads', display_name: 'Threads' },
            { id: 'instagram-1', service: 'instagram', display_name: 'Instagram' },
            { id: 'x-1', service: 'twitter', display_name: 'X' }
        ],
        SNS_PUBLISH_ENABLED: false,
        ...overrides
    };
}

test('composer config exposes channels but never the Buffer key or automation state', () => {
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: { async shareNowMany() { return []; } }
    });
    const result = service.getComposerConfig();

    assert.equal(result.configured, true);
    assert.equal(result.channels.length, 3);
    assert.equal(result.channels[0].limit, 500);
    assert.equal(result.channels[1].image_required, true);
    assert.equal(result.ai.available, false);
    assert.equal(JSON.stringify(result).includes('buffer-secret'), false);
    assert.equal(Object.hasOwn(result, 'SNS_PUBLISH_ENABLED'), false);
});

test('composer config exposes only public Chat Model availability', () => {
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: { async shareNowMany() { return []; } },
        aiService: {
            getManualOptimizationAvailability() {
                return { available: true, model_name: 'Chat Model' };
            }
        }
    });

    const result = service.getComposerConfig();
    assert.deepEqual(result.ai, { available: true, model_name: 'Chat Model' });
    assert.equal(JSON.stringify(result).includes('buffer-secret'), false);
});

test('manual optimization delegates to Chat Model with the shortest selected channel limit', async () => {
    const calls = [];
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: { async shareNowMany() { return []; } },
        aiService: {
            getManualOptimizationAvailability() {
                return { available: true, model_name: 'Chat Model' };
            },
            async optimizeManualPost(input) {
                calls.push(input);
                return {
                    text: '다듬은 글 #태그',
                    model_name: 'Chat Model',
                    max_length: input.maxLength,
                    within_limit: true
                };
            }
        }
    });

    const result = await service.optimize({
        channelIds: ['threads-1', 'x-1'],
        text: '초안'
    });

    assert.equal(result.optimized_text, '다듬은 글 #태그');
    assert.equal(result.max_length, 280);
    assert.equal(calls[0].maxLength, 280);
    assert.deepEqual(calls[0].services, ['threads', 'twitter']);
});

test('manual publish works while SNS automation is disabled', async () => {
    const calls = [];
    const service = createManualSnsService({
        CONFIG: createConfig({ SNS_PUBLISH_ENABLED: false }),
        bufferClient: {
            async shareNowMany(apiKey, deliveries) {
                calls.push({ apiKey, deliveries });
                return deliveries.map((delivery) => ({
                    success: true,
                    channelId: delivery.channelId,
                    bufferPostId: `post-${delivery.channelId}`
                }));
            }
        }
    });

    const result = await service.publish({
        channelIds: ['threads-1', 'x-1'],
        text: '오늘의 짧은 기록'
    });

    assert.equal(result.success, true);
    assert.equal(result.success_count, 2);
    assert.equal(calls[0].apiKey, 'buffer-secret');
    assert.deepEqual(calls[0].deliveries.map((item) => item.channelId), ['threads-1', 'x-1']);
});

test('manual publish rejects a channel that is not in saved Buffer settings', async () => {
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: { async shareNowMany() { throw new Error('must not run'); } }
    });

    await assert.rejects(
        service.publish({ channelIds: ['unknown'], text: '본문' }),
        (error) => error.apiCode === 'MANUAL_SNS_CHANNEL_NOT_CONFIGURED'
    );
});

test('manual publish validates per-channel text limit without truncating', async () => {
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: { async shareNowMany() { throw new Error('must not run'); } }
    });

    await assert.rejects(
        service.publish({ channelIds: ['x-1'], text: '가'.repeat(281) }),
        (error) => error.apiCode === 'MANUAL_SNS_CONTENT_TOO_LONG' && /281\/280/.test(error.message)
    );
});

test('Instagram requires an image and HTTPS image is forwarded to Buffer', async () => {
    const deliveries = [];
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: {
            async shareNowMany(_apiKey, input) {
                deliveries.push(...input);
                return [{ success: true, channelId: 'instagram-1', bufferPostId: 'post-1' }];
            }
        }
    });

    await assert.rejects(
        service.publish({ channelIds: ['instagram-1'], text: '본문' }),
        (error) => error.apiCode === 'MANUAL_SNS_IMAGE_REQUIRED'
    );

    await service.publish({
        channelIds: ['instagram-1'],
        text: '본문',
        imageUrl: 'https://cdn.example/image.jpg'
    });
    assert.equal(deliveries[0].imageUrl, 'https://cdn.example/image.jpg');
});

test('image URL accepts only public-style HTTPS URLs without credentials', () => {
    assert.equal(normalizeImageUrl(''), '');
    assert.equal(normalizeImageUrl('https://cdn.example/image.jpg'), 'https://cdn.example/image.jpg');
    assert.throws(() => normalizeImageUrl('http://cdn.example/image.jpg'), /공개 HTTPS/);
    assert.throws(() => normalizeImageUrl('https://user:pass@cdn.example/image.jpg'), /공개 HTTPS/);
});

test('manual publish preserves partial Buffer results per channel', async () => {
    const service = createManualSnsService({
        CONFIG: createConfig(),
        bufferClient: {
            async shareNowMany() {
                return [
                    { success: true, channelId: 'threads-1', bufferPostId: 'post-1' },
                    { success: false, channelId: 'x-1', code: 'BUFFER_POST_REJECTED', message: 'rejected' }
                ];
            }
        }
    });

    const result = await service.publish({
        channelIds: ['threads-1', 'x-1'],
        text: '본문'
    });

    assert.equal(result.success, false);
    assert.equal(result.success_count, 1);
    assert.equal(result.failure_count, 1);
    assert.equal(result.results[1].code, 'BUFFER_POST_REJECTED');
});
