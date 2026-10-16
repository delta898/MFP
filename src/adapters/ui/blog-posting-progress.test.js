const test = require('node:test');
const assert = require('node:assert/strict');
const { presentBlogImageGenerationProgress } = require('./blog-posting-progress');

test('image generation progress is formatted consistently for posting targets', () => {
    assert.equal(presentBlogImageGenerationProgress({ current: 1, total: 4, state: 'started' }, 'naver'),
        '네이버 블로그용 이미지 생성 중 (1/4)');
    assert.equal(presentBlogImageGenerationProgress({ current: 4, total: 4, state: 'completed' }, 'wordpress'),
        '워드프레스용 이미지 준비 완료 (4/4)');
    assert.equal(presentBlogImageGenerationProgress({ current: 2, total: 4, state: 'failed' }),
        '이미지 생성 실패 (2/4). 다음 이미지 생성을 계속합니다.');
    assert.equal(presentBlogImageGenerationProgress({ current: 0, total: 4, state: 'started' }), '');
});
