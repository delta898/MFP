const CARD_NEWS_SHEET_NAME = 'cardnews';

const CARD_NEWS_SHEET_HEADERS = Object.freeze([
    'entry_key', '상태', '발행 상태', '원문 플랫폼', '글 제목', '원문 URL',
    'RSS GUID', 'RSS 발행일시', '수집일시', 'generation_id', '카드 수',
    '발행 채널', '게시물 링크', '예약일시', '처리일시', '마지막 오류'
]);

const CARD_NEWS_WORKFLOW_STATUSES = Object.freeze(['후보', '제작 중', '제작 완료', '제외']);
const CARD_NEWS_PUBLISHING_STATUSES = Object.freeze(['미발행', '예약', '발행 중', '일부 완료', '발행 완료', '실패']);

function buildStatusValidationRequest(sheetId, columnIndex, values) {
    return {
        setDataValidation: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
            rule: {
                condition: { type: 'ONE_OF_LIST', values: values.map((value) => ({ userEnteredValue: value })) },
                showCustomUi: true,
                strict: true
            }
        }
    };
}

function buildCardNewsStatusValidationRequests(sheetId) {
    return [
        buildStatusValidationRequest(sheetId, CARD_NEWS_SHEET_HEADERS.indexOf('상태'), CARD_NEWS_WORKFLOW_STATUSES),
        buildStatusValidationRequest(sheetId, CARD_NEWS_SHEET_HEADERS.indexOf('발행 상태'), CARD_NEWS_PUBLISHING_STATUSES)
    ];
}

module.exports = {
    CARD_NEWS_SHEET_NAME,
    CARD_NEWS_SHEET_HEADERS,
    CARD_NEWS_WORKFLOW_STATUSES,
    CARD_NEWS_PUBLISHING_STATUSES,
    buildCardNewsStatusValidationRequests
};
