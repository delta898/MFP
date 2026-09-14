const SIMPLE_GREETING_PATTERN = /^(?:(?:hi)+|hello+|hey+|안녕(?:하세요)?|반가워(?:요)?)[\s!?.~]*$/iu;

function getSimpleConversationReply(text) {
    const normalized = String(text || '').trim();
    if (!normalized || !SIMPLE_GREETING_PATTERN.test(normalized)) return '';
    return '안녕하세요! 무엇을 도와드릴까요? 사용 가능한 기능은 /help에서 확인할 수 있어요.';
}

module.exports = {
    getSimpleConversationReply
};
