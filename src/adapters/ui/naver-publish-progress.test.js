const test = require('node:test');
const assert = require('node:assert/strict');
const { presentNaverPublishProgress } = require('./naver-publish-progress');

test('Naver browser events produce bounded user-facing progress', () => {
    assert.deepEqual(presentNaverPublishProgress({ stage: 'editor' }, 'draft'), {
        stage: 'editor', postStatus: 'draft', message: '네이버 글쓰기 화면에 연결하고 있습니다.'
    });
    assert.equal(presentNaverPublishProgress({ stage: 'body', itemType: 'heading', label: 'Foobar heading' }, 'draft').message,
        '[소제목] Foobar heading 입력 중');
    assert.equal(presentNaverPublishProgress({ stage: 'body', itemType: 'paragraph', label: 'A useful paragraph' }, 'draft').message,
        '[본문] A useful paragraph 입력 중');
    assert.equal(presentNaverPublishProgress({ stage: 'body', itemType: 'quote', label: 'A quote' }, 'draft').message,
        '[인용구] A quote 입력 중');
    assert.equal(presentNaverPublishProgress({ stage: 'image', current: 1, total: 2, label: 'Green tea field' }, 'draft').message,
        '[이미지] Green tea field 업로드 중 (1/2)');
    assert.equal(presentNaverPublishProgress({ stage: 'link', current: 2, total: 3, label: 'Related article' }, 'draft').message,
        '[연관글] Related article 링크 추가 중 (2/3)');
    assert.equal(presentNaverPublishProgress({ stage: 'body', current: 0, total: 5 }, 'draft').message,
        '[본문] 입력 중');
    assert.equal(presentNaverPublishProgress({ stage: 'submitting', postStatus: 'draft' }, 'publish').message,
        '네이버 블로그에 임시 저장을 요청하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'verifying' }, 'schedule').message,
        '네이버 블로그의 예약 등록 결과를 확인하고 있습니다.');
    assert.equal(presentNaverPublishProgress({ stage: 'unknown' }), null);
});
