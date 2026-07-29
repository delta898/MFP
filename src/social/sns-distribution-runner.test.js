const test = require('node:test');
const assert = require('node:assert/strict');
const { BufferApiError } = require('./gateways/buffer-client');
const {
    buildSnsFailureNotification,
    composeSnsPostText,
    requiresImageAsset,
    createSnsDistributionRunner
} = require('./sns-distribution-runner');

function createConfig(overrides = {}) {
    return {
        SNS_PUBLISH_ENABLED: true,
        SNS_SOURCE_BLOGS: ['naver'],
        SNS_AI_MODE: 'none',
        BUFFER_API_KEY: 'buffer-key',
        NOTIFY_BITLY_TOKEN: '',
        NOTIFY_TELEGRAM_ENABLED: false,
        NOTIFY_TELEGRAM_BOT_TOKEN: '',
        NOTIFY_TELEGRAM_CHAT_ID: '',
        BUFFER_CHANNELS: [
            { id: 'channel-1', service: 'threads' },
            { id: 'channel-2', service: 'bluesky' },
            { id: 'channel-3', service: 'instagram' }
        ],
        ...overrides
    };
}

function createStore(rows = []) {
    const processing = [];
    const results = [];
    const hashtags = [];
    return {
        processing,
        results,
        hashtags,
        async findFirstPendingGroup() {
            if (rows.length === 0) return null;
            return {
                entryKey: rows[0].entryKey,
                firstRowNumber: rows[0].rowNumber,
                rows
            };
        },
        async markGroupProcessing(targets, log) {
            processing.push({ targets, log });
        },
        async applyDeliveryResults(items) {
            results.push(...items);
        },
        async saveEntryHashtags(entryKey, value) {
            hashtags.push({ entryKey, value });
        }
    };
}

function createRunner(options = {}) {
    return createSnsDistributionRunner({
        CONFIG: options.CONFIG || createConfig(),
        License: {
            async checkLicenseStatus() {
                return { success: true, features: { enable_sns_distribution: true } };
            }
        },
        store: options.store,
        bufferClient: options.bufferClient,
        aiService: options.aiService || {
            async generateHashtags() {
                return { success: true, attempted: false, hashtags: [] };
            }
        },
        urlService: options.urlService || {
            async shorten(url) {
                return url;
            }
        },
        notificationService: options.notificationService || {
            async sendNotification() {
                return { success: true };
            }
        },
        getEnableSnsDistribution: (features) => features?.enable_sns_distribution === true,
        sleep: options.sleep || (async () => {}),
        retryDelayMs: 10,
        maxAttempts: 3,
        Logger: { info() {}, warn() {} }
    });
}

test('SNS content composer combines title, summary, URL, and hashtags', () => {
    assert.equal(
        composeSnsPostText({
            service: 'threads',
            title: '새 글',
            summary: '글 요약',
            originalUrl: 'https://blog.example/1',
            hashtags: '#블로그'
        }),
        '새 글\n\n글 요약\n\nhttps://blog.example/1\n\n#블로그'
    );
    assert.equal(requiresImageAsset('Instagram'), true);
    assert.equal(requiresImageAsset('threads'), false);
});

test('distribution runner processes one entry group and records per-channel partial results', async () => {
    const store = createStore([
        {
            rowNumber: 2,
            deliveryKey: 'delivery-1',
            entryKey: 'entry-1',
            sourcePlatform: 'naver',
            service: 'threads',
            channelId: 'channel-1',
            title: '새 글',
            summary: '글 요약',
            originalUrl: 'https://blog.example/1',
            imageUrl: 'https://blog.example/image.jpg'
        },
        {
            rowNumber: 3,
            deliveryKey: 'delivery-2',
            entryKey: 'entry-1',
            sourcePlatform: 'naver',
            service: 'bluesky',
            channelId: 'channel-2',
            title: '새 글',
            originalUrl: 'https://blog.example/1',
            imageUrl: ''
        },
        {
            rowNumber: 4,
            deliveryKey: 'delivery-3',
            entryKey: 'entry-1',
            sourcePlatform: 'naver',
            service: 'instagram',
            channelId: 'channel-3',
            title: '새 글',
            originalUrl: 'https://blog.example/1',
            imageUrl: ''
        }
    ]);
    const calls = [];
    const runner = createRunner({
        store,
        bufferClient: {
            async shareNowMany(_apiKey, deliveries) {
                calls.push(deliveries);
                return [
                    {
                        success: true,
                        deliveryKey: 'delivery-1',
                        channelId: 'channel-1',
                        bufferPostId: 'post-1'
                    },
                    {
                        success: false,
                        deliveryKey: 'delivery-2',
                        channelId: 'channel-2',
                        message: 'Channel disconnected'
                    }
                ];
            }
        }
    });

    const result = await runner.run('test');

    assert.equal(result.code, 'SNS_DISTRIBUTION_PARTIAL');
    assert.equal(result.data.completedCount, 1);
    assert.equal(result.data.failedCount, 1);
    assert.equal(result.data.skippedCount, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 2);
    assert.match(calls[0][0].text, /글 요약/);
    assert.deepEqual(store.processing[0].targets.map((row) => row.rowNumber), [2, 3]);
    assert.deepEqual(store.results.map((item) => [item.rowNumber, item.status]), [
        [4, '건너뜀'],
        [2, '완료'],
        [3, '실패']
    ]);
});

