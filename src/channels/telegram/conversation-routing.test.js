const test = require('node:test');
const assert = require('node:assert/strict');
const { getSimpleConversationReply } = require('./conversation-routing');

test('simple greetings receive a conversational reply without becoming a data query', () => {
    assert.match(getSimpleConversationReply('hihi'), /안녕하세요/);
    assert.match(getSimpleConversationReply('Hello!'), /\/help/);
    assert.match(getSimpleConversationReply('안녕하세요~'), /무엇을 도와드릴까요/);
});

test('greetings combined with an actual request continue through intent parsing', () => {
    assert.equal(getSimpleConversationReply('안녕하세요 글감 추천해줘'), '');
    assert.equal(getSimpleConversationReply('현재 상태 알려줘'), '');
});
