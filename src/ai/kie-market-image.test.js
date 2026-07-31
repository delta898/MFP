const test = require('node:test');
const assert = require('node:assert/strict');

const {
    KIE_MARKET_CREATE_TASK_ENDPOINT,
    KIE_MARKET_TASK_INFO_ENDPOINT,
    buildNanoBanana2TaskRequest,
    createKieMarketImageClient,
    normalizeKieMarketTask
} = require('./kie-market-image');

test('Nano Banana 2 profile builds the documented Market request', () => {
    const request = buildNanoBanana2TaskRequest({
        provider: 'kie',
        code: 'nano-banana-2',
        transport: 'kie_market_image_jobs'
    }, 'blog hero', {
        aspectRatio: '16:9',
        imageSize: '2K'
    });

    assert.equal(request.definition.transport, 'kie_market_image_jobs');
    assert.deepEqual(request.body, {
        model: 'nano-banana-2',
        input: {
            prompt: 'blog hero',
            image_input: [],
            aspect_ratio: '16:9',
            resolution: '2K',
            output_format: 'png'
        }
    });
});

test('KIE Market task parser handles progress, result JSON, credits, and failure', () => {
    assert.deepEqual(normalizeKieMarketTask({
        data: {
            taskId: 'task-1',
            state: 'success',
            progress: 100,
            resultJson: '{"resultUrls":["https://cdn.example/image.png"]}',
            creditsConsumed: 8
        }
    }), {
        taskId: 'task-1',
        state: 'success',
        progress: 100,
        resultUrls: ['https://cdn.example/image.png'],
        creditsConsumed: 8,
        errorCode: '',
        errorMessage: ''
    });

    assert.equal(normalizeKieMarketTask({
        data: { state: 'fail', failCode: 'FAILED', failMsg: 'bad prompt' }
    }).errorMessage, 'bad prompt');
});

test('KIE Market client submits once, polls the same task, and downloads the result', async () => {
    const calls = [];
    const states = ['waiting', 'generating', 'success'];
    let time = 0;
    const journal = new Map();
    const client = createKieMarketImageClient({
        sleep: async (ms) => { time += ms; },
        now: () => time,
        jobStore: {
            upsert(record) {
                journal.set(record.taskId, {
                    ...(journal.get(record.taskId) || {}),
                    ...record
                });
            },
            get(taskId) {
                return journal.get(taskId);
            }
        },
        httpClient: {
            async post(url, body, config) {
                calls.push({ method: 'post', url, body, config });
                return { data: { code: 200, data: { taskId: 'task-1' } } };
            },
            async get(url, config) {
                calls.push({ method: 'get', url, config });
                if (url === KIE_MARKET_TASK_INFO_ENDPOINT) {
                    const state = states.shift();
                    return {
                        data: {
                            data: {
                                taskId: 'task-1',
                                state,
                                resultJson: state === 'success'
                                    ? '{"resultUrls":["https://cdn.example/image.png"]}'
                                    : ''
                            }
                        }
                    };
                }
                return { data: Buffer.from('png-bytes') };
            }
        }
    });

    const result = await client.generate({
        modelConfig: {
            provider: 'kie',
            code: 'nano-banana-2',
            transport: 'kie_market_image_jobs',
            api_key: 'kie-secret'
        },
        prompt: 'blog hero',
        options: { aspectRatio: '4:3', imageSize: '1K' }
    });

    assert.equal(calls.filter((call) => call.method === 'post').length, 1);
    assert.equal(calls[0].url, KIE_MARKET_CREATE_TASK_ENDPOINT);
    assert.equal(calls[0].config.headers.Authorization, 'Bearer kie-secret');
    const pollCalls = calls.filter((call) => call.url === KIE_MARKET_TASK_INFO_ENDPOINT);
    assert.equal(pollCalls.length, 3);
    pollCalls.forEach((call) => assert.equal(call.config.params.taskId, 'task-1'));
    assert.equal(result.imageBuffer.toString(), 'png-bytes');
    assert.equal(journal.get('task-1').state, 'downloaded');
});

test('KIE Market client does not resubmit when polling fails', async () => {
    let postCalls = 0;
    let time = 0;
    const client = createKieMarketImageClient({
        sleep: async (ms) => { time += ms; },
        now: () => time,
        httpClient: {
            async post() {
                postCalls += 1;
                return { data: { data: { taskId: 'task-2' } } };
            },
            async get() {
                const error = new Error('unauthorized');
                error.response = { status: 401 };
                throw error;
            }
        }
    });

    await assert.rejects(
        client.generate({
            modelConfig: {
                provider: 'kie',
                code: 'nano-banana-2',
                transport: 'kie_market_image_jobs',
                api_key: 'kie-secret'
            },
            prompt: 'blog hero'
        }),
        /상태 조회에 실패했습니다/
    );
    assert.equal(postCalls, 1);
});
