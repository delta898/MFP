const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentMetaCapabilities } = require('./meta');

test('help capability reports only Agent-exposed capabilities and their examples', async () => {
    const capabilities = createAgentMetaCapabilities({
        listAgentCapabilities: () => [
            {
                id: 'content.idea.suggest',
                confirmPolicy: 'required',
                agentExposure: {
                    category: '블로그 글감',
                    title: '글감 추천',
                    description: '블로그 글감을 제안합니다.',
                    examples: ['게임 글감 추천해줘']
                }
            },
            { id: 'internal.secret.operation' },
            {
                id: 'content.keyword.analyze',
                agentExposure: {
                    category: '키워드',
                    title: '키워드 분석',
                    description: '검색 지표를 확인합니다.',
                    availabilityNote: '라이선스와 키워드 분석 서버 연결이 필요합니다.',
                    examples: []
                }
            }
        ]
    });
    const help = capabilities.find((capability) => capability.name === 'get_help');
    const result = await help.execute();

    assert.match(result.message, /글감 추천/);
    assert.match(result.message, /게임 글감 추천해줘/);
    assert.match(result.message, /키워드 분석/);
    assert.match(result.message, /실행 전에 사용자 확인이 필요합니다/);
    assert.match(result.message, /라이선스와 키워드 분석 서버 연결이 필요합니다/);
    assert.match(result.message, /Plugin Host에 설치된 기능을 모두 뜻하지는 않습니다/);
    assert.doesNotMatch(result.message, /internal\.secret\.operation/);
    assert.doesNotMatch(result.message, /트렌드 수집/);
    assert.equal(result.data.capabilities, 2);
});

test('help capability reports unavailable catalog data without making product claims', async () => {
    const capabilities = createAgentMetaCapabilities({ listAgentCapabilities: () => [] });
    const help = capabilities.find((capability) => capability.name === 'get_help');
    const result = await help.execute();

    assert.match(result.message, /목록을 가져오지 못했습니다/);
    assert.equal(result.data.capabilities, 0);
});

test('identity capability does not claim settings changes or arbitrary task execution', async () => {
    const capabilities = createAgentMetaCapabilities();
    const identity = capabilities.find((capability) => capability.name === 'get_identity');
    const result = await identity.execute();

    assert.match(result.message, /\/help/);
    assert.doesNotMatch(result.message, /설정.*변경|작업 실행/);
});

test('current-time action returns a concrete local date and time without side effects', async () => {
    const capabilities = createAgentMetaCapabilities();
    const currentTime = capabilities.find((capability) => capability.name === 'get_current_time');
    const validation = currentTime.validate({});
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.normalizedParams, {});
    assert.match((await currentTime.preview()).summary, /현재 시각/);

    const result = await currentTime.execute();
    assert.equal(result.success, true);
    assert.match(result.data.now, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.match(result.message, /현재 시각은/);
    assert.deepEqual(result.sideEffects, []);
});
