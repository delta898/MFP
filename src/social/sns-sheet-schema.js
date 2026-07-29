const SNS_SHEET_NAME = 'SNS';

const SNS_SHEET_HEADERS = Object.freeze([
    'delivery_key',
    'entry_key',
    '상태',
    '원문 플랫폼',
    '서비스',
    '채널 이름',
    'channel_id',
    '글 제목',
    '글 요약',
    '해시태그',
    '원문 URL',
    '대표 이미지 URL',
    'RSS 발행일시',
    '처리일시',
    'buffer_post_id',
    '로그'
]);

const SNS_DELIVERY_STATUSES = Object.freeze([
    '대기',
    '처리 중',
    '완료',
    '실패',
    '건너뜀'
]);

function buildSnsStatusValidationRequest(sheetId, statusColumnIndex = SNS_SHEET_HEADERS.indexOf('상태')) {
    return {
        setDataValidation: {
            range: {
                sheetId,
                startRowIndex: 1,
                startColumnIndex: statusColumnIndex,
                endColumnIndex: statusColumnIndex + 1
            },
            rule: {
                condition: {
                    type: 'ONE_OF_LIST',
                    values: SNS_DELIVERY_STATUSES.map((status) => ({
                        userEnteredValue: status
                    }))
                },
                showCustomUi: true,
                strict: true
            }
        }
    };
}

module.exports = {
    SNS_SHEET_NAME,
    SNS_SHEET_HEADERS,
    SNS_DELIVERY_STATUSES,
    buildSnsStatusValidationRequest
};
