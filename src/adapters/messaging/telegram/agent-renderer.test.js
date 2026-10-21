const test = require('node:test');
const assert = require('node:assert/strict');

const {
    formatExecutionMessage,
    buildRecommendationKeyboard
} = require('./agent-renderer');

test('execution renderer does not report topic preparation as a completed registration', () => {
    const prepared = formatExecutionMessage([{
        action_domain: 'content.register_topic',
        result: { success: true, message: '글감 등록 준비를 마쳤습니다.', data: { persisted: false } }
    }]);
    const persisted = formatExecutionMessage([{
        action_domain: 'content.register_topic',
        result: { success: true, message: '글감을 보관했습니다.', data: { persisted: true } }
    }]);

    assert.match(prepared, /이렇게 준비했습니다/);
    assert.doesNotMatch(prepared, /등록했습니다/);
    assert.match(persisted, /등록했습니다/);
});

test('execution renderer escapes persisted topic names before sending Markdown messages', () => {
    const message = formatExecutionMessage([{
        action_domain: 'content.queue',
        result: { success: true, message: 'A_B [test]*' }
    }]);

    assert.match(message, /A\\_B \\\[test\]\\\*/);
});

test('topic-list results do not number the section heading like a list item', () => {
    const message = formatExecutionMessage([{
        capability_id: 'content.queue.list_topics',
        action_domain: 'content.queue',
        result: { success: true, message: '발행 대기열 (2건)\n1. 가을 여행 (#96)\n2. 겨울 여행지 추천 (#97)' }
    }]);

    assert.match(message, /\n발행 대기열 \(2건\)\n1\. 가을 여행/);
    assert.doesNotMatch(message, /\n1\. 발행 대기열/);
});

test('renderer uses bounded recommendation feedback callbacks and skips pending confirmations', () => {
    const rows = buildRecommendationKeyboard([{ result: { data: { recommendations: [
        { recommendation_id: 'rec_1234567890abcdef', feedback_enabled: true }
    ] } } }]);
    assert.deepEqual(rows, [[
        { text: '👍 도움됨 1.1', callback_data: 'rec_fb:h:rec_1234567890abcdef' },
        { text: '👎 별로 1.1', callback_data: 'rec_fb:n:rec_1234567890abcdef' }
    ]]);
    rows.flat().forEach((button) => assert.equal(Buffer.byteLength(button.callback_data) <= 64, true));
});
