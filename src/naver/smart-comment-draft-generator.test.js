const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCommentDraftBatchPrompt,
    buildCommentDraftPrompt,
    generateSmartCommentDraftBatch,
    generateSmartCommentDrafts,
    parseBatchDraftResponse,
    parseDraftResponse,
    validateDrafts
} = require('./smart-comment-draft-generator');

const VALID_DRAFTS = [
    { tone: 'empathetic', text: '하카타 간식 조합이 여행 분위기와 잘 어울리네요.' },
    { tone: 'friendly', text: '달걀 김밥을 기다린 과정도 좋은 추억이 된 것 같아요.' },
    { tone: 'calm', text: '신선샌드를 포기한 대목이 현실적이라 공감돼요.' }
];

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
    assert.match(prompt, /empathetic\(공감형\)/);
    assert.match(prompt, /friendly\(친근형\)/);
    assert.match(prompt, /calm\(담백형\)/);
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
    assert.deepEqual(result.drafts.map((draft) => draft.tone), ['empathetic', 'friendly', 'calm']);
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
    assert.deepEqual(drafts.map((draft) => draft.tone), ['empathetic', 'friendly', 'calm']);
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

test('batch prompt keeps candidate ids and requests one structured response', () => {
    const prompt = buildCommentDraftBatchPrompt({
        items: [
            { id: '0', title: '첫 글', excerpt: '첫 글 본문입니다.' },
            { id: '1', title: '둘째 글', excerpt: '둘째 글 본문입니다.' }
        ],
        maxChars: 80
    });
    assert.match(prompt, /"id":"0"/);
    assert.match(prompt, /"id":"1"/);
    assert.match(prompt, /"items"/);
    assert.match(prompt, /"tone":"empathetic"/);
});

test('batch parser validates each candidate independently', () => {
    const parsed = parseBatchDraftResponse(JSON.stringify({
        items: [
            { id: '0', drafts: VALID_DRAFTS },
            { id: '1', drafts: ['No', '좋네요', '좋네요'] }
        ]
    }), [{ id: '0' }, { id: '1' }], 80);
    assert.equal(parsed[0].errors.length, 0);
    assert.ok(parsed[1].errors.length > 0);
});

test('batch generation creates three candidates with one model request', async () => {
    let calls = 0;
    let requestedMaxTokens = 0;
    const items = ['0', '1', '2'].map((id) => ({
        id,
        title: `후보 ${id}`,
        excerpt: `후보 ${id}의 공개 본문 일부입니다.`
    }));
    const results = await generateSmartCommentDraftBatch({
        items,
        maxChars: 80,
        callModel: async (_mode, _prompt, maxTokens) => {
            calls += 1;
            requestedMaxTokens = maxTokens;
            return JSON.stringify({ items: items.map((item) => ({ id: item.id, drafts: VALID_DRAFTS })) });
        }
    });
    assert.equal(calls, 1);
    assert.equal(requestedMaxTokens, 3072);
    assert.equal(results.length, 3);
    assert.ok(results.every((result) => result.drafts.length === 3));
    assert.ok(results.every((result) => result.drafts[1].tone === 'friendly'));
});

test('quality validator rejects missing or duplicate tone variants', () => {
    const errors = validateDrafts([
        { tone: 'empathetic', text: '글의 경험에 자연스럽게 공감되는 내용이에요.' },
        { tone: 'empathetic', text: '소개한 내용이 친근하게 느껴져서 좋았어요.' },
        { tone: 'calm', text: '핵심을 차분하게 정리한 부분이 눈에 들어옵니다.' }
    ], 80);
    assert.ok(errors.some((message) => message.includes('각각 하나씩')));
});
