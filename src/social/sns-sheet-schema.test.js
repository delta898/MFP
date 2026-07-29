const test = require('node:test');
const assert = require('node:assert/strict');
const {
    SNS_SHEET_NAME,
    SNS_SHEET_HEADERS,
    SNS_DELIVERY_STATUSES,
    buildSnsStatusValidationRequest
} = require('./sns-sheet-schema');

test('SNS sheet schema uses the canonical uppercase tab name and stable headers', () => {
    assert.equal(SNS_SHEET_NAME, 'SNS');
    assert.deepEqual(SNS_SHEET_HEADERS, [
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
});

test('SNS status validation targets the status column below the frozen header', () => {
    const request = buildSnsStatusValidationRequest(42);

    assert.deepEqual(request.setDataValidation.range, {
        sheetId: 42,
        startRowIndex: 1,
        startColumnIndex: 2,
        endColumnIndex: 3
    });
    assert.deepEqual(
        request.setDataValidation.rule.condition.values.map((item) => item.userEnteredValue),
        SNS_DELIVERY_STATUSES
    );
    assert.equal(request.setDataValidation.rule.strict, true);
});

test('SNS status validation can follow an existing user-reordered status column', () => {
    const request = buildSnsStatusValidationRequest(42, 5);

    assert.equal(request.setDataValidation.range.startColumnIndex, 5);
    assert.equal(request.setDataValidation.range.endColumnIndex, 6);
});
