const test = require('node:test');
const assert = require('node:assert/strict');
const { presentPublishingProgress, buildCompletionLinks } = require('./presentation');

test('publishing progress translates internal milestones into user-facing stages', () => {
    assert.deepEqual(presentPublishingProgress('네이버 콘텐츠 생성 중...', { postStatus: 'draft' }), {
        stage: 'writing', title: '글 작성 중', message: '네이버 블로그용 글을 작성하고 있습니다.'
    });
    assert.deepEqual(presentPublishingProgress('네이버 발행 중...', { postStatus: 'draft' }), {
        stage: 'publishing', title: '임시 저장 중', message: '네이버 블로그에 임시 저장하고 있습니다.'
    });
    assert.equal(presentPublishingProgress('시트 상태 반영 중...').title, '마무리 중');
});

test('draft completion links use configured homes while public completion uses returned posts', () => {
    const results = {
        naver: { success: true, postUrl: 'https://blog.naver.com/owner/123' },
        wordpress: { success: true, postUrl: 'https://blog.example/posts/123' }
    };
    assert.deepEqual(buildCompletionLinks({
        postStatus: 'draft', results,
        config: { NAVER_ID: 'owner', WORDPRESS_URL: 'https://blog.example/' }
    }), [
        { platform: 'naver', kind: 'home', label: '네이버 블로그 열기', url: 'https://blog.naver.com/owner' },
        { platform: 'wordpress', kind: 'home', label: '워드프레스 열기', url: 'https://blog.example/' }
    ]);
    assert.deepEqual(buildCompletionLinks({ postStatus: 'publish', results }), [
        { platform: 'naver', kind: 'post', label: '네이버 글 보기', url: 'https://blog.naver.com/owner/123' },
        { platform: 'wordpress', kind: 'post', label: '워드프레스 글 보기', url: 'https://blog.example/posts/123' }
    ]);
});

test('completion links omit failed targets, unsafe URLs, and scheduled registrations', () => {
    assert.deepEqual(buildCompletionLinks({
        postStatus: 'publish',
        results: {
            naver: { success: false, postUrl: 'https://blog.naver.com/owner/123' },
            wordpress: { success: true, postUrl: 'javascript:alert(1)' }
        }
    }), []);
    assert.deepEqual(buildCompletionLinks({ postStatus: 'schedule', results: { naver: { success: true } } }), []);
});
