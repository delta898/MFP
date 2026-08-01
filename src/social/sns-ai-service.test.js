const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseHashtagResponse,
    buildHashtagPrompt,
    createSnsAiService
} = require('./sns-ai-service');

test('SNS AI hashtag parser accepts JSON and plain hashtag output', () => {
    assert.deepEqual(
        parseHashtagResponse('{"hashtags":["#블로그","#자동화","#블로그"]}'),
        ['#블로그', '#자동화']
    );
    assert.deepEqual(parseHashtagResponse('#SNS #Buffer #123'), ['#SNS', '#Buffer']);
    assert.match(buildHashtagPrompt({ title: '제목', summary: '요약' }), /제목: 제목[\s\S]*요약: 요약/);
});

test('SNS AI service uses only the explicitly selected model role', async () => {
    const calls = [];
    const service = createSnsAiService({
        CONFIG: { SNS_AI_MODE: 'blog_text' },
        Utils: {
            async callWritingText(_prompt, retries) {
                calls.push(['blog_text', retries]);
                return '{"hashtags":["#하나","#둘"]}';
            },
            async callChatText() {
                calls.push(['chat']);
                return '';
            }
        }
    });

    const result = await service.generateHashtags({ title: '글', summary: '요약' });

    assert.deepEqual(result.hashtags, ['#하나', '#둘']);
    assert.deepEqual(calls, [['blog_text', 1]]);
});

test('SNS AI service does not fall back or fail publishing when the selected model fails', async () => {
    let chatCalls = 0;
    const service = createSnsAiService({
        CONFIG: { SNS_AI_MODE: 'blog_text' },
        Utils: {
            async callWritingText() {
                throw new Error('text model unavailable');
            },
            async callChatText() {
                chatCalls += 1;
                return '#fallback';
            }
        },
        Logger: { warn() {} }
    });

    const result = await service.generateHashtags({ title: '글' });

    assert.equal(result.success, false);
    assert.deepEqual(result.hashtags, []);
    assert.equal(chatCalls, 0);
});
