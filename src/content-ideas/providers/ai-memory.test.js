const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiMemoryContentIdeaProvider } = require('./ai-memory');

test('AI idea provider falls back quickly with natural Korean when Chat Model is rate limited', async () => {
    let calls = 0;
    const provider = createAiMemoryContentIdeaProvider({ generateText: async (_prompt, options) => {
        calls += 1;
        assert.equal(options.maxTokens, 1024);
        assert.equal(options.reasoningEffort, 'minimal');
        assert.equal(options.responseMimeType, 'application/json');
        throw new Error('Request failed with status code 429');
    } });

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
});

test('AI output is constrained to selected candidates and fills omitted candidates safely', async () => {
    let prompt = '';
    let requestOptions = null;
    const provider = createAiMemoryContentIdeaProvider({ generateText: async (receivedPrompt, options) => {
        prompt = receivedPrompt;
        requestOptions = options;
        return JSON.stringify({
            ideas: [
                { candidate_id: 'candidate-1', title: '선택된 후보를 자연스럽게 다듬은 글감' },
                { candidate_id: 'invented-candidate', title: 'AI가 임의로 만든 글감' }
            ]
        });
    } });

    const result = await provider.generate({ limit: 2 }, {
            recommendationCandidates: [
                { id: 'candidate-1', topic_seed: '오디세이', semantic_context: '영화 오디세이와 그리스 로마신화', explanation: '첫 번째 근거' },
                { id: 'candidate-2', topic_seed: '두 번째 후보', explanation: '두 번째 근거' }
            ]
        });

        assert.deepEqual(result.ideas.map((idea) => idea.candidate_id), ['candidate-1', 'candidate-2']);
        assert.doesNotMatch(result.ideas.map((idea) => idea.title).join(' '), /임의로 만든/);
        assert.match(prompt, /주제 선택은 프로그램이 이미 끝냈습니다/);
        assert.match(prompt, /영화 오디세이와 그리스 로마신화/);
        assert.match(prompt, /동음이의어/);
        assert.doesNotMatch(prompt, /최근 action|최근 설정 변경|외부 트렌드 신호/);
        assert.deepEqual(requestOptions.responseJsonSchema.properties.ideas.items.properties.candidate_id.enum, ['candidate-1', 'candidate-2']);
        assert.equal(requestOptions.responseJsonSchema.properties.ideas.items.properties.reason, undefined);
        assert.equal(requestOptions.maxTokens, 1024);
        assert.equal(requestOptions.logTokenUsage, true);
});

test('AI idea provider uses injected Blog Writing Application text generation', async () => {
    let received;
    const provider = createAiMemoryContentIdeaProvider({
        generateText: async (prompt, options) => {
            received = { prompt, options };
            return JSON.stringify({ ideas: [{
                candidate_id: 'candidate-a',
                title: '프로그램이 고른 후보를 자연스럽게 표현',
                summary: '요약',
                keywords: ['후보']
            }] });
        }
    });
    const result = await provider.generate({ limit: 1 }, {
        recommendationCandidates: [{ id: 'candidate-a', topic_seed: '후보 주제', explanation: '근거' }]
    });

    assert.equal(result.ideas[0].candidate_id, 'candidate-a');
    assert.match(received.prompt, /후보 주제/);
    assert.equal(received.options.temperature, 0.4);
    assert.equal(received.options.maxTokens, 1024);
});
