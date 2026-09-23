const test = require('node:test');
const assert = require('node:assert/strict');
const { presentNaverPublishProgress } = require('./naver-publish-progress');

test('Naver browser events produce bounded user-facing progress', () => {
    assert.deepEqual(presentNaverPublishProgress({ stage: 'editor' }, 'draft'), {
        stage: 'editor', postStatus: 'draft', message: '네이버 글쓰기 화면에 연결하고 있습니다.'
    });
    assert.equal(presentNaverPublishProgress({ stage: 'body', current: 3, total: 5 }, 'draft').message,
        '본문 3/5 구간을 입력하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'image', current: 1, total: 2 }, 'draft').message,
        '이미지 1/2개를 올리고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'link', current: 2, total: 3 }, 'draft').message,
        '링크 2/3개를 추가하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'body', current: 0, total: 5 }, 'draft').message,
        '원고를 입력하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'submitting', postStatus: 'draft' }, 'publish').message,
        '네이버 블로그에 임시 저장을 요청하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'verifying' }, 'schedule').message,
        '네이버 블로그의 예약 등록 결과를 확인하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'unknown' }), null);
});
