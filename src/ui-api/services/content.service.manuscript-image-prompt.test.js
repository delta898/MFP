const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');

test('image prompt generation sends nearby manuscript context and current user inputs to the writing model', async () => {
    let modelPrompt = '';
    const logs = [];
    const service = createContentService({
        CONFIG: {
            TEXT_MODEL_CONFIG: { provider: 'google', code: 'test-model' },
            TEXT_MODEL_API_KEY: 'test-key'
        },
        Utils: {
            parseMarkdown() {},
            findImageByPrefix() {}
        },
        blogWritingApplication: {
            async generateText(prompt, context) {
                modelPrompt = prompt;
                assert.deepEqual(context.modelSelection, { provider: 'google', modelId: 'test-model' });
                assert.deepEqual(context.generationOptions, { maxOutputTokens: 900, temperature: 0.4 });
                return JSON.stringify({ title: '동해가 보이는 객실', prompt: '동해의 푸른 바다를 담은 호텔 객실' });
            }
        },
        Logger: { info(message) { logs.push(message); } },
        manuscriptDraftService: {
            getDraft() {
                return {
                    rawMarkdown: [
                        '# 강릉 여행',
                        '',
                        '강릉 숙소에서 동해를 바라본 아침 풍경입니다.',
                        '',
                        '파도 소리를 들으며 편안하게 쉴 수 있었습니다.',
                        '',
                        '[[IMAGE_0',
                        'id: target-block',
                        'title: 서울 골목 빵집',
                        'prompt: 서울 빵집 이미지',
                        ']]',
                        '',
                        '## 서울 빵집',
                        '',
                        '서울 골목 빵집의 갓 구운 빵 이야기입니다.'
                    ].join('\n'),
                    images: [{
                        slotId: 'slot-target',
                        blockId: 'target-block',
                        index: 0,
                        title: '저장된 제목',
                        prompt: '저장된 프롬프트'
                    }]
                };
            }
        }
    });

    const result = await service.generateManuscriptImagePrompt({
        draftId: 'draft-1',
        slotId: 'slot-target',
        title: '화면의 현재 제목',
        prompt: '화면의 현재 프롬프트',
        instruction: '따뜻한 색감으로'
    });

    assert.deepEqual(result, {
        title: '동해가 보이는 객실',
        prompt: '동해의 푸른 바다를 담은 호텔 객실'
    });
    assert.match(modelPrompt, /강릉 숙소에서 동해를 바라본 아침 풍경/);
    assert.match(modelPrompt, /파도 소리를 들으며 편안하게 쉴 수 있었습니다/);
    assert.doesNotMatch(modelPrompt, /서울 골목 빵집의 갓 구운 빵 이야기/);
    assert.match(modelPrompt, /화면의 현재 제목/);
    assert.match(modelPrompt, /화면의 현재 프롬프트/);
    assert.match(modelPrompt, /따뜻한 색감으로/);
    assert.match(modelPrompt, /상충하면 원고를 우선합니다/);
    assert.match(logs[0], /매칭 block_id/);
    assert.doesNotMatch(logs.join('\n'), /강릉 숙소에서 동해/);
});
