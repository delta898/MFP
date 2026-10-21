const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createRegisterTopicCapabilities,
    normalizeRegisterTopicParams
} = require('./register-topic');

function getExecuteCapability(options = {}) {
    const capabilities = createRegisterTopicCapabilities(options);
    return capabilities.find((item) => item.id === 'content.register_topic.execute');
}

test('register topic execute routes topic capture through Blog Queue Management Application', async () => {
    const capability = getExecuteCapability({
        blogQueueManagementApplication: {
            async captureTopic(input, options) {
                assert.equal(input.subject, '애드센스');
                assert.equal(input.targets[0], 'naver');
                assert.equal(input.imageMode, 'generate');
                assert.ok(options.memoryProvenance);
                return { action: 'enqueue', status: '발행 준비 완료', rowIndex: 12, rowNumber: 14 };
            }
        }
    });

    const result = await capability.execute({ theme: '애드센스', platforms: ['naver'] }, {
        channel: 'telegram', user: { id: 'user-1' }
    });

    assert.equal(result.success, true);
    assert.equal(result.data.status, '발행 준비 완료');
    assert.deepEqual(result.data.rowIndices, [12]);
});

test('register topic can save an idea instead of adding it to the publishing queue', async () => {
    let capturedInput;
    const capability = getExecuteCapability({
        blogQueueManagementApplication: {
            async captureTopic(input) {
                capturedInput = input;
                return { action: 'save', status: '대기', rowIndex: 4, rowNumber: 6 };
            }
        }
    });

    const result = await capability.execute({
        theme: '가을 여행',
        platforms: ['naver'],
        action: 'save'
    }, {
        channel: 'mcp',
        user: { id: 'user-1' }
    });

    assert.equal(result.success, true);
    assert.equal(capturedInput.subject, '가을 여행');
    assert.equal(result.data.action, 'save');
    assert.equal(result.data.status, '대기');
    assert.deepEqual(result.data.rowIndices, [4]);
    assert.equal(result.data.rowCount, 1);
});

test('register topic requires a connected queue application before exposing execution', () => {
    const capability = getExecuteCapability();
    assert.equal(capability.agentExposure, undefined);
});

test('register topic preparation helper is not advertised as a user-facing Agent action', () => {
    const prepare = createRegisterTopicCapabilities().find((item) => item.id === 'content.register_topic.prepare');
    assert.equal(prepare.agentExposure, undefined);
});

test('register topic defaults image generation and external reference to true', () => {
    const normalized = normalizeRegisterTopicParams({
        theme: '기본값 테스트'
    });

    assert.equal(normalized.options.image_gen, true);
    assert.equal(normalized.options.external_reference, true);
});