test('distribution runner shortens URL once, generates hashtags once, and saves them before Buffer', async () => {
    const events = [];
    const store = createStore([
        {
            rowNumber: 2,
            deliveryKey: 'delivery-1',
            entryKey: 'entry-1',
            sourcePlatform: 'naver',
            service: 'threads',
            channelName: 'Threads',
            channelId: 'channel-1',
            title: '새 글',
            summary: '핵심 요약',
            originalUrl: 'https://blog.example/long'
        },
        {
            rowNumber: 3,
            deliveryKey: 'delivery-2',
            entryKey: 'entry-1',
            sourcePlatform: 'naver',
            service: 'bluesky',
            channelName: 'Bluesky',
            channelId: 'channel-2',
            title: '새 글',
            summary: '핵심 요약',
            originalUrl: 'https://blog.example/long'
        }
    ]);
    store.saveEntryHashtags = async (entryKey, value) => {
        events.push(`sheet:${entryKey}:${value}`);
    };
    let aiCalls = 0;
    let shortenCalls = 0;
    const runner = createRunner({
        CONFIG: createConfig({
            SNS_AI_MODE: 'chat',
            NOTIFY_BITLY_TOKEN: 'bitly-token'
        }),
        store,
        aiService: {
            async generateHashtags(input) {
                aiCalls += 1;
                assert.equal(input.summary, '핵심 요약');
                return { success: true, hashtags: ['#새글', '#블로그'] };
            }
        },
        urlService: {
            async shorten(url, token) {
                shortenCalls += 1;
                assert.equal(token, 'bitly-token');
                assert.equal(url, 'https://blog.example/long');
                return 'https://bit.ly/short';
            }
        },
        bufferClient: {
            async shareNowMany(_apiKey, deliveries) {
                events.push('buffer');
                assert.equal(deliveries.length, 2);
                assert.match(deliveries[0].text, /https:\/\/bit\.ly\/short/);
                assert.match(deliveries[0].text, /#새글 #블로그/);
                return deliveries.map((delivery, index) => ({
                    success: true,
                    deliveryKey: delivery.deliveryKey,
                    channelId: delivery.channelId,
                    bufferPostId: `post-${index + 1}`
                }));
            }
        }
    });

    const result = await runner.run('test');

    assert.equal(result.success, true);
    assert.equal(aiCalls, 1);
    assert.equal(shortenCalls, 1);
    assert.deepEqual(events, [
        'sheet:entry-1:#새글 #블로그',
        'buffer'
    ]);
});

test('distribution runner reuses stored hashtags without calling AI', async () => {
    const store = createStore([{
        rowNumber: 2,
        deliveryKey: 'delivery-1',
        entryKey: 'entry-1',
        sourcePlatform: 'naver',
        service: 'threads',
        channelId: 'channel-1',
        title: '새 글',
        hashtags: '#직접입력',
        originalUrl: 'https://blog.example/1'
    }]);
    let aiCalled = false;
    const runner = createRunner({
        store,
        aiService: {
            async generateHashtags() {
                aiCalled = true;
                return { hashtags: ['#AI'] };
            }
        },
        bufferClient: {
            async shareNowMany(_apiKey, deliveries) {
                assert.match(deliveries[0].text, /#직접입력/);
                return [{
                    success: true,
                    deliveryKey: 'delivery-1',
                    channelId: 'channel-1',
                    bufferPostId: 'post-1'
                }];
            }
        }
    });

    await runner.run('test');

    assert.equal(aiCalled, false);
    assert.deepEqual(store.hashtags, [{ entryKey: 'entry-1', value: '#직접입력' }]);
});

test('distribution runner does not call Buffer when generated hashtags cannot be saved', async () => {
    const store = createStore([{
        rowNumber: 2,
        deliveryKey: 'delivery-1',
        entryKey: 'entry-1',
        sourcePlatform: 'naver',
        service: 'threads',
        channelName: 'Threads',
        channelId: 'channel-1',
        title: '새 글',
        originalUrl: 'https://blog.example/1'
    }]);
    store.saveEntryHashtags = async () => {
        throw new Error('sheet unavailable');
    };
    let bufferCalled = false;
    let notificationCount = 0;
    const runner = createRunner({
        CONFIG: createConfig({
            SNS_AI_MODE: 'chat',
            NOTIFY_TELEGRAM_ENABLED: true,
            NOTIFY_TELEGRAM_BOT_TOKEN: 'bot',
            NOTIFY_TELEGRAM_CHAT_ID: 'chat'
        }),
        store,
        aiService: {
            async generateHashtags() {
                return { success: true, hashtags: ['#새글'] };
            }
        },
        notificationService: {
            async sendNotification() {
                notificationCount += 1;
                return { success: true };
            }
        },
        bufferClient: {
            async shareNowMany() {
                bufferCalled = true;
                return [];
            }
        }
    });

    const result = await runner.run('test');

    assert.equal(result.code, 'SNS_DISTRIBUTION_PREPARATION_FAILED');
    assert.equal(bufferCalled, false);
    assert.equal(notificationCount, 1);
    assert.deepEqual(store.results.map((item) => [item.rowNumber, item.status]), [[2, '실패']]);
});

test('distribution runner retries transient batch failures up to success', async () => {
    const store = createStore([{
        rowNumber: 2,
        deliveryKey: 'delivery-1',
        entryKey: 'entry-1',
        sourcePlatform: 'naver',
        service: 'threads',
        channelId: 'channel-1',
        title: '새 글',
        originalUrl: 'https://blog.example/1'
    }]);
    let callCount = 0;
    let sleepCount = 0;
    const runner = createRunner({
        store,
        sleep: async () => { sleepCount += 1; },
        bufferClient: {
            async shareNowMany() {
                callCount += 1;
                if (callCount < 3) {
                    throw new BufferApiError('temporary', {
                        code: 'BUFFER_CONNECTION_FAILED'
                    });
                }
                return [{
                    success: true,
                    deliveryKey: 'delivery-1',
                    channelId: 'channel-1',
                    bufferPostId: 'post-1'
                }];
            }
        }
    });

    const result = await runner.run('test');

    assert.equal(result.success, true);
    assert.equal(result.data.attempts, 3);
    assert.equal(callCount, 3);
    assert.equal(sleepCount, 2);
    assert.equal(store.results[0].status, '완료');
});

test('distribution runner reports an empty queue without calling Buffer', async () => {
    const store = createStore([]);
    let called = false;
    const runner = createRunner({
        store,
        bufferClient: {
            async shareNowMany() {
                called = true;
                return [];
            }
        }
    });

    const result = await runner.run('test');

    assert.equal(result.code, 'SNS_DISTRIBUTION_EMPTY');
    assert.equal(called, false);
});

test('distribution runner sends one Telegram alert only after final channel failures', async () => {
    const store = createStore([{
        rowNumber: 2,
        deliveryKey: 'delivery-1',
        entryKey: 'entry-1',
        sourcePlatform: 'naver',
        service: 'threads',
        channelName: '<Threads>',
        channelId: 'channel-1',
        title: '<새 글>',
        originalUrl: 'https://blog.example/1?a=1&b=2'
    }]);
    const notifications = [];
    const runner = createRunner({
        CONFIG: createConfig({
            NOTIFY_TELEGRAM_ENABLED: true,
            NOTIFY_TELEGRAM_BOT_TOKEN: 'bot',
            NOTIFY_TELEGRAM_CHAT_ID: 'chat'
        }),
        store,
        notificationService: {
            async sendNotification(message, options) {
                notifications.push({ message, options });
                return { success: true };
            }
        },
        bufferClient: {
            async shareNowMany() {
                return [{
                    success: false,
                    deliveryKey: 'delivery-1',
                    channelId: 'channel-1',
                    message: 'permanent failure'
                }];
            }
        }
    });

    const result = await runner.run('test');

    assert.equal(result.data.failedCount, 1);
    assert.equal(result.data.notification.attempted, true);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, /&lt;새 글&gt;/);
    assert.match(notifications[0].message, /&lt;Threads&gt;/);
    assert.doesNotMatch(notifications[0].message, /<새 글>/);
});

test('SNS failure notification escapes user-controlled HTML', () => {
    const message = buildSnsFailureNotification({
        rows: [{
            title: '<b>제목</b>',
            originalUrl: 'https://example.com/?a=1&b=2'
        }]
    }, [{
        row: { channelName: '<채널>' },
        message: '<오류>'
    }]);
    assert.match(message, /&lt;b&gt;제목&lt;\/b&gt;/);
    assert.match(message, /&lt;채널&gt;/);
    assert.match(message, /&lt;오류&gt;/);
});
