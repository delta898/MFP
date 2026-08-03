const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isManualOptimizationAvailable,
    parseOptimizedPostResponse,
    buildManualPostOptimizationPrompt,
    parseHashtagResponse,
    buildHashtagPrompt,
    createSnsAiService
} = require('./sns-ai-service');

test('manual SNS optimization availability follows the resolved Chat Model config', () => {
    assert.equal(isManualOptimizationAvailable({}), false);
    assert.equal(isManualOptimizationAvailable({
        CHAT_MODEL_CONFIG: { provider: 'gemini', code: 'gemini-test', api_key: 'secret' }
    }), true);
    assert.equal(isManualOptimizationAvailable({
        CHAT_MODEL_CONFIG: { provider: 'direct', code: 'local-model', base_url: 'http://127.0.0.1:1234/v1' }
    }), true);
});

test('manual SNS optimization parser accepts plain text and JSON text responses', () => {
    assert.equal(parseOptimizedPostResponse('```text\n다듬은 글 #태그\n```'), '다듬은 글 #태그');
    assert.equal(parseOptimizedPostResponse('{"text":"JSON 결과 #태그"}'), 'JSON 결과 #태그');
});

test('manual SNS optimization prompt preserves intent and selected channel limit', () => {
    const prompt = buildManualPostOptimizationPrompt({
        text: '오늘 기록',
        maxLength: 280,
        services: ['twitter', 'threads']
    });

    assert.match(prompt, /의도, 말투, 사실을 보존/);
    assert.match(prompt, /해시태그를 최대 5개/);
    assert.match(prompt, /280자 이하/);
    assert.match(prompt, /대상 채널: twitter, threads/);
    assert.match(prompt, /<원문>\n오늘 기록\n<\/원문>/);
});

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

test('manual SNS optimization uses the common Chat Model once and returns editable text', async () => {
    const calls = [];
    const service = createSnsAiService({
        CONFIG: {
            CHAT_MODEL_CONFIG: {
                provider: 'gemini',
                name: 'Gemini Chat',
                code: 'gemini-chat',
                api_key: 'secret'
            }
        },
        Utils: {
            async callWritingText() {
                throw new Error('writing model must not run');
            },
            async callChatText(prompt, retries, options) {
                calls.push({ prompt, retries, options });
                return '더 읽기 좋은 글입니다.\n\n#기록 #일상';
            }
        }
    });

    const result = await service.optimizeManualPost({
        text: '오늘 기록이다',
        maxLength: 280,
        services: ['twitter']
    });

    assert.equal(result.success, true);
    assert.equal(result.text, '더 읽기 좋은 글입니다.\n\n#기록 #일상');
    assert.equal(result.model_name, 'Gemini Chat');
    assert.equal(result.within_limit, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].retries, 1);
    assert.equal(calls[0].options.usageLabel, 'SNS 글 AI 최적화');
    assert.match(calls[0].prompt, /280자 이하/);
});
