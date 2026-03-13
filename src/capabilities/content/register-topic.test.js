const test = require('node:test');
const assert = require('node:assert/strict');

const { createRegisterTopicCapabilities } = require('./register-topic');

function getExecuteCapability(options = {}) {
    const capabilities = createRegisterTopicCapabilities(options);
    return capabilities.find((item) => item.id === 'content.register_topic.execute');
}

test('register topic execute throws when sheet append fails', async () => {
    const capability = getExecuteCapability({
        appendGoogleSheetTopics: async () => ({
            success: false,
            message: 'Google OAuth 클라이언트가 아직 구성되지 않았습니다.'
        })
    });

    await assert.rejects(
        () => capability.execute({
            theme: '애드센스',
            platforms: ['naver']
        }, {
            channel: 'mcp',
            user: { id: 'user-1' }
        }),
        /Google OAuth 클라이언트가 아직 구성되지 않았습니다\./
    );
});

test('register topic execute returns row indices when sheet append succeeds', async () => {
    const capability = getExecuteCapability({
        appendGoogleSheetTopics: async () => ({
            success: true,
            rowIndices: [12]
        })
    });

    const result = await capability.execute({
        theme: '애드센스',
        platforms: ['naver']
    }, {
        channel: 'mcp',
        user: { id: 'user-1' }
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data.rowIndices, [12]);
    assert.equal(result.data.rowCount, 1);
});
