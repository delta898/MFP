const test = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('../../utils');
const { createAiMemoryContentIdeaProvider } = require('./ai-memory');

test('AI idea provider falls back quickly with natural Korean when Chat Model is rate limited', async () => {
    const originalCallChatText = Utils.callChatText;
    let calls = 0;
    Utils.callChatText = async (_prompt, retries, options) => {
        calls += 1;
        assert.equal(retries, 1);
        assert.equal(options.maxTokens, 1024);
        assert.equal(options.reasoningEffort, 'minimal');
        assert.equal(options.responseMimeType, 'application/json');
        throw new Error('Request failed with status code 429');
    };

    try {
        const provider = createAiMemoryContentIdeaProvider();
        const result = await provider.generate({ limit: 1 }, {
            recommendationCandidates: [{
                id: 'candidate-1',
                topic_seed: '임지연 다이어트',
                explanation: '최근 트렌드 주제입니다.'
            }]
        });

        assert.equal(calls, 1);
        assert.equal(result.ideas.length, 1);
        assert.equal(result.ideas[0].source, 'candidate_fallback');
        assert.doesNotMatch(result.ideas[0].title, /을\(를\)/);
    } finally {
        Utils.callChatText = originalCallChatText;
    }
});

test('AI output is constrained to selected candidates and fills omitted candidates safely', async () => {
    const originalCallChatText = Utils.callChatText;
    let prompt = '';
    let requestOptions = null;
    Utils.callChatText = async (receivedPrompt, _retries, options) => {
        prompt = receivedPrompt;
        requestOptions = options;
        return JSON.stringify({
            ideas: [
                { candidate_id: 'candidate-1', title: '선택된 후보를 자연스럽게 다듬은 글감' },
                { candidate_id: 'invented-candidate', title: 'AI가 임의로 만든 글감' }
            ]
        });
    };

    try {
        const provider = createAiMemoryContentIdeaProvider();
        const result = await provider.generate({ limit: 2 }, {
            recommendationCandidates: [
                { id: 'candidate-1', topic_seed: '첫 번째 후보', explanation: '첫 번째 근거' },
                { id: 'candidate-2', topic_seed: '두 번째 후보', explanation: '두 번째 근거' }
            ]
        });

        assert.deepEqual(result.ideas.map((idea) => idea.candidate_id), ['candidate-1', 'candidate-2']);
        assert.doesNotMatch(result.ideas.map((idea) => idea.title).join(' '), /임의로 만든/);
        assert.match(prompt, /주제 선택은 프로그램이 이미 끝냈습니다/);
        assert.doesNotMatch(prompt, /최근 action|최근 설정 변경|외부 트렌드 신호/);
        assert.deepEqual(requestOptions.responseJsonSchema.properties.ideas.items.properties.candidate_id.enum, ['candidate-1', 'candidate-2']);
        assert.equal(requestOptions.maxTokens, 1024);
        assert.equal(requestOptions.logTokenUsage, true);
    } finally {
        Utils.callChatText = originalCallChatText;
    }
});
