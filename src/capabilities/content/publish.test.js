const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createPublishCapabilities,
    normalizePublishParams
} = require('./publish');

function getExecuteCapability(options = {}) {
    const capabilities = createPublishCapabilities(options);
    return capabilities.find((item) => item.id === 'content.publish.execute');
}

test('publish params keep zero-based row indices', () => {
    const normalized = normalizePublishParams({
        targetRowIndices: [0, 1, '2', -1, 'x']
    });

    assert.deepEqual(normalized.targetRowIndices, [0, 1, 2]);
});

test('publish execute starts background publish via async endpoint', async () => {
    const requests = [];
    const capability = getExecuteCapability({
        axios: {
            async post(url, data) {
                requests.push({ url, data });
                return {
                    data: {
                        data: {
                            startedAt: '2026-03-14T10:00:00.000Z'
                        }
                    }
                };
            }
        },
        CONFIG: {
            UI_SERVER_PORT: 4577
        }
    });

    const result = await capability.execute({
        targetRowIndices: [0],
        platforms: ['naver']
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://127.0.0.1:4577/api/v1/auto/publish/start');
    assert.deepEqual(requests[0].data.targetRowIndices, [0]);
    assert.equal(result.success, true);
    assert.equal(result.data.startedAt, '2026-03-14T10:00:00.000Z');
    assert.deepEqual(result.data.targetRowIndices, [0]);
    assert.equal(result.sideEffects.includes('publish_run_started'), true);
});

test('publish execute reports running state when another publish is already active', async () => {
    const capability = getExecuteCapability({
        axios: {
            async post() {
                const error = new Error('Conflict');
                error.response = { status: 409 };
                throw error;
            }
        },
        CONFIG: {
            UI_SERVER_PORT: 4577
        }
    });

    const result = await capability.execute({
        targetRowIndices: [3]
    });

    assert.equal(result.success, false);
    assert.equal(result.data.running, true);
});
