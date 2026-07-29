const test = require('node:test');
const assert = require('node:assert/strict');
const { BufferApiError } = require('./gateways/buffer-client');
const {
    composeSnsPostText,
    requiresImageAsset,
    createSnsDistributionRunner
} = require('./sns-distribution-runner');

function createConfig(overrides = {}) {
    return {
        SNS_PUBLISH_ENABLED: true,
        SNS_SOURCE_BLOGS: ['naver'],
        BUFFER_API_KEY: 'buffer-key',
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
    return {
        processing,
        results,
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
        getEnableSnsDistribution: (features) => features?.enable_sns_distribution === true,
        sleep: options.sleep || (async () => {}),
        retryDelayMs: 10,
        maxAttempts: 3,
        Logger: { info() {}, warn() {} }
    });
}

test('SNS content composer combines title and original URL', () => {
    assert.equal(
        composeSnsPostText({ title: '새 글', originalUrl: 'https://blog.example/1' }),
        '새 글\n\nhttps://blog.example/1'
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
    assert.deepEqual(store.processing[0].targets.map((row) => row.rowNumber), [2, 3]);
    assert.deepEqual(store.results.map((item) => [item.rowNumber, item.status]), [
        [4, '건너뜀'],
        [2, '완료'],
        [3, '실패']
    ]);
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
