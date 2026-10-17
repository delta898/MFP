const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CARD_NEWS_SHEET_NAME,
    CARD_NEWS_SHEET_HEADERS,
    CARD_NEWS_WORKFLOW_STATUSES,
    CARD_NEWS_PUBLISHING_STATUSES,
    buildCardNewsStatusValidationRequests
} = require('./ledger-sheet-schema');

test('cardnews ledger schema keeps workflow and publishing state separate', () => {
    assert.equal(CARD_NEWS_SHEET_NAME, 'cardnews');
    assert.deepEqual(CARD_NEWS_SHEET_HEADERS.slice(0, 3), ['entry_key', '상태', '발행 상태']);
    assert.ok(CARD_NEWS_SHEET_HEADERS.includes('generation_id'));
    assert.ok(CARD_NEWS_SHEET_HEADERS.includes('게시물 링크'));
    assert.deepEqual(CARD_NEWS_WORKFLOW_STATUSES, ['후보', '제작 중', '제작 완료', '제외']);
    assert.deepEqual(CARD_NEWS_PUBLISHING_STATUSES, ['미발행', '예약', '발행 중', '일부 완료', '발행 완료', '실패']);
});

test('cardnews ledger builds a dropdown request for each independent status', () => {
    const requests = buildCardNewsStatusValidationRequests(91);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].setDataValidation.range.sheetId, 91);
    assert.equal(requests[0].setDataValidation.range.startColumnIndex, 1);
    assert.equal(requests[1].setDataValidation.range.startColumnIndex, 2);
    assert.equal(requests[0].setDataValidation.rule.condition.values.length, CARD_NEWS_WORKFLOW_STATUSES.length);
    assert.equal(requests[1].setDataValidation.rule.condition.values.length, CARD_NEWS_PUBLISHING_STATUSES.length);
});
