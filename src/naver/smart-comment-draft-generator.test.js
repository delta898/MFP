const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCommentDraftPrompt,
    generateSmartCommentDrafts,
    parseDraftResponse,
    validateDrafts
} = require('./smart-comment-draft-generator');

test('prompt uses the visible title and excerpt and forbids invented experience', () => {
    const prompt = buildCommentDraftPrompt({
        authorName: '이웃',
        title: '규슈 여행 3일차',
        excerpt: '하카타에서 달걀 김밥과 신선샌드를 사기로 했다.',
        maxChars: 60
    });

    assert.match(prompt, /규슈 여행 3일차/);
    assert.match(prompt, /달걀 김밥과 신선샌드/);
    assert.match(prompt, /경험을 지어내지 않는다/);
    assert.match(prompt, /정확히 3개/);
});

test('strict parser rejects non-JSON fragments instead of recovering arbitrary text', () => {
    const result = parseDraftResponse('제주 is fine).\nNo', 60);
    assert.deepEqual(result.drafts, []);
    assert.match(result.errors[0], /JSON/);
});

test('strict parser accepts one valid JSON object surrounded by model commentary', () => {
    const result = parseDraftResponse('응답입니다.\n```json\n{"drafts":["첫 번째 댓글입니다.","두 번째 댓글입니다.","세 번째 댓글입니다."]}\n```', 60);
    assert.equal(result.errors.length, 0);
    assert.equal(result.drafts.length, 3);
});

test('quality validator rejects short English fragments and duplicate drafts', () => {
    const errors = validateDrafts(['No', '풍경이 정말 아름답네요.', '풍경이 정말 아름답네요.'], 60);
    assert.ok(errors.some((message) => message.includes('너무 짧')));
    assert.ok(errors.some((message) => message.includes('한국어')));
    assert.ok(errors.some((message) => message.includes('중복')));
});

test('generation retries quality failure once and returns corrected drafts', async () => {
    const responses = [
        '{"drafts":["No","좋네요","좋네요"]}',
        '{"drafts":["하카타에서 고른 간식 조합이 여행 분위기와 잘 어울리네요.","달걀 김밥을 기다린 과정까지 여행의 추억이 된 것 같아요.","신선샌드를 포기한 대목이 현실적인 여행 이야기라 공감돼요."]}'
    ];
    const prompts = [];
    const drafts = await generateSmartCommentDrafts({
        callModel: async (_mode, prompt) => {
            prompts.push(prompt);
            return responses.shift();
        },
        aiMode: 'default',
        title: '규슈 여행 3일차',
        excerpt: '하카타에서 달걀 김밥과 신선샌드를 사기로 했다.',
        maxChars: 80,
        logger: { debug() {} }
    });

    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /이전 응답의 문제/);
    assert.equal(drafts.length, 3);
});

test('generation stops after one quality regeneration', async () => {
    let calls = 0;
    await assert.rejects(
        () => generateSmartCommentDrafts({
            callModel: async () => {
                calls += 1;
                return '{"drafts":["No","No","No"]}';
            },
            title: '제목',
            excerpt: '본문 일부',
            maxChars: 60
        }),
        (error) => error.code === 'COMMENT_DRAFT_QUALITY_FAILED'
    );
    assert.equal(calls, 2);
});
