const test = require('node:test');
const assert = require('node:assert/strict');
const { createManualSnsService, normalizeImageUrl } = require('./manual-sns-service');

function createConfig(overrides = {}) {
    return {
        BUFFER_API_KEY: 'buffer-secret',
        BUFFER_ORGANIZATION_ID: 'organization-1',
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
    assert.equal(result.local_media_available, false);
    assert.equal(JSON.stringify(result).includes('buffer-secret'), false);
    assert.equal(Object.hasOwn(result, 'SNS_PUBLISH_ENABLED'), false);
});

test('composer config enables local media only when WordPress and media dependencies are ready', () => {
    const service = createManualSnsService({
        CONFIG: createConfig({
            WORDPRESS_URL: 'https://blog.example',
            WORDPRESS_USER_ID: 'editor',
            WORDPRESS_APP_PASSWORD: 'app-password'
        }),
        bufferClient: { async shareNowMany() { return []; } },
        parseImagePayload() {},
        createWordPressClient() {}
    });

    assert.equal(service.getComposerConfig().local_media_available, true);
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

test('manual publish works in development while SNS automation is disabled', async () => {
    const calls = [];
    const service = createManualSnsService({
        CONFIG: createConfig({
            SNS_PUBLISH_ENABLED: false,
            RUNTIME_ENVIRONMENT_PROFILE: {
                environment: 'development',
                configured: true,
                effects: { manualPublish: true, automatedPublish: false, livePublish: false }
            }
        }),
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

test('manual SNS publish is blocked before Buffer access in local', async () => {
    let publishCount = 0;
    const service = createManualSnsService({
        CONFIG: createConfig({
            RUNTIME_ENVIRONMENT_PROFILE: {
                environment: 'local',
                configured: true,
                effects: { manualPublish: false, automatedPublish: false, livePublish: false }
            }
        }),
        bufferClient: {
            async shareNowMany() {
                publishCount += 1;
                return [];
            }
        }
    });

    await assert.rejects(
        () => service.publish({ channelIds: ['threads-1'], text: '로컬 환경 테스트' }),
        (error) => error.apiCode === 'MANUAL_PUBLISH_BLOCKED_BY_ENVIRONMENT'
    );
    assert.equal(publishCount, 0);
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

function createLocalMediaDeps(overrides = {}) {
    const calls = { upload: [], remove: [], share: [], query: [] };
    const wordpressClient = {
        isConfigured() { return true; },
        async uploadMedia(...args) {
            calls.upload.push(args);
            return { id: 91, url: 'https://blog.example/wp-content/uploads/manual.png' };
        },
        async deleteMedia(mediaId) {
            calls.remove.push(mediaId);
            return true;
        }
    };
    const deps = {
        CONFIG: createConfig({
            WORDPRESS_URL: 'https://blog.example',
            WORDPRESS_USER_ID: 'editor',
            WORDPRESS_APP_PASSWORD: 'app-password'
        }),
        parseImagePayload() {
            return { buffer: Buffer.from('local-image'), ext: '.png' };
        },
        createWordPressClient() { return wordpressClient; },
        bufferClient: {
            async shareNowMany(_apiKey, deliveries) {
                calls.share.push(deliveries);
                return deliveries.map((delivery) => ({
                    success: true,
                    channelId: delivery.channelId,
                    bufferPostId: `post-${delivery.channelId}`
                }));
            },
            async getPostsByIds(_apiKey, postIds) {
                calls.query.push(postIds);
                return postIds.map((postId) => ({
                    id: postId,
                    status: 'sent',
                    externalLink: `https://social.example/${postId}`
                }));
            }
        },
        ...overrides
    };
    return { deps, calls, wordpressClient };
}

test('local image is uploaded to WordPress, published, confirmed sent, and deleted', async () => {
    const { deps, calls } = createLocalMediaDeps();
    const service = createManualSnsService(deps);

    const result = await service.publish({
        channelIds: ['threads-1', 'x-1'],
        text: '로컬 이미지 테스트',
        localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
    });

    assert.equal(calls.upload.length, 1);
    assert.equal(calls.upload[0][3], 'image/png');
    assert.equal(calls.share[0][0].imageUrl, 'https://blog.example/wp-content/uploads/manual.png');
    assert.deepEqual(calls.remove, [91]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].status, 'sent');
    assert.deepEqual(result.media_cleanup, { attempted: true, retained: false });
});

test('Buffer terminal error still deletes temporary WordPress media', async () => {
    const { deps, calls } = createLocalMediaDeps();
    deps.bufferClient.getPostsByIds = async (_apiKey, postIds) => postIds.map((postId) => ({
        id: postId,
        status: 'error',
        error: { message: 'Buffer could not fetch the image' }
    }));
    const service = createManualSnsService(deps);

    const result = await service.publish({
        channelIds: ['threads-1'],
        text: '실패 테스트',
        localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
    });

    assert.deepEqual(calls.remove, [91]);
    assert.equal(result.success, false);
    assert.equal(result.results[0].code, 'BUFFER_POST_PUBLISH_FAILED');
});

test('Buffer request failure deletes temporary WordPress media before returning the error', async () => {
    const { deps, calls } = createLocalMediaDeps();
    deps.bufferClient.shareNowMany = async () => {
        const error = new Error('Buffer unavailable');
        error.code = 'BUFFER_CONNECTION_FAILED';
        throw error;
    };
    const service = createManualSnsService(deps);

    await assert.rejects(
        service.publish({
            channelIds: ['threads-1'],
            text: 'Buffer 요청 실패',
            localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
        }),
        (error) => error.apiCode === 'BUFFER_CONNECTION_FAILED'
    );
    assert.deepEqual(calls.remove, [91]);
});

test('Buffer request timeout retains temporary WordPress media because delivery is ambiguous', async () => {
    const { deps, calls } = createLocalMediaDeps();
    deps.bufferClient.shareNowMany = async () => {
        const error = new Error('Buffer가 60초 안에 응답하지 않았습니다.');
        error.code = 'BUFFER_REQUEST_TIMEOUT';
        throw error;
    };
    const service = createManualSnsService(deps);

    await assert.rejects(
        service.publish({
            channelIds: ['threads-1'],
            text: 'Buffer 시간 초과',
            localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
        }),
        (error) => error.apiCode === 'BUFFER_REQUEST_TIMEOUT'
            && error.status === 504
            && /즉시 다시 시도하지 마세요/.test(error.message)
    );
    assert.deepEqual(calls.remove, []);
});

test('Buffer request timeout recovers matching recent posts and completes media cleanup', async () => {
    const { deps, calls } = createLocalMediaDeps();
    deps.bufferClient.shareNowMany = async () => {
        const error = new Error('Buffer가 60초 안에 응답하지 않았습니다.');
        error.code = 'BUFFER_REQUEST_TIMEOUT';
        throw error;
    };
    deps.bufferClient.listRecentPosts = async (_apiKey, input) => {
        calls.recovery = input;
        return [{
            id: 'recovered-post',
            channelId: 'threads-1',
            text: '복구 테스트',
            status: 'sent',
            createdAt: '2026-08-03T04:47:54.374Z'
        }];
    };
    const service = createManualSnsService(deps);

    const result = await service.publish({
        channelIds: ['threads-1'],
        text: '복구 테스트',
        localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
    });

    assert.equal(calls.recovery.organizationId, 'organization-1');
    assert.deepEqual(calls.recovery.channelIds, ['threads-1']);
    assert.deepEqual(calls.remove, [91]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].buffer_post_id, 'recovered-post');
    assert.equal(result.results[0].status, 'sent');
});

test('Buffer request timeout retries recent-post recovery without resending the publish request', async () => {
    const sleeps = [];
    let recoveryCalls = 0;
    let publishCalls = 0;
    const { deps, calls } = createLocalMediaDeps({
        recoveryMaxAttempts: 3,
        recoveryIntervalMs: 5000,
        async sleep(ms) { sleeps.push(ms); }
    });
    deps.bufferClient.shareNowMany = async () => {
        publishCalls += 1;
        const error = new Error('Buffer가 60초 안에 응답하지 않았습니다.');
        error.code = 'BUFFER_REQUEST_TIMEOUT';
        throw error;
    };
    deps.bufferClient.listRecentPosts = async () => {
        recoveryCalls += 1;
        if (recoveryCalls === 1) return [];
        return [{
            id: 'delayed-recovered-post',
            channelId: 'threads-1',
            text: '지연 복구 테스트',
            status: 'sent',
            createdAt: '2026-08-03T04:47:54.374Z'
        }];
    };
    const service = createManualSnsService(deps);

    const result = await service.publish({
        channelIds: ['threads-1'],
        text: '지연 복구 테스트',
        localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
    });

    assert.equal(publishCalls, 1);
    assert.equal(recoveryCalls, 2);
    assert.deepEqual(sleeps, [5000]);
    assert.deepEqual(calls.remove, [91]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].buffer_post_id, 'delayed-recovered-post');
});

test('WordPress upload failure stops before Buffer publishing', async () => {
    const { deps, calls, wordpressClient } = createLocalMediaDeps();
    wordpressClient.uploadMedia = async () => null;
    const service = createManualSnsService(deps);

    await assert.rejects(
        service.publish({
            channelIds: ['threads-1'],
            text: '업로드 실패',
            localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
        }),
        (error) => error.apiCode === 'MANUAL_SNS_WORDPRESS_UPLOAD_FAILED' && /이미지 URL/.test(error.message)
    );
    assert.equal(calls.share.length, 0);
    assert.equal(calls.remove.length, 0);
});

test('Buffer status timeout retains temporary WordPress media without a recovery job', async () => {
    const { deps, calls } = createLocalMediaDeps({ pollTimeoutMs: 0 });
    deps.bufferClient.getPostsByIds = async (_apiKey, postIds) => postIds.map((postId) => ({
        id: postId,
        status: 'sending'
    }));
    const service = createManualSnsService(deps);

    const result = await service.publish({
        channelIds: ['threads-1'],
        text: '시간 초과',
        localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
    });

    assert.equal(calls.remove.length, 0);
    assert.equal(result.results[0].code, 'BUFFER_POST_STATUS_TIMEOUT');
    assert.deepEqual(result.media_cleanup, { attempted: false, retained: true });
});

test('WordPress cleanup failure is reported without changing a successful SNS result', async () => {
    const { deps, calls, wordpressClient } = createLocalMediaDeps();
    wordpressClient.deleteMedia = async (mediaId) => {
        calls.remove.push(mediaId);
        return false;
    };
    const service = createManualSnsService(deps);

    const result = await service.publish({
        channelIds: ['threads-1'],
        text: '정리 실패',
        localImage: { fileName: 'photo.png', mimeType: 'image/png', base64Data: 'ignored' }
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.media_cleanup, { attempted: true, retained: true });
});
